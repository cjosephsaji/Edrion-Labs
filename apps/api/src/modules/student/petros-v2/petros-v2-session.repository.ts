import { Inject, Injectable } from '@nestjs/common';
import { and, eq, schema, sql, desc, type Database } from '@edrion/database';
import { randomUUID } from 'node:crypto';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal as Owner } from '../student.types';
import type { M4State } from './petros-v2-contracts.server';
import { PetrosSessionIntentRepository } from '../petros-session-intent/petros-session-intent.repository';
import { timePetrosStage } from './petros-performance';
@Injectable()
export class PetrosV2SessionRepository {
  constructor(
    @Inject(DATABASE) readonly db: Database,
    readonly intents: PetrosSessionIntentRepository,
  ) {}
  lock(key: string) {
    return timePetrosStage('session_lock', async () =>
      this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`m4:${key}`},0))`),
    );
  }
  async session(p: Owner, id: string) {
    const t = schema.petrosLearningSessions;
    return timePetrosStage(
      'session_read',
      async () =>
        (
          await this.db
            .select({
              id: t.id,
              status: t.status,
              version: t.version,
              engine: t.engineVersion,
              state: t.v2State,
              clientRequestId: t.clientRequestId,
            })
            .from(t)
            .where(
              and(
                eq(t.id, id),
                eq(t.institutionId, p.institutionId),
                eq(t.studentId, p.studentId),
                eq(t.engineVersion, 'v2'),
              ),
            )
            .limit(1)
            .for('no key update')
        )[0],
    );
  }
  async engine(p: Owner, id: string) {
    const t = schema.petrosLearningSessions;
    const [installed] = await this.db.execute<{ ok: boolean }>(
      sql`select exists(select 1 from pg_attribute where attrelid='public.petros_learning_sessions'::regclass and attname='engine_version' and not attisdropped) as ok`,
    );
    if (!installed?.ok) {
      const [legacy] = await this.db
        .select({ id: t.id })
        .from(t)
        .where(
          and(eq(t.id, id), eq(t.institutionId, p.institutionId), eq(t.studentId, p.studentId)),
        )
        .limit(1);
      return legacy ? { engine: 'v1' as const } : undefined;
    }
    return (
      await this.db
        .select({ engine: t.engineVersion })
        .from(t)
        .where(
          and(eq(t.id, id), eq(t.institutionId, p.institutionId), eq(t.studentId, p.studentId)),
        )
        .limit(1)
    )[0];
  }
  async existing(p: Owner, publicationId: string, commandId: string) {
    const t = schema.petrosLearningSessions;
    return (
      await this.db
        .select({
          id: t.id,
          state: t.v2State,
          status: t.status,
          clientRequestId: t.clientRequestId,
        })
        .from(t)
        .where(
          and(
            eq(t.institutionId, p.institutionId),
            eq(t.studentId, p.studentId),
            eq(t.engineVersion, 'v2'),
            sql`(${t.clientRequestId}=${commandId}::uuid OR (${t.v2State}->>'publicationId'=${publicationId} AND ${t.status}<>'closed'))`,
          ),
        )
        .orderBy(desc(t.createdAt))
        .limit(1)
    )[0];
  }
  async publication(id: string) {
    return timePetrosStage(
      'publication_lookup',
      async () =>
        (
          await this.db.execute<{ id: string; content_hash: string; content: unknown }>(
            sql`select id,content_hash,content from m4_publication(${id}::uuid)`,
          )
        )[0],
    );
  }
  available() {
    return this.db.execute<{ id: string }>(sql`select * from m4_available_publications()`);
  }
  async publicInstrument(publicationId: string, candidateId: string) {
    return (
      await this.db.execute<{ public_task: unknown; equivalence_key: string }>(
        sql`select * from m4_public_instrument(${publicationId}::uuid,${candidateId}::uuid)`,
      )
    )[0];
  }
  async create(
    p: Owner,
    id: string,
    requestId: string,
    state: M4State,
    title: string,
    objective: string,
  ) {
    await this.db.insert(schema.petrosLearningSessions).values({
      id,
      institutionId: p.institutionId,
      studentId: p.studentId,
      clientRequestId: requestId,
      stateVersion: 'petros.v2.session.v1',
      engineVersion: 'v2',
      v2State: state,
      sessionType: 'learn',
      status: 'active',
      topic: title,
      currentGoal: objective,
      timeBudgetSeconds: 1200,
      maxMoves: 1,
      checkpoints: [],
      currentCheckpointId: 'm4',
      promptVersion: 'm4.bounded.v1',
      outputSchemaVersion: 'm4.public.v1',
    });
  }
  save(p: Owner, id: string, state: M4State, status: string, revision: number) {
    const t = schema.petrosLearningSessions;
    return this.db
      .update(t)
      .set({
        v2State: state,
        status,
        version: revision,
        updatedAt: new Date(),
        ...(status === 'closed' ? { closedAt: new Date(), closeReason: 'student_closed' } : {}),
      })
      .where(
        and(
          eq(t.id, id),
          eq(t.studentId, p.studentId),
          eq(t.institutionId, p.institutionId),
          eq(t.engineVersion, 'v2'),
        ),
      );
  }
  async command(p: Owner, id: string, commandId: string) {
    const t = schema.petrosSessionCommands;
    return (
      await this.db
        .select()
        .from(t)
        .where(
          and(
            eq(t.sessionId, id),
            eq(t.institutionId, p.institutionId),
            eq(t.studentId, p.studentId),
            eq(t.idempotencyKey, commandId),
          ),
        )
        .limit(1)
    )[0];
  }
  async event(
    p: Owner,
    id: string,
    type: string,
    payload: Record<string, unknown>,
    commandId: string = randomUUID(),
  ) {
    const [r] = await this.db
      .insert(schema.petrosSessionEvents)
      .values({
        sessionId: id,
        institutionId: p.institutionId,
        studentId: p.studentId,
        type,
        payload,
        correlationId: commandId,
      })
      .returning();
    return r!;
  }
  events(p: Owner, id: string) {
    const t = schema.petrosSessionEvents;
    return this.db
      .select()
      .from(t)
      .where(
        and(
          eq(t.sessionId, id),
          eq(t.institutionId, p.institutionId),
          eq(t.studentId, p.studentId),
        ),
      )
      .orderBy(t.createdAt)
      .limit(1000);
  }
  async task(p: Owner, id: string, taskId?: string | null) {
    const t = schema.petrosV2Tasks;
    return (
      await this.db
        .select()
        .from(t)
        .where(
          and(
            eq(t.sessionId, id),
            ...(taskId !== undefined
              ? [eq(t.id, taskId ?? '00000000-0000-0000-0000-000000000000')]
              : []),
            eq(t.institutionId, p.institutionId),
            eq(t.studentId, p.studentId),
          ),
        )
        .limit(1)
    )[0];
  }
  async response(p: Owner, id: string, responseId?: string | null) {
    const t = schema.petrosV2Responses;
    return (
      await this.db
        .select()
        .from(t)
        .where(
          and(
            eq(t.sessionId, id),
            ...(responseId !== undefined
              ? [eq(t.id, responseId ?? '00000000-0000-0000-0000-000000000000')]
              : []),
            eq(t.institutionId, p.institutionId),
            eq(t.studentId, p.studentId),
          ),
        )
        .limit(1)
    )[0];
  }
  async evaluation(p: Owner, id: string, responseId?: string | null) {
    const t = schema.petrosV2Evaluations;
    const rows = await this.db
      .select()
      .from(t)
      .where(
        and(
          eq(t.sessionId, id),
          ...(responseId !== undefined
            ? [eq(t.responseId, responseId ?? '00000000-0000-0000-0000-000000000000')]
            : []),
          eq(t.institutionId, p.institutionId),
          eq(t.studentId, p.studentId),
        ),
      );
    const superseded = new Set(rows.map((r) => r.supersedes));
    return rows.find((r) => !superseded.has(r.id));
  }
  async historyCounts(p: Owner, id: string) {
    const [r] = await this.db.execute<{ committed: string; evaluated: string }>(sql`
      select (select count(*) from petros_v2_responses where session_id=${id}::uuid and institution_id=${p.institutionId}::uuid and student_id=${p.studentId}::uuid) as committed,
      (select count(*) from petros_v2_evaluations e where e.session_id=${id}::uuid and e.institution_id=${p.institutionId}::uuid and e.student_id=${p.studentId}::uuid
        and e.result->>'status' in ('evaluated','review_required') and not exists(select 1 from petros_v2_evaluations c where c.supersedes=e.id)) as evaluated`);
    return { committed: Number(r?.committed ?? 0), evaluated: Number(r?.evaluated ?? 0) };
  }
  async workspace(p: Owner, id: string) {
    const t = schema.petrosWorkspaces;
    return (
      await this.db
        .select()
        .from(t)
        .where(
          and(eq(t.id, id), eq(t.institutionId, p.institutionId), eq(t.studentId, p.studentId)),
        )
        .limit(1)
    )[0];
  }
  async checkpoint(p: Owner, workspaceId: string, id: string) {
    const t = schema.petrosWorkspaceCheckpoints;
    return (
      await this.db
        .select()
        .from(t)
        .where(
          and(
            eq(t.id, id),
            eq(t.workspaceId, workspaceId),
            eq(t.institutionId, p.institutionId),
            eq(t.studentId, p.studentId),
          ),
        )
        .limit(1)
    )[0];
  }
}
