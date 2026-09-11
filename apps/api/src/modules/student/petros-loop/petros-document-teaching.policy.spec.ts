import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { petrosDocumentTeachingActionSchema } from '@edrion/schemas';
import {
  fallbackDocumentTeachingPlan,
  publicDocumentTeachingPlan,
} from '../petros-session-intent/petros-document-teaching';
import {
  initialDocumentTeachingState,
  transitionDocumentTeaching,
} from './petros-document-teaching.policy';

const plan = publicDocumentTeachingPlan(
  fallbackDocumentTeachingPlan({
    documentId: '11111111-1111-4111-8111-111111111111',
    documentVersion: 2,
    sourceFingerprint: 'a'.repeat(64),
    topicId: 'concept-1',
    title: 'Cellular respiration',
    summary: 'How cells release usable energy.',
    prerequisites: ['energy'],
    pages: [{ page: 3, text: 'Cells release usable energy.' }],
  }),
);
const key = () => randomUUID();
const choice = (answer: string) => ({
  action: 'answer' as const,
  scene: 0,
  answer,
  idempotencyKey: key(),
  expectedVersion: 0,
});

describe('document teaching policy', () => {
  it('starts with a neutral diagnostic and adapts its level', () => {
    const state = initialDocumentTeachingState(plan);
    expect(state.diagnosticComplete).toBe(false);
    const next = transitionDocumentTeaching(
      state,
      {
        action: 'diagnostic',
        answer: 'I can explain the main mechanism',
        idempotencyKey: key(),
        expectedVersion: 0,
      },
      {
        correctness: 'correct',
        feedback: 'Good starting point.',
        safeNextHint: 'Connect the mechanism to evidence.',
      },
    );
    expect(next.level).toBe('stretch');
    expect(next.diagnosticComplete).toBe(true);
  });

  it('preserves drafts and classifies first unsupported success as independent', () => {
    const state = initialDocumentTeachingState(plan);
    const saved = transitionDocumentTeaching(state, {
      action: 'save',
      scene: 0,
      draft: 'My explanation',
      idempotencyKey: key(),
      expectedVersion: 0,
    });
    const next = transitionDocumentTeaching(saved, choice('My explanation'), {
      correctness: 'correct',
      feedback: 'Clear.',
      safeNextHint: 'Apply it.',
    });
    expect(next.scenes.orientation?.outcome).toBe('independent');
    expect(next.scenes.orientation?.draft).toBe('My explanation');
  });

  it('requires a checked answer or explicit revisit before advancing', () => {
    const state = initialDocumentTeachingState(plan);
    expect(() =>
      transitionDocumentTeaching(state, {
        action: 'advance',
        skip: false,
        idempotencyKey: key(),
        expectedVersion: 0,
      }),
    ).toThrow();
    const next = transitionDocumentTeaching(state, {
      action: 'advance',
      skip: true,
      idempotencyKey: key(),
      expectedVersion: 0,
    });
    expect(next.scene).toBe(1);
    expect(next.scenes.orientation?.outcome).toBe('skipped');
  });

  it('does not replay an idempotent command', () => {
    const state = initialDocumentTeachingState(plan);
    const action = {
      action: 'help' as const,
      kind: 'hint' as const,
      idempotencyKey: key(),
      expectedVersion: 0,
    };
    const once = transitionDocumentTeaching(state, action);
    const twice = transitionDocumentTeaching(once, action);
    expect(twice).toEqual(once);
  });

  it('stores visual exploration separately from the submitted answer', () => {
    const state = initialDocumentTeachingState(plan);
    const next = transitionDocumentTeaching(state, {
      action: 'explore', scene: 0, values: { value: 42 }, idempotencyKey: key(), expectedVersion: 0,
    });
    expect(next.scenes.orientation?.exploration).toEqual({ value: 42 });
    expect(next.scenes.orientation?.draft).toBe('');
  });

  it('completes an ungraded teaching scene as exploration evidence', () => {
    const state = initialDocumentTeachingState(plan);
    const next = transitionDocumentTeaching(state, {
      action: 'complete', scene: 0, idempotencyKey: key(), expectedVersion: 0,
    });
    expect(next.scenes.orientation).toMatchObject({ outcome: 'explored', completed: true });
    expect(next.scene).toBe(1);
  });

  it('validates the public action contract', () => {
    expect(() =>
      petrosDocumentTeachingActionSchema.parse({
        action: 'answer',
        scene: 0,
        answer: '',
        idempotencyKey: key(),
        expectedVersion: 0,
      }),
    ).toThrow();
  });
});
