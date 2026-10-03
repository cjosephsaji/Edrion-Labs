import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { and, desc, eq, sql, schema, type Database } from '@edrion/database';
import {
  PETROS_QUESTION_EXECUTION_VERSION,
  type PetrosComposerQuestionInput,
  type PetrosKnowledgePolicy,
  type PetrosAdmissionDenial,
} from '@edrion/schemas';
import { DATABASE, AUDIT_WRITER } from '../../../common/tokens';
import type { AuditWriter } from '@edrion/audit';
import { ActorType } from '@edrion/shared-types';
import type { InstitutionalStudentPrincipal } from '../student.types';
import type { PetrosOwnerScope } from './petros-loop.repository';
import { questionDenial } from '../../petros-institutional/petros-admission';

const commands = schema.petrosSessionCommands;
export type QuestionExecution = typeof commands.$inferSelect;
export const executionConflict = (code: string) =>
  new ConflictException({
    code,
    message: 'The document question changed or is unavailable. Refresh its status.',
    meta: { admission: questionDenial(code) },
  });

/** Extension of the existing command owner; its row also owns dispatch recovery. */
@Injectable()
export class PetrosQuestionExecutionRepository {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async admit(
    principal: InstitutionalStudentPrincipal,
    sessionId: string,
    input: PetrosComposerQuestionInput,
    sourceFingerprint: string,
    knowledgePolicy: PetrosKnowledgePolicy | null = null,
  ) {
    // Serialize admission and retry for this owner, including requests with different keys.
    await this.lockOwner(principal);
    const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const existing = await this.byKey(principal, sessionId, input.idempotencyKey);
    if (existing) {
      if (
        existing.executionVersion !== PETROS_QUESTION_EXECUTION_VERSION ||
        existing.inputSha256 !== digest
      )
        throw executionConflict('PETROS_QUESTION_KEY_REUSED');
      return existing;
    }
    await this.capacity(principal);
    const [count] = await this.db.execute<{
      count: number;
    }>(sql`select count(*)::int as count from petros_session_commands
      where institution_id = ${principal.institutionId} and student_id = ${principal.studentId}
      and execution_version is not null and created_at > now() - interval '24 hours'`);
    if ((count?.count ?? 0) >= 100) throw executionConflict('PETROS_QUESTION_LIMIT');
    let row: QuestionExecution | undefined;
    try {
      [row] = await this.db
        .insert(commands)
        .values({
          sessionId,
          institutionId: principal.institutionId,
          studentId: principal.studentId,
          idempotencyKey: input.idempotencyKey,
          command: 'document_question.v1',
          executionVersion: PETROS_QUESTION_EXECUTION_VERSION,
          executionState: 'queued',
          executionInput: input,
          requestedBy: principal.institutionUserId,
          inputSha256: digest,
          sourceFingerprint,
          knowledgePolicy,
          nextDispatchAt: new Date(),
        })
        .returning();
    } catch (error) {
      if (activeQuestionConflict(error))
        throw executionConflict('PETROS_QUESTION_EXECUTION_REQUIRED');
      throw error;
    }
    await this.transition(row!);
    return row!;
  }

