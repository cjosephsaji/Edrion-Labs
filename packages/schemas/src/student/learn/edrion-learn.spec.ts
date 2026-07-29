import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LEARN_POLICY_V1,
  DEFAULT_TOPIC_PROFILE_V1,
  blockV1Schema,
  createLearnSessionInputSchema,
  learnPolicyV1Schema,
  learnSessionV1Schema,
  parseLearningPathGoal,
  ratingToDisplayMastery,
  selfDeclaredGoalV1Schema,
  sessionStateV1Schema,
  toSelfDeclaredGoalV1,
  topicProfileV1Schema,
  learnAttemptSchema,
} from './index';

describe('SelfDeclaredGoalV1', () => {
  it('parses v1 goals', () => {
    const goal = selfDeclaredGoalV1Schema.parse({
      v: 1,
      statement: 'Pass calculus',
      constraints: ['evenings only'],
      weekly_minutes: 120,
      default_session_minutes: 15,
      source: 'self_declared',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    expect(goal.statement).toBe('Pass calculus');
  });

  it('losslessly upgrades legacy goalStatement shape', () => {
    const parsed = parseLearningPathGoal({
      goalStatement: 'Learn Python',
      constraints: 'weekends',
      weeklyMinutes: 90,
    });
    expect(parsed?.statement).toBe('Learn Python');
    expect(parsed?.weekly_minutes).toBe(90);
    expect(parsed?.constraints).toEqual(['weekends']);
    expect(parsed?.v).toBe(1);
  });

  it('builds a new goal with defaults', () => {
    const goal = toSelfDeclaredGoalV1({ statement: 'A levels' });
    expect(goal.default_session_minutes).toBe(15);
    expect(goal.weekly_minutes).toBe(60);
  });
});

describe('TopicProfileV1', () => {
  it('accepts the default profile fixture', () => {
    expect(topicProfileV1Schema.parse(DEFAULT_TOPIC_PROFILE_V1).knowledge_type).toEqual(['conceptual']);
  });
});

describe('LearnPolicyV1', () => {
  it('ships the permissive P1 default', () => {
    const policy = learnPolicyV1Schema.parse(DEFAULT_LEARN_POLICY_V1);
    expect(policy.session_visibility).toBe('none');
    expect(policy.curriculum_bounds).toBe('open');
  });
});

describe('session contracts', () => {
  it('requires pathItemId for learning_path entry', () => {
    const bad = createLearnSessionInputSchema.safeParse({
      entryPoint: 'learning_path',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    });
    expect(bad.success).toBe(false);

    const ok = createLearnSessionInputSchema.safeParse({
      entryPoint: 'learning_path',
      pathItemId: '00000000-0000-4000-8000-000000000002',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    });
    expect(ok.success).toBe(true);
  });

  it('requires reportCardEntryId for bad_result entry', () => {
    const bad = createLearnSessionInputSchema.safeParse({
      entryPoint: 'bad_result',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    });
    expect(bad.success).toBe(false);

    const ok = createLearnSessionInputSchema.safeParse({
      entryPoint: 'bad_result',
      reportCardEntryId: '00000000-0000-4000-8000-000000000003',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    });
    expect(ok.success).toBe(true);
  });

  it('requires examScheduleId for upcoming_exam entry', () => {
    const ok = createLearnSessionInputSchema.safeParse({
      entryPoint: 'upcoming_exam',
      examScheduleId: '00000000-0000-4000-8000-000000000004',
      idempotencyKey: '00000000-0000-4000-8000-000000000001',
    });
    expect(ok.success).toBe(true);
  });

  it('keeps session state digest bounded', () => {
    const state = sessionStateV1Schema.parse({
      v: 1,
      session_id: '00000000-0000-4000-8000-000000000010',
      topic_key: 'topic:calc',
      goal: 'acquisition',
      emotional_context: 'neutral',
      time_budget_minutes: 15,
      elapsed_minutes: 3,
      checkpoints: { total: 4, done: 1 },
      moves: [],
      probe_chains: { chains_used: 0 },
      mastery_snapshot: {},
    });
    expect(JSON.stringify(state).length).toBeLessThan(8 * 1024);
  });
});

describe('BlockV1', () => {
  it('parses an explanation block', () => {
    const block = blockV1Schema.parse({
      block_type: 'explanation',
      body_md: 'Newton’s second law relates force and acceleration.',
    });
    expect(block.block_type).toBe('explanation');
  });
});

describe('mastery display', () => {
  it('maps rating 1200 to 0.5 display mastery', () => {
    expect(ratingToDisplayMastery(1200)).toBe(0.5);
  });
});

describe('backward compatibility readers', () => {
  it('accepts quiz-shaped learn_attempt rows', () => {
    const attempt = learnAttemptSchema.parse({
      id: '00000000-0000-4000-8000-000000000020',
      sessionId: null,
      blockId: null,
      kind: 'quiz',
      input: { response: '42' },
      evaluation: { correct: true, score: 1, feedback: 'Nice' },
      hintsUsed: 0,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(attempt.evaluation).toMatchObject({ correct: true });
  });

  it('accepts orchestrator session DTO with legacy status projection', () => {
    const session = learnSessionV1Schema.parse({
      id: '00000000-0000-4000-8000-000000000030',
      topicId: '00000000-0000-4000-8000-000000000031',
      topicKey: 'topic:calc',
      topicTitle: 'Calculus',
      subjectLabel: 'Math',
      status: 'active',
      policySnapshot: DEFAULT_LEARN_POLICY_V1,
      startedAt: '2026-01-01T00:00:00.000Z',
      version: 1,
    });
    expect(session.orchestratorStatus).toBeUndefined();
  });
});
