import { and, eq, schema, sql, type Database } from '@edrion/database';
import { randomUUID } from 'node:crypto';
import { ConflictException } from '@nestjs/common';
/** Legacy helpers cannot become an unrecorded M4 assessment tutor. */
export async function assertM4AssistanceBoundary(db: Database) {
  const [installed] = await db.execute<{ ok: boolean }>(
    sql`select to_regprocedure('public.m4_has_pending_assessment()') is not null as ok`,
  );
  if (!installed?.ok) return;
  const [pending] = await db.execute<{ pending: boolean }>(
    sql`select m4_has_pending_assessment() as pending`,
  );
  if (pending?.pending)
    throw new ConflictException({
      code: 'M4_ASSESSMENT_HELP_RESTRICTED',
      message:
        'Use the help available in your lesson, or close the current question before asking Petros for other help.',
    });
}
/** Called only after the existing source owner authorizes a file/preview read.
 * This conservative observation does not grant access or expose a private contract.
 */
export async function recordM4SourceExposure(
  db: Database,
  p: { institutionId: string; studentId: string },
  objectId: string,
) {
  const [installed] = await db.execute<{ ok: boolean }>(
    sql`select to_regprocedure('public.m4_source_sessions(uuid)') is not null as ok`,
  );
  if (!installed?.ok) return;
  const rows = await db.execute<{ id: string; task_id: string }>(
    sql`select * from m4_source_sessions(${objectId}::uuid)`,
  );
  for (const row of rows) {
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`m4:${row.id}`},0))`);
    // Recheck after waiting for a competing submission. Later access cannot rewrite its conditions.
    const current = await db.execute<{ id: string }>(
      sql`select id from m4_source_sessions(${objectId}::uuid) where id=${row.id}::uuid`,
    );
    if (!current.length) continue;
    const t = schema.petrosSessionEvents;
    const prior = await db
      .select({ id: t.id })
      .from(t)
      .where(
        and(
          eq(t.sessionId, row.id),
          eq(t.institutionId, p.institutionId),
          eq(t.studentId, p.studentId),
          eq(t.type, 'm4.exposure'),
          sql`${t.payload}->>'kind'='solution_bearing_source_access' AND ${t.payload}->>'taskId'=${row.task_id}`,
        ),
      )
      .limit(1);
    if (prior.length) continue;
    await db
      .insert(t)
      .values({
        sessionId: row.id,
        institutionId: p.institutionId,
        studentId: p.studentId,
        type: 'm4.exposure',
        payload: { kind: 'solution_bearing_source_access', taskId: row.task_id },
        correlationId: randomUUID(),
      });
  }
}
