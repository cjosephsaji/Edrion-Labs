import { randomUUID } from 'node:crypto';
import { MeasurePetrosRuntime } from '../../../common/petros-runtime-metrics';
import type { ApiEnv } from '@edrion/config';
import { LocalDiskDriver } from '../storage/drivers/local-disk.driver';
import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, schema, type Database } from '@edrion/database';
import {
  petrosDocumentLocatorSchema,
  petrosPdfExtractionSnapshotSchema,
  petrosResolvedDocumentLocatorSchema,
  type PetrosDocumentLocator,
  petrosDocumentSearchSchema,
  type PetrosDocumentSearch,
  petrosSourceComparisonSchema,
  petrosSessionBlockSchema,
  type PetrosSourceComparison,
} from '@edrion/schemas';
import { retrieveDocumentSpans } from './knowledge-document-retrieval';
import { API_ENV, DATABASE } from '../../../common/tokens';
import { StudentMaterialsService } from '../materials/student-materials.service';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';
import {
  documentPageCitation,
  documentReadiness,
  documentSourceVersion,
  documentTextHash,
  hasUsableDocumentText,
  requireDocumentReady,
  type SourceItem,
} from '../petros-session-intent/petros-document-source';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Item = typeof schema.knowledgeItems.$inferSelect;

/** Called within the existing publication transaction, after the material/owner lock. */
export async function publishKnowledgeExtraction(tx: Transaction, item: Item, texts: string[]) {
  const snapshot = petrosPdfExtractionSnapshotSchema.parse({
    institutionId: item.institutionId,
    studentId: item.studentId,
    id: item.id,
    version: item.version,
    kind: item.kind,
    title: item.title,
    objectIds: item.objectIds,
    origin: item.origin,
    pageCount: item.pageCount,
    pagesDone: item.pagesDone,
    status: item.status,
    extractedTextReady: item.extractedTextReady,
    indexReady: item.indexReady,
  });
  // Logical identity excludes mutable counters, timestamps and random page/version IDs.
  const { version: _counter, ...content } = snapshot;
  const fingerprint = documentTextHash(
    JSON.stringify(
      canonical({
        contract: 'knowledge.pdf-extraction.v1',
        content,
        pages: texts,
      }),
    ),
  );

  const [existing] = await tx
    .select()
    .from(schema.knowledgeItemVersions)
    .where(
      and(
        eq(schema.knowledgeItemVersions.itemId, item.id),
        eq(schema.knowledgeItemVersions.fingerprint, fingerprint),
      ),
    )
    .limit(1);
  if (existing) {
    if (existing.invalidatedAt) throw invalidated();
    return { version: existing, replayed: true };
  }
  const [version] = await tx
    .insert(schema.knowledgeItemVersions)
    .values({
      itemId: item.id,
      fingerprint,
      ordinal: item.version,
      objectId: item.objectIds[0]!,
      snapshot,
      pageCount: texts.length,
      admissible: texts.some(hasUsableDocumentText),
    })
    .returning();
  await tx.insert(schema.knowledgeItemVersionPages).values(
    texts.map((text, pageIndex) => ({
      versionId: version!.id,
      pageIndex,
      text,
    })),
  );
  const [complete] = await tx
    .update(schema.knowledgeItemVersions)
    .set({ state: 'complete' })
    .where(eq(schema.knowledgeItemVersions.id, version!.id))
    .returning();
  return { version: complete!, replayed: false };
}

