import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, isNotNull, or, schema, sql, runOutsideTenant, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import {
  petrosDocumentMapSchema,
  petrosDocumentPreparationSchema,
  petrosDocumentPathSchema,
  petrosDocumentSourceStructureSchema,
  type PetrosDocumentMap,
  type PetrosDocumentPreparation,
  type PetrosDocumentSubject,
  type PetrosDocumentTeachingPlan,
} from '@edrion/schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Job } from 'bullmq';
import { API_ENV, DATABASE } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { PetrosAiGatewayService } from '../../petros-ai-routing/petros-ai-gateway.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';
import {
  bindDocumentTeachingGeneration,
  DOCUMENT_TEACHING_GENERATOR_VERSION,
  DOCUMENT_TEACHING_PROMPT,
  documentTeachingGenerationSchema,
  fallbackDocumentTeachingPlan,
  publicDocumentTeachingPlan,
  recoverInstructionalPhaseLabels,
  validateDocumentTeachingGeneration,
  type DocumentTeachingGeneration,
} from './petros-document-teaching';

export const PETROS_DOCUMENT_PREPARATION_JOB = 'petros.document.prepare';
const LEGACY_PARSER_VERSION = 'legacy-page-regions-2026-09-08-r1';

type DocumentSource = {
  item: typeof schema.knowledgeItems.$inferSelect;
  pages: Array<typeof schema.knowledgeItemPages.$inferSelect>;
  allPages?: Array<typeof schema.knowledgeItemPages.$inferSelect>;
};

interface TopicRequest {
  id: string;
  title: string;
  summary: string;
  pageStart?: number | null;
  pageEnd?: number | null;
  prerequisites?: string[];
  documentTopics?: TopicRequest[];
}

