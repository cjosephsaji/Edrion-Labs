import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  planV1Schema,
  sessionStateV1Schema,
  type MoveType,
  type PlanV1,
  type SessionStateV1,
} from '@edrion/schemas';
import type { TopicProfileV1 } from '@edrion/schemas';
import type { LearnPolicyV1 } from '@edrion/schemas';
import { LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import { PROMPT_VERSION } from '../learn-ai/prompts/version';
import {
  LEARN_MOVE_CAP,
  LEARN_PROBE_MAX_CHAINS,
  LEARN_PROBE_MAX_TURNS,
  NON_EXPOSITION_MOVES,
} from './constants';
import { buildPlanSystemPrompt, buildPlanUserPrompt, stateDigest } from './prompts/plan.prompt';
import type { StudentPrincipal } from '../student.types';

export interface PlanContext {
  state: SessionStateV1;
  profile: TopicProfileV1;
  policy: LearnPolicyV1;
  topicTitle: string;
  lastOutcome?: Record<string, unknown>;
  hardRules: string[];
  preferRetrieval?: boolean;
}

@Injectable()
export class MovePlannerService {
  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly callLog: LearnAiCallLogger,
  ) {}

  enforceHardRules(move: MoveType, ctx: PlanContext): MoveType {
    const moveCount = ctx.state.moves.length;
    const hasExposition = ctx.state.moves.some((m) => !NON_EXPOSITION_MOVES.has(m.move_type));

    if (move === 'retrieval_check' && !hasExposition && ctx.state.goal !== 'revision') {
      return 'direct_explanation';
    }
    if (move === 'prereq_pulse') {
      if (moveCount >= 2 || ctx.profile.prerequisite_density === 'low') return 'direct_explanation';
    }
    if (move === 'socratic_probe') {
      const chains = ctx.state.probe_chains.chains_used ?? 0;
      const turn = ctx.state.probe_chains.turn ?? 0;
      if (chains >= LEARN_PROBE_MAX_CHAINS || turn >= LEARN_PROBE_MAX_TURNS) return 'direct_explanation';
    }
    if ((move === 'synthesis' || move === 'artifact_commit') && moveCount < LEARN_MOVE_CAP - 2) {
      return 'direct_explanation';
    }
    return move;
  }

  async planMove(
    principal: StudentPrincipal,
    ctx: PlanContext,
    opts?: { sessionId?: string },
  ): Promise<PlanV1> {
    if (this.shouldForceClose(ctx.state)) {
      return this.closingPlan(ctx.state);
    }

    const deterministic = this.deterministicPlan(ctx);
    if (!this.ai.available) return deterministic;

    const started = Date.now();
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'learn_plan',
        tier: 'small',
        system: buildPlanSystemPrompt(),
        user: buildPlanUserPrompt({
          topicTitle: ctx.topicTitle,
          profile: ctx.profile,
          policy: ctx.policy,
          stateDigest: stateDigest(ctx.state),
          hardRules: ctx.hardRules,
          preferRetrieval: ctx.preferRetrieval ?? false,
        }),
        schema: planV1Schema,
        schemaName: 'PlanV1',
        maxOutputTokens: 400,
      });
      await this.logSafe(principal, 'learn_plan', usage, {
        sessionId: opts?.sessionId,
        promptVersion: PROMPT_VERSION,
      });
      const move = this.enforceHardRules(result.move, ctx);
      return planV1Schema.parse({ ...result, move });
    } catch {
      await this.logSafe(
        principal,
        'learn_plan',
        { inputTokens: 0, outputTokens: 0, model: 'fallback', durationMs: Date.now() - started },
        { sessionId: opts?.sessionId, error: 'plan_failed', degraded: true },
      );
      return deterministic;
    }
  }

  /** Telemetry must never escape the handler it is reporting from. */
  private async logSafe(...args: Parameters<LearnAiCallLogger['log']>): Promise<void> {
    try {
      await this.callLog.log(...args);
    } catch {
      /* non-fatal */
    }
  }

  deterministicPlan(ctx: PlanContext): PlanV1 {
    const { state, profile, preferRetrieval } = ctx;
    const n = state.moves.length;
    const hasSynthesis = state.moves.some((m) => m.move_type === 'synthesis');
    const hasArtifact = state.moves.some((m) => m.move_type === 'artifact_commit');
    const wrongTotal = state.moves.reduce(
      (sum, m) => sum + (m.outcome?.answered?.wrong ?? 0),
      0,
    );

    if (state.pending_free_question) {
      return this.fallbackPlan(`Answering your question: ${state.pending_free_question.slice(0, 80)}`);
    }

    if (n >= LEARN_MOVE_CAP - 1 && !hasArtifact) {
      return planV1Schema.parse({
        v: 1,
        move: 'artifact_commit',
        params: { max_cards: 4, include_canvas: state.moves.some((m) => m.move_type === 'visual_spawn') },
        reasoning: 'Saving the key ideas from this lesson to your Library.',
        checkpoint_advance: true,
        session_should_end: false,
      });
    }
    if (n >= LEARN_MOVE_CAP - 2 && !hasSynthesis) {
      return planV1Schema.parse({
        v: 1,
        move: 'synthesis',
        params: {},
        reasoning: 'Say it in your own words — one sentence to lock it in.',
        checkpoint_advance: false,
        session_should_end: false,
      });
    }

    if (wrongTotal >= 2 && n > 0) {
      return this.fallbackPlan("Let's shore this up first — it'll make the rest click.");
    }

    if (n === 0) {
      if (state.goal === 'revision' || preferRetrieval) {
        return this.fallbackPlan('Quick warm-up before we dive in.', { preferRetrieval: true });
      }
      return this.fallbackPlan('Starting with a clear explanation.');
    }
    if (n === 1 && state.goal !== 'revision') {
      return planV1Schema.parse({
        v: 1,
        move: 'worked_example',
        params: { problem_statement: ctx.topicTitle, step_count: 4 },
        reasoning: 'Walking through a worked example step by step.',
        checkpoint_advance: false,
        session_should_end: false,
      });
    }
    if (n === 2) {
      return this.fallbackPlan('Checking what stuck.', { preferRetrieval: true });
    }
    if (n === 3 && profile.knowledge_type.includes('procedural')) {
      return planV1Schema.parse({
        v: 1,
        move: 'visual_spawn',
        params: { caption: ctx.topicTitle },
        reasoning: 'Drawing this out so you can see the structure.',
        checkpoint_advance: false,
        session_should_end: false,
      });
    }
    if (n === 4 && profile.misconception_richness !== 'low') {
      return planV1Schema.parse({
        v: 1,
        move: 'socratic_probe',
        params: { chain_id: randomUUID(), turn: 1 },
        reasoning: 'What do you think happens next?',
        checkpoint_advance: false,
        session_should_end: false,
      });
    }
    if (n % 2 === 1) {
      return this.fallbackPlan('Building on what you know.');
    }
    return this.fallbackPlan('Quick check.', { preferRetrieval: true });
  }

  closingPlan(state: SessionStateV1): PlanV1 {
    const hasArtifact = state.moves.some((m) => m.move_type === 'artifact_commit');
    if (!hasArtifact) {
      return planV1Schema.parse({
        v: 1,
        move: 'artifact_commit',
        params: { max_cards: 3 },
        reasoning: 'Wrapping up — save what mattered.',
        checkpoint_advance: true,
        session_should_end: true,
      });
    }
    return planV1Schema.parse({
      v: 1,
      move: 'synthesis',
      params: {},
      reasoning: 'Great work — lesson complete.',
      checkpoint_advance: true,
      session_should_end: true,
    });
  }

  fallbackPlan(reason: string, opts?: { preferRetrieval?: boolean }): PlanV1 {
    const move = opts?.preferRetrieval ? 'retrieval_check' : 'direct_explanation';
    return planV1Schema.parse({
      v: 1,
      move,
      params: move === 'direct_explanation' ? { depth: 'base' } : { question_count: 1 },
      reasoning: reason.slice(0, 400),
      checkpoint_advance: move === 'retrieval_check',
      session_should_end: false,
    });
  }

  forceClosingPlan(): PlanV1 {
    return this.closingPlan({
      moves: [{ seq: 1, move_type: 'synthesis', checkpoint_advance: false, outcome: {} }],
    } as SessionStateV1);
  }

  parsePlan(raw: unknown): PlanV1 {
    return planV1Schema.parse(raw);
  }

  shouldForceClose(state: SessionStateV1): boolean {
    return state.moves.length >= LEARN_MOVE_CAP;
  }

  initialState(input: {
    sessionId: string;
    topicKey: string;
    goal: SessionStateV1['goal'];
    emotionalContext: SessionStateV1['emotional_context'];
    timeBudgetMinutes: number;
  }): SessionStateV1 {
    return sessionStateV1Schema.parse({
      v: 1,
      session_id: input.sessionId,
      topic_key: input.topicKey,
      goal: input.goal,
      emotional_context: input.emotionalContext,
      time_budget_minutes: input.timeBudgetMinutes,
      elapsed_minutes: 0,
      checkpoints: { total: 4, done: 0 },
      moves: [],
      probe_chains: { chains_used: 0 },
      mastery_snapshot: {},
      free_questions_used: 0,
    });
  }

  blockTypeForMove(move: MoveType): string {
    const map: Record<MoveType, string> = {
      direct_explanation: 'explanation',
      worked_example: 'worked_example',
      retrieval_check: 'question_set',
      prereq_pulse: 'question_set',
      visual_spawn: 'canvas_embed',
      synthesis: 'synthesis',
      artifact_commit: 'artifact_commit',
      socratic_probe: 'probe',
    };
    return map[move] ?? 'explanation';
  }

  requiresResponse(move: MoveType): boolean {
    return new Set<MoveType>([
      'retrieval_check',
      'prereq_pulse',
      'socratic_probe',
      'synthesis',
      'artifact_commit',
      'worked_example',
    ]).has(move);
  }
}
