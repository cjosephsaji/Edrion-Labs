import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  schema,
  sql,
  getDatabase,
  type Database,
} from '@edrion/database';
import {
  PETROS_ARTIFACT_SCHEMA_VERSION,
  type PetrosArtifactContent,
  type PetrosArtifactQuery,
  type PetrosArtifactSource,
  type PetrosScheduleResult,
  type PetrosSubmitArtifactReviewInput,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';

type ProposalSeed = {
  kind: PetrosArtifactContent['kind'];
  content: PetrosArtifactContent;
  sources: PetrosArtifactSource[];
  functionKey: string;
  promptVersion: string;
  schemaVersion: string;
};

@Injectable()
export class PetrosArtifactsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  findSession(scope: PetrosOwnerScope, sessionId: string) {
    return this.db.select().from(schema.petrosLearningSessions).where(and(
      eq(schema.petrosLearningSessions.id, sessionId),
      eq(schema.petrosLearningSessions.institutionId, scope.institutionId),
      eq(schema.petrosLearningSessions.studentId, scope.studentId),
    )).limit(1).then((rows) => rows[0]);
  }

  listSessionBlocks(scope: PetrosOwnerScope, sessionId: string) {
    return this.db.select().from(schema.petrosTeachingBlocks).where(and(
      eq(schema.petrosTeachingBlocks.sessionId, sessionId),
      eq(schema.petrosTeachingBlocks.institutionId, scope.institutionId),
      eq(schema.petrosTeachingBlocks.studentId, scope.studentId),
    )).orderBy(asc(schema.petrosTeachingBlocks.sequence));
  }

  findNextExamDate(scope: PetrosOwnerScope) {
    const today = new Date().toISOString().slice(0, 10);
    return this.db.select({ examDate: schema.examSchedules.examDate }).from(schema.examSchedules)
      .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
      .innerJoin(schema.examAssignees, eq(schema.examAssignees.examId, schema.exams.id))
      .where(and(
        eq(schema.exams.institutionId, scope.institutionId),
        eq(schema.examAssignees.studentId, scope.studentId),
        gte(schema.examSchedules.examDate, today),
      ))
      .orderBy(asc(schema.examSchedules.examDate)).limit(1).then((rows) => rows[0]?.examDate ?? null);
  }

  findBundle(scope: PetrosOwnerScope, sessionId: string) {
    return this.db.select().from(schema.petrosArtifactBundles).where(and(
      eq(schema.petrosArtifactBundles.sessionId, sessionId),
      eq(schema.petrosArtifactBundles.institutionId, scope.institutionId),
      eq(schema.petrosArtifactBundles.studentId, scope.studentId),
    )).limit(1).then((rows) => rows[0]);
  }

  findBundleById(scope: PetrosOwnerScope, bundleId: string) {
    return this.db.select().from(schema.petrosArtifactBundles).where(and(
      eq(schema.petrosArtifactBundles.id, bundleId),
      eq(schema.petrosArtifactBundles.institutionId, scope.institutionId),
      eq(schema.petrosArtifactBundles.studentId, scope.studentId),
    )).limit(1).then((rows) => rows[0]);
  }

  listProposals(scope: PetrosOwnerScope, bundleId: string) {
    return this.db.select().from(schema.petrosArtifactProposals).where(and(
      eq(schema.petrosArtifactProposals.bundleId, bundleId),
      eq(schema.petrosArtifactProposals.institutionId, scope.institutionId),
      eq(schema.petrosArtifactProposals.studentId, scope.studentId),
    )).orderBy(asc(schema.petrosArtifactProposals.createdAt));
  }

  async createBundle(scope: PetrosOwnerScope, sessionId: string, forwardLink: string | null, seeds: ProposalSeed[]) {
    return this.db.transaction(async (tx) => {
      const [bundle] = await tx.insert(schema.petrosArtifactBundles).values({
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        sessionId,
        forwardLink,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      }).onConflictDoNothing().returning();
      if (!bundle) return null;
      if (seeds.length) {
        const proposals = await tx.insert(schema.petrosArtifactProposals).values(seeds.map((seed) => ({
          bundleId: bundle.id,
          institutionId: scope.institutionId,
          studentId: scope.studentId,
          kind: seed.kind,
          originalContent: seed.content,
          content: seed.content,
          sources: seed.sources,
          generationFunctionKey: seed.functionKey,
          promptVersion: seed.promptVersion,
          schemaVersion: seed.schemaVersion,
        }))).returning();
        await tx.insert(schema.petrosArtifactEvents).values(proposals.map((proposal) => ({
          institutionId: scope.institutionId,
          studentId: scope.studentId,
          sessionId,
          bundleId: bundle.id,
          proposalId: proposal.id,
          type: 'proposal.created',
          payload: { kind: proposal.kind, functionKey: proposal.generationFunctionKey },
        })));
      }
      return bundle;
    });
  }

  updateProposal(scope: PetrosOwnerScope, proposalId: string, expectedVersion: number, selected: boolean, content: PetrosArtifactContent) {
    return this.db.transaction(async (tx) => {
      const [proposal] = await tx.update(schema.petrosArtifactProposals).set({
        content,
        kind: content.kind,
        selected,
        state: 'edited',
        failureCode: null,
        editedAt: new Date(),
        version: sql`${schema.petrosArtifactProposals.version} + 1`,
        updatedAt: new Date(),
      }).where(and(
        eq(schema.petrosArtifactProposals.id, proposalId),
        eq(schema.petrosArtifactProposals.institutionId, scope.institutionId),
        eq(schema.petrosArtifactProposals.studentId, scope.studentId),
        eq(schema.petrosArtifactProposals.version, expectedVersion),
        or(eq(schema.petrosArtifactProposals.state, 'proposed'), eq(schema.petrosArtifactProposals.state, 'edited'), eq(schema.petrosArtifactProposals.state, 'failed')),
      )).returning();
      if (!proposal) return undefined;
      await tx.update(schema.petrosArtifactBundles).set({
        version: sql`${schema.petrosArtifactBundles.version} + 1`, updatedAt: new Date(),
      }).where(eq(schema.petrosArtifactBundles.id, proposal.bundleId));
      await tx.insert(schema.petrosArtifactEvents).values({
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        bundleId: proposal.bundleId,
        proposalId: proposal.id,
        type: 'proposal.edited',
        payload: { kind: proposal.kind, selected },
      });
      return proposal;
    });
  }

  async discardBundle(scope: PetrosOwnerScope, bundleId: string, expectedVersion: number) {
    return this.db.transaction(async (tx) => {
      const [bundle] = await tx.update(schema.petrosArtifactBundles).set({
        state: 'discarded', discardedAt: new Date(), version: sql`${schema.petrosArtifactBundles.version} + 1`, updatedAt: new Date(),
      }).where(and(
        eq(schema.petrosArtifactBundles.id, bundleId),
        eq(schema.petrosArtifactBundles.institutionId, scope.institutionId),
        eq(schema.petrosArtifactBundles.studentId, scope.studentId),
        eq(schema.petrosArtifactBundles.version, expectedVersion),
        or(eq(schema.petrosArtifactBundles.state, 'open'), eq(schema.petrosArtifactBundles.state, 'partially_saved')),
      )).returning();
      if (!bundle) return undefined;
      await tx.update(schema.petrosArtifactProposals).set({ state: 'discarded', selected: false, discardedAt: new Date(), updatedAt: new Date() }).where(and(
        eq(schema.petrosArtifactProposals.bundleId, bundleId),
        or(eq(schema.petrosArtifactProposals.state, 'proposed'), eq(schema.petrosArtifactProposals.state, 'edited'), eq(schema.petrosArtifactProposals.state, 'failed')),
      ));
      await tx.insert(schema.petrosArtifactEvents).values({
        institutionId: scope.institutionId, studentId: scope.studentId, sessionId: bundle.sessionId,
        bundleId, type: 'bundle.discarded', payload: {},
      });
      return bundle;
    });
  }

  async beginCommit(scope: PetrosOwnerScope, bundleId: string, idempotencyKey: string) {
    const [created] = await this.db.insert(schema.petrosArtifactCommitCommands).values({
      bundleId, institutionId: scope.institutionId, studentId: scope.studentId, idempotencyKey,
    }).onConflictDoNothing().returning();
    if (created) return { state: 'started' as const, command: created };
    const [existing] = await this.db.select().from(schema.petrosArtifactCommitCommands).where(and(
      eq(schema.petrosArtifactCommitCommands.institutionId, scope.institutionId),
      eq(schema.petrosArtifactCommitCommands.studentId, scope.studentId),
      eq(schema.petrosArtifactCommitCommands.idempotencyKey, idempotencyKey),
    )).limit(1);
    if (existing?.status === 'completed' && existing.response) return { state: 'completed' as const, command: existing, response: existing.response };
    return { state: 'in_flight' as const, command: existing };
  }

  finishCommit(commandId: string, response: Record<string, unknown>) {
    return this.db.update(schema.petrosArtifactCommitCommands).set({ status: 'completed', response, completedAt: new Date(), updatedAt: new Date() }).where(eq(schema.petrosArtifactCommitCommands.id, commandId));
  }

  recordOperationalEvent(scope: PetrosOwnerScope, input: {
    type: string;
    sessionId?: string;
    bundleId?: string;
    proposalId?: string;
    artifactId?: string;
    payload?: Record<string, unknown>;
  }) {
    return this.db.insert(schema.petrosArtifactEvents).values({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      sessionId: input.sessionId,
      bundleId: input.bundleId,
      proposalId: input.proposalId,
      artifactId: input.artifactId,
      type: input.type,
      payload: input.payload ?? {},
    });
  }

  async recordDoorArtifactSave(
    scope: PetrosOwnerScope,
    sessionId: string,
    savedCount: number,
  ) {
    const [intent] = await this.db
      .select()
      .from(schema.petrosSessionIntents)
      .where(
        and(
          eq(schema.petrosSessionIntents.institutionId, scope.institutionId),
          eq(schema.petrosSessionIntents.studentId, scope.studentId),
          eq(schema.petrosSessionIntents.sessionId, sessionId),
        ),
      )
      .limit(1);
    if (!intent || savedCount <= 0) return undefined;
    return this.db.insert(schema.petrosDoorEvents).values({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      intentId: intent.id,
      sessionId,
      door: intent.door,
      sessionType: intent.sessionType,
      type: 'artifact_saved',
      idempotencyKey: randomUUID(),
      correlationId: intent.correlationId,
      payload: { count: savedCount },
    });
  }

  /**
   * Failure telemetry must survive the student request transaction that is intentionally rolled
   * back when the API returns a validation error. This content-free write uses the maintenance
   * path allowed by the Stage 7 event RLS policy and still carries the explicit owner scope.
   */
  recordFailureEvent(scope: PetrosOwnerScope, input: {
    type: 'artifact.save_failed' | 'artifact.sanitization_failed' | 'artifact.commit_failed';
    bundleId?: string;
    proposalId?: string;
    payload?: Record<string, unknown>;
  }) {
    return getDatabase().insert(schema.petrosArtifactEvents).values({
      institutionId: scope.institutionId,
      studentId: scope.studentId,
      bundleId: input.bundleId,
      proposalId: input.proposalId,
      type: input.type,
      payload: input.payload ?? {},
    });
  }

  failCommit(commandId: string, errorCode: string) {
    return this.db.update(schema.petrosArtifactCommitCommands).set({ status: 'failed', errorCode, completedAt: new Date(), updatedAt: new Date() }).where(eq(schema.petrosArtifactCommitCommands.id, commandId));
  }

  findSavedByProposal(scope: PetrosOwnerScope, proposalId: string) {
    return this.db.select().from(schema.petrosSavedArtifacts).where(and(
      eq(schema.petrosSavedArtifacts.sourceProposalId, proposalId),
      eq(schema.petrosSavedArtifacts.institutionId, scope.institutionId),
      eq(schema.petrosSavedArtifacts.studentId, scope.studentId),
    )).limit(1).then((rows) => rows[0]);
  }

  async saveProposal(input: {
    scope: PetrosOwnerScope;
    bundleId: string;
    proposalId: string;
    topic: string;
    portableId: string;
    firstReview: PetrosScheduleResult | null;
    examDate: string | null;
  }) {
    return this.db.transaction(async (tx) => {
      const [proposal] = await tx.select().from(schema.petrosArtifactProposals).where(and(
        eq(schema.petrosArtifactProposals.id, input.proposalId),
        eq(schema.petrosArtifactProposals.bundleId, input.bundleId),
        eq(schema.petrosArtifactProposals.institutionId, input.scope.institutionId),
        eq(schema.petrosArtifactProposals.studentId, input.scope.studentId),
      )).limit(1);
      if (!proposal) return { state: 'missing' as const };
      if (proposal.savedArtifactId || proposal.state === 'saved') {
        const [artifact] = await tx.select().from(schema.petrosSavedArtifacts).where(eq(schema.petrosSavedArtifacts.sourceProposalId, proposal.id)).limit(1);
        return { state: 'already_saved' as const, artifact };
      }
      if (proposal.state === 'discarded') return { state: 'discarded' as const };

      const content = proposal.content as PetrosArtifactContent;
      const product = await this.createProduct(tx, input.scope, input.topic, content, proposal.sources as PetrosArtifactSource[], input.firstReview);
      const [artifact] = await tx.insert(schema.petrosSavedArtifacts).values({
        portableId: input.portableId,
        institutionId: input.scope.institutionId,
        studentId: input.scope.studentId,
        sessionId: (await tx.select({ sessionId: schema.petrosArtifactBundles.sessionId }).from(schema.petrosArtifactBundles).where(eq(schema.petrosArtifactBundles.id, input.bundleId)).limit(1))[0]!.sessionId,
        bundleId: input.bundleId,
        sourceProposalId: proposal.id,
        kind: proposal.kind,
        content,
        sources: proposal.sources,
        productType: product.type,
        productTargetId: product.id,
        contentVersion: 'student-curated.v1',
        promptVersion: proposal.promptVersion,
        schemaVersion: proposal.schemaVersion,
        dueAt: input.firstReview?.dueAt ?? null,
        intervalMinutes: input.firstReview ? Math.max(10, Math.round(input.firstReview.intervalDays * 1_440)) : null,
        easeBasisPoints: input.firstReview ? Math.round(input.firstReview.ease * 10_000) : null,
        schedulerVersion: input.firstReview?.schedulerVersion ?? null,
        examDate: input.examDate,
        examAware: input.firstReview?.examAware ?? false,
      }).returning();
      await tx.insert(schema.petrosArtifactRevisions).values({
        artifactId: artifact!.id, institutionId: input.scope.institutionId, studentId: input.scope.studentId,
        revision: 1, content, sources: proposal.sources, reason: 'explicit_save',
      });
      await tx.update(schema.petrosArtifactProposals).set({
        state: 'saved', selected: true, savedArtifactId: artifact!.id, savedAt: new Date(), failureCode: null, updatedAt: new Date(),
      }).where(eq(schema.petrosArtifactProposals.id, proposal.id));
      await tx.insert(schema.petrosArtifactEvents).values({
        institutionId: input.scope.institutionId, studentId: input.scope.studentId,
        sessionId: artifact!.sessionId, bundleId: input.bundleId, proposalId: proposal.id, artifactId: artifact!.id,
        type: 'artifact.saved', payload: { kind: proposal.kind, productType: product.type, schedulerVersion: input.firstReview?.schedulerVersion ?? null },
      });
      return { state: 'saved' as const, artifact: artifact! };
    });
  }

  async saveBlockArtifact(input: {
    scope: PetrosOwnerScope;
    sessionId: string;
    blockId: string;
    idempotencyKey: string;
    topic: string;
    content: PetrosArtifactContent;
    sources: PetrosArtifactSource[];
    firstReview: PetrosScheduleResult | null;
    examDate: string | null;
  }) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(schema.petrosSavedArtifacts).where(and(
        eq(schema.petrosSavedArtifacts.portableId, input.idempotencyKey),
        eq(schema.petrosSavedArtifacts.institutionId, input.scope.institutionId),
        eq(schema.petrosSavedArtifacts.studentId, input.scope.studentId),
      )).limit(1);
      if (existing) return { state: 'already_saved' as const, artifact: existing };

      const product = await this.createProduct(
        tx,
        input.scope,
        input.topic,
        input.content,
        input.sources,
        input.firstReview,
      );
      const [artifact] = await tx.insert(schema.petrosSavedArtifacts).values({
        // Portable ids already have a global unique index and are not tied to proposal rows.
        // Reusing the command UUID here gives a retried click exactly-once behavior.
        portableId: input.idempotencyKey,
        institutionId: input.scope.institutionId,
        studentId: input.scope.studentId,
        sessionId: input.sessionId,
        bundleId: null,
        sourceProposalId: null,
        kind: input.content.kind,
        content: input.content,
        sources: input.sources,
        productType: product.type,
        productTargetId: product.id,
        contentVersion: 'student-created.v1',
        promptVersion: 'block-action.v1',
        schemaVersion: PETROS_ARTIFACT_SCHEMA_VERSION,
        dueAt: input.firstReview?.dueAt ?? null,
        intervalMinutes: input.firstReview
          ? Math.max(10, Math.round(input.firstReview.intervalDays * 1_440))
          : null,
        easeBasisPoints: input.firstReview ? Math.round(input.firstReview.ease * 10_000) : null,
        schedulerVersion: input.firstReview?.schedulerVersion ?? null,
        examDate: input.examDate,
        examAware: input.firstReview?.examAware ?? false,
      }).returning();
      await tx.insert(schema.petrosArtifactRevisions).values({
        artifactId: artifact!.id,
        institutionId: input.scope.institutionId,
        studentId: input.scope.studentId,
        revision: 1,
        content: input.content,
        sources: input.sources,
        reason: 'explicit_block_save',
      });
      await tx.insert(schema.petrosArtifactEvents).values({
        institutionId: input.scope.institutionId,
        studentId: input.scope.studentId,
        sessionId: input.sessionId,
        artifactId: artifact!.id,
        type: 'artifact.saved',
        payload: {
          kind: input.content.kind,
          productType: product.type,
          sourceBlockId: input.blockId,
          schedulerVersion: input.firstReview?.schedulerVersion ?? null,
        },
      });
      return { state: 'saved' as const, artifact: artifact! };
    });
  }

  async refreshBundleState(scope: PetrosOwnerScope, bundleId: string) {
    return this.db.transaction(async (tx) => {
      const proposals = await tx.select({ state: schema.petrosArtifactProposals.state }).from(schema.petrosArtifactProposals).where(and(
        eq(schema.petrosArtifactProposals.bundleId, bundleId),
        eq(schema.petrosArtifactProposals.institutionId, scope.institutionId),
        eq(schema.petrosArtifactProposals.studentId, scope.studentId),
      ));
      const saved = proposals.filter((proposal) => proposal.state === 'saved').length;
      const failed = proposals.filter((proposal) => proposal.state === 'failed').length;
      const active = proposals.filter((proposal) => !['saved', 'discarded'].includes(proposal.state)).length;
      const state = saved > 0 && active === 0 && failed === 0 ? 'saved' : saved > 0 ? 'partially_saved' : 'open';
      const [bundle] = await tx.update(schema.petrosArtifactBundles).set({
        state, version: sql`${schema.petrosArtifactBundles.version} + 1`, updatedAt: new Date(),
      }).where(and(
        eq(schema.petrosArtifactBundles.id, bundleId),
        eq(schema.petrosArtifactBundles.institutionId, scope.institutionId),
        eq(schema.petrosArtifactBundles.studentId, scope.studentId),
      )).returning();
      return bundle;
    });
  }

  markProposalFailed(scope: PetrosOwnerScope, proposalId: string, errorCode: string) {
    return this.db.update(schema.petrosArtifactProposals).set({ state: 'failed', failureCode: errorCode, updatedAt: new Date() }).where(and(
      eq(schema.petrosArtifactProposals.id, proposalId),
      eq(schema.petrosArtifactProposals.institutionId, scope.institutionId),
      eq(schema.petrosArtifactProposals.studentId, scope.studentId),
    ));
  }

  listSaved(scope: PetrosOwnerScope, query: PetrosArtifactQuery) {
    const conditions = [
      eq(schema.petrosSavedArtifacts.institutionId, scope.institutionId),
      eq(schema.petrosSavedArtifacts.studentId, scope.studentId),
      eq(schema.petrosSavedArtifacts.lifecycle, 'saved'),
      isNull(schema.petrosSavedArtifacts.deletedAt),
    ];
    if (query.kind) conditions.push(eq(schema.petrosSavedArtifacts.kind, query.kind));
    if (query.q) conditions.push(ilike(sql`${schema.petrosSavedArtifacts.content}::text`, `%${query.q.replace(/[%_]/g, '\\$&')}%`));
    return this.db.select().from(schema.petrosSavedArtifacts).where(and(...conditions)).orderBy(desc(schema.petrosSavedArtifacts.updatedAt)).limit(query.limit);
  }

  findSaved(scope: PetrosOwnerScope, artifactId: string) {
    return this.db.select().from(schema.petrosSavedArtifacts).where(and(
      eq(schema.petrosSavedArtifacts.id, artifactId),
      eq(schema.petrosSavedArtifacts.institutionId, scope.institutionId),
      eq(schema.petrosSavedArtifacts.studentId, scope.studentId),
      isNull(schema.petrosSavedArtifacts.deletedAt),
    )).limit(1).then((rows) => rows[0]);
  }

  resolveKnowledgeSource(scope: PetrosOwnerScope, itemId: string, pageIndex: number) {
    return this.db.select({
      itemId: schema.knowledgeItems.id,
      title: schema.knowledgeItems.title,
      status: schema.knowledgeItems.status,
      pageId: schema.knowledgeItemPages.id,
    }).from(schema.knowledgeItems)
      .leftJoin(schema.knowledgeItemPages, and(
        eq(schema.knowledgeItemPages.itemId, schema.knowledgeItems.id),
        eq(schema.knowledgeItemPages.pageIndex, pageIndex),
      ))
      .where(and(
        eq(schema.knowledgeItems.id, itemId),
        eq(schema.knowledgeItems.institutionId, scope.institutionId),
        eq(schema.knowledgeItems.studentId, scope.studentId),
      )).limit(1).then((rows) => rows[0]);
  }

  resolveSessionBlock(scope: PetrosOwnerScope, sessionId: string, blockId: string | null) {
    if (!blockId) return this.findSession(scope, sessionId).then((session) => session ? { session, block: null } : undefined);
    return Promise.all([
      this.findSession(scope, sessionId),
      this.db.select({ id: schema.petrosTeachingBlocks.id }).from(schema.petrosTeachingBlocks).where(and(
        eq(schema.petrosTeachingBlocks.id, blockId),
        eq(schema.petrosTeachingBlocks.sessionId, sessionId),
        eq(schema.petrosTeachingBlocks.institutionId, scope.institutionId),
        eq(schema.petrosTeachingBlocks.studentId, scope.studentId),
      )).limit(1).then((rows) => rows[0]),
    ]).then(([session, block]) => session && block ? { session, block } : undefined);
  }

  listDue(scope: PetrosOwnerScope, now: Date, limit: number) {
    return this.db.select().from(schema.petrosSavedArtifacts).where(and(
      eq(schema.petrosSavedArtifacts.institutionId, scope.institutionId),
      eq(schema.petrosSavedArtifacts.studentId, scope.studentId),
      eq(schema.petrosSavedArtifacts.lifecycle, 'saved'),
      or(eq(schema.petrosSavedArtifacts.kind, 'flashcard'), eq(schema.petrosSavedArtifacts.kind, 'rule_card')),
      isNull(schema.petrosSavedArtifacts.pausedAt),
      isNull(schema.petrosSavedArtifacts.archivedAt),
      isNull(schema.petrosSavedArtifacts.deletedAt),
      lte(schema.petrosSavedArtifacts.dueAt, now),
    )).orderBy(asc(schema.petrosSavedArtifacts.dueAt)).limit(limit);
  }

  findReviewByClient(scope: PetrosOwnerScope, clientReviewId: string) {
    return this.db.select().from(schema.petrosArtifactReviewOutcomes).where(and(
      eq(schema.petrosArtifactReviewOutcomes.institutionId, scope.institutionId),
      eq(schema.petrosArtifactReviewOutcomes.studentId, scope.studentId),
      eq(schema.petrosArtifactReviewOutcomes.clientReviewId, clientReviewId),
    )).limit(1).then((rows) => rows[0]);
  }

  async commitReview(input: {
    scope: PetrosOwnerScope;
    artifact: typeof schema.petrosSavedArtifacts.$inferSelect;
    review: PetrosSubmitArtifactReviewInput;
    scheduled: PetrosScheduleResult;
  }) {
    return this.db.transaction(async (tx) => {
      const [existing] = await tx.select().from(schema.petrosArtifactReviewOutcomes).where(and(
        eq(schema.petrosArtifactReviewOutcomes.institutionId, input.scope.institutionId),
        eq(schema.petrosArtifactReviewOutcomes.studentId, input.scope.studentId),
        eq(schema.petrosArtifactReviewOutcomes.clientReviewId, input.review.clientReviewId),
      )).limit(1);
      if (existing) return { state: 'duplicate' as const, outcome: existing };
      const before = reviewState(input.artifact);
      const after = {
        dueAt: input.scheduled.dueAt.toISOString(), intervalDays: input.scheduled.intervalDays,
        ease: input.scheduled.ease, reps: input.scheduled.reps, lapses: input.scheduled.lapses,
      };
      const [outcome] = await tx.insert(schema.petrosArtifactReviewOutcomes).values({
        artifactId: input.artifact.id, institutionId: input.scope.institutionId, studentId: input.scope.studentId,
        clientReviewId: input.review.clientReviewId, grade: input.review.grade, confidence: input.review.confidence,
        stateBefore: before, stateAfter: after, schedulerVersion: input.scheduled.schedulerVersion,
        examAware: input.scheduled.examAware, elapsedMs: input.review.elapsedMs, reviewedAt: new Date(input.review.reviewedAt),
      }).returning();
      await tx.update(schema.petrosSavedArtifacts).set({
        dueAt: input.scheduled.dueAt,
        intervalMinutes: Math.max(10, Math.round(input.scheduled.intervalDays * 1_440)),
        easeBasisPoints: Math.round(input.scheduled.ease * 10_000),
        reviewReps: input.scheduled.reps,
        reviewLapses: input.scheduled.lapses,
        schedulerVersion: input.scheduled.schedulerVersion,
        examAware: input.scheduled.examAware,
        updatedAt: new Date(),
      }).where(and(
        eq(schema.petrosSavedArtifacts.id, input.artifact.id),
        eq(schema.petrosSavedArtifacts.institutionId, input.scope.institutionId),
        eq(schema.petrosSavedArtifacts.studentId, input.scope.studentId),
      ));
      if (input.artifact.productType === 'flashcard') {
        await tx.update(schema.flashcards).set({
          nextDueAt: input.scheduled.dueAt,
          fsrsDueAt: input.scheduled.dueAt,
          intervalDays: input.scheduled.intervalDays.toFixed(2),
          ease: input.scheduled.ease.toFixed(2),
          reps: input.scheduled.reps,
          lapses: input.scheduled.lapses,
          srsState: input.review.grade === 'again' ? 'relearning' : 'review',
          scheduler: 'petros',
          lastReviewAt: new Date(input.review.reviewedAt),
          updatedAt: new Date(),
        }).where(eq(schema.flashcards.id, input.artifact.productTargetId));
        await tx.insert(schema.flashcardReviews).values({
          cardId: input.artifact.productTargetId, studentId: input.scope.studentId,
          result: input.review.grade, grade: input.review.grade,
          stateBefore: String(before.reps === 0 ? 'new' : 'review'), stateAfter: input.review.grade === 'again' ? 'relearning' : 'review',
          dueBefore: input.artifact.dueAt, dueAfter: input.scheduled.dueAt,
          elapsedMs: input.review.elapsedMs, clientReviewId: input.review.clientReviewId,
          reviewedAt: new Date(input.review.reviewedAt),
        });
      }
      await tx.insert(schema.petrosArtifactEvents).values({
        institutionId: input.scope.institutionId, studentId: input.scope.studentId,
        sessionId: input.artifact.sessionId, artifactId: input.artifact.id, type: 'review.completed',
        payload: { grade: input.review.grade, confidence: input.review.confidence, schedulerVersion: input.scheduled.schedulerVersion, examAware: input.scheduled.examAware },
      });
      return { state: 'committed' as const, outcome: outcome! };
    });
  }

  attachReviewEvidence(scope: PetrosOwnerScope, outcomeId: string, eventId: string) {
    return this.db.update(schema.petrosArtifactReviewOutcomes).set({ learnerEvidenceEventId: eventId }).where(and(
      eq(schema.petrosArtifactReviewOutcomes.id, outcomeId),
      eq(schema.petrosArtifactReviewOutcomes.institutionId, scope.institutionId),
      eq(schema.petrosArtifactReviewOutcomes.studentId, scope.studentId),
      isNull(schema.petrosArtifactReviewOutcomes.learnerEvidenceEventId),
    ));
  }

  async updateSaved(scope: PetrosOwnerScope, artifactId: string, expectedRevision: number, content: PetrosArtifactContent) {
    return this.db.transaction(async (tx) => {
      const [artifact] = await tx.update(schema.petrosSavedArtifacts).set({
        content, kind: content.kind, revision: sql`${schema.petrosSavedArtifacts.revision} + 1`, updatedAt: new Date(),
      }).where(and(
        eq(schema.petrosSavedArtifacts.id, artifactId),
        eq(schema.petrosSavedArtifacts.institutionId, scope.institutionId),
        eq(schema.petrosSavedArtifacts.studentId, scope.studentId),
        eq(schema.petrosSavedArtifacts.lifecycle, 'saved'),
        eq(schema.petrosSavedArtifacts.revision, expectedRevision),
      )).returning();
      if (!artifact) return undefined;
      await this.updateProduct(tx, artifact.productType, artifact.productTargetId, content);
      await tx.insert(schema.petrosArtifactRevisions).values({
        artifactId, institutionId: scope.institutionId, studentId: scope.studentId,
        revision: artifact.revision, content, sources: artifact.sources, reason: 'student_edit',
      });
      await tx.insert(schema.petrosArtifactEvents).values({
        institutionId: scope.institutionId, studentId: scope.studentId, sessionId: artifact.sessionId,
        artifactId, type: 'artifact.revised', payload: { kind: content.kind, revision: artifact.revision },
      });
      return artifact;
    });
  }

  async deleteSaved(scope: PetrosOwnerScope, artifactId: string) {
    return this.db.transaction(async (tx) => {
      const [artifact] = await tx.select().from(schema.petrosSavedArtifacts).where(and(
        eq(schema.petrosSavedArtifacts.id, artifactId),
        eq(schema.petrosSavedArtifacts.institutionId, scope.institutionId),
        eq(schema.petrosSavedArtifacts.studentId, scope.studentId),
      )).limit(1);
      if (!artifact) return undefined;
      if (artifact.productType === 'flashcard') await tx.delete(schema.flashcards).where(eq(schema.flashcards.id, artifact.productTargetId));
      if (artifact.productType === 'note') await tx.delete(schema.libraryNotes).where(eq(schema.libraryNotes.id, artifact.productTargetId));
      if (artifact.productType === 'canvas') await tx.delete(schema.visualCanvases).where(eq(schema.visualCanvases.id, artifact.productTargetId));
      await tx.delete(schema.petrosSavedArtifacts).where(eq(schema.petrosSavedArtifacts.id, artifact.id));
      await tx.insert(schema.petrosArtifactEvents).values({
        institutionId: scope.institutionId, studentId: scope.studentId, sessionId: artifact.sessionId,
        type: 'artifact.deleted', payload: { kind: artifact.kind, portableId: artifact.portableId },
      });
      return { id: artifact.id, portableId: artifact.portableId };
    });
  }

  async setLifecycle(scope: PetrosOwnerScope, artifactId: string, action: 'pause_reviews' | 'resume_reviews' | 'archive' | 'restore') {
    return this.db.transaction(async (tx) => {
      const now = new Date();
      const patch = action === 'pause_reviews'
        ? { pausedAt: now }
        : action === 'resume_reviews'
          ? { pausedAt: null }
          : action === 'archive'
            ? { lifecycle: 'archived', archivedAt: now, pausedAt: now }
            : { lifecycle: 'saved', archivedAt: null, pausedAt: null };
      const [artifact] = await tx.update(schema.petrosSavedArtifacts).set({ ...patch, updatedAt: now }).where(and(
        eq(schema.petrosSavedArtifacts.id, artifactId),
        eq(schema.petrosSavedArtifacts.institutionId, scope.institutionId),
        eq(schema.petrosSavedArtifacts.studentId, scope.studentId),
        isNull(schema.petrosSavedArtifacts.deletedAt),
      )).returning();
      if (!artifact) return undefined;
      if (artifact.productType === 'flashcard') {
        await tx.update(schema.flashcards).set({
          suspendedAt: action === 'resume_reviews' || action === 'restore' ? null : now,
          updatedAt: now,
        }).where(eq(schema.flashcards.id, artifact.productTargetId));
      }
      await tx.insert(schema.petrosArtifactEvents).values({
        institutionId: scope.institutionId, studentId: scope.studentId, sessionId: artifact.sessionId,
        artifactId, type: `artifact.${action}`, payload: { kind: artifact.kind },
      });
      return artifact;
    });
  }

  async rebuildSchedulerVersion(scope: PetrosOwnerScope, version: string) {
    return this.db.update(schema.petrosSavedArtifacts).set({ schedulerVersion: version, updatedAt: new Date() }).where(and(
      eq(schema.petrosSavedArtifacts.institutionId, scope.institutionId),
      eq(schema.petrosSavedArtifacts.studentId, scope.studentId),
      or(eq(schema.petrosSavedArtifacts.kind, 'flashcard'), eq(schema.petrosSavedArtifacts.kind, 'rule_card')),
      isNull(schema.petrosSavedArtifacts.deletedAt),
    )).returning({ id: schema.petrosSavedArtifacts.id });
  }

  async dashboard(input: { institutionId?: string; from?: Date; to?: Date }) {
    const conditions = [];
    if (input.institutionId) conditions.push(eq(schema.petrosArtifactEvents.institutionId, input.institutionId));
    if (input.from) conditions.push(gte(schema.petrosArtifactEvents.createdAt, input.from));
    if (input.to) conditions.push(lte(schema.petrosArtifactEvents.createdAt, input.to));
    const events = await this.db.select({
      type: schema.petrosArtifactEvents.type,
      count: sql<number>`count(*)::int`,
    }).from(schema.petrosArtifactEvents).where(conditions.length ? and(...conditions) : undefined).groupBy(schema.petrosArtifactEvents.type);
    const eventKind = sql<string>`coalesce(${schema.petrosArtifactEvents.payload}->>'kind', 'unknown')`;
    const byKind = await this.db.select({
      type: schema.petrosArtifactEvents.type,
      kind: eventKind,
      count: sql<number>`count(*)::int`,
    }).from(schema.petrosArtifactEvents).where(conditions.length ? and(...conditions) : undefined).groupBy(schema.petrosArtifactEvents.type, eventKind);
    const [latency] = await this.db.select({
      completed: sql<number>`count(*) filter (where ${schema.petrosArtifactEvents.type} = 'artifact.commit_completed')::int`,
      averageMs: sql<number>`coalesce(avg((${schema.petrosArtifactEvents.payload}->>'durationMs')::double precision) filter (where ${schema.petrosArtifactEvents.type} = 'artifact.commit_completed'), 0)::float8`,
      maximumMs: sql<number>`coalesce(max((${schema.petrosArtifactEvents.payload}->>'durationMs')::integer) filter (where ${schema.petrosArtifactEvents.type} = 'artifact.commit_completed'), 0)::int`,
      storageFailures: sql<number>`count(*) filter (where ${schema.petrosArtifactEvents.type} = 'artifact.save_failed' and ${schema.petrosArtifactEvents.payload}->>'code' like 'PETROS_STORAGE_%')::int`,
    }).from(schema.petrosArtifactEvents).where(conditions.length ? and(...conditions) : undefined);
    const savedConditions = [isNull(schema.petrosSavedArtifacts.deletedAt)];
    if (input.institutionId) savedConditions.push(eq(schema.petrosSavedArtifacts.institutionId, input.institutionId));
    const schedules = await this.db.select({
      schedulerVersion: schema.petrosSavedArtifacts.schedulerVersion,
      due: sql<number>`count(*) filter (where ${schema.petrosSavedArtifacts.dueAt} <= now())::int`,
      total: sql<number>`count(*)::int`,
    }).from(schema.petrosSavedArtifacts).where(and(...savedConditions)).groupBy(schema.petrosSavedArtifacts.schedulerVersion);
    const [storage] = await this.db.select({
      artifacts: sql<number>`count(*)::int`,
      estimatedBytes: sql<number>`coalesce(sum(pg_column_size(${schema.petrosSavedArtifacts.content}) + pg_column_size(${schema.petrosSavedArtifacts.sources})), 0)::float8`,
      orphaned: sql<number>`count(*) filter (where
        (${schema.petrosSavedArtifacts.productType} = 'flashcard' and not exists (select 1 from ${schema.flashcards} where ${schema.flashcards.id} = ${schema.petrosSavedArtifacts.productTargetId})) or
        (${schema.petrosSavedArtifacts.productType} = 'note' and not exists (select 1 from ${schema.libraryNotes} where ${schema.libraryNotes.id} = ${schema.petrosSavedArtifacts.productTargetId})) or
        (${schema.petrosSavedArtifacts.productType} = 'canvas' and not exists (select 1 from ${schema.visualCanvases} where ${schema.visualCanvases.id} = ${schema.petrosSavedArtifacts.productTargetId}))
      )::int`,
    }).from(schema.petrosSavedArtifacts).where(and(...savedConditions));
    const reviewConditions = [];
    if (input.institutionId) reviewConditions.push(eq(schema.petrosArtifactReviewOutcomes.institutionId, input.institutionId));
    if (input.from) reviewConditions.push(gte(schema.petrosArtifactReviewOutcomes.reviewedAt, input.from));
    if (input.to) reviewConditions.push(lte(schema.petrosArtifactReviewOutcomes.reviewedAt, input.to));
    const reviewGrades = await this.db.select({
      grade: schema.petrosArtifactReviewOutcomes.grade,
      count: sql<number>`count(*)::int`,
    }).from(schema.petrosArtifactReviewOutcomes).where(reviewConditions.length ? and(...reviewConditions) : undefined).groupBy(schema.petrosArtifactReviewOutcomes.grade);
    const jobConditions = [];
    if (input.institutionId) jobConditions.push(eq(schema.petrosArtifactJobs.institutionId, input.institutionId));
    if (input.from) jobConditions.push(gte(schema.petrosArtifactJobs.createdAt, input.from));
    if (input.to) jobConditions.push(lte(schema.petrosArtifactJobs.createdAt, input.to));
    const jobs = await this.db.select({
      kind: schema.petrosArtifactJobs.kind,
      status: schema.petrosArtifactJobs.status,
      count: sql<number>`count(*)::int`,
    }).from(schema.petrosArtifactJobs).where(jobConditions.length ? and(...jobConditions) : undefined).groupBy(schema.petrosArtifactJobs.kind, schema.petrosArtifactJobs.status);
    return { events, byKind, latency, schedules, storage, reviewGrades, jobs };
  }

  private async createProduct(
    tx: Parameters<Parameters<Database['transaction']>[0]>[0],
    scope: PetrosOwnerScope,
    topic: string,
    content: PetrosArtifactContent,
    sources: PetrosArtifactSource[],
    firstReview: PetrosScheduleResult | null,
  ): Promise<{ type: 'flashcard' | 'note' | 'canvas'; id: string }> {
    if (content.kind === 'flashcard' || content.kind === 'rule_card') {
      const title = `Petros · ${topic}`.slice(0, 200);
      let [deck] = await tx.select().from(schema.flashcardDecks).where(and(
        eq(schema.flashcardDecks.institutionId, scope.institutionId),
        eq(schema.flashcardDecks.studentId, scope.studentId),
        eq(schema.flashcardDecks.title, title),
        eq(schema.flashcardDecks.fromLabel, 'Petros'),
        isNull(schema.flashcardDecks.archivedAt),
      )).limit(1);
      if (!deck) [deck] = await tx.insert(schema.flashcardDecks).values({
        institutionId: scope.institutionId, studentId: scope.studentId, title, fromLabel: 'Petros',
        subjectRef: { kind: 'self', label: topic },
      }).returning();
      const [sequenceRow] = await tx.select({ next: sql<number>`coalesce(max(${schema.flashcards.sequence}), 0)::int + 1` }).from(schema.flashcards).where(eq(schema.flashcards.deckId, deck!.id));
      const source = sources.find((candidate) => candidate.kind === 'document_page' && candidate.knowledgeItemId && candidate.pageIndex != null);
      const [card] = await tx.insert(schema.flashcards).values({
        deckId: deck!.id, sequence: sequenceRow?.next ?? 1, prompt: content.front, answer: content.back,
        nextDueAt: firstReview!.dueAt, intervalDays: firstReview!.intervalDays.toFixed(2), ease: firstReview!.ease.toFixed(2),
        srsState: 'new', stability: 0, difficulty: 0, fsrsDueAt: firstReview!.dueAt, scheduler: 'petros',
        sourcePage: source?.pageIndex == null ? null : source.pageIndex + 1,
        sourceRef: source ? { knowledge_item_id: source.knowledgeItemId!, page: source.pageIndex! + 1 } : null,
      }).returning();
      return { type: 'flashcard', id: card!.id };
    }
    if (content.kind === 'note') {
      const sourceRefs = sources.filter((source) => source.kind === 'document_page' && source.knowledgeItemId && source.pageIndex != null).map((source) => ({ knowledge_item_id: source.knowledgeItemId!, page: source.pageIndex! + 1 }));
      const [note] = await tx.insert(schema.libraryNotes).values({
        institutionId: scope.institutionId, studentId: scope.studentId, title: content.title,
        doc: { type: 'doc', version: 1, content: [{ type: 'paragraph', text: content.body }] },
        subjectRef: { kind: 'self', label: topic }, sourceRefs,
      }).returning();
      return { type: 'note', id: note!.id };
    }
    const diagram = content as Extract<PetrosArtifactContent, { kind: 'diagram' }>;
    const graph = diagramGraph(diagram);
    const [canvas] = await tx.insert(schema.visualCanvases).values({
      institutionId: scope.institutionId, studentId: scope.studentId, title: diagram.title,
      archetype: diagram.archetype, graph, origin: 'learn_session', status: 'ready', nodeCount: diagram.nodes.length,
      sourceMeta: { petros: true, sources, accessibleDescription: diagram.accessibleDescription },
    }).returning();
    await tx.insert(schema.visualCanvasRevisions).values({
      canvasId: canvas!.id, revisionNumber: 1, graph, title: diagram.title, archetype: diagram.archetype,
      reason: 'created', createdBy: 'student',
    });
    return { type: 'canvas', id: canvas!.id };
  }

  private async updateProduct(tx: Parameters<Parameters<Database['transaction']>[0]>[0], productType: string, productId: string, content: PetrosArtifactContent) {
    if (productType === 'flashcard' && (content.kind === 'flashcard' || content.kind === 'rule_card')) {
      await tx.update(schema.flashcards).set({ prompt: content.front, answer: content.back, updatedAt: new Date() }).where(eq(schema.flashcards.id, productId));
    }
    if (productType === 'note' && content.kind === 'note') {
      await tx.update(schema.libraryNotes).set({ title: content.title, doc: { type: 'doc', version: 1, content: [{ type: 'paragraph', text: content.body }] }, version: sql`${schema.libraryNotes.version} + 1`, updatedAt: new Date() }).where(eq(schema.libraryNotes.id, productId));
    }
    if (productType === 'canvas' && content.kind === 'diagram') {
      const graph = diagramGraph(content);
      const [canvas] = await tx.update(schema.visualCanvases).set({
        title: content.title, archetype: content.archetype, graph, nodeCount: content.nodes.length,
        version: sql`${schema.visualCanvases.version} + 1`, updatedAt: new Date(),
      }).where(eq(schema.visualCanvases.id, productId)).returning();
      if (canvas) await tx.insert(schema.visualCanvasRevisions).values({
        canvasId: canvas.id, revisionNumber: canvas.version, graph, title: content.title, archetype: content.archetype,
        reason: 'edit', createdBy: 'student',
      });
    }
  }
}

