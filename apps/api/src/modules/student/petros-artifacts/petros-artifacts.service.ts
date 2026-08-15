import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  PETROS_ARTIFACT_PROPOSAL_VERSION,
  PETROS_ARTIFACT_FUNCTION_KEYS,
  PETROS_ARTIFACT_PROMPT_VERSION,
  PETROS_ARTIFACT_SCHEMA_VERSION,
  PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
  PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
  PETROS_REVIEW_SCHEDULER_VERSION,
  firstPetrosReview,
  mixPetrosReviewTopics,
  petrosArtifactBundleSchema,
  petrosArtifactCommitResultSchema,
  petrosArtifactContentSchema,
  petrosSavedArtifactSchema,
  schedulePetrosReview,
  type PetrosArtifactBundle,
  type PetrosArtifactCommitResult,
  type PetrosArtifactContent,
  type PetrosArtifactQuery,
  type PetrosArtifactLifecycleInput,
  type PetrosArtifactSource,
  type PetrosCommitArtifactBundleInput,
  type PetrosSubmitArtifactReviewInput,
  type PetrosUpdateArtifactProposalInput,
  type PetrosUpdateSavedArtifactInput,
} from '@edrion/schemas';
import { PetrosLearnerModelService } from '../../petros-learner-model/petros-learner-model.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';
import { PetrosArtifactsRepository } from './petros-artifacts.repository';

@Injectable()
export class PetrosArtifactsService {
  constructor(
    private readonly repo: PetrosArtifactsRepository,
    private readonly learnerModels: PetrosLearnerModelService,
  ) {}

  async bundle(principal: InstitutionalStudentPrincipal, sessionId: string): Promise<PetrosArtifactBundle> {
    const scope = owner(principal);
    const session = await this.repo.findSession(scope, sessionId);
    if (!session) throw artifactNotFound('PETROS_SESSION_NOT_FOUND', 'Session not found.');
    let bundle = await this.repo.findBundle(scope, sessionId);
    if (!bundle) {
      const blocks = await this.repo.listSessionBlocks(scope, sessionId);
      const seeds = proposalSeeds(session, blocks);
      if (!seeds.length) {
        throw new ConflictException({
          code: 'PETROS_ARTIFACTS_NOT_READY',
          message: 'The session has not reached its artifact review bundle yet.',
        });
      }
      await this.repo.createBundle(scope, sessionId, forwardLink(blocks), seeds);
      bundle = await this.repo.findBundle(scope, sessionId);
    }
    if (!bundle) throw artifactNotFound('PETROS_BUNDLE_NOT_FOUND', 'Artifact bundle not found.');
    return this.bundleDto(scope, bundle);
  }

  async updateProposal(
    principal: InstitutionalStudentPrincipal,
    proposalId: string,
    input: PetrosUpdateArtifactProposalInput,
  ) {
    const scope = owner(principal);
    try {
      assertStudentSafeContent(input.content);
    } catch (error) {
      await Promise.all([
        this.repo.recordFailureEvent(scope, { type: 'artifact.save_failed', proposalId, payload: { kind: input.content.kind, code: 'PETROS_ARTIFACT_UNSAFE_CONTENT' } }),
        this.repo.recordFailureEvent(scope, { type: 'artifact.sanitization_failed', proposalId, payload: { kind: input.content.kind } }),
      ]);
      throw error;
    }
    const proposal = await this.repo.updateProposal(scope, proposalId, input.expectedVersion, input.selected, input.content);
    if (!proposal) throw staleProposal();
    const bundle = await this.repo.findBundleById(scope, proposal.bundleId);
    if (!bundle) throw artifactNotFound('PETROS_BUNDLE_NOT_FOUND', 'Artifact bundle not found.');
    return this.bundleDto(scope, bundle);
  }

  async discard(principal: InstitutionalStudentPrincipal, bundleId: string, expectedVersion: number) {
    const scope = owner(principal);
    const discarded = await this.repo.discardBundle(scope, bundleId, expectedVersion);
    if (!discarded) throw staleBundle();
    return this.bundleDto(scope, discarded);
  }

