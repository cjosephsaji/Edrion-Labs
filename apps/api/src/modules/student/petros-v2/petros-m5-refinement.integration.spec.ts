import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startM5Fixture, submitM5, type M5Fixture } from './petros-m5.fixture';
import type { M4Snapshot } from '@edrion/schemas';
/** Synthetic review records and disposable database; no production authority. */
describe.runIf(process.env.PETROS_M5_DB_TESTS === '1')(
  'M5 isolated refinement retries preserve assessment boundaries',
  () => {
    let f: M5Fixture;
    beforeAll(async () => {
      f = await startM5Fixture({ practiceRetries: true });
    }, 120000);
    afterAll(async () => {
      await f?.close();
    });
    it('projects only revealed checked examples and keeps the question with assisted practice', async () => {
      const lesson = await f.m5Lesson('cloud');
      let s = await f.command(await f.start(lesson.publication.id), 'next');
      const prompt = s.task!.prompt;
      expect(s.teaching).toBeNull();
      expect(s.learningUI?.family).toBe('practice');
      s = await submitM5(f, s, {
        kind: 'structured',
        values: { responsibility: 'consumer', available: 48, capacity: 7 },
      });
      s = await f.command(s, 'teach');
      expect(s.teaching!.decision.strategy).toBe('method_repair');
      expect(s.learningUI?.family).toBe('equation');
      expect(s.learningUI?.blocks).toEqual([]);
      expect(s.task!.prompt).toBe(prompt);
      expect(s.teaching!.equationSteps).toEqual([]);
      expect(s.teaching!.completedStepIds).toEqual([]);
      expect(s.teaching!.progressResponseId).toBe(s.submission!.id);
      s = await f.command(s, 'teaching_step', {
        actionId: s.teaching!.actionId,
        nextBeat: s.teaching!.nextBeat,
      });
      expect(s.teaching!.equationSteps?.map((step) => step.elementId)).toEqual(['available']);
      expect(s.teaching!.completedStepIds).toEqual(['available']);
      expect(s.learningUI?.blocks.map((block) => block.elementIds)).toEqual([['available']]);
      while (s.teaching!.status === 'presenting')
        s = await f.command(s, 'teaching_step', {
          actionId: s.teaching!.actionId,
          nextBeat: s.teaching!.nextBeat,
        });
      expect(s.teaching!.equationSteps?.map((step) => step.elementId)).toEqual([
        'available',
        'capacity',
      ]);
      expect(
        s.teaching!.equationSteps?.find((step) => step.elementId === 'capacity')?.result,
      ).toEqual({ value: 6, unit: 'VM' });
      expect(s.canvas!.elements.find((element) => element.id === 'capacity')).toMatchObject({
        value: '7',
      });
      s = await f.command(s, 'practice');
      expect(s.teaching).toBeNull();
      expect(s.task!.passage).toBe(prompt);
    }, 120000);
    it('automatically composes source, graph, process and experiment views from accepted public work', async () => {
      const lesson = await f.m5Lesson('cloud');
      let s = await f.command(await f.start(lesson.publication.id), 'next');
      s = await submitM5(f, s, {
        kind: 'structured',
        values: { responsibility: 'consumer', available: 48, capacity: 6 },
      });
      const reveal = async (state: M4Snapshot) => {
        while (state.teaching?.status === 'presenting')
          state = await f.command(state, 'teaching_step', {
            actionId: state.teaching.actionId,
            nextBeat: state.teaching.nextBeat,
          });
        return state;
      };
      s = await reveal(await f.command(s, 'teach'));
      expect(s.learningUI?.family).toBe('reading');
      for (const [preference, family] of [
        ['graph', 'graph'],
        ['process', 'process'],
        ['experiment', 'experiment'],
      ] as const) {
        s = await f.command(s, 'teach', { preference });
        expect(s.learningUI?.family).toBe(family);
        expect(s.learningUI?.blocks).toEqual([]);
        s = await reveal(s);
        expect(s.learningUI?.binding).toEqual({
          sessionId: s.id,
          epoch: s.epoch,
          revision: s.revision,
          canvasRevision: s.canvas!.revision,
        });
        const ids = new Set(s.canvas!.elements.map((element) => element.id));
        expect(
          s.learningUI!.blocks.every((block) => block.elementIds.every((id) => ids.has(id))),
        ).toBe(true);
      }
      expect(s.learningUI?.blocks.some((block) => block.kind === 'experiment')).toBe(true);
      expect(s.teaching!.experiment).toBeNull();
    }, 180000);
    it('evaluates separate immutable wrong and corrected practice submissions in the same assisted family', async () => {
      const lesson = await f.m5Lesson('cloud');
      let s = await f.command(await f.start(lesson.publication.id), 'next');
      s = await submitM5(f, s, {
        kind: 'structured',
        values: { responsibility: 'provider', available: 48, capacity: 6 },
      });
      expect(s.evaluation!.criteria[0]!.target).toEqual({ fieldId: 'responsibility' });
      const reveal = async (state: M4Snapshot) => {
        while (state.teaching?.status === 'presenting')
          state = await f.command(state, 'teaching_step', {
            actionId: state.teaching.actionId,
            nextBeat: state.teaching.nextBeat,
          });
        return state;
      };
      const connect = async (state: M4Snapshot, to: string) =>
        f.command(state, 'canvas_edit', {
          edit: {
            mode: 'session',
            activityId: state.canvas!.activityId,
            branchId: state.canvas!.branchId,
            checkpointId: state.canvas!.invitation!.id,
            expectedRevision: state.canvas!.revision,
            expectedDraftRevision: state.canvas!.draftRevision,
            operations: [
              {
                type: 'connect_elements',
                element: {
                  id: `student-${to}`,
                  kind: 'edge',
                  label: 'Student relationship',
                  version: 1,
                  editable: true,
                  sourceId: state.canvas!.elements.find((e) => e.id === 'guest-os')!.sourceId,
                  from: 'guest-os',
                  to,
                  relation: 'connects',
                  text: 'connects',
                },
              },
            ],
          },
        });
      s = await reveal(await f.command(s, 'teach'));
      s = await connect(s, 'provider');
      s = await f.command(s, 'practice');
      s = await submitM5(f, s, {
        kind: 'canvas_snapshot',
        checkpointId: s.checkpointId!,
        text: 'My first relationship.',
      });
      expect(s.evaluation!.criteria[0]!.status).toBe('not_satisfied');
      expect(s.evaluation!.criteria[0]!.target?.elementIds).toEqual(['student-provider']);
      const first = s.submission!.id;
      const saved = await f.studentRun(() => f.repo.response(f.student, s.id, first));
      s = await reveal(await f.command(s, 'teach'));
      s = await connect(s, 'consumer');
      s = await f.command(s, 'practice');
      s = await submitM5(f, s, {
        kind: 'canvas_snapshot',
        checkpointId: s.checkpointId!,
        text: 'My corrected relationship.',
      });
      expect(s.submission!.id).not.toBe(first);
      expect(s.evaluation!.criteria[0]!.status).toBe('satisfied');
      const corrected = await f.studentRun(() =>
        f.repo.response(f.student, s.id, s.submission!.id),
      );
      expect(corrected!.exposure.assisted).toBe(true);
      expect(corrected!.exposure.repeated).toBe(true);
      expect(
        (await f.studentRun(() => f.repo.response(f.student, s.id, first)))!.responseHash,
      ).toBe(saved!.responseHash);
      expect(s.progress.mastery).toBe(false);
    }, 120000);
  },
);