@Injectable()
export class PetrosDocumentPreparationService implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly gateway: PetrosAiGatewayService,
  ) {}

  onModuleInit() {
    this.workers.register(PETROS_DOCUMENT_PREPARATION_JOB, (job: Job) => this.process(String(job.data.preparationId), String(job.data.studentId)));
  }

  async prepare(
    principal: InstitutionalStudentPrincipal,
    source: DocumentSource,
    sourceFingerprint: string,
    topic: TopicRequest,
  ): Promise<{ preparation: PetrosDocumentPreparation; lesson: { publicPlan: PetrosDocumentTeachingPlan; internalPlan: DocumentTeachingGeneration } | null }> {
    const scope = { institutionId: principal.institutionId, studentId: principal.studentId };
    const revision = await this.ensureRevision(scope, source, sourceFingerprint);
    const requestedConceptId = topic.id || 'recommended';
    const requestContext = {
      topicId: requestedConceptId,
      title: topic.title,
      summary: topic.summary,
      pageStart: topic.pageStart ?? null,
      pageEnd: topic.pageEnd ?? null,
      prerequisites: topic.prerequisites ?? [],
      documentTopics: topic.documentTopics ?? [],
      prepareAhead: true,
    };
    let [preparation] = await this.db.insert(schema.petrosDocumentPreparations).values({
      institutionId: scope.institutionId,
      sourceRevisionId: revision.id,
      requestedConceptId,
      generatorVersion: DOCUMENT_TEACHING_GENERATOR_VERSION,
      requestContext,
      status: 'queued',
      stage: 'queued',
      progress: 2,
      message: 'Petros has queued this source for analysis.',
    }).onConflictDoNothing().returning();
    if (!preparation) {
      [preparation] = await this.db.select().from(schema.petrosDocumentPreparations).where(and(
        eq(schema.petrosDocumentPreparations.institutionId, scope.institutionId),
        eq(schema.petrosDocumentPreparations.sourceRevisionId, revision.id),
        eq(schema.petrosDocumentPreparations.requestedConceptId, requestedConceptId),
        eq(schema.petrosDocumentPreparations.generatorVersion, DOCUMENT_TEACHING_GENERATOR_VERSION),
        eq(schema.petrosDocumentPreparations.curriculumKey, 'default'),
      )).limit(1);
    }
    if (!preparation) throw new Error('Could not create the document preparation.');
    if (preparation.status === 'preparing' && preparation.leaseExpiresAt && preparation.leaseExpiresAt.getTime() <= Date.now()) {
      const [recovered] = await this.db.update(schema.petrosDocumentPreparations).set({
        status: 'queued', stage: 'queued', progress: Math.min(preparation.progress, 8),
        message: 'The previous worker stopped responding. Petros is retrying from the saved stage.',
        leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date(),
      }).where(and(eq(schema.petrosDocumentPreparations.id, preparation.id), eq(schema.petrosDocumentPreparations.status, 'preparing'))).returning();
      if (recovered) preparation = recovered;
    }

    let [learnerPath] = await this.db.insert(schema.petrosDocumentLearnerPaths).values({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      knowledgeItemId: source.item.id,
      sourceRevisionId: revision.id,
      preparationId: preparation.id,
      currentConceptId: preparation.recommendedConceptId ?? requestedConceptId,
      progress: { [requestedConceptId]: { status: 'available', evidence: 'none' } },
    }).onConflictDoUpdate({
      target: [schema.petrosDocumentLearnerPaths.institutionId, schema.petrosDocumentLearnerPaths.studentId, schema.petrosDocumentLearnerPaths.sourceRevisionId],
      set: { preparationId: preparation.id, knowledgeItemId: source.item.id, updatedAt: new Date() },
    }).returning();
    if (!learnerPath) [learnerPath] = await this.db.select().from(schema.petrosDocumentLearnerPaths).where(and(eq(schema.petrosDocumentLearnerPaths.institutionId, scope.institutionId), eq(schema.petrosDocumentLearnerPaths.studentId, scope.studentId), eq(schema.petrosDocumentLearnerPaths.sourceRevisionId, revision.id))).limit(1);

    if (preparation.status === 'ready' && preparation.firstLessonId) {
      const lesson = await this.lesson(scope, preparation.firstLessonId);
      return { preparation: this.dto(preparation, learnerPath?.id), lesson };
    }
    if (preparation.status === 'needs_attention' && preparation.retryable === 1) {
      const [retried] = await this.db.update(schema.petrosDocumentPreparations).set({ status: 'queued', stage: 'queued', progress: 2, issueCode: null, issueDetail: null, message: 'Petros is retrying the preparation.', updatedAt: new Date() }).where(eq(schema.petrosDocumentPreparations.id, preparation.id)).returning();
      if (retried) preparation = retried;
    }
    if (preparation?.status === 'queued') await this.dispatch(preparation.id, scope.studentId);
    return { preparation: this.dto(preparation, learnerPath?.id), lesson: null };
  }

  async read(scope: PetrosOwnerScope, preparationId: string) {
    const [row] = await this.db.select({ preparation: schema.petrosDocumentPreparations, pathId: schema.petrosDocumentLearnerPaths.id })
      .from(schema.petrosDocumentPreparations)
      .innerJoin(schema.petrosDocumentLearnerPaths, and(
        eq(schema.petrosDocumentLearnerPaths.institutionId, schema.petrosDocumentPreparations.institutionId),
        eq(schema.petrosDocumentLearnerPaths.sourceRevisionId, schema.petrosDocumentPreparations.sourceRevisionId),
      ))
      .where(and(
        eq(schema.petrosDocumentLearnerPaths.institutionId, scope.institutionId),
        eq(schema.petrosDocumentLearnerPaths.studentId, scope.studentId),
        eq(schema.petrosDocumentPreparations.id, preparationId),
      )).limit(1);
    if (!row) return null;
    let preparation = row.preparation;
    const leaseExpired = preparation.status === 'preparing' && (
      preparation.leaseExpiresAt
        ? preparation.leaseExpiresAt.getTime() <= Date.now()
        : preparation.updatedAt.getTime() <= Date.now() - 120_000
    );
    if (leaseExpired) {
      const [recovered] = await this.db.update(schema.petrosDocumentPreparations).set({
        status: 'queued',
        stage: 'queued',
        progress: Math.min(preparation.progress, 8),
        message: 'The previous worker stopped responding. Petros is retrying from the saved stage.',
        leaseOwner: null,
        leaseExpiresAt: null,
        updatedAt: new Date(),
      }).where(and(
        eq(schema.petrosDocumentPreparations.id, preparation.id),
        eq(schema.petrosDocumentPreparations.status, 'preparing'),
      )).returning();
      if (recovered) {
        preparation = recovered;
        await this.dispatch(preparation.id, scope.studentId);
      }
    }
    return this.dto(preparation, row.pathId);
  }

  async path(scope: PetrosOwnerScope, knowledgeItemId: string) {
    const [row] = await this.db.select({ path: schema.petrosDocumentLearnerPaths, revision: schema.petrosDocumentSourceRevisions })
      .from(schema.petrosDocumentLearnerPaths)
      .innerJoin(schema.petrosDocumentSourceRevisions, eq(schema.petrosDocumentSourceRevisions.id, schema.petrosDocumentLearnerPaths.sourceRevisionId))
      .where(and(eq(schema.petrosDocumentLearnerPaths.institutionId, scope.institutionId), eq(schema.petrosDocumentLearnerPaths.studentId, scope.studentId), eq(schema.petrosDocumentLearnerPaths.knowledgeItemId, knowledgeItemId)))
      .orderBy(asc(schema.petrosDocumentLearnerPaths.createdAt)).limit(1);
    if (!row) return null;
    const mappedPreparations = await this.db.select({
      documentMap: schema.petrosDocumentPreparations.documentMap,
      updatedAt: schema.petrosDocumentPreparations.updatedAt,
    })
      .from(schema.petrosDocumentPreparations)
      .where(and(
        eq(schema.petrosDocumentPreparations.institutionId, scope.institutionId),
        eq(schema.petrosDocumentPreparations.sourceRevisionId, row.revision.id),
        isNotNull(schema.petrosDocumentPreparations.documentMap),
      ))
      .orderBy(desc(schema.petrosDocumentPreparations.updatedAt))
      .limit(100);
    const candidates = mappedPreparations.flatMap((preparation) => {
      const parsed = petrosDocumentMapSchema.safeParse(preparation.documentMap);
      return parsed.success ? [{ map: parsed.data, updatedAt: preparation.updatedAt }] : [];
    }).sort((left, right) =>
      right.map.concepts.length - left.map.concepts.length
      || right.updatedAt.getTime() - left.updatedAt.getTime(),
    );
    const map = candidates[0]?.map;
    if (!map) return null;
    const artifacts = await this.db.select().from(schema.petrosDocumentLessonArtifacts).where(and(
      eq(schema.petrosDocumentLessonArtifacts.institutionId, scope.institutionId),
      eq(schema.petrosDocumentLessonArtifacts.sourceRevisionId, row.revision.id),
      eq(schema.petrosDocumentLessonArtifacts.generatorVersion, DOCUMENT_TEACHING_GENERATOR_VERSION),
      eq(schema.petrosDocumentLessonArtifacts.status, 'published'),
    ));
    const artifactByConcept = new Map(artifacts.map((artifact) => [artifact.conceptId, artifact]));
    const progress = row.path.progress as Record<string, { status?: string; evidence?: string }>;
    const concepts = map.concepts.map((concept) => {
      const learner = progress[concept.id];
      const artifact = artifactByConcept.get(concept.id);
      const learnerStatus = learner?.status === 'complete' || learner?.status === 'review' || learner?.status === 'in_progress'
        ? learner.status
        : artifact ? 'available' : 'locked';
      const evidence = ['supported', 'independent', 'needs_review'].includes(learner?.evidence ?? '') ? learner!.evidence : 'none';
      return { ...concept, lessonId: artifact?.id ?? null, learnerStatus, evidence };
    });
    return petrosDocumentPathSchema.parse({
      id: row.path.id, sourceRevisionId: row.revision.id, title: row.revision.title,
      currentConceptId: row.path.currentConceptId, concepts,
      completedConcepts: concepts.filter((concept) => concept.learnerStatus === 'complete').length,
      totalConcepts: concepts.filter((concept) => concept.classification === 'concept').length,
      updatedAt: row.path.updatedAt.toISOString(),
    });
  }

  async lesson(scope: PetrosOwnerScope, lessonId: string) {
    const [row] = await this.db.select({ artifact: schema.petrosDocumentLessonArtifacts })
      .from(schema.petrosDocumentLearnerPaths)
      .innerJoin(schema.petrosDocumentLessonArtifacts, and(
        eq(schema.petrosDocumentLessonArtifacts.sourceRevisionId, schema.petrosDocumentLearnerPaths.sourceRevisionId),
        eq(schema.petrosDocumentLessonArtifacts.id, lessonId),
      ))
      .where(and(
        eq(schema.petrosDocumentLearnerPaths.institutionId, scope.institutionId),
        eq(schema.petrosDocumentLearnerPaths.studentId, scope.studentId),
        eq(schema.petrosDocumentLessonArtifacts.status, 'published'),
      )).limit(1);
    if (!row) return null;
    return {
      publicPlan: row.artifact.publicPlan as unknown as PetrosDocumentTeachingPlan,
      internalPlan: row.artifact.privatePlan as unknown as DocumentTeachingGeneration,
    };
  }

  private async dispatch(preparationId: string, studentId: string) {
    const jobId = await this.jobs.enqueue('ai', PETROS_DOCUMENT_PREPARATION_JOB, { preparationId, studentId }, {
      jobId: `petros-document:${preparationId}`,
      delay: 500,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1_500 },
    });
    if (jobId) return;
    // Development without Redis still uses the persisted state machine. Escape
    // the request transaction before doing any provider work.
    setTimeout(() => {
      void runOutsideTenant(() => this.process(preparationId, studentId)).catch(() => undefined);
    }, 500);
  }

  private async ensureRevision(scope: PetrosOwnerScope, source: DocumentSource, sourceFingerprint: string) {
    const classMaterialId = typeof source.item.origin?.classMaterialId === 'string' ? source.item.origin.classMaterialId : null;
    const sourceKey = classMaterialId ? `material:${classMaterialId}` : `knowledge:${source.item.id}`;
    const [existing] = await this.db.select().from(schema.petrosDocumentSourceRevisions).where(and(
      eq(schema.petrosDocumentSourceRevisions.institutionId, scope.institutionId),
      eq(schema.petrosDocumentSourceRevisions.sourceKey, sourceKey),
      eq(schema.petrosDocumentSourceRevisions.documentVersion, source.item.version),
    )).orderBy(asc(schema.petrosDocumentSourceRevisions.createdAt)).limit(1);
    if (existing) return existing;
    const pages = source.allPages ?? source.pages;
    const checksum = createHash('sha256').update(pages.map((page) => `${page.pageIndex}:${page.text}`).join('\n')).digest('hex');
    const structure = petrosDocumentSourceStructureSchema.parse({
      parserVersion: LEGACY_PARSER_VERSION,
      checksum,
      pages: pages.map((page) => ({
        page: page.pageIndex + 1,
        width: null,
        height: null,
        regions: page.text.trim() ? [{ id: `p${page.pageIndex + 1}-legacy`, page: page.pageIndex + 1, order: 0, kind: 'paragraph', text: page.text, confidence: page.needsConfirm ? 0.5 : 0.9 }] : [{ id: `p${page.pageIndex + 1}-unresolved`, page: page.pageIndex + 1, order: 0, kind: 'unresolved', text: '', confidence: 0, warning: 'No extractable text is available.' }],
        confidence: page.text.trim() ? (page.needsConfirm ? 0.5 : 0.9) : 0,
        warnings: page.text.trim() ? [] : ['No extractable text is available.'],
      })),
      warnings: pages.filter((page) => !page.text.trim()).map((page) => `Page ${page.pageIndex + 1} needs OCR or visual inspection.`),
      extractionComplete: pages.every((page) => Boolean(page.text.trim()) && !page.needsConfirm),
    });
    const [revision] = await this.db.insert(schema.petrosDocumentSourceRevisions).values({
      institutionId: scope.institutionId,
      classMaterialId,
      canonicalKnowledgeItemId: source.item.id,
      sourceKey,
      title: source.item.title,
      documentVersion: source.item.version,
      checksum,
      parserVersion: LEGACY_PARSER_VERSION,
      extractionStatus: structure.extractionComplete ? 'ready' : 'needs_attention',
      structure: structure as unknown as Record<string, unknown>,
      warnings: structure.warnings,
    }).onConflictDoNothing().returning();
    if (revision) return revision;
    const [reread] = await this.db.select().from(schema.petrosDocumentSourceRevisions).where(and(
      eq(schema.petrosDocumentSourceRevisions.institutionId, scope.institutionId),
      eq(schema.petrosDocumentSourceRevisions.sourceKey, sourceKey),
      eq(schema.petrosDocumentSourceRevisions.documentVersion, source.item.version),
      eq(schema.petrosDocumentSourceRevisions.checksum, checksum),
      eq(schema.petrosDocumentSourceRevisions.parserVersion, LEGACY_PARSER_VERSION),
    )).limit(1);
    if (!reread) throw new Error(`Could not persist document revision ${sourceFingerprint.slice(0, 12)}.`);
    return reread;
  }

  private async process(preparationId: string, studentId: string) {
    const workerId = `api:${process.pid}:${randomUUID()}`;
    const [claimed] = await this.db.update(schema.petrosDocumentPreparations).set({
      status: 'preparing', stage: 'checking_source', progress: 8,
      message: 'Checking the extracted source and access scope…',
      leaseOwner: workerId, leaseExpiresAt: new Date(Date.now() + 120_000),
      startedAt: new Date(), attemptCount: sql`${schema.petrosDocumentPreparations.attemptCount} + 1`, updatedAt: new Date(),
    }).where(and(
      eq(schema.petrosDocumentPreparations.id, preparationId),
      or(eq(schema.petrosDocumentPreparations.status, 'queued'), eq(schema.petrosDocumentPreparations.status, 'needs_attention')),
    )).returning();
    if (!claimed) return { reused: true };
    const started = Date.now();
    try {
      const [revision] = await this.db.select().from(schema.petrosDocumentSourceRevisions).where(and(
        eq(schema.petrosDocumentSourceRevisions.id, claimed.sourceRevisionId),
        eq(schema.petrosDocumentSourceRevisions.institutionId, claimed.institutionId),
      )).limit(1);
      if (!revision) throw issue('PETROS_SOURCE_REVISION_MISSING', 'The prepared source revision no longer exists.', false);
      const structure = petrosDocumentSourceStructureSchema.parse(revision.structure);
      const readable = structure.pages.flatMap((page) => page.regions).filter((region) => region.kind !== 'unresolved' && region.text.trim());
      if (!readable.length) throw issue('PETROS_SOURCE_UNREADABLE', 'No readable source regions are available. OCR or a clearer file is required.', false);

      await this.progress(claimed.id, 'mapping_document', 24, 'Mapping concepts, prerequisites, examples and exercises…');
      const context = claimed.requestContext as Record<string, unknown>;
      const map = buildInitialMap(revision.id, revision.title, structure, context);
      await this.db.update(schema.petrosDocumentPreparations).set({ documentMap: map as unknown as Record<string, unknown>, recommendedConceptId: map.recommendedConceptId, stage: 'selecting_start', progress: 38, message: 'Selecting a substantive starting concept…', updatedAt: new Date() }).where(eq(schema.petrosDocumentPreparations.id, claimed.id));
      const concept = map.concepts.find((item) => item.id === map.recommendedConceptId) ?? map.concepts[0]!;
      const selectedRegions = boundedTeachingRegions(
        readable.filter((region) => concept.sourceRegionIds.includes(region.id)),
      );
      if (!selectedRegions.length) throw issue('PETROS_CONCEPT_SOURCE_UNRESOLVED', 'The selected concept depends on unresolved source material.', false);
      const pages = [...new Set(selectedRegions.map((region) => region.page))].map((page) => ({ page, text: selectedRegions.filter((region) => region.page === page).map((region) => region.text).join('\n') }));
      await this.progress(claimed.id, 'generating_lesson', 50, `Building the first ${concept.subject} lesson with a visual demonstration and practice…`);

      let generated: DocumentTeachingGeneration;
      let validated: DocumentTeachingGeneration;
      let provenance: Record<string, unknown>;
      const fallbackInput = {
        documentId: revision.canonicalKnowledgeItemId ?? revision.id,
        documentVersion: revision.documentVersion,
        sourceFingerprint: revision.checksum,
        topicId: concept.id,
        title: concept.title,
        summary: concept.summary,
        prerequisites: concept.prerequisites,
        pages,
        sourceComplete: structure.extractionComplete,
      };
      if (this.env.PETROS_AI_MODE !== 'live') {
        generated = fallbackDocumentTeachingPlan(fallbackInput);
        validated = validateDocumentTeachingGeneration(generated, pages);
        provenance = { source: 'deterministic_development_fixture', validationPassed: true, model: null };
      } else {
        const generationContext = {
            functionKey: 'document.teaching.plan', topic: concept.title, subject: concept.subject,
            sessionType: 'document_learning', inputModality: 'text', language: 'en',
            institutionId: claimed.institutionId, studentId, estimatedTokens: Math.ceil(pages.reduce((sum, page) => sum + page.text.length, 0) / 3.5),
            currentCostMicros: 0, previousFailures: claimed.attemptCount, requiredReasoningQuality: 0.85,
          } as const;
        const immutableProvenance = { schemaVersion: 'petros.document-teaching.v3', experience: 'document-teaching-v1', generatorVersion: DOCUMENT_TEACHING_GENERATOR_VERSION, documentId: revision.canonicalKnowledgeItemId ?? revision.id, documentVersion: revision.documentVersion, sourceFingerprint: revision.checksum, topicId: concept.id, sourceComplete: structure.extractionComplete, sourcePageCount: pages.length, generatedAt: new Date().toISOString() };
        const result = await this.gateway.execute({
          context: generationContext,
          system: DOCUMENT_TEACHING_PROMPT,
          input: [{ type: 'text', text: JSON.stringify({
            immutableProvenance,
            concept, sourcePages: pages,
          }) }],
          responseSchema: zodToJsonSchema(documentTeachingGenerationSchema, { $refStrategy: 'none' }) as Record<string, unknown>,
          cacheTtlSeconds: 86_400,
          maxOutputTokens: 6_000,
          timeoutMs: 25_000,
          maxRetries: 0,
          maxRouteAttempts: 1,
          deferResponseValidation: true,
          disableCache: true,
          metadata: { sourceRevisionId: revision.id, preparationId: claimed.id, sharedArtifact: true },
        });
        const binding = { documentId: revision.canonicalKnowledgeItemId ?? revision.id, documentVersion: revision.documentVersion, sourceFingerprint: revision.checksum, topicId: concept.id, sourceComplete: structure.extractionComplete, sourcePages: pages };
        let finalResult = result;
        let validationFallback: string | null = null;
        try {
          generated = bindDocumentTeachingGeneration(normalizeTeachingDraft(result.content), binding);
          validated = validateDocumentTeachingGeneration(generated, pages);
        } catch (firstValidationError) {
          await this.progress(claimed.id, 'repairing_lesson', 64, 'Repairing a malformed visual or assessment field without restarting source analysisâ€¦');
          try {
            const repair = await this.gateway.execute({
              context: { ...generationContext, previousFailures: generationContext.previousFailures + 1 },
              system: `${DOCUMENT_TEACHING_PROMPT}\n\nRepair the rejected draft below. Preserve its grounded teaching content, but fix every listed validation error. Return one complete corrected JSON object; do not explain the repair.`,
              input: [{ type: 'text', text: JSON.stringify({
                immutableProvenance,
                concept,
                sourcePages: pages,
                validationErrors: errorSummary(firstValidationError),
                rejectedDraft: result.content,
              }) }],
              responseSchema: zodToJsonSchema(documentTeachingGenerationSchema, { $refStrategy: 'none' }) as Record<string, unknown>,
              maxOutputTokens: 6_000,
              timeoutMs: 14_000,
              maxRetries: 0,
              maxRouteAttempts: 1,
              deferResponseValidation: true,
              disableCache: true,
              metadata: { sourceRevisionId: revision.id, preparationId: claimed.id, sharedArtifact: true, repairAttempt: 1 },
            });
            generated = bindDocumentTeachingGeneration(normalizeTeachingDraft(repair.content), binding);
            validated = validateDocumentTeachingGeneration(generated, pages);
            finalResult = repair;
          } catch (repairError) {
            generated = fallbackDocumentTeachingPlan(fallbackInput);
            validated = validateDocumentTeachingGeneration(generated, pages);
            validationFallback = `${errorSummary(firstValidationError)}; repair: ${errorSummary(repairError)}`;
          }
        }
        provenance = validationFallback ? {
          source: 'deterministic_validation_fallback',
          validationPassed: true,
          provider: result.providerKey,
          model: result.modelKey,
          requestId: result.requestId,
          failure: validationFallback,
        } : {
          source: 'ai', provider: finalResult.providerKey, model: finalResult.modelKey,
          requestId: finalResult.requestId, promptVersion: finalResult.promptVersion, schemaVersion: finalResult.schemaVersion,
          inputTokens: result.inputTokens + (finalResult === result ? 0 : finalResult.inputTokens),
          outputTokens: result.outputTokens + (finalResult === result ? 0 : finalResult.outputTokens),
          costMicros: result.estimatedCostMicros + (finalResult === result ? 0 : finalResult.estimatedCostMicros),
          responseTimeMs: result.responseTimeMs + (finalResult === result ? 0 : finalResult.responseTimeMs),
          repairAttempted: finalResult !== result, cached: false,
        };
      }
      await this.progress(claimed.id, 'validating_lesson', 72, 'Checking source references, visual relationships, answer keys and teaching phases…');
      const publicPlan = publicDocumentTeachingPlan(validated);
      const [artifact] = await this.db.insert(schema.petrosDocumentLessonArtifacts).values({
        institutionId: claimed.institutionId, sourceRevisionId: revision.id, preparationId: claimed.id,
        conceptId: concept.id, subject: concept.subject, generatorVersion: DOCUMENT_TEACHING_GENERATOR_VERSION,
        status: 'published', publicPlan: publicPlan as unknown as Record<string, unknown>, privatePlan: validated as unknown as Record<string, unknown>,
        quality: { instructionalPhases: 5, sourceReferencesValidated: true, privateAnswersSeparated: true, visualSpecValidated: true },
        provenance, publishedAt: new Date(),
      }).onConflictDoUpdate({
        target: [schema.petrosDocumentLessonArtifacts.institutionId, schema.petrosDocumentLessonArtifacts.sourceRevisionId, schema.petrosDocumentLessonArtifacts.conceptId, schema.petrosDocumentLessonArtifacts.generatorVersion],
        set: { preparationId: claimed.id, status: 'published', publicPlan: publicPlan as unknown as Record<string, unknown>, privatePlan: validated as unknown as Record<string, unknown>, quality: { instructionalPhases: 5, sourceReferencesValidated: true, privateAnswersSeparated: true, visualSpecValidated: true }, provenance, publishedAt: new Date(), updatedAt: new Date() },
      }).returning();
      if (!artifact) throw issue('PETROS_LESSON_PUBLISH_FAILED', 'The validated lesson could not be published.', true);
      await this.db.update(schema.petrosDocumentPreparations).set({
        status: 'ready', stage: 'first_lesson_ready', progress: 82,
        message: context.prepareAhead === false
          ? 'This validated lesson is ready.'
          : 'Your first validated lesson is ready. Petros is preparing one mapped concept ahead.',
        firstLessonId: artifact.id, recommendedConceptId: concept.id,
        timing: { firstLessonMs: Date.now() - started }, completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date(),
      }).where(eq(schema.petrosDocumentPreparations.id, claimed.id));
      if (context.prepareAhead !== false) {
        await this.queueOneLessonAhead(claimed, map, concept.id, studentId);
      }
      return { lessonId: artifact.id };
    } catch (error) {
      const typed = preparationFailure(error);
      await this.db.update(schema.petrosDocumentPreparations).set({
        status: 'needs_attention', stage: 'needs_attention', progress: 100,
        message: typed.message.slice(0, 500),
        issueCode: typed.issueCode ?? 'PETROS_PREPARATION_FAILED', issueDetail: typed.message.slice(0, 2_000), retryable: typed.retryable === false ? 0 : 1,
        timing: { failedAfterMs: Date.now() - started }, completedAt: new Date(), leaseOwner: null, leaseExpiresAt: null, updatedAt: new Date(),
      }).where(eq(schema.petrosDocumentPreparations.id, claimed.id));
      throw error;
    }
  }

  private progress(id: string, stage: string, progress: number, message: string) {
    return this.db.update(schema.petrosDocumentPreparations).set({ stage, progress, message, leaseExpiresAt: new Date(Date.now() + 120_000), updatedAt: new Date() }).where(eq(schema.petrosDocumentPreparations.id, id));
  }

  private async queueOneLessonAhead(
    preparation: typeof schema.petrosDocumentPreparations.$inferSelect,
    map: PetrosDocumentMap,
    currentConceptId: string,
    studentId: string,
  ) {
    const currentIndex = map.concepts.findIndex((concept) => concept.id === currentConceptId);
    const next = map.concepts.slice(currentIndex + 1).find((concept) => concept.classification === 'concept');
    if (!next) return;
    const [queued] = await this.db.insert(schema.petrosDocumentPreparations).values({
      institutionId: preparation.institutionId,
      sourceRevisionId: preparation.sourceRevisionId,
      requestedConceptId: next.id,
      generatorVersion: DOCUMENT_TEACHING_GENERATOR_VERSION,
      requestContext: {
        topicId: next.id,
        title: next.title,
        summary: next.summary,
        pageStart: Math.min(...next.sourcePages),
        pageEnd: Math.max(...next.sourcePages),
        prerequisites: next.prerequisites,
        documentTopics: map.concepts.map((item) => ({
          id: item.id,
          title: item.title,
          summary: item.summary,
          pageStart: Math.min(...item.sourcePages),
          pageEnd: Math.max(...item.sourcePages),
          prerequisites: item.prerequisites,
          estimatedMinutes: item.estimatedMinutes,
        })),
        prepareAhead: false,
      },
      status: 'queued',
      stage: 'queued',
      progress: 2,
      message: 'Queued as the next likely lesson.',
    }).onConflictDoNothing().returning();
    if (queued) await this.dispatch(queued.id, studentId);
  }

  private dto(row: typeof schema.petrosDocumentPreparations.$inferSelect, pathId?: string): PetrosDocumentPreparation {
    return petrosDocumentPreparationSchema.parse({
      id: row.id, status: row.status, stage: row.stage, progress: row.progress, message: row.message.slice(0, 500),
      pathId: pathId ?? null, firstLessonId: row.firstLessonId, recommendedConceptId: row.recommendedConceptId,
      retryable: row.retryable === 1, issueCode: row.issueCode, updatedAt: row.updatedAt.toISOString(),
    });
  }
}

