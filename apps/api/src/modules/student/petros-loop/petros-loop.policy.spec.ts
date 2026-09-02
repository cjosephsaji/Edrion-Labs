import { describe, expect, it } from 'vitest';
import {
  PETROS_MOVE_TYPES,
  PETROS_PLAN_PROMPT_VERSION,
  PETROS_PLAN_SCHEMA_VERSION,
  PETROS_SESSION_STATE_VERSION,
  petrosTeachingBlockContentSchema,
  type PetrosMoveType,
  type PetrosSessionState,
} from '@edrion/schemas';
import {
  applyRepetitionGuard,
  deterministicPlan,
  deterministicRender,
  requiresDeterministicPolicyEnvelope,
  terminalReason,
} from './petros-loop.policy';
import { stage4ProfileFixture } from './petros-stage4.fixture';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const INSTITUTION_ID = '33333333-3333-4333-8333-333333333333';

function state(topic: string, used = 0): PetrosSessionState {
  return {
    stateVersion: PETROS_SESSION_STATE_VERSION,
    sessionId: SESSION_ID,
    studentId: STUDENT_ID,
    institutionId: INSTITUTION_ID,
    sessionType: 'repair',
    topic,
    currentGoal: `Repair the key decision in ${topic}.`,
    time: { budgetSeconds: 480, elapsedSeconds: 30, remainingSeconds: 450 },
    moves: { maximum: 4, used, remaining: 4 - used },
    checkpointPlan: Array.from({ length: 4 }, (_, index) => ({
      id: `checkpoint-${index + 1}`,
      label: `Checkpoint ${index + 1}`,
      status:
        index < used
          ? ('complete' as const)
          : index === used
            ? ('current' as const)
            : ('pending' as const),
    })),
    currentCheckpointId: `checkpoint-${Math.min(used + 1, 4)}`,
    priorMoves: [],
    learnerContext: {},
    topicContext: {},
    resolvedTopicProfile: stage4ProfileFixture(topic, INSTITUTION_ID),
    sourceContext: null,
    observations: {
      recent: [],
      summarizedOutcomes: {
        answered: 0,
        correct: 0,
        incorrect: 0,
        partial: 0,
        highValueMisconceptions: 0,
        fragileSuccesses: 0,
        openDetours: 0,
        activeStruggleLevel: 0,
        activeWrongAttemptCount: 0,
      },
    },
    promptVersion: PETROS_PLAN_PROMPT_VERSION,
    outputSchemaVersion: PETROS_PLAN_SCHEMA_VERSION,
  };
}

