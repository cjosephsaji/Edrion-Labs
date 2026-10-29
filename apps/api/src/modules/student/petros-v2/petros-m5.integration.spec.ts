import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, schema, sql } from '@edrion/database';
import {
  startM5Fixture,
  submitM5,
  buildTeachingInstruments,
  type M5Fixture,
} from './petros-m5.fixture';
import type { M4Snapshot } from '@edrion/schemas';
import { m4Hash } from './petros-v2-contracts.server';
describe.runIf(process.env.PETROS_M5_DB_TESTS === '1')(
  'M5 durable evidence to teaching loop',
  () => {
    let f: M5Fixture,
      cloud: Awaited<ReturnType<M5Fixture['m5Lesson']>>,
      a: M4Snapshot,
      b: M4Snapshot;
    beforeAll(async () => {
      f = await startM5Fixture();
      cloud = await f.m5Lesson('cloud');
    }, 120000);
    afterAll(async () => {
      await f?.close();
    });
    const steps = async (s: M4Snapshot, p = f.student) => {
      while (s.teaching?.status === 'presenting')
        s = await f.command(
          s,
          'teaching_step',
          { actionId: s.teaching.actionId, nextBeat: s.teaching.nextBeat },
          p,
        );
      return s;
    };
    it('persists two separately owned, actual responses and selects different strategies', async () => {
      a = await f.command(await f.start(cloud.publication.id), 'next');
      b = await f.command(await f.start(cloud.publication.id, f.other), 'next', {}, f.other);
      a = await submitM5(f, a, {
        kind: 'structured',
        values: { responsibility: 'provider', available: 48, capacity: 6 },
      });
      b = await submitM5(
        f,
        b,
        { kind: 'structured', values: { responsibility: 'consumer', available: 48, capacity: 7 } },
        f.other,
      );
      expect(a.evaluation?.criteria[0]?.status).toBe('not_satisfied');
      expect(b.evaluation?.criteria[0]?.status).toBe('satisfied');
      a = await f.command(a, 'teach');
      b = await f.command(b, 'teach', {}, f.other);
      expect(a.teaching?.decision.strategy).toBe('conceptual_contrast');
      expect(b.teaching?.decision.strategy).toBe('method_repair');
      expect(a.teaching?.decision.uncertainty).toBe('candidate');
    }, 60000);
    it('constructs actual canvas steps, fences duplicates and interruption, preserves accepted prefix', async () => {
      const command = {
        type: 'teaching_step',
        commandId: randomUUID(),
        expectedRevision: a.revision,
        epoch: a.epoch,
        actionId: a.teaching!.actionId,
        nextBeat: 0,
      };
      const one = await f.sessions.command(f.student, a.id, command);
      expect(await f.sessions.command(f.student, a.id, command)).toEqual(one);
      a = await f.sessions.get(f.student, a.id);
      expect(a.canvas?.elements).toHaveLength(1);
      a = await f.command(a, 'interrupt');
      await expect(
        f.sessions.command(f.student, a.id, { ...command, commandId: randomUUID() }),
      ).rejects.toMatchObject({ status: 409 });
      a = await steps(a);
      b = await f.command(
        b,
        'teaching_step',
        { actionId: b.teaching!.actionId, nextBeat: 0 },
        f.other,
      );
      const equationPrefix = b.canvas;
      b = await f.command(b, 'pause', {}, f.other);
      b = await f.sessions.get(f.other, b.id);
      expect(b.canvas).toEqual(equationPrefix);
      expect(b.teaching?.nextBeat).toBe(1);
      b = await f.command(b, 'resume', {}, f.other);
      b = await steps(b, f.other);
      expect(a.canvas?.elements.some((e) => e.id === 'guest-os')).toBe(true);
      expect(b.canvas?.elements.some((e) => e.kind === 'equation')).toBe(true);
      expect(a.teaching?.status).toBe('participating');
    });
    it('saves student diagram edit, issues reviewed practice, commits immutable snapshot and privately evaluates it', async () => {
      const c = a.canvas!;
      const editCommand = {
        type: 'canvas_edit',
        commandId: randomUUID(),
        expectedRevision: a.revision,
        epoch: a.epoch,
        edit: {
          mode: 'session',
          activityId: c.activityId,
          branchId: c.branchId,
          checkpointId: c.invitation!.id,
          expectedRevision: c.revision,
          expectedDraftRevision: c.draftRevision,
          operations: [
            {
              type: 'connect_elements',
              element: {
                id: 'student-link',
                kind: 'edge',
                version: 1,
                label: 'My responsibility relationship',
                sourceId: c.elements[0]!.sourceId,
                editable: true,
                from: 'guest-os',
                to: 'consumer',
                relation: 'connects',
                text: 'connects',
              },
            },
          ],
        },
      };
      const edited = await f.sessions.command(f.student, a.id, editCommand);
      expect(await f.sessions.command(f.student, a.id, editCommand)).toEqual(edited);
      a = await f.sessions.get(f.student, a.id);
      const checkpoint = a.checkpointId;
      expect(a.canvas?.elements.filter((e) => e.id === 'student-link')).toHaveLength(1);
      a = await f.sessions.get(f.student, a.id);
      expect(a.checkpointId).toBe(checkpoint);
      a = await f.command(a, 'practice');
      expect(a.assistance).toBe('assisted');
      expect(a.teaching).toBeNull();
      a = await submitM5(f, a, {
        kind: 'canvas_snapshot',
        checkpointId: a.checkpointId!,
        text: 'In IaaS the consumer manages the guest operating system.',
      });
      expect(a.evaluation?.criteria[0]?.status).toBe('satisfied');
      const response = a.submission!.id;
      await expect(f.command(a, 'canvas_edit', { edit: editCommand.edit })).rejects.toMatchObject({
        status: 409,
      });
      await expect(f.command(a, 'undo')).rejects.toMatchObject({ status: 409 });
      expect((await f.sessions.get(f.student, a.id)).submission?.id).toBe(response);
    });
    it('evaluates the equation value saved in the checkpoint, not a client correctness declaration', async () => {
      const c = b.canvas!,
        e = c.elements.find((e) => e.id === 'capacity')!;
      b = await f.command(
        b,
        'canvas_edit',
        {
          edit: {
            mode: 'session',
            activityId: c.activityId,
            branchId: c.branchId,
            checkpointId: c.invitation!.id,
            expectedRevision: c.revision,
            expectedDraftRevision: c.draftRevision,
            operations: [
              { type: 'replace_content', id: e.id, expectedVersion: e.version, text: '6' },
            ],
          },
        },
        f.other,
      );
      b = await f.command(b, 'practice', {}, f.other);
      b = await submitM5(
        f,
        b,
        {
          kind: 'canvas_snapshot',
          checkpointId: b.checkpointId!,
          text: '48 GB divided by 8 GB/VM gives 6 VM.',
        },
        f.other,
      );
      expect(b.evaluation?.criteria[0]?.status).toBe('satisfied');
      b = await f.command(b, 'teach', {}, f.other);
      expect(b.teaching?.decision.strategy).toBe('faded_support');
      b = await steps(b, f.other);
      await expect(f.command(b, 'verify', {}, f.other)).rejects.toMatchObject({ status: 409 });
    });
    it('uses the same engine for extracted English and abstains on ambiguous interpretation', async () => {
      const l = await f.m5Lesson('argument');
      let s = await f.command(await f.start(l.publication.id), 'next');
      s = await submitM5(f, s, {
        kind: 'structured',
        values: {
          survey: 'preference',
          reason:
            'The survey could support the claim, but the sample may not represent all residents. An alternative explanation remains possible.',
        },
      });
      expect(s.evaluation?.status).toBe('review_required');
      s = await f.command(s, 'teach');
      expect(s.teaching?.decision.strategy).toBe('clarifying_question');
      s = await steps(s);
      expect(s.canvas?.elements.find((e) => e.id === 'passage')).toBeTruthy();
      s = await f.command(s, 'practice');
      s = await submitM5(f, s, {
        kind: 'canvas_snapshot',
        checkpointId: s.checkpointId!,
        text: 'Alternative reading: the survey establishes preference, not causal effect.',
      });
      expect(s.evaluation?.status).toBe('review_required');
    }, 120000);
    it('keeps private answer/rubric/discriminator material out of all public teaching snapshots', async () => {
      for (const s of [a, b]) {
        const text = JSON.stringify(s);
        expect(text).not.toContain('M4_PRIVATE_SENTINEL');
        expect(text).not.toContain('checker');
        expect(text).not.toContain('privateDiscriminators');
      }
    });
    it('denies cross-student ownership and direct evaluator snapshot function access', async () => {
      await expect(f.sessions.get(f.other, a.id)).rejects.toMatchObject({ status: 404 });
      await expect(
        f.studentRun(() =>
          f.f.f.db.execute(sql`select m5_committed_canvas(${a.submission!.id}::uuid)`),
        ),
      ).rejects.toThrow();
    });
    it('restricts the belief cache to the current student and rejects cross-owner projection writes', async () => {
      const mine = await f.studentRun(() => f.f.f.db.select().from(schema.petrosConceptBeliefs));
      expect(mine.every((r) => r.studentId === f.student.studentId)).toBe(true);
      const row = mine[0]!;
      await expect(
        f.studentRun(() =>
          f.f.f.db
            .insert(schema.petrosConceptBeliefs)
            .values({ ...row, studentId: f.other.studentId, conceptId: randomUUID() }),
        ),
      ).rejects.toThrow();
    });
    it('database publication rejects teaching different from the reviewed instrument', async () => {
      const content = structuredClone(cloud.publication.content) as Record<string, unknown>;
      const pins = content.instruments as Array<{
        teaching: { fragments: Array<{ explanation: string }> };
      }>;
      pins[0]!.teaching.fragments[0]!.explanation = 'A substituted unreviewed teaching claim.';
      await expect(
        f.f.runReviewer(() =>
          f.f.f.db.insert(schema.courseCurriculumRecords).values({
            ...cloud.publication,
            id: randomUUID(),
            content,
            contentHash: m4Hash(content),
          }),
        ),
      ).rejects.toThrow('M5_EXACT_REVIEWED_TEACHING_REQUIRED');
    });
    it('retains multiple task/response records and rebuilds a categorical projection without mastery inflation', async () => {
      const rows = await f.f.admin
        .select()
        .from(schema.petrosV2Responses)
        .where(eq(schema.petrosV2Responses.sessionId, a.id));
      expect(rows.length).toBe(2);
      const beliefs = await f.studentRun(() => f.f.f.db.select().from(schema.petrosConceptBeliefs));
      expect(beliefs.length).toBeGreaterThan(0);
      expect(beliefs.every((b) => b.projection.state === 'developing')).toBe(true);
    });
    it('admits a fresh separately reviewed family through a clean assessment workspace', async () => {
      const l = await f.lesson('cloud', false, 'no_hints', {
        sourceName: 'm5-cloud-capacity.txt',
        instruments: (base, p) => buildTeachingInstruments(base, p, 'cloud', true),
      });
      let s = await f.command(await f.start(l.publication.id), 'next');
      s = await submitM5(f, s, {
        kind: 'structured',
        values: { responsibility: 'consumer', available: 48, capacity: 7 },
      });
      s = await f.command(s, 'teach');
      s = await steps(s);
      const c = s.canvas!,
        e = c.elements.find((e) => e.id === 'capacity')!;
      expect(e.kind === 'equation' && e.value).toBe('7');
      s = await f.command(s, 'canvas_edit', {
        edit: {
          mode: 'session',
          activityId: c.activityId,
          branchId: c.branchId,
          checkpointId: c.invitation!.id,
          expectedRevision: c.revision,
          expectedDraftRevision: c.draftRevision,
          operations: [
            { type: 'replace_content', id: e.id, expectedVersion: e.version, text: '6' },
          ],
        },
      });
      s = await f.command(s, 'practice');
      s = await submitM5(f, s, {
        kind: 'canvas_snapshot',
        checkpointId: s.checkpointId!,
        text: 'Corrected to six.',
      });
      s = await f.command(s, 'teach');
      s = await steps(s);
      s = await f.command(s, 'verify');
      expect(s.teaching).toBeNull();
      expect(s.canvas?.elements).toEqual([]);
      expect(s.lesson?.excerpts).toEqual([]);
      expect(s.assistance).toBe('independent');
      s = await submitM5(f, s, {
        kind: 'structured',
        values: { responsibility: 'consumer', available: 64, capacity: 16 },
      });
      expect(s.evaluation?.criteria.every((c) => c.status === 'satisfied')).toBe(true);
      const response = await f.studentRun(() => f.repo.response(f.student, s.id, s.submission!.id));
      expect(response?.exposure.assisted).toBe(false);
      expect(s.progress.mastery).toBe(false);
    }, 120000);
    it('withdraws a source during an accepted action, fences the next operation and preserves committed work', async () => {
      a = await f.command(a, 'teach', { preference: 'process' });
      a = await f.command(a, 'teaching_step', { actionId: a.teaching!.actionId, nextBeat: 0 });
      expect(a.teaching?.status).toBe('presenting');
      const before = await f.f.admin
        .select()
        .from(schema.petrosV2Responses)
        .where(eq(schema.petrosV2Responses.sessionId, a.id));
      await f.f.admin
        .update(schema.classMaterials)
        .set({ sourceRevokedAt: new Date() })
        .where(eq(schema.classMaterials.id, cloud.file.id));
      const blocked = await f.sessions.get(f.student, a.id);
      expect(blocked.status).toBe('blocked');
      expect(blocked.canvas).toBeNull();
      expect(blocked.teaching).toBeNull();
      expect(
        (
          await f.f.admin
            .select()
            .from(schema.petrosV2Responses)
            .where(eq(schema.petrosV2Responses.sessionId, a.id))
        ).map((r) => r.responseHash),
      ).toEqual(before.map((r) => r.responseHash));
      const result = await f.sessions.command(f.student, a.id, {
        type: 'teaching_step',
        actionId: a.teaching!.actionId,
        nextBeat: a.teaching!.nextBeat,
        commandId: randomUUID(),
        expectedRevision: blocked.revision,
        epoch: blocked.epoch,
      });
      expect(result.status).toBe('blocked');
    });
  },
);