  async commit(
    principal: InstitutionalStudentPrincipal,
    bundleId: string,
    input: PetrosCommitArtifactBundleInput,
  ): Promise<PetrosArtifactCommitResult> {
    const startedAt = Date.now();
    const scope = owner(principal);
    const bundle = await this.repo.findBundleById(scope, bundleId);
    if (!bundle) throw artifactNotFound('PETROS_BUNDLE_NOT_FOUND', 'Artifact bundle not found.');
    if (bundle.state === 'discarded') throw new ConflictException({ code: 'PETROS_BUNDLE_DISCARDED', message: 'This proposal bundle was discarded.' });
    if (bundle.version !== input.expectedBundleVersion) throw staleBundle();
    const command = await this.repo.beginCommit(scope, bundleId, input.idempotencyKey);
    if (command.state === 'completed') return petrosArtifactCommitResultSchema.parse(command.response);
    if (command.state === 'in_flight' || !command.command) throw new ConflictException({ code: 'PETROS_ARTIFACT_COMMIT_IN_FLIGHT', message: 'These artifacts are already being saved.' });
    try {
      const session = await this.repo.findSession(scope, bundle.sessionId);
      if (!session) throw artifactNotFound('PETROS_SESSION_NOT_FOUND', 'Session not found.');
      const proposals = await this.repo.listProposals(scope, bundleId);
      const requested = new Set(input.proposalIds);
      if (requested.size !== input.proposalIds.length || proposals.filter((proposal) => requested.has(proposal.id)).length !== requested.size) {
        throw new BadRequestException({ code: 'PETROS_PROPOSAL_SELECTION_INVALID', message: 'Select proposals from this bundle only.' });
      }
      if (proposals.some((proposal) => requested.has(proposal.id) && !proposal.selected && proposal.state !== 'saved')) {
        throw new BadRequestException({
          code: 'PETROS_PROPOSAL_NOT_CURATED',
          message: 'Each item must be explicitly selected from the editable review bundle before save.',
        });
      }
      const examDate = sourceExamDate(session.sourceContext) ?? await this.repo.findNextExamDate(scope);
      const timezone = sourceTimezone(session.learnerContext);
      const results: PetrosArtifactCommitResult['results'] = [];
      for (const proposal of proposals.filter((candidate) => requested.has(candidate.id))) {
        try {
          const content = petrosArtifactContentSchema.parse(proposal.content);
          assertStudentSafeContent(content);
          const firstReview = content.kind === 'flashcard' || content.kind === 'rule_card'
            ? firstPetrosReview(new Date(), timezone, examDate)
            : null;
          const saved = await this.repo.saveProposal({
            scope, bundleId, proposalId: proposal.id, topic: session.topic,
            portableId: randomUUID(), firstReview, examDate,
          });
          if (saved.state === 'saved' || saved.state === 'already_saved') {
            if (saved.state === 'already_saved') {
              await this.repo.recordOperationalEvent(scope, {
                type: 'artifact.duplicate_prevented', sessionId: session.id, bundleId,
                proposalId: proposal.id, artifactId: saved.artifact?.id,
                payload: { kind: proposal.kind },
              });
            }
            results.push({
              proposalId: proposal.id,
              status: saved.state === 'saved' ? 'saved' : 'already_saved',
              artifactId: saved.artifact?.id ?? null,
              errorCode: null,
              recovery: null,
            });
          } else {
            results.push({ proposalId: proposal.id, status: 'failed', artifactId: null, errorCode: `PETROS_PROPOSAL_${saved.state.toUpperCase()}`, recovery: 'Reload the bundle, edit or reselect this item, and retry it.' });
          }
        } catch (error) {
          const code = errorCode(error);
          await this.repo.markProposalFailed(scope, proposal.id, code);
          await this.repo.recordOperationalEvent(scope, {
            type: 'artifact.save_failed', sessionId: session.id, bundleId,
            proposalId: proposal.id, payload: { kind: proposal.kind, code },
          });
          if (code === 'PETROS_ARTIFACT_UNSAFE_CONTENT') {
            await this.repo.recordOperationalEvent(scope, {
              type: 'artifact.sanitization_failed', sessionId: session.id, bundleId,
              proposalId: proposal.id, payload: { kind: proposal.kind },
            });
          }
          results.push({ proposalId: proposal.id, status: 'failed', artifactId: null, errorCode: code, recovery: 'Your edits are still here. Review this item and retry save.' });
        }
      }
      const refreshed = await this.repo.refreshBundleState(scope, bundleId);
      if (!refreshed) throw artifactNotFound('PETROS_BUNDLE_NOT_FOUND', 'Artifact bundle not found.');
      const response = petrosArtifactCommitResultSchema.parse({ bundle: await this.bundleDto(scope, refreshed), results });
      await this.repo.finishCommit(command.command.id, response as unknown as Record<string, unknown>);
      try {
        await this.repo.recordOperationalEvent(scope, {
          type: 'artifact.commit_completed', sessionId: bundle.sessionId, bundleId,
          payload: {
            durationMs: Date.now() - startedAt,
            requested: requested.size,
            saved: results.filter((result) => result.status === 'saved').length,
            alreadySaved: results.filter((result) => result.status === 'already_saved').length,
            failed: results.filter((result) => result.status === 'failed').length,
          },
        });
        await this.repo.recordDoorArtifactSave(
          scope,
          session.id,
          results.filter((result) => result.status === 'saved').length,
        );
      } catch {
        // Product persistence has already committed; telemetry must not turn success into failure.
      }
      return response;
    } catch (error) {
      await this.repo.failCommit(command.command.id, errorCode(error));
      try {
        await this.repo.recordFailureEvent(scope, {
          type: 'artifact.commit_failed', bundleId,
          payload: { durationMs: Date.now() - startedAt, code: errorCode(error) },
        });
      } catch {
        // Preserve the original command error when the independent telemetry write is unavailable.
      }
      throw error;
    }
  }