function buildInitialMap(
  sourceRevisionId: string,
  title: string,
  structure: ReturnType<typeof petrosDocumentSourceStructureSchema.parse>,
  context: Record<string, unknown>,
): PetrosDocumentMap {
  const all = structure.pages.flatMap((page) => page.regions);
  const headings = all.filter((region) => region.kind === 'heading');
  const requestedPages = all.filter((region) => {
    const start = Number(context.pageStart ?? 0); const end = Number(context.pageEnd ?? 0);
    return !start || !end || (region.page >= start && region.page <= end);
  });
  const selected = requestedPages.filter((region) => region.kind !== 'unresolved');
  const requestedId = String(context.topicId ?? 'recommended');
  const requestedTitle = String(context.title ?? headings[0]?.text ?? title).slice(0, 240);
  const requestedSummary = String(context.summary ?? selected.slice(0, 3).map((region) => region.text).join(' ')).slice(0, 1_000);
  const concepts: PetrosDocumentMap['concepts'] = [{
    id: requestedId,
    title: requestedTitle,
    summary: requestedSummary.length >= 10 ? requestedSummary : `Understand and apply ${requestedTitle} from the supplied source.`,
    subject: inferSubject(`${title}\n${requestedTitle}\n${selected.slice(0, 8).map((region) => region.text).join('\n')}`),
    objectives: [`Explain the central relationship in ${requestedTitle}`, `Apply ${requestedTitle} independently to a new case`],
    prerequisites: Array.isArray(context.prerequisites) ? context.prerequisites.map(String).slice(0, 12) : [],
    // A concept lesson must be fully grounded in a coherent, bounded source
    // slice. The rest of the document remains represented by later concepts.
    sourceRegionIds: selected.slice(0, 36).map((region) => region.id),
    sourcePages: [...new Set(selected.slice(0, 36).map((region) => region.page))],
    estimatedMinutes: 15,
    classification: classifySourceSection(requestedTitle, title),
    preparationStatus: 'preparing',
  }];
  const plannedTopics = Array.isArray(context.documentTopics) ? context.documentTopics : [];
  for (const value of plannedTopics) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const topic = value as Record<string, unknown>;
    const id = String(topic.id ?? '').slice(0, 160);
    const topicTitle = String(topic.title ?? '').slice(0, 240);
    if (!id || !topicTitle || concepts.some((concept) => concept.id === id)) continue;
    const start = Number(topic.pageStart ?? 0);
    const end = Number(topic.pageEnd ?? 0);
    const regions = all.filter((region) => region.kind !== 'unresolved' && (!start || !end || (region.page >= start && region.page <= end))).slice(0, 60);
    if (!regions.length) continue;
    const summary = String(topic.summary ?? regions.slice(0, 3).map((region) => region.text).join(' ')).slice(0, 1_000);
    concepts.push({
      id,
      title: topicTitle,
      summary: summary.length >= 10 ? summary : `Understand and apply ${topicTitle} from the supplied source.`,
      subject: inferSubject(`${title}\n${topicTitle}\n${summary}`),
      objectives: [`Understand and apply ${topicTitle}`],
      prerequisites: Array.isArray(topic.prerequisites) ? topic.prerequisites.map(String).slice(0, 12) : [],
      sourceRegionIds: regions.map((region) => region.id),
      sourcePages: [...new Set(regions.map((region) => region.page))],
      estimatedMinutes: Math.max(5, Math.min(60, Number(topic.estimatedMinutes ?? 15))),
      classification: classifySourceSection(topicTitle, title),
      preparationStatus: 'mapped',
    });
  }
  for (const heading of headings) {
    if (concepts.length >= 80 || concepts.some((concept) => concept.title.toLowerCase() === heading.text.toLowerCase())) continue;
    const following = all.filter((region) => region.page >= heading.page && region.order > heading.order).slice(0, 5);
    concepts.push({
      id: `concept-${heading.page}-${heading.order}`,
      title: heading.text.slice(0, 240),
      summary: following.map((region) => region.text).join(' ').slice(0, 1_000) || `Study ${heading.text} from page ${heading.page}.`,
      subject: inferSubject(`${title}\n${heading.text}\n${following.map((region) => region.text).join('\n')}`),
      objectives: [`Understand and apply ${heading.text}`], prerequisites: [],
      sourceRegionIds: [heading, ...following].map((region) => region.id), sourcePages: [...new Set([heading, ...following].map((region) => region.page))],
      estimatedMinutes: 15, classification: classifySourceSection(heading.text, title), preparationStatus: 'mapped',
    });
  }
  const plannedOrder = new Map(
    plannedTopics
      .filter((topic): topic is Record<string, unknown> => Boolean(topic) && typeof topic === 'object' && !Array.isArray(topic))
      .map((topic, index) => [String(topic.id ?? ''), index]),
  );
  concepts.sort((left, right) => {
    const leftOrder = plannedOrder.get(left.id);
    const rightOrder = plannedOrder.get(right.id);
    if (leftOrder !== undefined || rightOrder !== undefined) {
      return (leftOrder ?? Number.MAX_SAFE_INTEGER) - (rightOrder ?? Number.MAX_SAFE_INTEGER);
    }
    return Math.min(...left.sourcePages) - Math.min(...right.sourcePages);
  });
  return petrosDocumentMapSchema.parse({
    version: 'petros.document-learning.v1', sourceRevisionId, title, provisional: true,
    subject: inferSubject(`${title}\n${all.slice(0, 30).map((region) => region.text).join('\n')}`),
    concepts, recommendedConceptId: requestedId,
    mappedRegionIds: [...new Set(concepts.flatMap((concept) => concept.sourceRegionIds))],
    unresolvedRegionIds: all.filter((region) => region.kind === 'unresolved').map((region) => region.id),
    generatedAt: new Date().toISOString(),
  });
}