function reviewState(artifact: typeof schema.petrosSavedArtifacts.$inferSelect) {
  return {
    dueAt: artifact.dueAt?.toISOString() ?? artifact.createdAt.toISOString(),
    intervalDays: (artifact.intervalMinutes ?? 0) / 1_440,
    ease: (artifact.easeBasisPoints ?? 25_000) / 10_000,
    reps: artifact.reviewReps,
    lapses: artifact.reviewLapses,
  };
}

function diagramGraph(content: Extract<PetrosArtifactContent, { kind: 'diagram' }>) {
  const depths = new Map<string, number>([[content.nodes[0]!.id, 0]]);
  for (let pass = 0; pass < content.nodes.length; pass += 1) {
    for (const edge of content.edges) {
      const parent = depths.get(edge.from);
      if (parent != null && !depths.has(edge.to)) depths.set(edge.to, Math.min(6, parent + 1));
    }
  }
  return {
    graph_schema_version: 1 as const,
    title: content.title,
    archetype: content.archetype,
    root_node_id: content.nodes[0]?.id ?? null,
    nodes: content.nodes.map((node) => ({
      id: node.id, type: 'concept' as const, title: node.label, body: node.description,
      depth: depths.get(node.id) ?? 1, collapsed: false, status: 'normal' as const, origin: 'student' as const,
    })),
    edges: content.edges.map((edge) => ({ id: edge.id, source: edge.from, target: edge.to, type: 'leads_to' as const, label: edge.label || undefined })),
    groups: [],
    layout_cache: {},
  };
}