  async list(principal: InstitutionalStudentPrincipal, query: PetrosArtifactQuery) {
    const rows = await this.repo.listSaved(owner(principal), query);
    return rows.map(savedDto);
  }

  async export(principal: InstitutionalStudentPrincipal, forTransfer: boolean) {
    const scope = owner(principal);
    const rows = await this.repo.listSaved(scope, { limit: 100 });
    await this.repo.recordOperationalEvent(scope, {
      type: forTransfer ? 'job.transfer' : 'job.export',
      payload: { artifactCount: rows.length, restrictedSourcesRemoved: forTransfer },
    });
    return {
      schemaVersion: PETROS_ARTIFACT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      portable: true,
      artifacts: rows.map((row) => {
        const dto = savedDto(row);
        return forTransfer
          ? { ...dto, sources: dto.sources.filter((source) => !source.institutionRestricted).map((source) => ({ ...source, excerpt: null })) }
          : dto;
      }),
      transferNotice: forTransfer
        ? 'Institution-restricted sources and excerpts were removed; learner-created artifact content remains portable.'
        : null,
    };
  }

  async updateSaved(principal: InstitutionalStudentPrincipal, artifactId: string, input: PetrosUpdateSavedArtifactInput) {
    const scope = owner(principal);
    try {
      assertStudentSafeContent(input.content);
    } catch (error) {
      await Promise.all([
        this.repo.recordFailureEvent(scope, { type: 'artifact.save_failed', payload: { kind: input.content.kind, code: 'PETROS_ARTIFACT_UNSAFE_CONTENT' } }),
        this.repo.recordFailureEvent(scope, { type: 'artifact.sanitization_failed', payload: { kind: input.content.kind } }),
      ]);
      throw error;
    }
    const artifact = await this.repo.updateSaved(scope, artifactId, input.expectedRevision, input.content);
    if (!artifact) throw new ConflictException({ code: 'PETROS_ARTIFACT_STALE', message: 'This artifact changed. Reload before saving your revision.' });
    return savedDto(artifact);
  }

