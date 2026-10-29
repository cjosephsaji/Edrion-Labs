import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  lt,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import { PETROS_COMPANION_SCHEMA_VERSION } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { assertM4AssistanceBoundary } from '../petros-v2/petros-v2-source-exposure';
import type { PetrosOwnerScope } from '../petros-loop/petros-loop.repository';

/** Verbatim turns kept in the prompt before older ones are folded into the summary. */
export const COMPANION_VERBATIM_WINDOW = 12;

@Injectable()
export class PetrosCompanionRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  assertV2Assistance(){return assertM4AssistanceBoundary(this.db);}

  private ownerWhere(scope: PetrosOwnerScope) {
    return and(
      eq(schema.petrosStudentThreads.institutionId, scope.institutionId),
      eq(schema.petrosStudentThreads.studentId, scope.studentId),
    );
  }

  findThread(scope: PetrosOwnerScope, threadId: string) {
    return this.db
      .select()
      .from(schema.petrosStudentThreads)
      .where(and(eq(schema.petrosStudentThreads.id, threadId), this.ownerWhere(scope)))
      .limit(1)
      .then((rows) => rows[0]);
  }

  latestActiveThread(scope: PetrosOwnerScope) {
    return this.db
      .select()
      .from(schema.petrosStudentThreads)
      .where(and(this.ownerWhere(scope), eq(schema.petrosStudentThreads.status, 'active')))
      .orderBy(desc(schema.petrosStudentThreads.lastActivityAt))
      .limit(1)
      .then((rows) => rows[0]);
  }

  listThreads(scope: PetrosOwnerScope, limit = 20) {
    return this.db
      .select()
      .from(schema.petrosStudentThreads)
      .where(this.ownerWhere(scope))
      .orderBy(desc(schema.petrosStudentThreads.lastActivityAt))
      .limit(limit);
  }

  createThread(
    scope: PetrosOwnerScope,
    values: { title?: string | null; activeTopic?: string | null; campusId?: string | null },
  ) {
    return this.db
      .insert(schema.petrosStudentThreads)
      .values({
        schemaVersion: PETROS_COMPANION_SCHEMA_VERSION,
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        campusId: values.campusId ?? null,
        title: values.title ?? null,
        activeTopic: values.activeTopic ?? null,
      })
      .returning()
      .then((rows) => rows[0]!);
  }

  touchThread(
    scope: PetrosOwnerScope,
    threadId: string,
    patch: {
      title?: string | null;
      activeTopic?: string | null;
      activeFocusRef?: string | null;
      summary?: string | null;
      summaryWatermark?: number;
    },
  ) {
    return this.db
      .update(schema.petrosStudentThreads)
      .set({ ...patch, lastActivityAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.petrosStudentThreads.id, threadId), this.ownerWhere(scope)))
      .returning()
      .then((rows) => rows[0]);
  }

  archiveThread(scope: PetrosOwnerScope, threadId: string) {
    return this.db
      .update(schema.petrosStudentThreads)
      .set({ status: 'archived', archivedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(schema.petrosStudentThreads.id, threadId), this.ownerWhere(scope)))
      .returning()
      .then((rows) => rows[0]);
  }

  deleteThread(scope: PetrosOwnerScope, threadId: string) {
    return this.db
      .delete(schema.petrosStudentThreads)
      .where(and(eq(schema.petrosStudentThreads.id, threadId), this.ownerWhere(scope)))
      .returning({ id: schema.petrosStudentThreads.id })
      .then((rows) => rows[0]);
  }

  /** Oldest-first, bounded. Ordering is by `seq`, never by timestamp. */
  listMessages(scope: PetrosOwnerScope, threadId: string, limit = 60) {
    return this.db
      .select()
      .from(schema.petrosStudentMessages)
      .where(
        and(
          eq(schema.petrosStudentMessages.threadId, threadId),
          eq(schema.petrosStudentMessages.institutionId, scope.institutionId),
          eq(schema.petrosStudentMessages.studentId, scope.studentId),
        ),
      )
      .orderBy(asc(schema.petrosStudentMessages.seq))
      .limit(limit);
  }

  findMessageByKey(scope: PetrosOwnerScope, idempotencyKey: string, role: 'student' | 'petros') {
    return this.db
      .select()
      .from(schema.petrosStudentMessages)
      .where(
        and(
          eq(schema.petrosStudentMessages.institutionId, scope.institutionId),
          eq(schema.petrosStudentMessages.studentId, scope.studentId),
          eq(schema.petrosStudentMessages.idempotencyKey, idempotencyKey),
          eq(schema.petrosStudentMessages.role, role),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  insertMessage(values: typeof schema.petrosStudentMessages.$inferInsert) {
    return this.db
      .insert(schema.petrosStudentMessages)
      .values(values)
      .onConflictDoNothing({
        target: [
          schema.petrosStudentMessages.institutionId,
          schema.petrosStudentMessages.studentId,
          schema.petrosStudentMessages.idempotencyKey,
          schema.petrosStudentMessages.role,
        ],
      })
      .returning()
      .then((rows) => rows[0]);
  }

  updateMessage(
    scope: PetrosOwnerScope,
    messageId: string,
    patch: { blocks?: unknown[]; status?: string },
  ) {
    return this.db
      .update(schema.petrosStudentMessages)
      .set(patch)
      .where(
        and(
          eq(schema.petrosStudentMessages.id, messageId),
          eq(schema.petrosStudentMessages.institutionId, scope.institutionId),
          eq(schema.petrosStudentMessages.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  insertProposal(values: typeof schema.petrosStudentActionProposals.$inferInsert) {
    return this.db
      .insert(schema.petrosStudentActionProposals)
      .values(values)
      .returning()
      .then((rows) => rows[0]!);
  }

  findProposal(scope: PetrosOwnerScope, proposalId: string) {
    return this.db
      .select()
      .from(schema.petrosStudentActionProposals)
      .where(
        and(
          eq(schema.petrosStudentActionProposals.id, proposalId),
          eq(schema.petrosStudentActionProposals.institutionId, scope.institutionId),
          eq(schema.petrosStudentActionProposals.studentId, scope.studentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  listProposals(scope: PetrosOwnerScope, threadId: string) {
    return this.db
      .select()
      .from(schema.petrosStudentActionProposals)
      .where(
        and(
          eq(schema.petrosStudentActionProposals.threadId, threadId),
          eq(schema.petrosStudentActionProposals.institutionId, scope.institutionId),
          eq(schema.petrosStudentActionProposals.studentId, scope.studentId),
        ),
      )
      .orderBy(desc(schema.petrosStudentActionProposals.createdAt))
      .limit(40);
  }

  /**
   * Claims a proposal for execution exactly once. The `proposed -> confirmed` transition is
   * the concurrency gate: a second confirmation of the same proposal updates zero rows.
   */
  claimProposal(scope: PetrosOwnerScope, proposalId: string, executionKey: string) {
    return this.db
      .update(schema.petrosStudentActionProposals)
      .set({ status: 'confirmed', confirmedAt: new Date(), executionKey, updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosStudentActionProposals.id, proposalId),
          eq(schema.petrosStudentActionProposals.institutionId, scope.institutionId),
          eq(schema.petrosStudentActionProposals.studentId, scope.studentId),
          eq(schema.petrosStudentActionProposals.status, 'proposed'),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  settleProposal(
    scope: PetrosOwnerScope,
    proposalId: string,
    patch: { status: string; resultRef?: string | null; failureReason?: string | null },
  ) {
    return this.db
      .update(schema.petrosStudentActionProposals)
      .set({
        ...patch,
        executedAt: patch.status === 'executed' ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(schema.petrosStudentActionProposals.id, proposalId),
          eq(schema.petrosStudentActionProposals.institutionId, scope.institutionId),
          eq(schema.petrosStudentActionProposals.studentId, scope.studentId),
        ),
      )
      .returning()
      .then((rows) => rows[0]);
  }

  expireStaleProposals(scope: PetrosOwnerScope) {
    return this.db
      .update(schema.petrosStudentActionProposals)
      .set({ status: 'expired', updatedAt: new Date() })
      .where(
        and(
          eq(schema.petrosStudentActionProposals.institutionId, scope.institutionId),
          eq(schema.petrosStudentActionProposals.studentId, scope.studentId),
          eq(schema.petrosStudentActionProposals.status, 'proposed'),
          lt(schema.petrosStudentActionProposals.expiresAt, new Date()),
        ),
      );
  }

  findPreferences(scope: PetrosOwnerScope) {
    return this.db
      .select()
      .from(schema.petrosStudentCompanionPreferences)
      .where(
        and(
          eq(schema.petrosStudentCompanionPreferences.institutionId, scope.institutionId),
          eq(schema.petrosStudentCompanionPreferences.studentId, scope.studentId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]);
  }

  upsertPreferences(
    scope: PetrosOwnerScope,
    values: Omit<
      typeof schema.petrosStudentCompanionPreferences.$inferInsert,
      'institutionId' | 'studentId'
    >,
  ) {
    return this.db
      .insert(schema.petrosStudentCompanionPreferences)
      .values({ ...values, institutionId: scope.institutionId, studentId: scope.studentId })
      .onConflictDoUpdate({
        target: [
          schema.petrosStudentCompanionPreferences.institutionId,
          schema.petrosStudentCompanionPreferences.studentId,
        ],
        set: {
          ...values,
          version: sql`${schema.petrosStudentCompanionPreferences.version} + 1`,
          updatedAt: new Date(),
        },
      })
      .returning()
      .then((rows) => rows[0]!);
  }

  listSuppressedNudges(scope: PetrosOwnerScope) {
    return this.db
      .select({
        nudgeKey: schema.petrosStudentNudgeState.nudgeKey,
        suppressUntil: schema.petrosStudentNudgeState.suppressUntil,
      })
      .from(schema.petrosStudentNudgeState)
      .where(
        and(
          eq(schema.petrosStudentNudgeState.institutionId, scope.institutionId),
          eq(schema.petrosStudentNudgeState.studentId, scope.studentId),
          sql`${schema.petrosStudentNudgeState.suppressUntil} > now()`,
        ),
      );
  }

  dismissNudge(scope: PetrosOwnerScope, nudgeKey: string, suppressUntil: Date) {
    return this.db
      .insert(schema.petrosStudentNudgeState)
      .values({
        institutionId: scope.institutionId,
        studentId: scope.studentId,
        nudgeKey,
        suppressUntil,
      })
      .onConflictDoUpdate({
        target: [
          schema.petrosStudentNudgeState.institutionId,
          schema.petrosStudentNudgeState.studentId,
          schema.petrosStudentNudgeState.nudgeKey,
        ],
        set: { suppressUntil, dismissedAt: new Date() },
      })
      .returning()
      .then((rows) => rows[0]!);
  }
}
