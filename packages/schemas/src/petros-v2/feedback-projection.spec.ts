import { describe, expect, it } from 'vitest';
import { m4EvaluationSchema } from './student-session';
const id = '10000000-0000-4000-8000-000000000001';
const result = {
  id,
  responseId: id,
  status: 'evaluated',
  evaluatorVersion: 'petros.m4.kernel.v1',
  supersedes: null,
  reason: null,
  criteria: [
    {
      criterionId: id,
      label: 'Criterion',
      status: 'not_satisfied',
      origin: 'trusted_kernel',
      feedback: 'Needs another look.',
      target: { fieldId: 'work', elementIds: ['student-edge'] },
    },
  ],
};
describe('Safe public feedback projection', () => {
  it('accepts response location metadata and historical results without it', () => {
    expect(m4EvaluationSchema.safeParse(result).success).toBe(true);
    const historical = structuredClone(result);
    delete (historical.criteria[0] as { target?: unknown }).target;
    expect(m4EvaluationSchema.safeParse(historical).success).toBe(true);
  });
  it.each(['expected', 'accepted', 'rubric'])(
    'rejects private %s data in a public target',
    (key) => {
      const unsafe = structuredClone(result);
      Object.assign(unsafe.criteria[0]!.target, { [key]: 'PRIVATE' });
      expect(m4EvaluationSchema.safeParse(unsafe).success).toBe(false);
    },
  );
});