  async source(principal: InstitutionalStudentPrincipal, artifactId: string, sourceIndex: number) {
    const scope = owner(principal);
    const artifact = await this.repo.findSaved(scope, artifactId);
    if (!artifact) throw artifactNotFound('PETROS_ARTIFACT_NOT_FOUND', 'Artifact not found.');
    const sources = artifact.sources as PetrosArtifactSource[];
    const source = sources[sourceIndex];
    if (!source) throw artifactNotFound('PETROS_ARTIFACT_SOURCE_NOT_FOUND', 'Source reference not found.');
    if (source.kind === 'session_block') {
      const resolved = await this.repo.resolveSessionBlock(scope, source.sessionId, source.blockId);
      const result = resolved
        ? { available: true, source, href: `/petros/session?session=${source.sessionId}${source.blockId ? `#block-${source.blockId}` : ''}`, reason: null }
        : { available: false, source: { ...source, excerpt: null }, href: null, reason: 'This session block is no longer available. The artifact remains yours.' };
      if (!result.available) await this.repo.recordOperationalEvent(scope, { type: 'source.unavailable', sessionId: artifact.sessionId ?? undefined, artifactId, payload: { kind: source.kind } });
      return result;
    }
    if (source.kind === 'document_page') {
      const resolved = await this.repo.resolveKnowledgeSource(scope, source.knowledgeItemId!, source.pageIndex!);
      const result = resolved?.pageId && resolved.status !== 'error'
        ? { available: true, source, href: `/library/${source.knowledgeItemId}?page=${source.pageIndex! + 1}`, reason: null }
        : { available: false, source: { ...source, excerpt: null }, href: null, reason: 'The source page was removed, restricted, or is still unavailable. The artifact remains yours.' };
      if (!result.available) await this.repo.recordOperationalEvent(scope, { type: 'source.unavailable', sessionId: artifact.sessionId ?? undefined, artifactId, payload: { kind: source.kind } });
      return result;
    }
    const result = source.assessmentId
      ? { available: true, source: { ...source, excerpt: null }, href: `/results?resultId=${source.assessmentId}`, reason: source.institutionRestricted ? 'The assessment remains institution-restricted and is excluded from transfers.' : null }
      : { available: false, source: { ...source, excerpt: null }, href: null, reason: 'The assessment source is unavailable. The artifact remains yours.' };
    if (!result.available) await this.repo.recordOperationalEvent(scope, { type: 'source.unavailable', sessionId: artifact.sessionId ?? undefined, artifactId, payload: { kind: source.kind } });
    return result;
  }

  async deleteSaved(principal: InstitutionalStudentPrincipal, artifactId: string) {
    const scope = owner(principal);
    const receipt = await this.repo.deleteSaved(scope, artifactId);
    if (!receipt) throw artifactNotFound('PETROS_ARTIFACT_NOT_FOUND', 'Artifact not found.');
    await this.repo.recordOperationalEvent(scope, { type: 'job.deletion' });
    return { ...receipt, deleted: true, recoverable: false };
  }

  async lifecycle(principal: InstitutionalStudentPrincipal, artifactId: string, input: PetrosArtifactLifecycleInput) {
    const artifact = await this.repo.setLifecycle(owner(principal), artifactId, input.action);
    if (!artifact) throw artifactNotFound('PETROS_ARTIFACT_NOT_FOUND', 'Artifact not found.');
    return savedDto(artifact);
  }

  async rebuildSchedule(principal: InstitutionalStudentPrincipal) {
    const rows = await this.repo.rebuildSchedulerVersion(owner(principal), PETROS_REVIEW_SCHEDULER_VERSION);
    return {
      schedulerVersion: PETROS_REVIEW_SCHEDULER_VERSION,
      cardsUpdated: rows.length,
      reviewHistoryPreserved: true,
    };
  }

  async due(principal: InstitutionalStudentPrincipal, limit: number) {
    const rows = await this.repo.listDue(owner(principal), new Date(), Math.min(100, Math.max(1, limit)));
    const cards = rows.map((row) => {
      const dto = savedDto(row);
      const content = dto.content;
      return {
        artifact: dto,
        deckId: row.productTargetId,
        topic: content.tags[0] ?? content.title,
        dueAt: row.dueAt!.toISOString(),
        schedulerVersion: row.schedulerVersion ?? PETROS_REVIEW_SCHEDULER_VERSION,
        examDate: row.examDate,
        scheduleExplanation: row.examAware
          ? 'The interval is safely tighter because a known exam is approaching.'
          : 'The interval follows your prior result and confidence.',
      };
    });
    return {
      cards: mixPetrosReviewTopics(cards),
      mixingExplanation: 'Topics are intentionally mixed: the extra retrieval difficulty makes review more durable.',
      generatedAt: new Date().toISOString(),
    };
  }

  async review(principal: InstitutionalStudentPrincipal, artifactId: string, input: PetrosSubmitArtifactReviewInput) {
    const scope = owner(principal);
    const artifact = await this.repo.findSaved(scope, artifactId);
    if (!artifact || !['flashcard', 'rule_card'].includes(artifact.kind)) throw artifactNotFound('PETROS_REVIEW_CARD_NOT_FOUND', 'Review card not found.');
    const reviewedAt = new Date(input.reviewedAt);
    if (reviewedAt > new Date(Date.now() + 5 * 60_000)) throw new BadRequestException({ code: 'PETROS_REVIEW_TIME_INVALID', message: 'A review cannot be recorded in the future.' });
    const scheduled = schedulePetrosReview({
      state: {
        dueAt: artifact.dueAt ?? artifact.createdAt,
        intervalDays: (artifact.intervalMinutes ?? 0) / 1_440,
        ease: (artifact.easeBasisPoints ?? 25_000) / 10_000,
        reps: artifact.reviewReps,
        lapses: artifact.reviewLapses,
      },
      grade: input.grade,
      confidence: input.confidence,
      reviewedAt,
      timezone: input.timezone,
      examDate: artifact.examDate,
    });
    const result = await this.repo.commitReview({ scope, artifact, review: input, scheduled });
    const outcome = result.outcome;
    if (!outcome.learnerEvidenceEventId) {
      try {
        const content = petrosArtifactContentSchema.parse(artifact.content);
        const evidence = await this.learnerModels.ingest(scope, {
          schemaVersion: PETROS_LEARNER_EVIDENCE_SCHEMA_VERSION,
          source: 'flashcard_review',
          sourceEventId: outcome.id,
          sourceRecordId: artifact.id,
          conceptId: canonicalConcept(content.tags[0] ?? content.title),
          topicId: canonicalConcept(content.tags[0] ?? content.title),
          prerequisiteConceptIds: [],
          evidenceKind: 'recall',
          outcome: input.grade === 'again' ? 'wrong' : input.grade === 'hard' ? 'partial' : 'correct',
          creditBasisPoints: input.grade === 'again' ? 0 : input.grade === 'hard' ? 6_000 : input.grade === 'good' ? 8_500 : 10_000,
          moveType: null,
          profileDimension: 'artifact:flashcard',
          preEvidenceBasisPoints: null,
          postEvidenceBasisPoints: input.grade === 'again' ? 0 : input.grade === 'hard' ? 6_000 : input.grade === 'good' ? 8_500 : 10_000,
          responseTimeMs: input.elapsedMs,
          hintCount: 0,
          confidenceBefore: null,
          confidenceAfter: input.confidence,
          errorCategory: input.grade === 'again' ? 'unclassified' : 'none',
          errorConfidenceBasisPoints: 10_000,
          evaluatorVersion: scheduled.schedulerVersion,
          algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
          environment: 'production',
          synthetic: false,
          occurredAt: input.reviewedAt,
          metadata: { artifactId: artifact.id, schedulerVersion: scheduled.schedulerVersion },
        });
        if (evidence.accepted) await this.repo.attachReviewEvidence(scope, outcome.id, evidence.evidenceEventId);
      } catch {
        // The durable review is authoritative. Repeating this idempotent request retries evidence delivery.
      }
    }
    const updated = await this.repo.findSaved(scope, artifactId);
    return {
      duplicate: result.state === 'duplicate',
      artifact: updated ? savedDto(updated) : savedDto(artifact),
      outcomeId: outcome.id,
      nextDueAt: scheduled.dueAt.toISOString(),
      scheduleExplanation: scheduled.explanation,
    };
  }

  private async bundleDto(scope: PetrosOwnerScope, bundle: Awaited<ReturnType<PetrosArtifactsRepository['findBundleById']>> extends infer T ? NonNullable<T> : never) {
    const proposals = await this.repo.listProposals(scope, bundle.id);
    return petrosArtifactBundleSchema.parse({
      schemaVersion: PETROS_ARTIFACT_SCHEMA_VERSION,
      id: bundle.id,
      sessionId: bundle.sessionId,
      state: bundle.state,
      version: bundle.version,
      proposals: proposals.map((proposal) => ({
        schemaVersion: PETROS_ARTIFACT_PROPOSAL_VERSION,
        id: proposal.id,
        bundleId: proposal.bundleId,
        kind: proposal.kind,
        state: proposal.state,
        selected: proposal.selected,
        content: proposal.content,
        originalContent: proposal.originalContent,
        sources: proposal.sources,
        version: proposal.version,
        savedArtifactId: proposal.savedArtifactId,
        failureCode: proposal.failureCode,
        createdAt: proposal.createdAt.toISOString(),
        updatedAt: proposal.updatedAt.toISOString(),
      })),
      counts: {
        proposed: proposals.filter((proposal) => ['proposed', 'edited', 'failed'].includes(proposal.state)).length,
        saved: proposals.filter((proposal) => proposal.state === 'saved').length,
        failed: proposals.filter((proposal) => proposal.state === 'failed').length,
      },
      forwardLink: bundle.forwardLink,
      createdAt: bundle.createdAt.toISOString(),
      updatedAt: bundle.updatedAt.toISOString(),
    });
  }
}

function proposalSeeds(
  session: Awaited<ReturnType<PetrosArtifactsRepository['findSession']>> extends infer T ? NonNullable<T> : never,
  blocks: Awaited<ReturnType<PetrosArtifactsRepository['listSessionBlocks']>>,
) {
  const commit = [...blocks].reverse().find((block) => (block.content as { type?: string }).type === 'artifact_commit');
  if (!commit) return [];
  const commitContent = commit.content as { proposals?: Array<{ kind?: string; label?: string; preview?: string }> };
  const diagramBlock = [...blocks].reverse().find((block) => (block.content as { type?: string }).type === 'diagram');
  const sourceBlock = [...blocks].reverse().find((block) => !['artifact_commit', 'forward_link'].includes(String((block.content as { type?: string }).type))) ?? commit;
  return (commitContent.proposals ?? []).flatMap((proposal, index) => {
    const kind = proposal.kind;
    if (!['flashcard', 'rule_card', 'diagram', 'note'].includes(String(kind))) return [];
    const label = cleanGenerated(proposal.label ?? `${session.topic} artifact`, 200);
    const preview = cleanGenerated(proposal.preview ?? `Key idea from ${session.topic}`, 4_000);
    const sources = sourceReferences(session, kind === 'diagram' && diagramBlock ? diagramBlock.id : sourceBlock.id);
    let content: PetrosArtifactContent;
    if (kind === 'flashcard' || kind === 'rule_card') {
      content = { kind, title: label, front: label, back: preview, hint: null, explanation: null, tags: [tag(session.topic)] };
    } else if (kind === 'note') {
      content = { kind: 'note', title: label, body: preview, tags: [tag(session.topic)] };
    } else {
      const raw = diagramBlock?.content as { title?: string; diagramType?: string; nodes?: Array<{ id: string; label: string; description?: string }>; edges?: Array<{ from: string; to: string; label?: string }>; altText?: string } | undefined;
      const nodes = raw?.nodes?.slice(0, 40).map((node, nodeIndex) => ({ id: safeLocalId(node.id, `node_${nodeIndex + 1}`), label: cleanGenerated(node.label, 160), description: cleanGenerated(node.description ?? '', 1_000) })) ?? [
        { id: 'topic', label: tag(session.topic), description: '' },
        { id: 'key_idea', label, description: preview.slice(0, 1_000) },
      ];
      const ids = new Set(nodes.map((node) => node.id));
      const edges = (raw?.edges ?? [{ from: nodes[0]!.id, to: nodes[1]!.id, label: 'connects to' }]).slice(0, 80).flatMap((edge, edgeIndex) => {
        const from = safeLocalId(edge.from, nodes[0]!.id);
        const to = safeLocalId(edge.to, nodes[1]!.id);
        return ids.has(from) && ids.has(to) && from !== to ? [{ id: `edge_${edgeIndex + 1}`, from, to, label: cleanGenerated(edge.label ?? 'connects to', 120) }] : [];
      });
      content = {
        kind: 'diagram', title: cleanGenerated(raw?.title ?? label, 200),
        archetype: diagramArchetype(raw?.diagramType), nodes, edges,
        accessibleDescription: cleanGenerated(raw?.altText ?? `An editable diagram of ${session.topic}: ${preview}`, 4_000),
        tags: [tag(session.topic)],
      };
    }
    const parsed = petrosArtifactContentSchema.safeParse(content);
    return parsed.success ? [{
      kind: parsed.data.kind,
      content: parsed.data,
      sources,
      functionKey: PETROS_ARTIFACT_FUNCTION_KEYS[parsed.data.kind],
      promptVersion: PETROS_ARTIFACT_PROMPT_VERSION,
      schemaVersion: PETROS_ARTIFACT_PROPOSAL_VERSION,
      ordinal: index,
    }] : [];
  });
}

function sourceReferences(
  session: Awaited<ReturnType<PetrosArtifactsRepository['findSession']>> extends infer T ? NonNullable<T> : never,
  blockId: string,
): PetrosArtifactSource[] {
  const sources: PetrosArtifactSource[] = [{
    kind: 'session_block', sessionId: session.id, blockId, knowledgeItemId: null, pageIndex: null,
    assessmentId: null, label: `Petros session: ${session.topic}`, excerpt: null, institutionRestricted: false,
  }];
  const context = session.sourceContext ?? {};
  if (context.door === 'uploaded_document' && typeof context.referenceId === 'string' && /^[0-9a-f-]{36}$/i.test(context.referenceId)) {
    sources.push({
      kind: 'document_page', sessionId: session.id, blockId,
      knowledgeItemId: context.referenceId, pageIndex: typeof context.pageIndex === 'number' ? context.pageIndex : 0,
      assessmentId: null, label: typeof context.label === 'string' ? context.label.slice(0, 240) : 'Source document',
      excerpt: null, institutionRestricted: context.institutionRestricted === true,
    });
  }
  if (context.door === 'result_repair' && typeof context.referenceId === 'string' && /^[0-9a-f-]{36}$/i.test(context.referenceId)) {
    sources.push({
      kind: 'assessment', sessionId: session.id, blockId, knowledgeItemId: null, pageIndex: null,
      assessmentId: context.referenceId, label: typeof context.label === 'string' ? context.label.slice(0, 240) : 'Published result',
      excerpt: null, institutionRestricted: true,
    });
  }
  return sources;
}

function savedDto(row: NonNullable<Awaited<ReturnType<PetrosArtifactsRepository['findSaved']>>>) {
  return petrosSavedArtifactSchema.parse({
    schemaVersion: PETROS_ARTIFACT_SCHEMA_VERSION,
    id: row.id,
    portableId: row.portableId,
    kind: row.kind,
    lifecycle: row.lifecycle,
    content: row.content,
    sources: row.sources,
    revision: row.revision,
    productTargetId: row.productTargetId,
    dueAt: row.dueAt?.toISOString() ?? null,
    schedulerVersion: row.schedulerVersion,
    examAware: row.examAware,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

function assertStudentSafeContent(content: PetrosArtifactContent) {
  const values: string[] = [];
  if (content.kind === 'flashcard' || content.kind === 'rule_card') values.push(content.title, content.front, content.back, content.hint ?? '', content.explanation ?? '', ...content.tags);
  if (content.kind === 'note') values.push(content.title, content.body, ...content.tags);
  if (content.kind === 'diagram') values.push(content.title, content.accessibleDescription, ...content.tags, ...content.nodes.flatMap((node) => [node.label, node.description]), ...content.edges.map((edge) => edge.label));
  if (values.some((value) => /<\/?[a-z][^>]*>|javascript\s*:|on[a-z]+\s*=|data\s*:\s*text\/html/i.test(value))) {
    throw new UnprocessableEntityException({
      code: 'PETROS_ARTIFACT_UNSAFE_CONTENT',
      message: 'Markup or executable content cannot be saved. Your text was not changed; remove the unsafe fragment and retry.',
    });
  }
}

function owner(principal: InstitutionalStudentPrincipal): PetrosOwnerScope {
  return { institutionId: principal.institutionId, studentId: principal.studentId };
}

function sourceExamDate(value: Record<string, unknown> | null) {
  return value && typeof value.examDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.examDate) ? value.examDate : null;
}

function sourceTimezone(value: Record<string, unknown>) {
  return typeof value.timezone === 'string' && value.timezone.length <= 80 ? value.timezone : 'Asia/Kolkata';
}

function forwardLink(blocks: Awaited<ReturnType<PetrosArtifactsRepository['listSessionBlocks']>>) {
  for (const block of [...blocks].reverse()) {
    const content = block.content as { type?: string; openQuestion?: string; forwardLink?: string };
    if (content.type === 'forward_link' && content.openQuestion) return content.openQuestion.slice(0, 700);
    if (content.type === 'synthesis' && content.forwardLink) return content.forwardLink.slice(0, 700);
  }
  return null;
}

function diagramArchetype(value: string | undefined): 'mind_map' | 'flowchart' | 'timeline' | 'comparison' {
  if (value === 'flowchart' || value === 'timeline' || value === 'comparison') return value;
  return 'mind_map';
}

function safeLocalId(value: string, fallback: string) {
  const clean = value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  return clean || fallback;
}

function cleanGenerated(value: string, max: number) {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/<[^>]*>/g, '').trim().slice(0, max) || 'Key idea';
}

function tag(value: string) {
  return cleanGenerated(value, 80);
}

function canonicalConcept(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 180) || 'unknown-concept';
}

function staleBundle() {
  return new ConflictException({ code: 'PETROS_ARTIFACT_BUNDLE_STALE', message: 'This bundle changed. Reload before saving.' });
}

function staleProposal() {
  return new ConflictException({ code: 'PETROS_ARTIFACT_PROPOSAL_STALE', message: 'This proposal changed. Reload before editing.' });
}

function artifactNotFound(code: string, message: string) {
  return new NotFoundException({ code, message });
}

function errorCode(error: unknown) {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response?: { code?: string } }).response;
    if (typeof response?.code === 'string') return response.code.slice(0, 120);
  }
  if (error && typeof error === 'object' && 'code' in error) {
    const storageCode = String((error as { code?: unknown }).code).replace(/[^A-Za-z0-9_]/g, '').slice(0, 24);
    const constraint = 'constraint_name' in error
      ? String((error as { constraint_name?: unknown }).constraint_name).replace(/[^A-Za-z0-9_]/g, '').slice(0, 72)
      : '';
    if (storageCode) return `PETROS_STORAGE_${storageCode}${constraint ? `_${constraint}` : ''}`.slice(0, 120);
  }
  return error instanceof Error ? error.name.slice(0, 120) : 'PETROS_ARTIFACT_SAVE_FAILED';
}