function classifySourceSection(title: string, documentTitle: string): PetrosDocumentMap['concepts'][number]['classification'] {
  const normalized = title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const normalizedDocument = documentTitle.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (normalized === normalizedDocument || /^(?:table of contents|contents|bibliography|references|acknowledgements?)$/.test(normalized)) return 'reference';
  if (/\b(?:exercise|practice|questions?|worksheet|problem set)\b/i.test(title)) return 'exercise';
  if (/\b(?:worked examples?|solved examples?)\b/i.test(title)) return 'worked_example';
  return 'concept';
}

function inferSubject(text: string): PetrosDocumentSubject {
  const value = text.toLowerCase();
  // Domain-specific titles beat incidental words such as "function" inside a
  // computing document. Mixed documents are classified again per concept.
  if (/machine learning|neural|dataset|training data|classification model|algorithm|programming|computer science|software|database|\bcode\b/.test(value)) return 'computing';
  if (/integral|derivative|calculus|algebra|geometry|trigonometry|probability|theorem|\bequation\b|\bfunction\b/.test(value)) return 'mathematics';
  if (/force|velocity|circuit|energy|momentum|physics/.test(value)) return 'physics';
  if (/reaction|molecule|atom|chemical|molar/.test(value)) return 'chemistry';
  if (/cell|organ|species|biology|enzyme|photosynth/.test(value)) return 'biology';
  if (/inflation|demand|supply|price|econom/.test(value)) return 'economics';
  if (/algorithm|program|variable|computer|code|database/.test(value)) return 'computing';
  if (/grammar|sentence|poem|novel|literature|language/.test(value)) return 'language';
  if (/history|society|government|war|empire|culture/.test(value)) return 'humanities';
  return 'mixed';
}

