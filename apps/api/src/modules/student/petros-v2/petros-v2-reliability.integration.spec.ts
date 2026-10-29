import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startM4Fixture, type M4Fixture } from './petros-v2.fixture';
import { m4V1Owners } from './petros-v2-v1.fixture';
describe.runIf(process.env.PETROS_M4_DB_TESTS === '1')(
  'M4 measured duplicate/retry and warm latency harness',
  () => {
    let f: M4Fixture,
      s: Awaited<ReturnType<M4Fixture['start']>>,
      command: Record<string, unknown>,
      receipt: unknown;
    const timings: {
      admission: number[];
      duplicate: number[];
      read: number[];
      evaluation: number[];
    } = { admission: [], duplicate: [], read: [], evaluation: [] };
    const passedBoundaries = { payloadConflict: 0, stale: 0, foreign: 0 };
    beforeAll(async () => {
      f = await startM4Fixture();
      const l = await f.lesson('cloud');
      const start = performance.now();
      s = await f.start(l.publication.id);
      timings.admission.push(performance.now() - start);
      command = {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        type: 'next',
      };
      receipt = await f.sessions.command(f.student, s.id, command);
      s = await f.sessions.get(f.student, s.id);
    }, 120000);
    afterAll(async () => {
      if (process.env.PETROS_M4_EVIDENCE_DIR)
        writeFileSync(
          resolve(process.env.PETROS_M4_EVIDENCE_DIR, 'reliability-performance.json'),
          JSON.stringify(
            {
              label:
                'Local disposable PostgreSQL; warm cache; no provider; repeated boundary workload, not full production failure gate',
              counts: { duplicate: timings.duplicate.length, ...passedBoundaries },
              timings,
            },
            null,
            2,
          ),
        );
      await f?.close();
    });
    for (let index = 0; index < 400; index++)
      it(`duplicate delivery / retry ${index + 1}`, async () => {
        const began = performance.now();
        expect(await f.sessions.command(f.student, s.id, command)).toEqual(receipt);
        timings.duplicate.push(performance.now() - began);
      });
    for (let index = 0; index < 200; index++)
      it(`command hash mismatch ${index + 1}`, async () => {
        await expect(
          f.sessions.command(f.student, s.id, { ...command, type: index % 2 ? 'close' : 'pause' }),
        ).rejects.toMatchObject({ status: 409 });
        passedBoundaries.payloadConflict++;
      });
    for (let index = 0; index < 200; index++)
      it(`stale revision/epoch ${index + 1}`, async () => {
        await expect(
          f.sessions.command(f.student, s.id, {
            commandId: randomUUID(),
            expectedRevision: index % 2 ? s.revision : 0,
            epoch: index % 2 ? s.epoch + 1 : s.epoch,
            type: 'pause',
          }),
        ).rejects.toMatchObject({ status: 409 });
        passedBoundaries.stale++;
      });
    for (let index = 0; index < 200; index++)
      it(`foreign session retry ${index + 1}`, async () => {
        await expect(f.sessions.get(f.other, s.id)).rejects.toMatchObject({ status: 404 });
        passedBoundaries.foreign++;
      });
    it('records 50 warm admissions and reads and 50 real restricted-evaluator checks', async () => {
      for (let i = 0; i < 50; i++) {
        let start = performance.now();
        await f.sessions.admit(f.student, {
          intentId: (await f.studentRun(() => f.repo.session(f.student, s.id)))!.state!
            .admissionIntentId,
          commandId: randomUUID(),
        });
        timings.admission.push(performance.now() - start);
        start = performance.now();
        await f.sessions.get(f.student, s.id);
        timings.read.push(performance.now() - start);
      }
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
      const claim = (await f.sessions.claim(f.student, s.id))!;
      for (let i = 0; i < 50; i++) {
        const start = performance.now();
        await f.assessment.evaluate(claim);
        timings.evaluation.push(performance.now() - start);
      }
      await f.sessions.publish(f.student, claim, await f.assessment.evaluate(claim));
      expect(timings.admission).toHaveLength(51);
      expect(timings.evaluation).toHaveLength(50);
    }, 300000);
    it('disabled new admissions preserve owned V2 recovery and the original V1 lifecycle', async () => {
      f.env.PETROS_V2_SESSIONS_ENABLED = false;
      expect((await f.sessions.get(f.student, s.id)).submission).not.toBeNull();
      await expect(
        f.sessions.admit(f.student, { intentId: randomUUID(), commandId: randomUUID() }),
      ).rejects.toMatchObject({ status: 409 });
      const v1 = m4V1Owners(f),
        id = await v1.seed();
      expect(await f.sessions.engine(f.student, id)).toEqual({ engine: 'v1' });
      expect((await f.studentRun(() => v1.loop.document(f.student, id))).status).toBe('paused');
      expect((await f.studentRun(() => v1.loop.resume(f.student, id, randomUUID()))).status).toBe(
        'active',
      );
      expect((await f.studentRun(() => v1.loop.pause(f.student, id, randomUUID()))).status).toBe(
        'paused',
      );
      expect(
        (
          await f.studentRun(() =>
            v1.loop.close(f.student, id, {
              idempotencyKey: randomUUID(),
              reason: 'student_stopped',
            }),
          )
        ).status,
      ).toBe('closed');
      f.env.PETROS_V2_SESSIONS_ENABLED = true;
    }, 30000);
  },
);
