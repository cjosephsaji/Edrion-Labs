import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startM4Fixture, type M4Fixture } from './petros-v2.fixture';
describe.runIf(process.env.PETROS_M4_DB_TESTS === '1')(
  'M4 acknowledged workspace persistence',
  () => {
    let f: M4Fixture, s: Awaited<ReturnType<M4Fixture['start']>>;
    beforeAll(async () => {
      f = await startM4Fixture();
      const l = await f.lesson('cloud', true);
      s = await f.start(l.publication.id);
    }, 120000);
    afterAll(async () => {
      await f?.close();
    });
    const edit = (operations: unknown[], extra = {}) => ({
      edit: {
        mode: s.canvas!.mode,
        activityId: s.canvas!.activityId,
        branchId: s.canvas!.branchId,
        checkpointId: s.canvas!.invitation!.id,
        expectedRevision: s.canvas!.revision,
        expectedDraftRevision: s.canvas!.draftRevision,
        operations,
        ...extra,
      },
    });
    it('accepts a semantic edit and restores its exact acknowledged checkpoint on reload', async () => {
      s = await f.command(
        s,
        'canvas_edit',
        edit([
          {
            type: 'replace_content',
            id: 'student-note',
            expectedVersion: 1,
            text: 'My observation',
          },
        ]),
      );
      const reload = await f.sessions.get(f.student, s.id);
      expect(reload.canvas?.elements[0]).toMatchObject({ text: 'My observation' });
      expect(reload.checkpointId).toBe(s.checkpointId);
    });
    it('rejects stale revision, branch, protected/deleted targets and invalid relations', async () => {
      for (const [operations, extra] of [
        [[{ type: 'replace_content', id: 'student-note', expectedVersion: 1, text: 'stale' }], {}],
        [[{ type: 'replace_content', id: 'missing', expectedVersion: 1, text: 'foreign' }], {}],
        [
          [
            {
              type: 'replace_content',
              id: 'student-note',
              expectedVersion: 2,
              text: 'wrong branch',
            },
          ],
          { branchId: 'other' },
        ],
        [
          [
            {
              type: 'replace_content',
              id: 'student-note',
              expectedVersion: 2,
              text: 'stale canvas',
            },
          ],
          { expectedRevision: 0 },
        ],
        [
          [
            {
              type: 'connect_elements',
              element: {
                id: 'edge',
                kind: 'edge',
                version: 1,
                label: 'bad',
                sourceId: 'reviewed-source',
                editable: true,
                from: 'missing',
                to: 'student-note',
                relation: 'supports',
                text: 'supports',
              },
            },
          ],
          {},
        ],
      ] as const)
        await expect(
          f.command(s, 'canvas_edit', edit([...operations], extra)),
        ).rejects.toMatchObject({ status: 409 });
    });
    it('undo and redo append checkpoints without erasing accepted history', async () => {
      s = await f.command(s, 'undo');
      expect(s.canvas?.elements[0]).toMatchObject({ text: 'Write an observation' });
      s = await f.command(s, 'redo');
      expect(s.canvas?.elements[0]).toMatchObject({ text: 'My observation' });
      s = await f.command(s, 'undo');
      const e = s.canvas!.elements[0]!;
      s = await f.command(
        s,
        'canvas_edit',
        edit([
          {
            type: 'replace_content',
            id: e.id,
            expectedVersion: e.version,
            text: 'New branch work',
          },
        ]),
      );
      await expect(f.command(s, 'redo')).rejects.toMatchObject({ status: 409 });
    });
    it('save while paused persists the accepted draft and resume retains it', async () => {
      s = await f.command(s, 'pause');
      s = await f.command(s, 'canvas_checkpoint', {
        draft: 'Paused draft',
        canvasRevision: s.canvas!.revision,
      });
      s = await f.command(s, 'resume');
      expect(s.draft).toBe('Paused draft');
    });
    it('submit during a competing save uses optimistic concurrency and locks undo after commitment', async () => {
      s = await f.command(s, 'next');
      const version = s.revision;
      s = await f.command(s, 'canvas_checkpoint', {
        draft: 'Before commitment',
        canvasRevision: s.canvas!.revision,
      });
      const input = {
        commandId: randomUUID(),
        expectedRevision: version,
        epoch: s.epoch,
        taskInstanceHash: s.task!.instanceHash,
        canvasRevision: s.canvas!.revision,
        response: {
          kind: 'structured',
          values: { responsibility: 'consumer', reason: 'data_access' },
        },
      };
      await expect(f.sessions.commit(f.student, s.id, s.task!.taskId, input)).rejects.toMatchObject(
        { status: 409 },
      );
      await f.sessions.commit(f.student, s.id, s.task!.taskId, {
        ...input,
        commandId: randomUUID(),
        expectedRevision: s.revision,
      });
      s = await f.sessions.get(f.student, s.id);
      expect(s.canvas?.invitation?.submitted).toBe(true);
      await expect(f.command(s, 'undo')).rejects.toMatchObject({ status: 409 });
      await expect(f.command(s, 'replay_demo')).rejects.toMatchObject({ status: 409 });
    });
  },
);