/** One access boundary for live and historical knowledge content; no in-process access cache. */
@Injectable()
export class KnowledgeDocumentService {
  private readonly driver: LocalDiskDriver;
  private readonly retrievalEnabled: boolean;
  private readonly comparisonEnabled: boolean;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly materials: StudentMaterialsService,
    @Inject(API_ENV) env: ApiEnv,
  ) {
    this.driver = new LocalDiskDriver(env);
    this.retrievalEnabled = env.PETROS_DOCUMENT_RETRIEVAL_ENABLED;
    this.comparisonEnabled = env.PETROS_MULTI_SOURCE_ENABLED;
  }

  @MeasurePetrosRuntime('retrieval_search')
  async search(
    scope: PetrosOwnerScope,
    itemId: string,
    raw: PetrosDocumentSearch,
    signal?: AbortSignal,
  ) {
    if (!this.retrievalEnabled)
      throw new ConflictException({
        code: 'PETROS_SOURCE_RETRIEVAL_DISABLED',
        message: 'Document search is not enabled.',
      });
    signal?.throwIfAborted();
    const input = petrosDocumentSearchSchema.parse(raw);
    const document = await this.resolve(scope, itemId, undefined, input.sourceVersion);
    signal?.throwIfAborted();
    if (!document.version) throw stale();
    const readiness = documentReadiness(document.item, document.allPages, input.pages);
    // Unreadable selected pages are disclosed, never indexed. Structural/global failures deny access.
    if (
      readiness.reasons.some(
        (reason) =>
          !['unreadable_text', 'confirmation_required', 'missing_pages', 'pending'].includes(
            reason,
          ),
      )
    )
      requireDocumentReady(readiness);
    if (input.pages.some((page) => page > document.item.pageCount!))
      requireDocumentReady(readiness);
    const unavailable = input.pages
      .filter((page) => readiness.unavailablePages.includes(page))
      .sort((a, b) => a - b);
    const available = input.pages.filter((page) => !unavailable.includes(page));
    if (available.length)
      requireDocumentReady(documentReadiness(document.item, document.allPages, available));
    return retrieveDocumentSpans(
      itemId,
      input,
      document.allPages,
      document.item.pageCount!,
      unavailable,
      signal,
    );
  }

  /** A bounded source set, never a cross-owner index or an adjudication of truth. */
  async compare(scope: PetrosOwnerScope, raw: PetrosSourceComparison, signal?: AbortSignal) {
    this.requireComparisonEnabled();
    const input = petrosSourceComparisonSchema.parse(raw);
    const results = [];
    for (const source of input.sources) {
      signal?.throwIfAborted();
      const current = await this.resolve(scope, source.sourceId);
      if (current.version?.fingerprint !== source.sourceVersion) throw stale();
      const retrieval = await this.search(scope, source.sourceId, {sourceVersion: source.sourceVersion,
        pages: source.pages, query: input.question, purpose: 'source_lookup', limit: 2}, signal);
      results.push({title: current.item.title, ...retrieval});
    }
    // Recheck every authority after retrieval: a revoked source cannot yield a partial reply.
    for (const source of input.sources) {
      const current = await this.resolve(scope, source.sourceId);
      if (current.version?.fingerprint !== source.sourceVersion) throw stale();
    }
    signal?.throwIfAborted();
    const comparisonId = documentTextHash(JSON.stringify({version: input.schemaVersion,
      owner: `${scope.institutionId}:${scope.studentId}`, question: input.question, sources: input.sources}));
    const signatures = results.map(result => result.hits.map(hit => hit.source.text.trim()).join('\n'));
    return {schemaVersion: input.schemaVersion, comparisonId, question: input.question,
      selectedScope: input.sources, sources: results,
      conceptIdentity: {kind: 'comparison_question', id: comparisonId, canonicalConceptMerged: false},
      status: signatures.some(text => !text) ? 'missing_support' : new Set(signatures).size > 1 ? 'different_passages' : 'matching_passages',
      uncertainty: 'These are selected extracted passages. Different wording may reflect a conflict, different assumptions or different coverage. No source is treated as overriding another; agreement does not establish correctness.',
      evidenceRecorded: false,
      studyPlan: {objective: {id: comparisonId, statement: 'Explain agreement, disagreement and assumptions across the selected sources.', canonicalConceptMerged: false},
        assessmentConditions: {supervision: 'unknown', externalAssistance: 'unknown', purpose: 'exploratory_synthesis', evidenceRecorded: false},
        block: petrosSessionBlockSchema.parse({id: randomUUID(),sessionId: randomUUID(),decisionId: randomUUID(),sequence: 1,status: 'current',version: 0,
          content: {schemaVersion: 'petros.render.v2',type: 'layered_explanation',title: 'Build a careful synthesis',
            firstLayer: 'Read each cited passage separately. Identify what it claims and the conditions under which that claim applies. Keep disagreement visible in your explanation.',
            deeperLayers: [{id: 'compare-conditions',label: 'Compare claims and conditions',content: 'For each source, state its claim in your own words and name any assumptions. Distinguish conflicting claims from differences in scope. Cite the exact passage for each statement.'},
              {id: 'write-synthesis',label: 'Write a qualified synthesis',content: 'Explain what the sources agree on, where they differ, and what remains unresolved. Do not choose a winner from wording alone. Inspect the originals or ask a qualified teacher when the evidence is insufficient.'}],
            keyIdea: 'A shared question connects these sources; their claims and authority remain separate.',
            sourceGrounding: results.map(result => ({label: result.title.slice(0,160),reference: `Source ${result.sourceId} version ${result.sourceVersion}`}))},
          interactionState: {},observedOutcome: null,questions: [],whyThis: 'Guided exploratory synthesis of currently authorized, explicitly pinned sources. No factual merged answer or assessment is generated.',
          correlationId: randomUUID(),delivery: 'deterministic_fallback',createdAt: new Date().toISOString(),completedAt: null})}};
  }

  async selectedScope(scope: PetrosOwnerScope, sourceId: string) {
    this.requireComparisonEnabled();
    const document = await this.resolve(scope, sourceId);
    if (!document.version) throw stale();
    const readiness = documentReadiness(document.item, document.allPages);
    requireDocumentReady(readiness);
    return {sourceId, title: document.item.title, sourceVersion: document.version.fingerprint,
      pages: readiness.selectedPages, coverage: 'extracted_text_only'};
  }

  private requireComparisonEnabled() {
    if (!this.comparisonEnabled || !this.retrievalEnabled) throw new ConflictException({
      code: 'PETROS_MULTI_SOURCE_DISABLED', message: 'Source comparison is not enabled.'});
  }

  /** The lesson owns this scope. A student question cannot widen its selected pages or change its pin. */
  async searchContext(
    scope: PetrosOwnerScope,
    context: Record<string, unknown> | null,
    query: string,
  ) {
    if (!this.retrievalEnabled || context?.door !== 'uploaded_document') return null;
    await this.assertContext(scope, context);
    const citations = context.citations as Array<{ page: number }>;
    return this.search(scope, context.referenceId as string, {
      sourceVersion: context.sourceFingerprint as string,
      query,
      purpose: 'lesson_question',
      pages: [...new Set(citations.map((citation) => citation.page))],
      limit: 3,
    });
  }

  @MeasurePetrosRuntime('source_resolve')
  async resolve(scope: PetrosOwnerScope, itemId: string, page?: number, fingerprint?: string) {
    const [live] = await this.db
      .select()
      .from(schema.knowledgeItems)
      .where(
        and(
          eq(schema.knowledgeItems.id, itemId),
          eq(schema.knowledgeItems.institutionId, scope.institutionId),
          eq(schema.knowledgeItems.studentId, scope.studentId),
        ),
      )
      .limit(1);
    if (!live || live.sourceRevokedAt) throw unavailable();
    const conditions = [eq(schema.knowledgeItemVersions.itemId, live.id)];
    if (fingerprint) conditions.push(eq(schema.knowledgeItemVersions.fingerprint, fingerprint));
    const [version] = await this.db
      .select()
      .from(schema.knowledgeItemVersions)
      .where(and(...conditions))
      .orderBy(
        desc(schema.knowledgeItemVersions.admissible),
        desc(schema.knowledgeItemVersions.ordinal),
        desc(schema.knowledgeItemVersions.id),
      )
      .limit(1);
    if (
      version &&
      (version.snapshot.institutionId !== scope.institutionId ||
        version.snapshot.studentId !== scope.studentId ||
        version.snapshot.id !== itemId)
    )
      throw unavailable();
    if (version?.invalidatedAt) throw invalidated();
    if (version && version.state !== 'complete') throw unavailable();
    const parsed = version ? petrosPdfExtractionSnapshotSchema.safeParse(version.snapshot) : null;
    if (parsed && !parsed.success) throw unavailable();
    const item =
      version && parsed?.success
        ? ({ ...live, ...parsed.data, extractionFingerprint: version.fingerprint } as Item &
            SourceItem)
        : live;
    // Membership and material existence are checked even for superseded snapshots.
    const materialId = live.origin.classMaterialId;
    if (live.origin.source === 'teacher_class_material' || materialId != null) {
      if (typeof materialId !== 'string' || item.origin.classMaterialId !== materialId)
        throw unavailable();
      const currentFile = await this.materials.file(scope, materialId);
      if (!version && !live.objectIds.includes(currentFile.objectId)) throw unavailable();
    }
    if (item.objectIds.length !== 1) {
      // Readiness gives the specific multi-file recovery error for legacy records.
      if (version) throw unavailable();
    }
    for (const objectId of item.objectIds) {
      const [object] = await this.db
        .select()
        .from(schema.storageObjects)
        .where(
          and(
            eq(schema.storageObjects.id, objectId),
            eq(schema.storageObjects.institutionId, scope.institutionId),
          ),
        )
        .limit(1);
      if (!object || !['uploaded', 'ready'].includes(object.processingStatus)) throw unavailable();
      if (!materialId && object.ownerStudentId !== scope.studentId) throw unavailable();
      // An original replaced in-place cannot masquerade as the historical file.
      const extraction = item.origin.petrosExtraction as { fileSha256?: string } | undefined;
      if (version && (!object.checksumSha256 || object.checksumSha256 !== extraction?.fileSha256))
        throw unavailable();
      if (version) {
        if (object.driver !== 'local') throw unavailable(); // No remote storage adapter is authorized by this increment.
        try {
          if ((await this.driver.size(object.storageKey)) !== object.sizeBytes) throw unavailable();
        } catch {
          throw unavailable();
        }
      }
    }
    const allPages = version
      ? (
          await this.db
            .select()
            .from(schema.knowledgeItemVersionPages)
            .where(eq(schema.knowledgeItemVersionPages.versionId, version.id))
            .orderBy(asc(schema.knowledgeItemVersionPages.pageIndex))
        ).map((row) => ({
          ...row,
          itemId: live.id,
          objectId: version.objectId,
          needsConfirm: !hasUsableDocumentText(row.text),
          ocrConfidence: null,
          confirmedAt: null,
          updatedAt: row.createdAt,
        }))
      : await this.db
          .select()
          .from(schema.knowledgeItemPages)
          .where(eq(schema.knowledgeItemPages.itemId, live.id))
          .orderBy(asc(schema.knowledgeItemPages.pageIndex));
    if (fingerprint && documentSourceVersion(item, allPages) !== fingerprint) throw stale();
    return {
      item,
      pages: page == null ? allPages : allPages.filter((row) => row.pageIndex === page - 1),
      allPages,
      version,
      currentVersion: live.version,
    };
  }

  async assertContext(
    scope: PetrosOwnerScope,
    context: Record<string, unknown> | null | undefined,
  ) {
    if (context?.door !== 'uploaded_document') return;
    if (typeof context.referenceId !== 'string' || typeof context.sourceFingerprint !== 'string')
      throw stale();
    const document = await this.resolve(
      scope,
      context.referenceId,
      undefined,
      context.sourceFingerprint,
    );
    const citations = context.citations;
    if (!Array.isArray(citations) || !citations.length) throw stale();
    const pages: number[] = [];
    for (const citation of citations) {
      if (!citation || typeof citation.page !== 'number' || citation.sourceId !== document.item.id)
        throw stale();
      const page = document.allPages.find((row) => row.pageIndex + 1 === citation.page);
      if (!page) throw stale();
      const exact = documentPageCitation(
        document.item,
        page,
        context.sourceFingerprint,
        citation.section ?? 'Source',
      );
      if (citation.excerpt !== exact.excerpt || citation.version !== exact.version) throw stale();
      if (citation.locator) {
        const parsed = petrosDocumentLocatorSchema.safeParse(citation.locator);
        if (!parsed.success || JSON.stringify(parsed.data) !== JSON.stringify(exact.locator))
          throw stale();
      }
      pages.push(citation.page);
    }
    requireDocumentReady(documentReadiness(document.item, document.allPages, pages));
  }

  async canReadContext(scope: PetrosOwnerScope, context: Record<string, unknown> | null) {
    try {
      await this.assertContext(scope, context);
      return true;
    } catch (error) {
      if (error instanceof NotFoundException || error instanceof ConflictException) return false;
      throw error;
    }
  }

  async canReadSession(scope: PetrosOwnerScope, sessionId: string) {
    const [session] = await this.db
      .select({ sourceContext: schema.petrosLearningSessions.sourceContext })
      .from(schema.petrosLearningSessions)
      .where(
        and(
          eq(schema.petrosLearningSessions.id, sessionId),
          eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
          eq(schema.petrosLearningSessions.studentId, scope.studentId),
        ),
      )
      .limit(1);
    return !!session && this.canReadContext(scope, session.sourceContext);
  }

  async canReadArtifact(
    scope: PetrosOwnerScope,
    artifact: Pick<typeof schema.petrosSavedArtifacts.$inferSelect, 'sessionId' | 'sources'>,
  ) {
    const sessionId =
      artifact.sessionId ?? artifact.sources.find((source) => source.sessionId)?.sessionId;
    if (sessionId) return this.canReadSession(scope, sessionId);
    return !artifact.sources.some((source) => source.kind === 'document_page');
  }

  async locator(scope: PetrosOwnerScope, itemId: string, input: PetrosDocumentLocator) {
    const locator = petrosDocumentLocatorSchema.parse(input);
    const document = await this.resolve(scope, itemId, locator.page, locator.sourceVersion);
    // This endpoint promises immutable history, so it never promotes legacy current pages.
    if (!document.version) throw stale();
    const page = document.pages.find((row) => row.id === locator.unitId);
    if (
      !page ||
      page.objectId !== locator.objectId ||
      documentTextHash(page.text) !== locator.textSha256 ||
      locator.end > page.text.length ||
      locator.end - locator.start > 1200
    )
      throw unavailable();
    requireDocumentReady(documentReadiness(document.item, document.allPages, locator.page));
    return petrosResolvedDocumentLocatorSchema.parse({
      locator,
      text: page.text.slice(locator.start, locator.end),
    });
  }

  /** Internal lifecycle boundary. Callers must use an authorized owner/tenant transaction. */
  async invalidate(scope: PetrosOwnerScope, itemId: string, fingerprint: string, reason: string) {
    await this.resolve(scope, itemId, undefined, fingerprint);
    if (!reason.trim()) throw new Error('An invalidation reason is required');
    await this.db
      .update(schema.knowledgeItemVersions)
      .set({ invalidatedAt: new Date(), invalidationReason: reason.slice(0, 1000) })
      .where(
        and(
          eq(schema.knowledgeItemVersions.itemId, itemId),
          eq(schema.knowledgeItemVersions.fingerprint, fingerprint),
        ),
      );
  }
}

function unavailable() {
  return new NotFoundException({
    code: 'PETROS_SOURCE_UNAVAILABLE',
    message: 'This source is no longer available to you.',
  });
}
function invalidated() {
  return new ConflictException({
    code: 'PETROS_SOURCE_INVALIDATED',
    message:
      'This extraction was invalidated. Prepare a corrected source before starting another lesson.',
  });
}
function stale() {
  return new ConflictException({
    code: 'PETROS_INTENT_STALE',
    message: 'This legacy source cannot be verified. Open a fresh document preview.',
  });
}

/** PostgreSQL jsonb reorders object keys; logical identity must survive its round-trip. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  return value;
}
