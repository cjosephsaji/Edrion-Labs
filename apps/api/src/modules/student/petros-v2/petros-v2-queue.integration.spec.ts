import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startM4Fixture, type M4Fixture } from './petros-v2.fixture';
import { m4IsolatedQueue } from './petros-v2-queue.fixture';
import { M4_JOB } from './petros-v2-command.worker';
describe.runIf(process.env.PETROS_M4_DB_TESTS === '1')(
  'M4 actual BullMQ/isolated Redis recovery',
  () => {
    let f: M4Fixture, q: Awaited<ReturnType<typeof m4IsolatedQueue>>;
    beforeAll(async () => {
      f = await startM4Fixture();
      q = await m4IsolatedQueue(f);
    }, 120000);
    afterAll(async () => {
      await q?.close();
      await f?.close();
    });
    async function committed() {
      const l = await f.lesson('cloud');
      let s = await f.start(l.publication.id);
      s = await f.command(s, 'next');
      await f.sessions.commit(f.student, s.id, s.task!.taskId, {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        taskInstanceHash: s.task!.instanceHash,
        canvasRevision: 0,
        response: {
          kind: 'structured',
          values: { responsibility: 'consumer', reason: 'data_access' },
        },
      });
      return s;
    }
    async function completed(id: string) {
      for (let i = 0; i < 100; i++) {
        const s = await f.sessions.get(f.student, id);
        if (s.submission?.status === 'complete') return s;
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('M4_QUEUE_COMPLETION_TIMEOUT');
    }
    it('crash after database publication before acknowledgment retries without duplicate evaluation', async () => {
      let inject = true;
      q.workers.register(M4_JOB, async (job) => {
        const r = await q.worker.process(job.data);
        if (inject) {
          inject = false;
          throw new Error('Injected crash after commit before acknowledgment');
        }
        return r;
      });
      const s = await committed();
      await q.worker.dispatch(s.id, f.student.institutionUserId);
      expect((await completed(s.id)).evaluation?.status).toBe('evaluated');
      await q.worker.dispatch(s.id, f.student.institutionUserId);
      await new Promise((r) => setTimeout(r, 2500));
      expect(
        (
          await f.f.f
            .adminSql`select count(*)::int n from petros_v2_evaluations where session_id=${s.id}`
        )[0]!.n,
      ).toBe(1);
    }, 30000);
    it('Redis loss cannot roll back a committed answer; durable due scan recovers after restart', async () => {
      await q.stop();
      const s = await committed();
      expect((await f.sessions.get(f.student, s.id)).submission?.status).toBe('pending');
      const buffered = q.worker.dispatch(s.id, f.student.institutionUserId);
      await new Promise((r) => setTimeout(r, 150));
      expect((await f.sessions.get(f.student, s.id)).submission?.status).toBe('pending');
      await q.start();
      await buffered;
      await q.worker.recover();
      expect((await completed(s.id)).submission?.status).toBe('complete');
    }, 30000);
  },
);
