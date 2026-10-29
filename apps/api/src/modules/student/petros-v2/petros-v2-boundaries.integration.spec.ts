import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startM4Fixture, type M4Fixture } from './petros-v2.fixture';
import { assertM4AssistanceBoundary, recordM4SourceExposure } from './petros-v2-source-exposure';

describe.runIf(process.env.PETROS_M4_DB_TESTS === '1')(
  'M4 intent, assistance, and unavailable evaluation boundaries',
  () => {
    let f: M4Fixture, l: Awaited<ReturnType<M4Fixture['lesson']>>;
    beforeAll(async () => {
      f = await startM4Fixture();
      l = await f.lesson('cloud');
    }, 120000);
    afterAll(async () => {
      await f?.close();
    });
    it('publishes only pinned source table cells and validates contextual reread targets', async () => {
      let s = await f.start(l.publication.id);
      const excerpt = s.lesson!.excerpts!.find((e) => e.table?.kind === 'table')!;
      expect(excerpt).toBeDefined();
      if (excerpt.table?.kind !== 'table') throw new Error('Expected native source table');
      expect(excerpt.table.cells.map((cell) => cell.value).join('\n')).toBe(excerpt.text);
      await expect(
        f.command(s, 'ask', {
          text: 'Read this source again.',
          target: { ...excerpt.reference, unitId: randomUUID() },
        }),
      ).rejects.toMatchObject({ status: 409 });
      s = await f.command(s, 'ask', { text: 'Read this source again.', target: excerpt.reference });
      const events = await f.f.f
        .adminSql`select payload from petros_session_events where session_id=${s.id} and payload->>'kind'='source_access'`;
      expect(
        events.some((event) => event.payload.target?.unitId === excerpt.reference.unitId),
      ).toBe(true);
      s = await f.command(s, 'next');
      expect(s.lesson!.excerpts).toEqual([]);
      expect(s.lesson!.explanation).not.toContain('consumer manages access policy');
      await f.command(s, 'close');
    });
    it('conceals another student’s durable admission intent', async () => {
      const intentId = await f.sessions.prepareIntent(f.student, l.publication.id);
      await expect(
        f.sessions.admit(f.other, { intentId, commandId: randomUUID() }),
      ).rejects.toMatchObject({ status: 404 });
    });
    it('rejects an expired intent without creating a session', async () => {
      const intentId = await f.sessions.prepareIntent(f.student, l.publication.id);
      await f.f.f
        .adminSql`update petros_session_intents set expires_at=now()-interval '1 minute' where id=${intentId}`;
      await expect(
        f.sessions.admit(f.student, { intentId, commandId: randomUUID() }),
      ).rejects.toMatchObject({ status: 404 });
      const rows = await f.f.f
        .adminSql`select id from petros_learning_sessions where v2_state->>'admissionIntentId'=${intentId}`;
      expect(rows).toHaveLength(0);
    });
    it('rechecks enrolled student membership at admission', async () => {
      const intentId = await f.sessions.prepareIntent(f.student, l.publication.id);
      await f.f.f.adminSql`update students set status='withdrawn' where id=${f.student.studentId}`;
      try {
        await expect(
          f.sessions.admit(f.student, { intentId, commandId: randomUUID() }),
        ).rejects.toBeDefined();
      } finally {
        await f.f.f.adminSql`update students set status='enrolled' where id=${f.student.studentId}`;
      }
    });
    it('blocks unrecorded legacy help while an issued question is active or paused', async () => {
      let s = await f.start(l.publication.id);
      s = await f.command(s, 'next');
      expect(s.lesson?.excerpts).toEqual([]);
      expect(s.lesson?.explanation).not.toContain('consumer manages access policy');
      await expect(f.studentRun(() => assertM4AssistanceBoundary(f.f.f.db))).rejects.toMatchObject({
        status: 409,
      });
      s = await f.command(s, 'pause');
      await expect(f.studentRun(() => assertM4AssistanceBoundary(f.f.f.db))).rejects.toMatchObject({
        status: 409,
      });
      s = await f.command(s, 'resume');
      await f.command(s, 'close');
      await expect(
        f.studentRun(() => assertM4AssistanceBoundary(f.f.f.db)),
      ).resolves.toBeUndefined();
    });
    it('records source-bearing access once and excludes independent criterion evidence', async () => {
      let s = await f.start(l.publication.id);
      s = await f.command(s, 'next');
      await f.studentRun(() => recordM4SourceExposure(f.f.f.db, f.student, l.file.objectId));
      await f.studentRun(() => recordM4SourceExposure(f.f.f.db, f.student, l.file.objectId));
      await f.sessions.commit(f.student, s.id, s.task!.taskId, {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        canvasRevision: 0,
        taskInstanceHash: s.task!.instanceHash,
        response: {
          kind: 'structured',
          values: { responsibility: 'consumer', reason: 'data_access' },
        },
      });
      await f.worker.process({ sessionId: s.id, requestedBy: f.student.institutionUserId });
      s = await f.sessions.get(f.student, s.id);
      expect(s.evaluation?.status).toBe('evaluated');
      expect(s.progress.criteriaObserved).toBe(0);
      const exposures = await f.f.f
        .adminSql`select id from petros_session_events where session_id=${s.id} and payload->>'kind'='solution_bearing_source_access'`;
      expect(exposures).toHaveLength(1);
      await f.command(s, 'close');
    });
    it('preserves committed work when the evaluator is unavailable', async () => {
      let s = await f.start(l.publication.id);
      s = await f.command(s, 'next');
      await f.sessions.commit(f.student, s.id, s.task!.taskId, {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        canvasRevision: 0,
        taskInstanceHash: s.task!.instanceHash,
        response: {
          kind: 'structured',
          values: { responsibility: 'consumer', reason: 'data_access' },
        },
      });
      await f.assessment.onModuleDestroy();
      await f.worker.process({ sessionId: s.id, requestedBy: f.student.institutionUserId });
      s = await f.sessions.get(f.student, s.id);
      expect(s.evaluation?.status).toBe('unavailable');
      expect(s.submission?.response.kind).toBe('structured');
      expect(s.progress.criteriaObserved).toBe(0);
      expect(s.message.toLowerCase()).toContain('saved');
    });
  },
);
