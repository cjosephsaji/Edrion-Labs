import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PETROS_EVALUATION_SCHEMA_VERSION,
  petrosPilotActionSchema,
  type PetrosAnswerEvaluation,
  type PetrosPilotAction,
} from '@edrion/schemas';
import { initialPilotState, transitionPilot } from './petros-pilot.policy';

const action = (value: Record<string, unknown>) =>
  petrosPilotActionSchema.parse({
    idempotencyKey: randomUUID(),
    expectedVersion: 0,
    ...value,
  });
const evaluation = (
  correctness: PetrosAnswerEvaluation['correctness'],
): PetrosAnswerEvaluation => ({
  schemaVersion: PETROS_EVALUATION_SCHEMA_VERSION,
  correctness,
  credit: correctness === 'correct' ? 1 : 0,
  evidence: ['Fixture'],
  errorClass: correctness === 'correct' ? 'none' : 'concept_gap',
  misconception: null,
  feedback: 'Feedback about the concept.',
  safeNextHint: 'Try comparing the prices.',
});

describe('Inflation teaching-stage policy', () => {
  it('does not let navigation or an unchecked advance claim understanding', () => {
    const state = initialPilotState();
    expect(() =>
      transitionPilot(state, action({ action: 'advance', skip: false })),
    ).toThrow('Check your understanding');
    expect(() =>
      transitionPilot(state, action({ action: 'navigate', scene: 5 })),
    ).toThrow('current scene');
    expect(state.scenes.basket!.outcome).toBe('unseen');
  });
  it('records an explicit skip and carries it through to closing review', () => {
    let state = initialPilotState();
    for (let i = 0; i < 6; i++)
      state = transitionPilot(state, action({ action: 'advance', skip: true }));
    expect(state.finished).toBe(true);
    expect(
      Object.values(state.scenes).every(
        (scene) => scene.outcome === 'unresolved',
      ),
    ).toBe(true);
    expect(() =>
      transitionPilot(state, action({ action: 'mode', mode: 'text' })),
    ).toThrow('finished');
  });
  it.each(['partial', 'incorrect', 'invalid'] as const)(
    'keeps %s answers unresolved',
    (correctness) => {
      const state = transitionPilot(
        initialPilotState(),
        action({ action: 'answer', answer: 'yes' }),
        evaluation(correctness),
      );
      expect(state.scenes.basket!.outcome).toBe('unresolved');
      expect(() =>
        transitionPilot(state, action({ action: 'advance', skip: false })),
      ).toThrow();
    },
  );
  it('counts only the first unassisted correct response as independent', () => {
    const first = transitionPilot(
      initialPilotState(),
      action({ action: 'answer', answer: 'no' }),
      evaluation('correct'),
    );
    expect(first.scenes.basket!.outcome).toBe('independent');
    const helped = transitionPilot(
      initialPilotState(),
      action({ action: 'help', kind: 'example' }),
    );
    expect(
      transitionPilot(
        helped,
        action({ action: 'answer', answer: 'no' }),
        evaluation('correct'),
      ).scenes.basket!.outcome,
    ).toBe('supported');
    const wrong = transitionPilot(
      initialPilotState(),
      action({ action: 'answer', answer: 'yes' }),
      evaluation('incorrect'),
    );
    expect(
      transitionPilot(
        wrong,
        action({ action: 'answer', answer: 'no' }),
        evaluation('correct'),
      ).scenes.basket!.outcome,
    ).toBe('supported');
  });
  it('keeps interruption support and returns to the same scene', () => {
    const state = transitionPilot(
      initialPilotState(),
      action({ action: 'ask', question: 'What does general mean?' }),
      undefined,
      'Across a broad set of prices.',
    );
    expect(state.scene).toBe(0);
    expect(state.scenes.basket!.reply).toContain('broad');
    expect(state.scenes.basket!.help).toBe('hint');
  });
  it('requires a real evaluation and validates choices', () => {
    expect(() =>
      transitionPilot(
        initialPilotState(),
        action({ action: 'answer', answer: 'no' }),
      ),
    ).toThrow('not been evaluated');
    expect(() =>
      transitionPilot(
        initialPilotState(),
        action({ action: 'answer', answer: 'invented' }),
        evaluation('correct'),
      ),
    ).toThrow('displayed');
  });
  it('commits each idempotency key once and preserves drafts across scene changes', () => {
    const input = action({ action: 'answer', answer: 'no' });
    const state = transitionPilot(
      initialPilotState(),
      input,
      evaluation('correct'),
    );
    expect(
      transitionPilot(state, input, evaluation('correct')).scenes.basket!
        .attempts,
    ).toHaveLength(1);
    const next = transitionPilot(
      state,
      action({ action: 'advance', skip: false }),
    );
    const back = transitionPilot(
      next,
      action({ action: 'navigate', scene: 0 }),
    );
    expect(back.scenes.basket!.draft).toBe('no');
    expect(back.unlocked).toBe(1);
  });
  it('requires checking an edited answer before normal advance', () => {
    const state = transitionPilot(
      initialPilotState(),
      action({ action: 'answer', answer: 'no' }),
      evaluation('correct'),
    );
    const edited = transitionPilot(
      state,
      action({ action: 'save', scene: 'basket', draft: 'yes', value: 0 }),
    );
    expect(() =>
      transitionPilot(edited, action({ action: 'advance', skip: false })),
    ).toThrow();
  });
  it('rejects arbitrary client evidence and state injection', () => {
    expect(() =>
      action({
        action: 'save',
        scene: 'basket',
        draft: 'no',
        value: 0,
        outcome: 'independent',
      }),
    ).toThrow();
    expect(() =>
      transitionPilot(
        initialPilotState(),
        action({
          action: 'save',
          scene: 'costs',
          draft: 'x',
          value: 0,
        }) as PetrosPilotAction,
      ),
    ).toThrow('scene changed');
  });
});
