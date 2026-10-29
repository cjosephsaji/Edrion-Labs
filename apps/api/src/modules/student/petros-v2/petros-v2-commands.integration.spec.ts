import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, schema } from '@edrion/database';
import { startM4Fixture, type M4Fixture } from './petros-v2.fixture';
import { m4Hash } from './petros-v2-contracts.server';
describe.runIf(process.env.PETROS_M4_DB_TESTS === '1')(
  'M4 durable commands and failure recovery',
  () => {
    let f: M4Fixture,
      lesson: Awaited<ReturnType<M4Fixture['lesson']>>,
      s: Awaited<ReturnType<M4Fixture['start']>>;
    beforeAll(async () => {
      f = await startM4Fixture();
      lesson = await f.lesson('cloud');
      s = await f.start(lesson.publication.id);
    }, 120000);
    afterAll(async () => {
      await f?.close();
    });
    it('same command and payload returns the same durable result; changed payload conflicts', async () => {
      const c = {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        type: 'next',
      };
      const [a, b] = await Promise.all([
        f.sessions.command(f.student, s.id, c),
        f.sessions.command(f.student, s.id, c),
      ]);
      expect(a).toEqual(b);
      await expect(
        f.sessions.command(f.student, s.id, { ...c, type: 'close' }),
      ).rejects.toMatchObject({ status: 409 });
      s = await f.sessions.get(f.student, s.id);
    });
    it('stale revision and epoch cannot overwrite the issued task', async () => {
      for (const extra of [{ expectedRevision: s.revision - 1 }, { epoch: s.epoch + 1 }])
        await expect(
          f.sessions.command(f.student, s.id, {
            commandId: randomUUID(),
            expectedRevision: s.revision,
            epoch: s.epoch,
            type: 'pause',
            ...extra,
          }),
        ).rejects.toMatchObject({ status: 409 });
    });
    it('draft pause/reload/resume returns the same task and accepted draft', async () => {
      const task = s.task!.taskId;
      s = await f.command(s, 'canvas_checkpoint', { draft: 'Saved draft', canvasRevision: 0 });
      s = await f.command(s, 'pause');
      const reload = await f.sessions.get(f.student, s.id);
      expect(reload.status).toBe('paused');
      expect(reload.draft).toBe('Saved draft');
      s = await f.command(reload, 'resume');
      expect(s.task?.taskId).toBe(task);
      expect(s.draft).toBe('Saved draft');
    });
    it('concurrent double submit commits once and returns durable receipts', async () => {
      const input = {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        taskInstanceHash: s.task!.instanceHash,
        canvasRevision: 0,
        response: {
          kind: 'structured',
          values: { responsibility: 'consumer', reason: 'all_transferred' },
        },
      };
      const [a, b] = await Promise.all([
        f.sessions.commit(f.student, s.id, s.task!.taskId, input),
        f.sessions.commit(f.student, s.id, s.task!.taskId, input),
      ]);
      expect(a.responseId).toBe(b.responseId);
      expect(a.status).toBe('pending');
      await expect(
        f.sessions.commit(f.student, s.id, s.task!.taskId, {
          ...input,
          response: {
            kind: 'structured',
            values: { responsibility: 'provider', reason: 'all_transferred' },
          },
        }),
      ).rejects.toMatchObject({ status: 409 });
      s = await f.sessions.get(f.student, s.id);
      expect(s.submission?.status).toBe('pending');
    });
    it('crash after claim, lease expiry and duplicate publication retain the committed response', async () => {
      const first = await f.sessions.claim(f.student, s.id);
      expect(first).not.toBeNull();
      expect(await f.sessions.claim(f.student, s.id)).toBeNull();
      const delayed = await f.assessment.evaluate(first!);
      await f.f.admin
        .update(schema.petrosSessionCommands)
        .set({ executionLeaseUntil: new Date(Date.now() - 1000) })
        .where(eq(schema.petrosSessionCommands.idempotencyKey, first!.commandId));
      const second = await f.sessions.claim(f.student, s.id);
      expect(second!.fence).toBeGreaterThan(first!.fence);
      expect(await f.sessions.publish(f.student, first!, delayed)).toBe(false);
      s = await f.command(s, 'pause');
      expect(s.submission?.status).toBe('pending');
      expect(
        await f.sessions.publish(f.student, second!, await f.assessment.evaluate(second!)),
      ).toBe(true);
      expect(await f.sessions.publish(f.student, second!, delayed)).toBe(false);
      const paused = await f.sessions.get(f.student, s.id);
      expect(paused.status).toBe('paused');
      expect(paused.evaluation?.criteria.map((c) => c.status)).toEqual([
        'satisfied',
        'not_satisfied',
      ]);
      expect(paused.progress.criteriaObserved).toBe(1);
      s = await f.command(paused, 'resume');
    });
    it('worker delivery after database commit is a logical no-op', async () => {
      const before = await f.sessions.get(f.student, s.id);
      await f.worker.process({ sessionId: s.id, requestedBy: f.student.institutionUserId });
      expect((await f.sessions.get(f.student, s.id)).revision).toBe(before.revision);
      const [counts] = await f.f.f
        .adminSql`select (select count(*) from petros_v2_responses)::int responses,(select count(*) from petros_v2_evaluations)::int evaluations`;
      expect(counts).toEqual({ responses: 1, evaluations: 1 });
    });
    it('withdrawal appends evidence invalidation and preserves response/evaluation history', async () => {
      const before = await f.repo.response(f.student, s.id);
      const rows = await f.f.f
        .adminSql`select response_hash from petros_v2_responses where session_id=${s.id}`;
      const hash = rows[0]!.response_hash;
      await f.f.admin
        .update(schema.classMaterials)
        .set({ sourceRevokedAt: new Date() })
        .where(eq(schema.classMaterials.id, lesson.file.id));
      const blocked = await f.sessions.get(f.student, s.id);
      expect(blocked.status).toBe('blocked');
      expect(blocked.lesson).toBeNull();
      expect(blocked.progress.criteriaObserved).toBe(0);
      expect(blocked.submission).not.toBeNull();
      const after = await f.f.f
        .adminSql`select response_hash from petros_v2_responses where session_id=${s.id}`;
      expect(after[0]!.response_hash).toBe(hash);
      const evals = await f.f.f
        .adminSql`select id,supersedes from petros_v2_evaluations where session_id=${s.id}`;
      expect(evals).toHaveLength(2);
      expect(evals.some((e) => e.supersedes)).toBe(true);
      s = blocked;
      void before;
      void m4Hash;
    });
    it('closed sessions cannot reactivate through stale commands', async () => {
      s = await f.command(s, 'close');
      expect(s.status).toBe('closed');
      await expect(f.command(s, 'resume')).rejects.toMatchObject({ status: 409 });
    });
  },
);
