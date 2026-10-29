import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startM4Fixture, type M4Fixture } from './petros-v2.fixture';
describe.runIf(process.env.PETROS_M4_DB_TESTS === '1')(
  'M4 restricted ownership and real admission path',
  () => {
    let f: M4Fixture;
    beforeAll(async () => {
      f = await startM4Fixture();
    }, 120000);
    afterAll(async () => {
      await f?.close();
    });
    it('rejects arbitrary publication identities', async () => {
      await expect(
        f.sessions.admit(f.student, { intentId: randomUUID(), commandId: randomUUID() }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it('admits an independently fixture-reviewed source and pins v2', async () => {
      const lesson = await f.lesson('cloud');
      const s = await f.start(lesson.publication.id);
      expect(s.engine).toBe('v2');
      expect(s.stage).toBe('delivering');
      expect(s.lesson?.subject).toBe('Cloud Computing');
      await expect(f.sessions.get(f.other, s.id)).rejects.toMatchObject({ status: 404 });
      const task = await f.command(s, 'next');
      expect(task.task).not.toBeNull();
      const committed = await f.sessions.commit(f.student, s.id, task.task!.taskId, {
        commandId: randomUUID(),
        expectedRevision: task.revision,
        epoch: task.epoch,
        taskInstanceHash: task.task!.instanceHash,
        canvasRevision: 0,
        response: {
          kind: 'structured',
          values: { responsibility: 'consumer', reason: 'data_access' },
        },
      });
      expect(committed.status).toBe('pending');
      expect((await f.sessions.get(f.student, s.id)).submission?.status).toBe('pending');
      await f.worker.process({ sessionId: s.id, requestedBy: f.student.institutionUserId });
      const result = await f.sessions.get(f.student, s.id);
      expect(result.evaluation?.criteria.map((c) => c.status)).toEqual(['satisfied', 'satisfied']);
      expect(result.progress.mastery).toBe(false);
      expect(result.progress.criteriaObserved).toBe(2);
    }, 60000);
  },
);