  async byKey(scope: PetrosOwnerScope, sessionId: string, key: string) {
    const [row] = await this.db
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.institutionId, scope.institutionId),
          eq(commands.studentId, scope.studentId),
          eq(commands.sessionId, sessionId),
          eq(commands.idempotencyKey, key),
        ),
      )
      .limit(1);
    return row;
  }

  async get(scope: PetrosOwnerScope, id: string, lock = false) {
    const query = this.db
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.id, id),
          eq(commands.institutionId, scope.institutionId),
          eq(commands.studentId, scope.studentId),
          eq(commands.executionVersion, PETROS_QUESTION_EXECUTION_VERSION),
        ),
      )
      .limit(1);
    const [row] = await (lock ? query.for('no key update') : query);
    if (!row)
      throw new NotFoundException({
        code: 'PETROS_QUESTION_UNAVAILABLE',
        message: 'Document question unavailable.',
      });
    return row;
  }

  async latest(scope: PetrosOwnerScope, sessionId: string) {
    const [row] = await this.db
      .select()
      .from(commands)
      .where(
        and(
          eq(commands.institutionId, scope.institutionId),
          eq(commands.studentId, scope.studentId),
          eq(commands.sessionId, sessionId),
          eq(commands.executionVersion, PETROS_QUESTION_EXECUTION_VERSION),
        ),
      )
      .orderBy(desc(commands.createdAt))
      .limit(1);
    return row ?? null;
  }

  due() {
    return this.db.execute<{
      id: string;
      institution_id: string;
      student_id: string;
      dispatch_sequence: number;
    }>(sql`select * from edrion_due_petros_questions()`);
  }

  async claim(scope: PetrosOwnerScope, id: string) {
    const row = await this.get(scope, id, true);
    const now = await this.now();
    if (
      !['queued', 'running'].includes(row.executionState!) ||
      (row.executionLeaseUntil && row.executionLeaseUntil > now)
    )
      return null;
    if (row.executionAttempts >= 3 || now.getTime() - row.createdAt.getTime() > 15 * 60_000) {
      await this.update(row.id, {
        executionState: 'failed',
        executionLeaseUntil: null,
        errorCode: 'PETROS_QUESTION_EXPIRED',
        admissionDenial: questionDenial('PETROS_QUESTION_EXPIRED', row.id),
      });
      return null;
    }
    return this.update(row.id, {
      executionState: 'running',
      executionFence: row.executionFence + 1,
      executionAttempts: row.executionAttempts + 1,
      executionLeaseUntil: sql`now() + interval '60 seconds'`,
      errorCode: null,
      admissionDenial: null,
    });
  }

  async assertLease(claim: QuestionExecution, lock = false) {
    const row = await this.get(claim, claim.id, lock);
    if (
      row.executionState !== 'running' ||
      row.executionFence !== claim.executionFence ||
      !row.executionLeaseUntil ||
      row.executionLeaseUntil <= (await this.now())
    )
      throw executionConflict('PETROS_QUESTION_LEASE_LOST');
    return row;
  }

  async complete(claim: QuestionExecution, response: Record<string, unknown>) {
    await this.assertLease(claim, true);
    return this.update(claim.id, {
      executionState: 'succeeded',
      executionLeaseUntil: null,
      status: 'completed',
      response,
      completedAt: new Date(),
      errorCode: null,
    });
  }

  async fail(claim: QuestionExecution, code: string, denial: PetrosAdmissionDenial | null = null) {
    const row = await this.get(claim, claim.id, true);
    if (row.executionState !== 'running' || row.executionFence !== claim.executionFence) return;
    return this.update(claim.id, {
      executionState: 'failed',
      executionLeaseUntil: null,
      errorCode: code,
      admissionDenial: denial,
    });
  }

  async command(scope: PetrosOwnerScope, id: string, version: number, action: 'cancel' | 'retry') {
    await this.lockOwner(scope);
    const row = await this.get(scope, id, true);
    // Lost response replay is safe; a stale command cannot cancel a newer retry.
    if (action === 'cancel' && row.executionState === 'cancelled') return row;
    if (
      action === 'retry' &&
      row.executionState === 'queued' &&
      row.executionRevision === version + 1
    )
      return row;
    if (row.executionRevision !== version) throw executionConflict('PETROS_QUESTION_STALE');
    if (row.executionState === 'succeeded') return row;
    if (action === 'retry') {
      if (!this.retryable(row, await this.now()))
        throw executionConflict('PETROS_QUESTION_RETRY_DENIED');
      await this.capacity(scope);
    }
    return this.update(id, {
      executionState: action === 'cancel' ? 'cancelled' : 'queued',
      executionFence: row.executionFence + 1,
      executionLeaseUntil: null,
      nextDispatchAt: new Date(),
      errorCode: action === 'cancel' ? 'PETROS_QUESTION_CANCELLED' : null,
      admissionDenial: null,
    });
  }

  retryable(row: QuestionExecution, now = new Date()) {
    return (
      row.executionState === 'failed' &&
      ['PETROS_QUESTION_INFRASTRUCTURE', 'PETROS_QUESTION_TIMEOUT'].includes(row.errorCode ?? '') &&
      row.executionAttempts < 3 &&
      now.getTime() - row.createdAt.getTime() < 15 * 60_000
    );
  }

  private async now() {
    const [row] = await this.db.execute<{ now: Date }>(sql`select clock_timestamp() as now`);
    return new Date(row!.now);
  }
  private lockOwner(scope: PetrosOwnerScope) {
    return this.db.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`petros-question:${scope.institutionId}:${scope.studentId}`}, 0))`,
    );
  }
  private async capacity(scope: PetrosOwnerScope) {
    const [active] = await this.db
      .execute(sql`select id from petros_session_commands where institution_id = ${scope.institutionId}
      and student_id = ${scope.studentId} and execution_state in ('queued','running') limit 1`);
    if (active) throw executionConflict('PETROS_QUESTION_IN_FLIGHT');
  }
  private async update(id: string, values: Parameters<ReturnType<Database['update']>['set']>[0]) {
    const [row] = await this.db
      .update(commands)
      .set({
        ...values,
        executionRevision: sql`${commands.executionRevision} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(commands.id, id))
      .returning();
    await this.transition(row!);
    return row!;
  }
  private async transition(row: QuestionExecution) {
    const payload = {
      commandId: row.id,
      version: row.executionRevision,
      state: row.executionState,
      attempts: row.executionAttempts,
      fence: row.executionFence,
      errorCode: row.errorCode,
      knowledgeMode: row.knowledgePolicy?.mode ?? null,
      policyHash: row.knowledgePolicy?.authorityHash ?? null,
      admission: row.admissionDenial,
    };
    await this.db
      .insert(schema.petrosSessionEvents)
      .values({
        sessionId: row.sessionId,
        institutionId: row.institutionId,
        studentId: row.studentId,
        type: `document_question.${row.executionState}`,
        correlationId: row.id,
        payload,
      });
    await this.audit.logAudit({
      actorType: ActorType.InstitutionUser,
      actorId: row.requestedBy!,
      institutionId: row.institutionId,
      action: `petros.document_question.${row.executionState}`,
      module: 'petros',
      entityType: 'petros_session_command',
      entityId: row.id,
      correlationId: row.id,
      newState: payload,
    });
  }
}

function activeQuestionConflict(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return false;
  const storage = error as { code?: unknown; constraint_name?: unknown };
  return storage.code === '23505' && storage.constraint_name === 'petros_question_active_student_uq';
}