function boundedTeachingRegions<T extends { page: number; text: string }>(regions: T[]): T[] {
  const selected: T[] = [];
  const pages = new Set<number>();
  let characters = 0;
  for (const region of regions) {
    const nextPage = !pages.has(region.page);
    if (nextPage && pages.size >= 6) break;
    if (selected.length && characters + region.text.length > 36_000) break;
    selected.push(region);
    pages.add(region.page);
    characters += region.text.length;
    if (selected.length >= 36) break;
  }
  return selected.length ? selected : regions.slice(0, 1);
}

function errorSummary(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}

export function normalizeTeachingDraft(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  const draft = structuredClone(input) as Record<string, unknown>;
  if (!Array.isArray(draft.scenes)) return draft;
  for (const value of draft.scenes) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const scene = value as Record<string, unknown>;
    const phase = String(scene.phase ?? '');
    if (typeof scene.purpose !== 'string') {
      scene.purpose = phase === 'concrete_opening' ? 'teaching'
        : phase === 'visual_explanation' ? 'exploration'
          : phase === 'guided_application' ? 'guided_practice'
            : phase === 'independent_check' ? 'independent_check'
              : 'connection_review';
    }
    if (typeof scene.taskId !== 'string' || !scene.taskId.trim()) {
      scene.taskId = `${String(scene.objectiveId ?? 'objective')}-${String(scene.id ?? 'scene')}`.slice(0, 100);
    }
    if (!scene.response || typeof scene.response !== 'object' || Array.isArray(scene.response)) {
      const ungraded = scene.purpose === 'teaching' || scene.purpose === 'exploration';
      scene.response = ungraded
        ? { kind: 'none' }
        : { kind: scene.responseType === 'choice' ? 'choice' : 'explanation' };
      if (ungraded) {
        scene.responseType = 'explanation';
        scene.choices = [];
        scene.correctChoiceId = null;
        scene.expectedAnswer = null;
      }
    }
    const expectedAnswer = scene.expectedAnswer;
    if (expectedAnswer && typeof expectedAnswer === 'object' && !Array.isArray(expectedAnswer)) {
      const answer = expectedAnswer as Record<string, unknown>;
      if (answer.kind === 'expression' && answer.allowAdditiveConstant === true && Array.isArray(answer.variables)) {
        answer.variables = answer.variables.filter((variable) => variable !== 'C');
        if (answer.domain && typeof answer.domain === 'object' && !Array.isArray(answer.domain)) {
          const { C: _integrationConstant, ...domain } = answer.domain as Record<string, unknown>;
          answer.domain = domain;
        }
      }
    }
    if (!scene.activitySpec || typeof scene.activitySpec !== 'object' || Array.isArray(scene.activitySpec)) continue;
    const spec = scene.activitySpec as Record<string, unknown>;
    if (typeof spec.evidence === 'string') spec.evidence = [spec.evidence];
    if (spec.relationship === 'sequential') spec.relationship = 'sequence';
    if (spec.kind === 'comparison' && Array.isArray(spec.columns)) {
      spec.columns = spec.columns.map((column) => column && typeof column === 'object'
        ? String((column as Record<string, unknown>).label ?? (column as Record<string, unknown>).title ?? (column as Record<string, unknown>).id ?? '')
        : String(column));
    }
    if (spec.kind === 'comparison' && Array.isArray(spec.rows)) {
      for (const value of spec.rows) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const row = value as Record<string, unknown>;
        if (Array.isArray(row.values)) {
          row.values = row.values.map((cell) => cell && typeof cell === 'object'
            ? String((cell as Record<string, unknown>).value ?? (cell as Record<string, unknown>).label ?? '')
            : String(cell));
        }
      }
      if (Array.isArray(spec.columns)) {
        const comparableWidth = Math.min(
          spec.columns.length,
          ...spec.rows.map((row) => row && typeof row === 'object' && Array.isArray((row as Record<string, unknown>).values)
            ? ((row as Record<string, unknown>).values as unknown[]).length
            : 0),
        );
        if (comparableWidth >= 2) {
          spec.columns = spec.columns.slice(0, comparableWidth);
          for (const value of spec.rows) {
            if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray((value as Record<string, unknown>).values)) {
              (value as Record<string, unknown>).values = ((value as Record<string, unknown>).values as unknown[]).slice(0, comparableWidth);
            }
          }
        }
      }
    }
    if (spec.kind === 'numeric_exploration' && Array.isArray(spec.outputs)) {
      for (const outputValue of spec.outputs) {
        if (!outputValue || typeof outputValue !== 'object' || Array.isArray(outputValue)) continue;
        const output = outputValue as Record<string, unknown>;
        if (Array.isArray(output.steps)) output.steps = output.steps.map(normalizeNumericStep);
      }
    }
    if (['coordinate_graph', 'equation_steps', 'process_diagram', 'timeline_evidence', 'code_trace'].includes(String(spec.kind)) && typeof spec.accessibleSummary !== 'string') {
      spec.accessibleSummary = `${String(scene.title ?? 'Interactive visual')}. ${String(scene.explanation ?? scene.introduction ?? '')}`.slice(0, 1_000);
    }
    if (Array.isArray(spec.lines)) {
      for (const value of spec.lines) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
        const line = value as Record<string, unknown>;
        if (typeof line.highlight === 'string') line.highlight = [line.highlight];
        else if (Array.isArray(line.highlight)) {
          line.highlight = line.highlight.filter(
            (highlight): highlight is string => typeof highlight === 'string' && highlight.trim().length > 0,
          );
        } else line.highlight = [];
        if (!['shown', 'faded', 'student'].includes(String(line.support))) {
          line.support = scene.phase === 'independent_check' ? 'student' : scene.phase === 'guided_application' ? 'faded' : 'shown';
        }
        if (typeof line.expression === 'string') line.expression = normalizeLegacyTeX(line.expression);
      }
    }
  }
  return recoverInstructionalPhaseLabels(draft);
}

