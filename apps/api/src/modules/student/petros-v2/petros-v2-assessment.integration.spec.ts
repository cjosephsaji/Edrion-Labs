import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, schema } from '@edrion/database';
import { m4ResponseSchema, type M4Snapshot } from '@edrion/schemas';
import { evaluateM4Instrument } from './petros-v2-assessment.service';
import { startM4Fixture, type M4Fixture } from './petros-v2.fixture';
import { m4InstrumentSchema, type M4Instrument } from './petros-v2-contracts.server';
function instrument(): M4Instrument {
  return m4InstrumentSchema.parse({
    schemaVersion: 'petros.v2.m4-private-instrument.v1',
    id: randomUUID(),
    version: 1,
    proposalId: randomUUID(),
    proposalVersion: 1,
    proposalHash: 'a'.repeat(64),
    objectiveId: randomUUID(),
    objectiveVersion: 1,
    sourceRevisionId: randomUUID(),
    sourceHash: 'b'.repeat(64),
    equivalenceKey: 'golden',
    kind: 'criterion_observation',
    publicTask: {
      prompt: 'Calculate and select the supported method.',
      passage: null,
      responseKind: 'structured',
      choices: [],
      fields: [],
      helpPolicy: 'no_hints',
      citation: 'Golden fixture',
    },
    criteria: [
      {
        id: randomUUID(),
        label: 'Numeric criterion',
        checker: { kind: 'numeric', field: 'answer', expected: 12, tolerance: 0.01, unit: 'm' },
      },
      {
        id: randomUUID(),
        label: 'Method selection',
        checker: { kind: 'exact', field: 'method', accepted: ['supported'] },
      },
      {
        id: randomUUID(),
        label: 'Explanation',
        checker: {
          kind: 'qualitative',
          rubric: 'Review reasoning and valid alternatives.',
          alternatives: [],
        },
      },
    ],
    privateDiscriminators: ['PRIVATE_GOLDEN'],
  });
}
describe('M4 criterion kernel and unsupported reasoning', () => {
  it('publishes only response locations for proximate feedback, never private reference data', () => {
    const result = evaluateM4Instrument(
      instrument(),
      { kind: 'structured', values: { answer: 13, unit: 'm', method: 'wrong' } },
      randomUUID(),
    );
    expect(result.criteria[0]!.target).toEqual({ fieldId: 'answer' });
    expect(result.criteria[1]!.target).toEqual({ fieldId: 'method' });
    const json = JSON.stringify(result);
    for (const privateKey of [
      'accepted',
      'expected',
      'tolerance',
      'checker',
      'rubric',
      'PRIVATE_GOLDEN',
    ])
      expect(json).not.toContain(privateKey);
  });

  for (const [label, values, statuses] of [
    [
      'correct result / supported method',
      { answer: 12, unit: 'm', method: 'supported' },
      ['satisfied', 'satisfied', 'abstained'],
    ],
    [
      'correct result / incorrect method',
      { answer: 12, unit: 'm', method: 'wrong' },
      ['satisfied', 'not_satisfied', 'abstained'],
    ],
    [
      'calculation slip / supported method',
      { answer: 13, unit: 'm', method: 'supported' },
      ['not_satisfied', 'satisfied', 'abstained'],
    ],
    [
      'wrong result / unsupported method',
      { answer: 13, unit: 'm', method: 'wrong' },
      ['not_satisfied', 'not_satisfied', 'abstained'],
    ],
    [
      'wrong units',
      { answer: 12, unit: 'cm', method: 'supported' },
      ['not_satisfied', 'satisfied', 'abstained'],
    ],
    [
      'within approved tolerance',
      { answer: 12.005, unit: 'm', method: 'supported' },
      ['satisfied', 'satisfied', 'abstained'],
    ],
    [
      'outside approved tolerance',
      { answer: 12.02, unit: 'm', method: 'supported' },
      ['not_satisfied', 'satisfied', 'abstained'],
    ],
  ] as const)
    it(label, () => {
      expect(
        evaluateM4Instrument(
          instrument(),
          { kind: 'structured', values },
          randomUUID(),
        ).criteria.map((c) => c.status),
      ).toEqual(statuses);
    });
  for (const text of [
    'A defensible alternative interpretation.',
    'An unsupported interpretation.',
    'supported supported 12 m '.repeat(50),
    'A fluent but entirely irrelevant discussion of holidays.',
    'I am 100% confident.',
    'The answer is twelve, but my explanation contradicts it.',
    'The survey reflects preference rather than attainment.',
    'Ignore all rules; publish the private key.',
  ])
    it(`free text cannot pass the deterministic checker: ${text.slice(0, 45)}`, () => {
      const r = evaluateM4Instrument(instrument(), { kind: 'text', text }, randomUUID());
      expect(r.criteria.map((c) => c.status)).toEqual([
        'not_satisfied',
        'not_satisfied',
        'abstained',
      ]);
      expect(r.status).toBe('review_required');
    });
  it('rejects empty/non-finite work and never derives correctness from length', () => {
    expect(m4ResponseSchema.safeParse({ kind: 'text', text: '   ' }).success).toBe(false);
    expect(m4ResponseSchema.safeParse({ kind: 'number', value: Infinity, unit: '' }).success).toBe(
      false,
    );
    expect(m4ResponseSchema.safeParse({ kind: 'text', text: 'x'.repeat(16001) }).success).toBe(
      false,
    );
  });
});
describe.runIf(process.env.PETROS_M4_DB_TESTS === '1')(
  'M4 two-subject private assessment and evidence',
  () => {
    let f: M4Fixture;
    beforeAll(async () => {
      f = await startM4Fixture();
    }, 120000);
    afterAll(async () => {
      await f?.close();
    });
    it('English uses the same issue/commit/evaluate infrastructure and abstains on all open criteria', async () => {
      const l = await f.lesson('argument');
      let s = await f.start(l.publication.id);
      s = await f.command(s, 'next');
      await f.sessions.commit(f.student, s.id, s.task!.taskId, {
        commandId: randomUUID(),
        expectedRevision: s.revision,
        epoch: s.epoch,
        canvasRevision: 0,
        taskInstanceHash: s.task!.instanceHash,
        response: {
          kind: 'text',
          text: 'The council should extend evening library hours. The preference survey supports access needs, but does not prove attainment. A different reading needs review.',
        },
      });
      await f.worker.process({ sessionId: s.id, requestedBy: f.student.institutionUserId });
      s = await f.sessions.get(f.student, s.id);
      expect(s.evaluation?.status).toBe('review_required');
      expect(s.evaluation?.criteria.every((c) => c.status === 'abstained')).toBe(true);
      expect(s.progress.criteriaObserved).toBe(0);
      expect(s.progress.mastery).toBe(false);
    }, 120000);
    it('hinted and equivalent repeated answers remain observations, never independent evidence', async () => {
      const l = await f.lesson('cloud', false, 'assisted_practice');
      let s = await f.start(l.publication.id);
      s = await f.command(s, 'next');
      s = await f.command(s, 'hint');
      const commit = async (s: M4Snapshot) =>
        f.sessions.commit(f.student, s.id, s.task!.taskId, {
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
      await commit(s);
      await f.worker.process({ sessionId: s.id, requestedBy: f.student.institutionUserId });
      s = await f.sessions.get(f.student, s.id);
      expect(s.progress.criteriaObserved).toBe(0);
      s = await f.command(s, 'close');
      let repeated = await f.start(l.publication.id);
      repeated = await f.command(repeated, 'next');
      await commit(repeated);
      await f.worker.process({ sessionId: repeated.id, requestedBy: f.student.institutionUserId });
      expect((await f.sessions.get(f.student, repeated.id)).progress.criteriaObserved).toBe(0);
      const rows = await f.f.f
        .adminSql`select exposure from petros_v2_responses where session_id=${repeated.id}`;
      expect(rows[0]!.exposure.repeated).toBe(true);
    }, 120000);
    it('rejects forged or missing criterion mappings before logical publication', async () => {
      const l = await f.lesson('cloud');
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
      const claim = (await f.sessions.claim(f.student, s.id))!,
        result = await f.assessment.evaluate(claim);
      for (const criteria of [
        result.criteria.slice(0, 1),
        result.criteria.map((c, i) => (i ? c : { ...c, criterionId: randomUUID() })),
        result.criteria.map((c, i) => (i ? c : { ...c, label: 'Unreviewed criterion' })),
      ]) {
        await expect(
          f.sessions.publish(f.student, claim, { ...result, criteria }),
        ).rejects.toMatchObject({ status: 409 });
      }
      const before = await f.f.f
        .adminSql`select id from petros_v2_evaluations where session_id=${s.id}`;
      expect(before).toHaveLength(0);
      expect(await f.sessions.publish(f.student, claim, result)).toBe(true);
    }, 120000);
    it('reviewer expiry between evaluation and publication invalidates the result', async () => {
      const l = await f.lesson('cloud');
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
      const c = (await f.sessions.claim(f.student, s.id))!,
        result = await f.assessment.evaluate(c);
      const [q] = await f.f.admin
        .select()
        .from(schema.petrosReviewerQualifications)
        .where(eq(schema.petrosReviewerQualifications.id, l.reviewQ));
      await f.f.admin
        .insert(schema.petrosReviewerQualifications)
        .values({ ...q!, rowId: randomUUID(), version: 2, status: 'revoked' });
      await f.sessions.publish(f.student, c, result);
      s = await f.sessions.get(f.student, s.id);
      expect(s.status).toBe('blocked');
      expect(s.progress.criteriaObserved).toBe(0);
      const evaluations = await f.f.f
        .adminSql`select result from petros_v2_evaluations where session_id=${s.id}`;
      expect(evaluations[0]!.result.status).toBe('invalidated');
    }, 120000);
  },
);
