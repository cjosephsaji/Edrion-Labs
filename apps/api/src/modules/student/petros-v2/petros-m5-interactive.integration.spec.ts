import { eq, schema } from '@edrion/database';
import { randomUUID } from 'node:crypto';
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import type { M4Snapshot, CanvasOperation } from '@edrion/schemas';
import { startM5Fixture, submitM5, type M5Fixture } from './petros-m5.fixture';
describe.runIf(process.env.PETROS_M5_DB_TESTS === '1')(
  'M5 genuine memory lab persistence and assessment separation',
  () => {
    let f: M5Fixture, s: M4Snapshot, originalId: string, originalHash: string;
    beforeAll(async () => {
      f = await startM5Fixture({ practiceRetries: true });
    }, 120000);
    afterAll(async () => {
      await f?.close();
    });
    const lab = () => {
      const e = s.canvas!.elements.find((e) => e.kind === 'allocation');
      if (e?.kind !== 'allocation') throw new Error('Missing lab');
      return e;
    };
    const editInput = (operations: CanvasOperation[]) => ({
      edit: {
        mode: s.canvas!.mode,
        activityId: s.canvas!.activityId,
        branchId: s.canvas!.branchId,
        checkpointId: s.canvas!.invitation!.id,
        expectedRevision: s.canvas!.revision,
        expectedDraftRevision: s.canvas!.draftRevision,
        operations,
      },
    });
    const edit = async (operations: CanvasOperation[]) => {
      s = await f.command(s, 'canvas_edit', editInput(operations));
    };
    const predict = async (requestedCount: number) =>
      edit([
        {
          type: 'predict_allocation',
          id: lab().id,
          expectedVersion: lab().version,
          prediction: { requestedCount, expectation: 'fits' },
        },
      ]);
    const allocate = async (requestedCount: number) =>
      edit([
        { type: 'change_allocation', id: lab().id, expectedVersion: lab().version, requestedCount },
      ]);
    it('keeps independent tasks free of the teaching lab and starts from exact source pins after evaluation', async () => {
      const lesson = await f.m5Lesson('cloud');
      s = await f.command(await f.start(lesson.publication.id), 'next');
      expect(s.teaching).toBeNull();
      expect(s.canvas?.elements.some((e) => e.kind === 'allocation')).toBe(false);
      s = await submitM5(f, s, {
        kind: 'structured',
        values: { responsibility: 'consumer', available: 48, capacity: 7 },
      });
      originalId = s.submission!.id;
      originalHash = (await f.studentRun(() => f.repo.response(f.student, s.id, originalId)))!
        .responseHash;
      s = await f.command(s, 'teach');
      expect(s.canvas?.elements).toEqual([]);
      while (s.teaching?.status === 'presenting')
        s = await f.command(s, 'teaching_step', {
          actionId: s.teaching.actionId,
          nextBeat: s.teaching.nextBeat,
        });
      expect(lab()).toMatchObject({
        sourceId: `source-${s.teaching!.reference.unitId}`,
        resource: { model: { totalGB: 64, reservedGB: 16, perVMGB: 8 }, allocatedCount: 1 },
      });
      expect(s.canvas!.elements.find((e) => e.id === 'capacity')).toMatchObject({ value: '7' });
      expect(lab().resource.observations.at(-1)).toMatchObject({
        prediction: null,
        allocatedGB: 8,
        remainingGB: 40,
      });
    }, 120000);
    it('pauses and reloads a pending exact prediction without attaching a prior result', async () => {
      await predict(2);
      const attempt = lab().resource.activeAttemptId;
      const a = lab().resource.attempts!.find((a) => a.id === attempt)!;
      expect(a).toMatchObject({
        sessionId: s.id,
        activityId: s.canvas!.activityId,
        sourceRevisionId: s.teaching!.reference.sourceRevisionId,
        sourceHash: s.teaching!.reference.sourceHash,
        status: 'predicted',
        observedAt: null,
      });
      s = await f.command(s, 'pause');
      s = await f.sessions.get(f.student, s.id);
      expect(lab().resource.activeAttemptId).toBe(attempt);
      s = await f.command(s, 'resume');
      expect(lab().resource.attempts!.find((a) => a.id === attempt)!.observedAt).toBeNull();
      await edit([
        {
          type: 'close_allocation_attempt',
          id: lab().id,
          expectedVersion: lab().version,
          attemptId: attempt!,
          disposition: 'cancel',
        },
      ]);
      expect(lab().resource.activeAttemptId).toBeNull();
    });
    it('saves prediction, allocation, exact checkpoint and reloads the same acknowledged observation', async () => {
      await predict(2);
      const predicted = lab().resource.prediction;
      await allocate(2);
      const checkpoint = s.checkpointId;
      s = await f.sessions.get(f.student, s.id);
      expect(s.checkpointId).toBe(checkpoint);
      expect(lab().resource.observations.at(-1)).toMatchObject({
        prediction: predicted,
        allocatedCount: 2,
        remainingGB: 32,
      });
    });
    it('new predictions keep previous results historical and reject a delayed old-attempt operation', async () => {
      const previousId = lab().resource.activeAttemptId!;
      await predict(3);
      const currentId = lab().resource.activeAttemptId!;
      expect(currentId).not.toBe(previousId);
      expect(lab().resource.observations.find((o) => o.attemptId === currentId)).toBeUndefined();
      await expect(
        f.command(
          s,
          'canvas_edit',
          editInput([
            {
              type: 'change_allocation',
              id: lab().id,
              expectedVersion: lab().version,
              requestedCount: 3,
              attemptId: previousId,
            },
          ]),
        ),
      ).rejects.toMatchObject({ status: 409 });
      s = await f.sessions.get(f.student, s.id);
      expect(lab().resource.activeAttemptId).toBe(currentId);
      await edit([
        {
          type: 'close_allocation_attempt',
          id: lab().id,
          expectedVersion: lab().version,
          attemptId: currentId,
          disposition: 'cancel',
        },
      ]);
    });
    it('is idempotent for a duplicate command and rejects a stale concurrent edit', async () => {
      const command = {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        type: 'canvas_edit' as const,
        ...editInput([
          {
            type: 'change_allocation',
            id: lab().id,
            expectedVersion: lab().version,
            requestedCount: 1,
          },
        ]),
      };
      const a = await f.sessions.command(f.student, s.id, command),
        b = await f.sessions.command(f.student, s.id, command);
      expect(b).toEqual(a);
      await expect(
        f.sessions.command(f.student, s.id, { ...command, commandId: randomUUID() }),
      ).rejects.toMatchObject({ status: 409 });
      s = await f.sessions.get(f.student, s.id);
      expect(lab().resource.allocatedCount).toBe(1);
    });
    it('refuses an over-capacity request, preserves its prediction and supports undo/redo', async () => {
      await predict(6);
      await allocate(6);
      await predict(7);
      await allocate(7);
      expect(lab().resource.allocatedCount).toBe(6);
      expect(lab().resource.observations.at(-1)).toMatchObject({
        admitted: false,
        requestedCount: 7,
        remainingGB: 0,
      });
      s = await f.command(s, 'undo');
      expect(lab().resource.prediction).toBeNull();
      expect(lab().resource.activeAttemptId).toBeNull();
      s = await f.command(s, 'redo');
      expect(lab().resource.activeAttemptId).toBeNull();
      expect(lab().resource.observations.some((o) => !o.admitted && o.requestedCount === 7)).toBe(
        true,
      );
      await predict(7);
      await allocate(7);
      await expect(f.command(s, 'teach')).rejects.toMatchObject({ status: 409 });
    });
    it('requires a saved explanation after experimentation and commits only assisted immutable work', async () => {
      await expect(f.command(s, 'practice')).rejects.toMatchObject({ status: 409 });
      await edit([
        {
          type: 'annotate',
          id: lab().id,
          expectedVersion: lab().version,
          text: 'The host reservation leaves 48 GB; seven 8 GB allocations exceed it.',
        },
      ]);
      const capacity = s.canvas!.elements.find((e) => e.id === 'capacity')!;
      await edit([
        { type: 'replace_content', id: capacity.id, expectedVersion: capacity.version, text: '6' },
      ]);
      s = await f.command(s, 'practice');
      const commit = {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        taskInstanceHash: s.task!.instanceHash,
        canvasRevision: s.canvas!.revision,
        response: {
          kind: 'canvas_snapshot' as const,
          checkpointId: s.checkpointId!,
          text: 'The model refused seven; six whole VMs use all available memory.',
        },
      };
      const firstReceipt = await f.sessions.commit(f.student, s.id, s.task!.taskId, commit);
      const replayReceipt = await f.sessions.commit(f.student, s.id, s.task!.taskId, commit);
      expect(replayReceipt.responseId).toBe(firstReceipt.responseId);
      await f.worker.process({ sessionId: s.id, requestedBy: f.student.institutionUserId });
      s = await f.sessions.get(f.student, s.id);

      expect(s.evaluation?.criteria.every((c) => c.status === 'satisfied')).toBe(true);
      const saved = await f.studentRun(() => f.repo.response(f.student, s.id, s.submission!.id));
      expect(saved!.exposure.assisted).toBe(true);
      expect(
        (await f.studentRun(() => f.repo.response(f.student, s.id, originalId)))!.responseHash,
      ).toBe(originalHash);
      expect(s.progress.mastery).toBe(false);
      await expect(f.command(s, 'undo')).rejects.toMatchObject({ status: 409 });
    });
    it('saves a standalone exploration without generating a submission, evaluation or independent credit', async () => {
      const responseId = s.submission!.id;
      s = await f.command(s, 'teach');
      while (s.teaching?.status === 'presenting')
        s = await f.command(s, 'teaching_step', {
          actionId: s.teaching.actionId,
          nextBeat: s.teaching.nextBeat,
        });
      s = await f.command(s, 'teach', { preference: 'experiment' });
      while (s.teaching?.status === 'presenting')
        s = await f.command(s, 'teaching_step', {
          actionId: s.teaching.actionId,
          nextBeat: s.teaching.nextBeat,
        });
      expect(s.teaching?.status).toBe('participating');
      await predict(2);
      await allocate(2);
      await expect(f.command(s, 'complete_exploration')).rejects.toMatchObject({ status: 409 });
      await edit([
        {
          type: 'annotate',
          id: lab().id,
          expectedVersion: lab().version,
          text: 'A second whole allocation uses eight more GB of the available memory.',
        },
      ]);
      s = await f.command(s, 'complete_exploration');
      expect(s.teaching?.status).toBe('complete');
      expect(s.submission!.id).toBe(responseId);
      expect(s.canvas!.invitation!.submitted).toBe(true);
      expect(lab().annotation).toContain('eight more GB');
      await expect(f.command(s, 'undo')).rejects.toMatchObject({ status: 409 });
      await expect(f.command(s, 'verify')).rejects.toMatchObject({ status: 409 });
    }, 120000);
    it('withdrawal during a prediction blocks the experiment and preserves committed responses', async () => {
      s = await f.command(s, 'close');
      const lesson = await f.m5Lesson('cloud');
      s = await f.command(await f.start(lesson.publication.id), 'next');
      expect(JSON.stringify(s)).not.toContain('M4_PRIVATE_SENTINEL');
      expect(s.canvas?.elements.some((e) => e.kind === 'allocation')).toBe(false);
      s = await submitM5(f, s, {
        kind: 'structured',
        values: { responsibility: 'consumer', available: 48, capacity: 7 },
      });
      const committedId = s.submission!.id;
      s = await f.command(s, 'teach');
      while (s.teaching?.status === 'presenting')
        s = await f.command(s, 'teaching_step', {
          actionId: s.teaching.actionId,
          nextBeat: s.teaching.nextBeat,
        });
      await predict(2);
      await f.f.admin
        .update(schema.classMaterials)
        .set({ sourceRevokedAt: new Date() })
        .where(eq(schema.classMaterials.id, lesson.file.id));
      const blocked = await f.sessions.get(f.student, s.id);
      expect(blocked.status).toBe('blocked');
      expect(blocked.canvas).toBeNull();
      expect(blocked.teaching).toBeNull();
      const receipt = await f.sessions.command(f.student, s.id, {
        commandId: randomUUID(),
        type: 'canvas_edit',
        expectedRevision: blocked.revision,
        epoch: blocked.epoch,
        ...editInput([
          {
            type: 'change_allocation',
            id: lab().id,
            expectedVersion: lab().version,
            requestedCount: 2,
          },
        ]),
      });
      expect(receipt.status).toBe('blocked');
      expect(
        (await f.studentRun(() => f.repo.response(f.student, s.id, committedId)))!.response,
      ).toMatchObject({ kind: 'structured', values: { capacity: 7 } });
    }, 120000);
  },
);