describe('Petros Stage 4 loop policy', () => {
  it('produces four structurally different profile-driven sequences', () => {
    const sequences = [
      sequence('integration by parts'),
      sequence('photosynthesis'),
      sequence('history of a revolution'),
      sequence('programming loops'),
    ];
    expect(new Set(sequences.map((moves) => moves.join(' → ')))).toHaveLength(4);
    expect(sequences.every((moves) => moves[0] === 'layered_explanation')).toBe(true);
    expect(sequences[1]).toContain('misconception_demolition');
    expect(sequences[2]).toContain('story');
    expect(sequences[3]).toContain('prerequisite_check');
  });

  it('overrides and logs a third consecutive identical move', () => {
    const current = state('photosynthesis', 2);
    const repeated = deterministicPlan(state('photosynthesis', 0));
    current.priorMoves = [1, 2].map((sequence) => ({
      decisionId: `${sequence}1111111-1111-4111-8111-111111111111`,
      sequence,
      decision: repeated,
      renderedBlockReference: null,
      status: 'completed' as const,
      observedOutcome: { completed: true },
    }));
    const result = applyRepetitionGuard(repeated, current.priorMoves);
    expect(result.decision.selectedMoveType).toBe('recall_check');
    expect(result.intervention).toMatchObject({
      policy: 'no_three_consecutive_moves',
      originalMoveType: repeated.selectedMoveType,
    });
    expect(result.decision.decisionFactors).toContain(
      'Repetition guard prevented a third consecutive identical move.',
    );
  });

  it('renders a provider-neutral valid fallback block for every planned move', () => {
    for (let used = 0; used < 4; used += 1) {
      const current = state('integration by parts', used);
      const decision = deterministicPlan(current);
      const block = deterministicRender(decision, current);
      expect(block.type).toBe(decision.selectedMoveType);
      expect(JSON.stringify(block)).not.toMatch(/provider|model|api key/i);
    }
  });

  it.each([
    ['simpler', 1],
    ['deeper', 3],
  ] as const)('turns an explicit %s request into a checkpoint-holding explanation', (level, layers) => {
    const current = state('photosynthesis', 1);
    current.learnerContext.pendingReexplanation = {
      level,
      sourceBlockId: '55555555-5555-4555-8555-555555555555',
      sourceBlockType: 'hook',
      sourceContent: { type: 'hook', title: 'Original explanation' },
    };

    const decision = deterministicPlan(current);

    expect(decision).toMatchObject({
      selectedMoveType: 'layered_explanation',
      moveParameters: { layerCount: layers },
      progressEffect: {
        checkpointId: current.currentCheckpointId,
        effect: 'hold',
        progressDelta: 0,
      },
      guessFirst: { status: 'not_applicable' },
    });
    expect(decision.studentSafeReason).toMatch(/explicitly asked/i);
  });

  it('renders the complete move vocabulary as exact typed blocks', () => {
    for (const move of PETROS_MOVE_TYPES) {
      const current = stateForMove(move);
      const decision = deterministicPlan(current);
      expect(decision.selectedMoveType).toBe(move);
      const block = deterministicRender(decision, current);
      expect(block.type).toBe(move);
      expect(petrosTeachingBlockContentSchema.safeParse(block).success).toBe(true);
    }
  });

  it('enforces derivation depth, the two-probe cap, and capability fallback', () => {
    const shallowMath = stateForMove('derivation');
    shallowMath.learnerContext.wantsDepth = false;
    const shallowDecision = deterministicPlan(shallowMath);
    expect(shallowDecision.selectedMoveType).not.toBe('derivation');
    expect(shallowDecision.selectionPolicy.exclusions).toContainEqual({
      move: 'derivation',
      reason: 'Derivation waits for an explicit learner signal requesting depth.',
    });

    const probed = stateForMove('socratic_probe');
    const probeDecision = deterministicPlan(probed);
    probed.priorMoves = [1, 2].map((sequence) => ({
      decisionId: `${sequence}1111111-1111-4111-8111-111111111111`,
      sequence,
      decision: probeDecision,
      renderedBlockReference: null,
      status: 'completed' as const,
      observedOutcome: { completed: true },
    }));
    const capped = deterministicPlan(probed);
    expect(capped.selectedMoveType).toBe('layered_explanation');
    expect(capped.selectionPolicy.exclusions).toContainEqual({
      move: 'socratic_probe',
      reason: 'The non-negotiable two-probe Socratic cap has been reached.',
    });

    const noVisual = stateForMove('diagram');
    noVisual.topicContext.visualProviderAvailable = false;
    const fallback = deterministicPlan(noVisual);
    expect(fallback.selectedMoveType).toBe('layered_explanation');
    expect(fallback.selectionPolicy.capabilityFallback).toContain(
      'Diagram capability was unavailable',
    );
    expect(fallback.studentSafeReason).toContain('Diagram capability was unavailable');
    expect(fallback.decisionFactors).toContain(fallback.selectionPolicy.capabilityFallback);
  });

  it('keeps every deterministic recall question objectively gradable during an outage', () => {
    const current = state('photosynthesis', 1);
    current.resolvedTopicProfile.profile.dimensions.moves.openingPattern = ['recall_check'];
    current.resolvedTopicProfile.profile.dimensions.moves.weights.misconception_demolition = 0;
    const block = deterministicRender(deterministicPlan(current), current);
    expect(block.type).toBe('recall_check');
    if (block.type !== 'recall_check') throw new Error('Expected a recall check.');
    expect(block.questions).toHaveLength(1);
    expect(block.questions.every((question) => question.responseType === 'single_choice')).toBe(
      true,
    );
  });

  it('caps on time and moves and reports pause/close without drifting', () => {
    const timeUp = state('photosynthesis');
    timeUp.time.remainingSeconds = 0;
    expect(terminalReason(timeUp, 'active')).toBe('time_up');
    const maxMoves = state('photosynthesis', 4);
    expect(terminalReason(maxMoves, 'active')).toBeNull();
    const artifactDecision = deterministicPlan(maxMoves);
    expect(artifactDecision.selectedMoveType).toBe('artifact_commit');
    expect(artifactDecision.termination.recommendation).toBe('goal_met');
    maxMoves.priorMoves.push({
      decisionId: '99999999-9999-4999-8999-999999999999',
      sequence: 5,
      decision: artifactDecision,
      renderedBlockReference: null,
      status: 'completed',
      observedOutcome: { completed: true },
    });
    expect(terminalReason(maxMoves, 'active')).toBe('max_moves');
    expect(terminalReason(state('photosynthesis'), 'paused')).toBe('paused');
    expect(terminalReason(state('photosynthesis'), 'closed')).toBe('closed');
    expect(deterministicPlan(state('photosynthesis', 3)).termination.recommendation).toBe('continue');
  });

  it('uses a composer observation causally and produces a visible return plan', () => {
    const current = state('photosynthesis', 1);
    current.observations.recent.push({
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      type: 'question_asked',
      blockId: null,
      decisionId: null,
      targetId: 'checkpoint-2',
      summary: 'Composer question: Why is oxygen released here?',
      occurredAt: '2026-08-08T08:00:00.000Z',
    });
    current.observations.summarizedOutcomes.openDetours = 1;
    const decision = deterministicPlan(current);
    expect(decision.observationResponse).toMatchObject({
      causalObservationIds: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
      action: 'answer_now',
    });
    expect(decision.observationResponse.returnPlan).toContain(current.currentGoal);
  });

  it('schedules an earlier recall after a correct but uncertain observation', () => {
    const current = state('photosynthesis', 1);
    current.observations.recent.push({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      type: 'answer_submitted',
      blockId: null,
      decisionId: null,
      targetId: 'light-energy',
      summary: 'Answer evaluated correct with confidence guessing.',
      occurredAt: '2026-08-08T08:01:00.000Z',
    });
    current.observations.summarizedOutcomes.fragileSuccesses = 1;
    const decision = deterministicPlan(current);
    expect(decision.selectedMoveType).toBe('recall_check');
    expect(decision.observationResponse.action).toBe('recheck');
  });

  it('does not misclassify an incorrect answer as correct because the word contains correct', () => {
    const current = state('photosynthesis', 1);
    current.observations.recent.push({
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      type: 'answer_submitted',
      blockId: null,
      decisionId: null,
      targetId: 'light-energy',
      summary: 'incorrect answer; confidence guessing.',
      occurredAt: '2026-08-08T08:02:00.000Z',
    });
    current.observations.summarizedOutcomes.incorrect = 1;
    const decision = deterministicPlan(current);
    expect(decision.observationResponse.action).toBe('continue');
    expect(decision.studentSafeReason).not.toContain('correct but uncertain');
  });

  it('logs resolved door factors, suppresses the bad-mark hook, and weights exam revision', () => {
    const repair = stateForMove('hook');
    repair.sessionType = 'repair';
    repair.sourceContext = {
      door: 'result_repair',
      emotionalRegister: 'flat_practical',
      referenceId: 'published-result',
      label: 'Published result',
    };
    const repairDecision = deterministicPlan(repair);
    expect(repairDecision.selectedMoveType).not.toBe('hook');
    expect(repairDecision.decisionFactors).toContain('Contextual door: result repair');
    expect(repairDecision.decisionFactors).toContain('Emotional register: flat practical');

    const revise = state('photosynthesis', 1);
    revise.sessionType = 'revise';
    revise.sourceContext = { door: 'upcoming_exam', label: 'Published syllabus' };
    const reviseDecision = deterministicPlan(revise);
    expect(['recall_check', 'contrast_case', 'synthesis']).toContain(reviseDecision.selectedMoveType);
  });

  it('carries exact document page references into deterministic teaching blocks', () => {
    const document = state('photosynthesis', 0);
    document.sourceContext = {
      door: 'uploaded_document',
      referenceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      label: 'Thermodynamics notes',
      citations: [{ label: 'Thermodynamics notes (p. 7)', page: 7, section: 'Entropy', version: '3' }],
    };
    const block = deterministicRender(deterministicPlan(document), document);
    expect(block.type).toBe('layered_explanation');
    if (block.type !== 'layered_explanation') throw new Error('Expected layered explanation.');
    expect(block.sourceGrounding).toEqual([{ label: 'Thermodynamics notes (p. 7)', reference: 'p. 7 · Entropy · v. 3' }]);
  });

  it('opens document and assistant doors with directly grounded explanations', () => {
    const document = state('linear equations', 0);
    document.sourceContext = {
      door: 'uploaded_document',
      emotionalRegister: 'curious_grounded',
      citations: [{ label: 'Mathematics notes', page: 2, section: 'Linear equations', version: '2' }],
    };
    expect(deterministicPlan(document)).toMatchObject({
      selectedMoveType: 'layered_explanation',
      studentSafeReason: expect.stringContaining('document page'),
    });

    const assistant = state('linear equations', 0);
    assistant.sessionType = 'doubt';
    assistant.sourceContext = {
      door: 'assistant_handoff',
      emotionalRegister: 'responsive_neutral',
    };
    expect(deterministicPlan(assistant)).toMatchObject({
      selectedMoveType: 'layered_explanation',
      studentSafeReason: expect.stringContaining('direct explanation'),
    });
  });

  it('opens a snapped question at the confirmed stuck point without dumping a solution', () => {
    const current = state('linear equations');
    current.sessionType = 'doubt';
    current.sourceContext = { door: 'snap_question', label: 'Student-confirmed question photo' };
    current.learnerContext.stuckPoint = 'setting_up';
    const decision = deterministicPlan(current);
    const block = deterministicRender(decision, current);
    expect(decision.selectedMoveType).toBe('layered_explanation');
    expect(decision.studentSafeReason).toContain('before any full solution');
    expect(block.type).toBe('layered_explanation');
    if (block.type !== 'layered_explanation') throw new Error('Expected a layered explanation.');
    expect(block.firstLayer).toContain('setting up');
    expect(block.deeperLayers[0]?.content).toContain('first justified step');
  });

  it('teaches the first confirmed handwriting break and preserves a reattempt', () => {
    const current = state('solving a linear equation');
    current.sourceContext = { door: 'handwriting', label: 'Student-confirmed handwritten work' };
    current.topicContext.teachingStep = 'Divide both sides by the coefficient instead of subtracting it.';
    current.topicContext.reattemptPrompt = 'Rewrite line 2, then continue from your own line 1.';
    const decision = deterministicPlan(current);
    const block = deterministicRender(decision, current);
    expect(decision.selectedMoveType).toBe('worked_example');
    expect(block.type).toBe('worked_example');
    if (block.type !== 'worked_example') throw new Error('Expected a worked example.');
    expect(block.problemStatement).toContain('Rewrite line 2');
    expect(block.steps[0]?.explanation).toContain('Divide both sides');
    expect(block.steps[2]?.explanation).toContain('Separate new errors');
  });

  it('enforces the exact four-move and five-minute promise with no automatic expansion', () => {
    const expected: PetrosMoveType[] = ['layered_explanation', 'diagram', 'recall_check', 'artifact_commit'];
    const actual = expected.map((_, used) => {
      const current = state('photosynthesis', used);
      current.sessionType = 'learn';
      current.time = { budgetSeconds: 300, elapsedSeconds: used * 60, remainingSeconds: 300 - used * 60 };
      current.sourceContext = { door: 'five_minute', label: 'Finite five-minute session' };
      return deterministicPlan(current);
    });
    expect(actual.map((decision) => decision.selectedMoveType)).toEqual(expected);
    expect(actual[3]?.studentSafeReason).toContain('never expands automatically');
  });

  it('changes an active-homework session toward questions and never selects a worked answer', () => {
    const current = state('photosynthesis', 0);
    current.sourceContext = {
      door: 'active_homework',
      institutionalDecision: {
        syllabus: { decision: 'within_bounds', studentMessage: 'Inside syllabus.' },
        homework: { mode: 'guided_homework', studentMessage: 'Use hints and setup, not a final answer.' },
      },
    };
    const decision = deterministicPlan(current);
    expect(decision.selectedMoveType).not.toBe('worked_example');
    expect(decision.selectedMoveType).toBe('layered_explanation');
    expect(decision.studentSafeReason).toMatch(/final answer|active related assignment/i);
    expect(decision.selectionPolicy.exclusions).toContainEqual(expect.objectContaining({ move: 'worked_example' }));
  });

  it('teaches an uploaded document before checking, then turns it into a diagram', () => {
    const opening = state('machine learning from examples', 0);
    opening.sessionType = 'learn';
    opening.sourceContext = { door: 'uploaded_document', label: 'Machine Learning — Module 5' };
    const first = deterministicPlan(opening);
    expect(first.selectedMoveType).toBe('layered_explanation');
    expect(first.guessFirst.status).toBe('not_applicable');

    const visual = state('machine learning from examples', 1);
    visual.sessionType = 'learn';
    visual.sourceContext = opening.sourceContext;
    visual.priorMoves = [{
      decisionId: '44444444-4444-4444-8444-444444444444',
      sequence: 1,
      decision: first,
      renderedBlockReference: null,
      status: 'completed',
      observedOutcome: { completed: true },
    }];
    const second = deterministicPlan(visual);
    expect(second.selectedMoveType).toBe('diagram');
    expect(second.guessFirst.status).toBe('not_applicable');
    expect(requiresDeterministicPolicyEnvelope(opening)).toBe(true);
    expect(requiresDeterministicPolicyEnvelope(visual)).toBe(true);
  });

  it('renders a nonempty legitimate syllabus path for an outside-bound request', () => {
    const current = state('quantum field theory');
    current.sourceContext = {
      door: 'student_portal',
      institutionalDecision: {
        syllabus: { decision: 'outside_bounds', studentMessage: 'This is outside the approved syllabus. Choose the related approved foundations path.' },
        homework: null,
      },
    };
    const decision = deterministicPlan(current);
    const block = deterministicRender(decision, current);
    expect(decision.selectedMoveType).toBe('goal_frame');
    expect(block.type).toBe('goal_frame');
    if (block.type !== 'goal_frame') throw new Error('Expected goal frame.');
    expect(block.goal).toMatch(/related approved foundations path/i);
  });
});

