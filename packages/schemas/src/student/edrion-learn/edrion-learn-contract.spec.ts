import { describe, expect, it } from 'vitest';
import {
  LEARN_ENTRY_POINTS,
  LEARN_ORCHESTRATOR_STATUSES,
  assertLearnEntryPointParity,
  assertLearnOrchestratorStatusParity,
} from './parity';
import { createOrchestratorSessionInputSchema, learnSessionEntrySchema } from './api';
import { parseLearningPathGoal, selfDeclaredGoalV1Schema } from './goal';
import { orchestratorBlockV1Schema } from './blocks';
import { planV1Schema } from './plan';
import { sessionStateV1Schema } from './state';

describe('Edrion Learn storage parity', () => {
  it('entry points match PostgreSQL CHECK', () => {
    assertLearnEntryPointParity();
    expect(LEARN_ENTRY_POINTS).toHaveLength(8);
  });

  it('orchestrator statuses match PostgreSQL CHECK', () => {
    assertLearnOrchestratorStatusParity();
    expect(LEARN_ORCHESTRATOR_STATUSES).toHaveLength(6);
  });
});

describe('goal compatibility', () => {
  it('parses legacy goalStatement shape', () => {
    const parsed = parseLearningPathGoal({
      goalStatement: 'Master integration',
      weeklyMinutes: 120,
      constraints: ['evenings only'],
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.statement).toBe('Master integration');
    expect(parsed?.weekly_minutes).toBe(120);
    expect(parsed?.constraints).toEqual(['evenings only']);
    expect(selfDeclaredGoalV1Schema.safeParse(parsed).success).toBe(true);
  });

  it('round-trips SelfDeclaredGoalV1', () => {
    const goal = {
      v: 1 as const,
      statement: 'SAT math',
      constraints: [] as string[],
      weekly_minutes: 180,
      default_session_minutes: 15,
      source: 'self_declared' as const,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    expect(selfDeclaredGoalV1Schema.parse(goal)).toEqual(goal);
  });
});

describe('downstream session entry contract', () => {
  it('accepts canonical remediation entry', () => {
    const entry = learnSessionEntrySchema.parse({
      entryPoint: 'bad_result',
      topicKey: 'algebra-linear-equations',
      sessionContext: { mockAttemptId: '00000000-0000-4000-8000-000000000001' },
    });
    expect(entry.entryPoint).toBe('bad_result');
  });

  it('validates create session discriminated union', () => {
    expect(
      createOrchestratorSessionInputSchema.safeParse({
        entryPoint: 'library_document',
        knowledgeItemId: '00000000-0000-4000-8000-000000000099',
      }).success,
    ).toBe(true);
  });
});

describe('orchestrator wire contracts', () => {
  it('parses PlanV1 and block payloads', () => {
    expect(
      planV1Schema.safeParse({
        v: 1,
        move: 'direct_explanation',
        reasoning: 'Introduce core idea',
      }).success,
    ).toBe(true);
    expect(
      orchestratorBlockV1Schema.safeParse({
        v: 1,
        kind: 'explanation',
        body_markdown: '## Topic\nHello',
      }).success,
    ).toBe(true);
    expect(sessionStateV1Schema.safeParse({ v: 1 }).success).toBe(true);
  });
});
