import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  initialSharedCanvas,
  companionEventSchema,
  m4CommandSchema,
  m4ResponseSchema,
  type M4Snapshot,
} from '@edrion/schemas';
import { buildCompanionCue } from './petros-companion-cues';
const id = () => randomUUID();
function fixture(): M4Snapshot {
  const sourceRevisionId = id(),
    unitId = id();
  return {
    engine: 'v2',
    id: id(),
    revision: 1,
    epoch: 0,
    status: 'active',
    stage: 'awaiting_response',
    lesson: {
      title: 'Public source',
      subject: 'Cloud',
      objective: { id: id(), version: 1, label: 'Model' },
      explanation: 'Public explanation',
      citation: 'Public source',
      limitations: [],
      references: [
        {
          sourceId: id(),
          sourceRevisionId,
          sourceHash: 'a'.repeat(64),
          representationHash: 'b'.repeat(64),
          unitId,
          unitHash: 'c'.repeat(64),
          locator: { kind: 'synthetic', section: 'cloud', span: { start: 0, end: 10 } },
          semanticId: null,
        },
      ],
    },
    canvas: initialSharedCanvas('activity'),
    task: null,
    draft: '',
    checkpointId: null,
    submission: null,
    evaluation: null,
    actions: [],
    assistance: 'independent',
    progress: {
      contentViewed: true,
      responsesCommitted: 0,
      responsesEvaluated: 0,
      criteriaObserved: 0,
      mastery: false,
    },
    message: '',
  } as M4Snapshot;
}
function result(kind: 'correct' | 'incorrect' | 'partial' | 'review' | 'pending' | 'unavailable') {
  const s = fixture(),
    responseId = id();
  s.submission = {
    id: responseId,
    commandId: id(),
    status: kind === 'pending' ? 'pending' : 'complete',
    response: { kind: 'text', text: 'PRIVATE_INPUT_NOT_A_CAPTION' },
  };
  if (kind !== 'pending')
    s.evaluation = {
      id: id(),
      responseId,
      status:
        kind === 'review'
          ? 'review_required'
          : kind === 'unavailable'
            ? 'unavailable'
            : 'evaluated',
      criteria: [0, 1].map((_, i) => ({
        criterionId: id(),
        label: 'PRIVATE_LABEL_NOT_A_CAPTION',
        feedback: 'PRIVATE_RUBRIC_NOT_A_CAPTION',
        origin: kind === 'review' || kind === 'unavailable' ? 'review_required' : 'trusted_kernel',
        status:
          kind === 'review' || kind === 'unavailable'
            ? 'abstained'
            : kind === 'incorrect' || (kind === 'partial' && i === 1)
              ? 'not_satisfied'
              : 'satisfied',
      })),
      evaluatorVersion: 'petros.m4.kernel.v1',
      supersedes: null,
      reason: null,
    };
  return s;
}
describe('M6 public-only deterministic companion bridge', () => {
  it.each(['correct', 'incorrect', 'partial', 'review', 'pending', 'unavailable'] as const)(
    'projects %s without private answer/rubric or speculative success',
    (kind) => {
      const c = buildCompanionCue(result(kind), 1000);
      expect(c.result).toBe(kind);
      expect(JSON.stringify(c)).not.toContain('PRIVATE_');
      expect(c.expression === 'pleased').toBe(kind === 'correct');
      if (kind !== 'correct') expect(c.gesture).toBe('settled');
    },
  );
  it('ignores a foreign evaluation rather than publishing success', () => {
    const s = result('correct');
    s.evaluation!.responseId = id();
    expect(buildCompanionCue(s).result).toBe('unavailable');
  });
  it('ignores a completed-looking evaluation while the actual submission is pending', () => {
    const s = result('correct');
    s.submission!.status = 'pending';
    expect(buildCompanionCue(s)).toMatchObject({
      result: 'pending',
      expression: 'neutral',
      gesture: 'settled',
    });
  });
  it('stays neutral before commitment regardless of draft or obsolete result', () => {
    const s = result('correct');
    s.submission = null;
    s.task = { taskId: id() } as M4Snapshot['task'];
    s.draft = 'Correct-looking answer';
    expect(buildCompanionCue(s)).toMatchObject({
      expression: 'neutral',
      gesture: 'settled',
      targetId: null,
      assistancePolicy: 'neutral_verification',
    });
  });
  it.each(['paused', 'blocked', 'closed'] as const)(
    'revokes teaching immediately for %s',
    (status) => {
      const s = result('correct');
      s.status = status;
      expect(buildCompanionCue(s)).toMatchObject({
        gesture: 'settled',
        targetId: null,
        expression: 'neutral',
        priority: 100,
      });
    },
  );
  it('polling and revision-only changes preserve semantic identity and never create evidence', () => {
    const s = result('correct'),
      before = structuredClone(s);
    const a = buildCompanionCue(s, 1000);
    s.revision++;
    const b = buildCompanionCue(s, 2000);
    expect(a.eventId).toBe(b.eventId);
    s.revision--;
    expect(s).toEqual(before);
    expect(a.acknowledgment).toBe('presentation-only');
  });
  it('rejects arbitrary selectors, code, coordinate controls and positive pending results', () => {
    const c = buildCompanionCue(result('pending'));
    for (const extra of [
      { selector: '#answer' },
      { x: 20, y: 30 },
      { svg: '<script/>' },
      { model: 'unqualified' },
      { expression: 'pleased' },
      { gesture: 'nod' },
    ])
      expect(companionEventSchema.safeParse({ ...c, ...extra }).success).toBe(false);
  });
  it('does not put invalidated or untrusted criteria into a positive expression', () => {
    const s = result('correct');
    s.evaluation!.status = 'invalidated';
    expect(buildCompanionCue(s).expression).toBe('uncertain');
    s.evaluation!.status = 'review_required';
    s.evaluation!.criteria[0]!.origin = 'review_required';
    expect(buildCompanionCue(s).result).toBe('review');
  });
  it('never reads private fields accidentally present on a snapshot object', () => {
    const s = result('incorrect');
    Object.assign(s, { privateReferenceAnswer: 'SECRET_ANSWER', privateRubric: 'SECRET_RUBRIC' });
    expect(JSON.stringify(buildCompanionCue(s))).not.toContain('SECRET');
  });
});

it('does not admit a character frame or cue as a learning command or answer', () => {
  const c = buildCompanionCue(fixture());
  expect(
    m4CommandSchema.safeParse({
      type: 'companion_frame',
      commandId: id(),
      expectedRevision: 1,
      epoch: 0,
      cue: c,
    }).success,
  ).toBe(false);
  expect(m4ResponseSchema.safeParse({ kind: 'companion_frame', cue: c }).success).toBe(false);
});