function sequence(topic: string) {
  const current = state(topic, 0);
  const moves = [];
  for (let index = 0; index < 4; index += 1) {
    current.moves = { maximum: 4, used: index, remaining: 4 - index };
    const decision = deterministicPlan(current);
    moves.push(decision.selectedMoveType);
    current.priorMoves.push({
      decisionId: `${index + 1}1111111-1111-4111-8111-111111111111`,
      sequence: index + 1,
      decision,
      renderedBlockReference: null,
      status: 'completed',
      observedOutcome: { completed: true },
    });
  }
  return moves;
}

function stateForMove(move: PetrosMoveType) {
  const closing = ['synthesis', 'artifact_commit', 'forward_link'].includes(move);
  // Exercise the whole move vocabulary after the mandatory teach-first opening.
  const current = state('photosynthesis', closing ? 3 : 1);
  current.sessionType = 'learn';
  current.sourceContext = null;
  current.resolvedTopicProfile.profile.dimensions.moves.weights = Object.fromEntries(
    PETROS_MOVE_TYPES.map((candidate) => [candidate, candidate === move ? 10_000 : 1]),
  ) as Record<PetrosMoveType, number>;
  current.resolvedTopicProfile.profile.dimensions.moves.required = [];
  current.resolvedTopicProfile.profile.dimensions.moves.recommended = [move];
  current.resolvedTopicProfile.profile.dimensions.moves.disallowed = [];
  current.resolvedTopicProfile.profile.dimensions.moves.openingPattern = [move];
  current.resolvedTopicProfile.profile.dimensions.moves.practicePattern = [move];
  current.resolvedTopicProfile.profile.dimensions.moves.closingPattern = [move];
  current.resolvedTopicProfile.profile.dimensions.prerequisiteDensity =
    move === 'prerequisite_check' ? 4 : 2;
  if (move === 'prerequisite_check') {
    current.resolvedTopicProfile.profile.dimensions.prerequisites = [
      {
        conceptKey: 'foundation',
        label: 'Foundation concept',
        requiredness: 'mandatory',
        sourceReferences: [],
      },
    ];
  }
  current.resolvedTopicProfile.profile.dimensions.mathematicalLoad =
    move === 'derivation' ? 4 : 0;
  current.learnerContext.wantsDepth = move === 'derivation';
  current.topicContext.visualProviderAvailable = true;
  return current;
}
