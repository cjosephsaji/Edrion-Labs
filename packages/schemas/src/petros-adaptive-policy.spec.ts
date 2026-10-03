import { describe, expect, it } from 'vitest';
import { proposePetrosAdaptiveMove } from './petros-adaptive-policy';

const objective = { id: '22222222-2222-4222-8222-222222222222', version: 1 };
const pack = { id: '11111111-1111-4111-8111-111111111111', version: 1 };
const base = {
  schemaVersion: 'petros.adaptive-policy.v1',
  objective,
  pack,
  policyVersion: 'policy.v1',
  sourceVersion: 'a'.repeat(64),
  curriculumRevision: 3,
  assignmentVersions: [{ id: '33333333-3333-4333-8333-333333333333', version: 2 }],
  availableTasks: [{ id: 'transfer', variant: 'b', unseenContext: true }],
  constraints: { sourceReady: true, sourceGrounding: 'supported', explanationPresented: true, remainingSeconds: 600, diagramAvailable: true, assistance: 'ordinary_study' },
};

describe('isolated adaptive policy candidate', () => {
  it('chooses bounded moves for all seven evidence scenarios', () => {
    const cases = [
      [{ kind: 'new_topic' }, 'layered_explanation', 'new_topic', 'none'],
      [{ kind: 'no_evidence' }, 'layered_explanation', 'no_evidence', 'none'],
      [{ kind: 'correct_uncertain', evidenceEventId: 'evt-correct' }, 'recall_check', 'correct_uncertain', 'new_independent_item'],
      [{ kind: 'assisted_success', evidenceEventId: 'evt-assisted' }, 'recall_check', 'assistance_requires_new_item', 'new_independent_item'],
      [{ kind: 'hint_exposed', evidenceEventId: 'evt-hint' }, 'recall_check', 'hint_exposed', 'new_independent_item'],
      [{ kind: 'wrong_confident', evidenceEventId: 'evt-wrong' }, 'contrast_case', 'confident_error', 'new_independent_item'],
      [{ kind: 'ambiguous', evidenceEventId: 'evt-ambiguous' }, 'socratic_probe', 'diagnosis_uncertain', 'clarification'],
      [{ kind: 'independent_transfer', evidenceEventId: 'evt-transfer' }, 'synthesis', 'independent_transfer', 'none'],
      [{ kind: 'repeated_confusion', evidenceEventIds: ['evt-1', 'evt-2'] }, 'diagram', 'representation_change', 'clarification'],
      [{ kind: 'misconception', misconceptionId: 'horizontal_gravity', diagnosis: 'supported', evidenceEventIds: ['evt-3'] }, 'contrast_case', 'supported_misconception', 'new_independent_item'],
    ] as const;
    for (const [signal, selectedMove, reason, expectedEvidence] of cases) {
      const result = proposePetrosAdaptiveMove({ ...base, signal });
      expect(result.decision).toMatchObject({ status: 'proposed', selectedMove, reason, expectedEvidence });
      expect(result.decision.status === 'proposed' && result.decision.studentSafeReason.length).toBeGreaterThan(0);
      expect(result).not.toHaveProperty('content');
      expect(result).not.toHaveProperty('rendered');
    }
  });

  it('requests clarification for uncertain diagnosis and changes representation after repeated confusion', () => {
    expect(proposePetrosAdaptiveMove({
      ...base,
      signal: { kind: 'misconception', misconceptionId: 'candidate', diagnosis: 'uncertain', evidenceEventIds: ['evt-4'] },
    }).decision).toMatchObject({ selectedMove: 'socratic_probe', reason: 'diagnosis_uncertain', diagnosis: 'tentative' });
    expect(proposePetrosAdaptiveMove({
      ...base,
      signal: { kind: 'repeated_confusion', evidenceEventIds: ['evt-5', 'evt-6'] },
      constraints: { ...base.constraints, diagramAvailable: false },
    }).decision).toMatchObject({ selectedMove: 'worked_example', reason: 'representation_change' });
    expect(proposePetrosAdaptiveMove({
      ...base,
      signal: { kind: 'repeated_confusion', evidenceEventIds: ['evt-5', 'evt-6'] },
      constraints: { ...base.constraints, diagramAvailable: false, assistance: 'guided_homework' },
    }).decision).toMatchObject({ selectedMove: 'socratic_probe', reason: 'assignment_restriction' });
  });

  it('blocks unavailable source and closes on short remaining time before probing', () => {
    expect(proposePetrosAdaptiveMove({ ...base, signal: { kind: 'new_topic' }, constraints: { ...base.constraints, sourceReady: false } }).decision)
      .toEqual({ status: 'blocked', reason: 'source_unavailable' });
    expect(proposePetrosAdaptiveMove({ ...base, signal: { kind: 'new_topic' }, constraints: { ...base.constraints, remainingSeconds: 119 } }).decision)
      .toMatchObject({ status: 'proposed', selectedMove: 'artifact_commit', reason: 'time_to_close', expectedEvidence: 'none' });
  });

  it('rejects duplicate evidence references and carries exact source/policy/objective/pack versions', () => {
    expect(() => proposePetrosAdaptiveMove({
      ...base,
      signal: { kind: 'repeated_confusion', evidenceEventIds: ['same', 'same'] },
    })).toThrow();
    const result = proposePetrosAdaptiveMove({ ...base, signal: { kind: 'no_evidence' } });
    expect(result).toMatchObject({ objective, pack, policyVersion: 'policy.v1', sourceVersion: 'a'.repeat(64), curriculumRevision: 3, assignmentVersions: base.assignmentVersions });
  });

  it('keeps uncertain grounding tentative and presents the explanation before probing', () => {
    const signal = { kind: 'ambiguous', evidenceEventId: 'evt-uncertain' };
    expect(proposePetrosAdaptiveMove({ ...base, signal, constraints: { ...base.constraints, sourceGrounding: 'uncertain' } }).decision)
      .toMatchObject({ selectedMove: 'layered_explanation', reason: 'source_uncertain', expectedEvidence: 'none', diagnosis: 'tentative' });
    expect(proposePetrosAdaptiveMove({ ...base, signal, constraints: { ...base.constraints, explanationPresented: false } }).decision)
      .toMatchObject({ selectedMove: 'layered_explanation', reason: 'explain_before_probe', expectedEvidence: 'none' });
  });
});