function normalizeLegacyTeX(value: string) {
  const superscripts: Record<string, string> = {
    '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
    '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9', '⁻': '-',
  };
  return value
    .replace(/\bintegral\b/gi, '\\int')
    .replaceAll('∫', '\\int')
    .replaceAll('Σ', '\\sum')
    .replaceAll('≈', '\\approx')
    .replaceAll('×', '\\times')
    .replace(/d\s*\/\s*d([A-Za-z])/g, '\\frac{d}{d$1}')
    .replace(/([A-Za-z0-9)])([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)/g, (_match, base: string, power: string) =>
      `${base}^{${[...power].map((part) => superscripts[part] ?? part).join('')}}`,
    )
    .replace(/\s+d([A-Za-z])\b/g, '\\,d$1')
    .trim();
}

function normalizeNumericStep(value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string') return value;
  const normalized = value.toLowerCase().replace(/\s+/g, ' ').trim();
  const operation = /(?:\bmultiply\b|\btimes\b|\*)/.test(normalized) ? 'multiply'
    : /(?:\bdivide\b|\/)/.test(normalized) ? 'divide'
      : /(?:\bsubtract\b|\bminus\b)/.test(normalized) ? 'subtract'
        : /(?:\badd\b|\bplus\b)/.test(normalized) ? 'add'
          : null;
  if (!operation) return value;
  if (/\b(input|slider|variable|selected value|current value)\b/.test(normalized)) {
    return { operation, operand: { source: 'input' } };
  }
  const number = normalized.match(/-?\d+(?:\.\d+)?/)?.[0];
  return number === undefined
    ? value
    : { operation, operand: { source: 'constant', value: Number(number) } };
}

function issue(code: string, message: string, retryable: boolean) {
  return Object.assign(new Error(message), { issueCode: code, retryable });
}

function preparationFailure(error: unknown): Error & { issueCode?: string; retryable?: boolean } {
  const typed = (error instanceof Error ? error : new Error(String(error))) as Error & {
    issueCode?: string;
    retryable?: boolean;
    getResponse?: () => unknown;
  };
  if (typed.issueCode || typeof typed.getResponse !== 'function') return typed;
  const response = typed.getResponse();
  if (!response || typeof response !== 'object') return typed;
  const detail = response as Record<string, unknown>;
  const failures = Array.isArray(detail.detail) ? detail.detail.map(String) : [];
  const message = failures.length
    ? `The configured AI routes failed (${failures.join(', ')}). You can retry without losing this preparation.`
    : typeof detail.message === 'string' ? detail.message : typed.message;
  return Object.assign(new Error(message), {
    issueCode: typeof detail.code === 'string' ? detail.code : 'PETROS_PREPARATION_FAILED',
    retryable: true,
  });
}
