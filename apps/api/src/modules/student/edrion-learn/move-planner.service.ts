import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  planV1Schema,
  sessionStateV1Schema,
  type EndReason,
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
import type { LearnConfig } from './learn-config.service';
import {
  CLOSING_PAIR_SIZE,
  PREREQ_PULSE_QUESTION_COUNT,
  PROBE_MAX_TURNS_PER_CHAIN,
  afterWrongRetrievalCheck,
  clampParams,
  deriveProbeChains,
  evaluateMove,
  hasExpositionMove,
  isClosingPhase,
  moveEntry,
  moveLibraryConstraintLines,
  prereqPulseFailed,
  weakestPrerequisite,
  type LearnBlockType,
  type MoveEvalContext,
} from './move-library';
import { buildPlanSystemPrompt, buildPlanUserPrompt, stateDigest } from './prompts/plan.prompt';
import type { StudentPrincipal } from '../student.types';

export interface PlanContext {
  state: SessionStateV1;
  profile: TopicProfileV1;
  policy: LearnPolicyV1;
  topicTitle: string;
  /**
   * Resolved knobs (hyperspec §4.2 `learn.move_cap`). Supplied by `LearnConfigService`
   * at the call site — the planner never reads raw constants.
   */
  config: Pick<LearnConfig, 'move_cap'>;
  lastOutcome?: Record<string, unknown>;
  hardRules: string[];
  preferRetrieval?: boolean;
}

/** What the server changed and why — kept truthful because hyperspec 2 §6 shows it to the student. */
export interface PlanEnforcement {
  rewritten: boolean;
  requested?: MoveType;
  applied: MoveType;
  code?: string;
  clause?: string;
  reason?: string;
}

export interface PlannedMove {
  plan: PlanV1;
  enforcement: PlanEnforcement;
  /** Set when the session must close after this block; `undefined` otherwise. */
  endReason?: EndReason;
}

@Injectable()
export class MovePlannerService {
  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly callLog: LearnAiCallLogger,
  ) {}

  private evalContext(ctx: PlanContext, plannerJustified = false): MoveEvalContext {
    return {
      state: ctx.state,
      profile: ctx.profile,
      policy: ctx.policy,
      config: ctx.config,
      plannerJustified,
    };
  }

  /**
   * Runs the move library's entry predicates and rewrites an illegal move to its
   * declared fallback. This is THE enforcement point: the prompt is advisory.
   */
  enforcePlan(plan: PlanV1, ctx: PlanContext): PlannedMove {
    let working = planV1Schema.parse(plan);
    if (ctx.state.pending_free_question) {
      working = { ...working, checkpoint_advance: false };
    }
    const last = ctx.state.moves[ctx.state.moves.length - 1];
    if (
      !ctx.state.pending_free_question &&
      last?.move_type === 'direct_explanation' &&
      working.move === 'direct_explanation'
    ) {
      const candidates: MoveType[] = ['retrieval_check', 'worked_example', 'visual_spawn', 'socratic_probe'];
      for (const move of candidates) {
        const decision = evaluateMove(moveEntry(move), this.evalContext(ctx));
        if (decision.legal) {
          working = planV1Schema.parse({
            v: 1,
            move,
            params: clampParams(move, this.defaultParamsFor(move, ctx)),
            reasoning: `Building on the explanation with a ${move.replace(/_/g, ' ')}.`,
            checkpoint_advance: move === 'retrieval_check' || moveEntry(move).counts_toward_checkpoints,
            session_should_end: false,
          });
          break;
        }
      }
    }
    const entry = moveEntry(working.move);
    const justified = working.move === 'visual_spawn' && working.reasoning.trim().length >= 20;
    const decision = evaluateMove(entry, this.evalContext(ctx, justified));

    if (decision.legal) {
      const applied = planV1Schema.parse({
        ...working,
        params: clampParams(working.move, working.params ?? {}),
        checkpoint_advance: working.checkpoint_advance && entry.counts_toward_checkpoints,
      });
      return { plan: applied, enforcement: { rewritten: false, applied: working.move } };
    }

    const target = moveEntry(decision.rewrite_to);
    const applied = planV1Schema.parse({
      v: 1,
      move: target.move,
      params: clampParams(target.move, this.defaultParamsFor(target.move, ctx)),
      reasoning: this.rewriteReasoning(decision.move, target.move, decision.reason),
      checkpoint_advance: false,
      session_should_end: false,
    });
    return {
      plan: applied,
      enforcement: {
        rewritten: true,
        requested: decision.move,
        applied: target.move,
        code: decision.code,
        clause: decision.clause,
        reason: decision.reason,
      },
    };
  }

  /** Back-compat surface: returns only the corrected move key. */
  enforceHardRules(move: MoveType, ctx: PlanContext): MoveType {
    const entry = moveEntry(move);
    const decision = evaluateMove(entry, this.evalContext(ctx));
    return decision.legal ? move : decision.rewrite_to;
  }

  private rewriteReasoning(requested: MoveType, applied: MoveType, reason: string): string {
    return `Switched from ${requested.replace(/_/g, ' ')} to ${applied.replace(
      /_/g,
      ' ',
    )}: ${reason}.`.slice(0, 400);
  }

  private defaultParamsFor(move: MoveType, ctx: PlanContext): Record<string, unknown> {
    switch (move) {
      case 'direct_explanation':
        return { depth: 'base' };
      case 'worked_example':
        return { problem_statement: ctx.topicTitle, step_count: 4 };
      case 'retrieval_check':
        return { question_count: 1 };
      case 'prereq_pulse':
        return {
          question_count: PREREQ_PULSE_QUESTION_COUNT,
          atom_ids: ctx.profile.prerequisites
            .map((p) => p.atom_id)
            .filter((id): id is string => Boolean(id))
            .slice(0, PREREQ_PULSE_QUESTION_COUNT),
        };
      case 'visual_spawn':
        return { caption: ctx.topicTitle };
      case 'artifact_commit':
        return {
          max_cards: 4,
          include_canvas: ctx.state.moves.some((m) => m.move_type === 'visual_spawn'),
        };
      case 'socratic_probe': {
        const chains = deriveProbeChains(ctx.state);
        return {
          chain_id: chains.open ? (ctx.state.probe_chains.open_chain_id ?? randomUUID()) : randomUUID(),
          turn: chains.open ? Math.min(chains.turn + 1, PROBE_MAX_TURNS_PER_CHAIN) : 1,
        };
      }
      default:
        return {};
    }
  }

  async planMove(
    principal: StudentPrincipal,
    ctx: PlanContext,
    opts?: { sessionId?: string; speculative?: boolean },
  ): Promise<PlanV1> {
    return (await this.planNextMove(principal, ctx, opts)).plan;
  }

  /**
   * Full planning pipeline. Order matters:
   *  1. move cap → forced closing pair (§4.2)
   *  2. forced prereq remediation (§3.4) — service-forced, not planner-chosen
   *  3. planner (AI or deterministic) → server-side enforcement → param clamp
   *  4. project the resulting move into `state.probe_chains` so the probe caps advance
   */
  async planNextMove(
    principal: StudentPrincipal,
    ctx: PlanContext,
    opts?: { sessionId?: string; speculative?: boolean },
  ): Promise<PlannedMove> {
    if (this.shouldForceClose(ctx.state, ctx.config)) {
      const plan = this.closingPlan(ctx.state);
      const result: PlannedMove = {
        plan,
        enforcement: {
          rewritten: true,
          applied: plan.move,
          code: 'move_cap',
          clause: '§4.2',
          reason: `session reached the ${ctx.config.move_cap}-move cap`,
        },
        endReason: 'move_cap',
      };
      this.applyPlanToState(ctx.state, plan);
      return result;
    }

    const remediation = this.forcedPrereqRemediation(ctx);
    if (remediation) {
      this.applyPlanToState(ctx.state, remediation.plan);
      return remediation;
    }

    const deterministic = this.enforcePlan(this.deterministicPlan(ctx), ctx);
    if (!this.ai.available) {
      this.applyPlanToState(ctx.state, deterministic.plan);
      return deterministic;
    }

    const started = Date.now();
    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'learn_plan',
        tier: 'small',
        system: buildPlanSystemPrompt({ moveCap: ctx.config.move_cap }),
        user: buildPlanUserPrompt({
          topicTitle: ctx.topicTitle,
          profile: ctx.profile,
          policy: ctx.policy,
          stateDigest: stateDigest(ctx.state),
          hardRules: [...moveLibraryConstraintLines(), ...ctx.hardRules],
          preferRetrieval: ctx.preferRetrieval ?? false,
        }),
        schema: planV1Schema,
        schemaName: 'PlanV1',
        maxOutputTokens: 400,
      });
      const enforced = this.enforcePlan(result, ctx);
      await this.callLog.log(principal, 'learn_plan', usage, {
        sessionId: opts?.sessionId,
        promptVersion: PROMPT_VERSION,
        speculative: opts?.speculative ?? false,
        outcome: enforced.enforcement.rewritten
          ? `constraint_rewrite:${enforced.enforcement.code}:${enforced.enforcement.requested}->${enforced.enforcement.applied}`
          : 'ok',
      });
      this.applyPlanToState(ctx.state, enforced.plan);
      return enforced;
    } catch {
      await this.callLog.log(
        principal,
        'learn_plan',
        { inputTokens: 0, outputTokens: 0, model: 'fallback', durationMs: Date.now() - started },
        {
          sessionId: opts?.sessionId,
          error: 'plan_failed',
          degraded: true,
          speculative: opts?.speculative ?? false,
          outcome: 'degraded',
        },
      );
      this.applyPlanToState(ctx.state, deterministic.plan);
      return deterministic;
    }
  }

  /**
   * §3.4 — both prereq questions wrong forces a remediation `direct_explanation`
   * on the weakest prerequisite AND appends one checkpoint. Mutates
   * `state.checkpoints.total`; the caller persists `state` after every move.
   */
  forcedPrereqRemediation(ctx: PlanContext): PlannedMove | null {
    if (!prereqPulseFailed(ctx.state)) return null;
    const weakest = weakestPrerequisite(ctx.profile, ctx.state);
    const anchor = weakest?.label ?? ctx.topicTitle;
    ctx.state.checkpoints.total += 1;
    const plan = planV1Schema.parse({
      v: 1,
      move: 'direct_explanation',
      params: { depth: 'base', anchor, remediation: true },
      reasoning: `Both prerequisite checks missed, so we're rebuilding "${anchor}" before moving on.`.slice(
        0,
        400,
      ),
      checkpoint_advance: false,
      session_should_end: false,
    });
    return {
      plan,
      enforcement: {
        rewritten: true,
        applied: 'direct_explanation',
        code: 'prereq_pulse_failed',
        clause: '§3.4',
        reason: `both prereq questions wrong; remediating "${anchor}" and adding a checkpoint`,
      },
    };
  }

  /**
   * Projects a planned move into the mutable session state so the probe caps can
   * actually fire. `probe_chains` was previously initialised to zero and never
   * written by anything, which made both probe caps dead guards. The counters are
   * DERIVED from the move digest (a chain is a maximal run of consecutive probes,
   * broken by any other move, by `outcome.probe_escaped`, or by the turn cap), so
   * they stay correct even if a caller forgets to call this.
   */
  applyPlanToState(state: SessionStateV1, plan: PlanV1): SessionStateV1 {
    const projected: SessionStateV1['moves'] = [
      ...state.moves,
      { seq: state.moves.length + 1, move_type: plan.move, checkpoint_advance: false, outcome: {} },
    ];
    const chains = deriveProbeChains({ ...state, moves: projected });
    state.probe_chains = {
      open_chain_id: chains.open
        ? ((plan.params?.chain_id as string | undefined) ??
          state.probe_chains.open_chain_id ??
          null)
        : null,
      turn: chains.open ? (Math.min(chains.turn, PROBE_MAX_TURNS_PER_CHAIN) as 1 | 2) : null,
      chains_used: chains.chains_used,
    };
    return state;
  }

  /**
   * §3.8 — the visible "Just explain it" escape. Ends the open chain and records
   * `probe_escaped=true` on the move digest, which `deriveProbeChains` reads.
   */
  recordProbeEscape(state: SessionStateV1): SessionStateV1 {
    const last = state.moves[state.moves.length - 1];
    if (last && last.move_type === 'socratic_probe') {
      last.outcome = { ...last.outcome, probe_escaped: true };
    }
    const chains = deriveProbeChains(state);
    state.probe_chains = {
      open_chain_id: null,
      turn: null,
      chains_used: chains.chains_used,
    };
    return state;
  }

  deterministicPlan(ctx: PlanContext): PlanV1 {
    const { state, profile, config, preferRetrieval } = ctx;
    const n = state.moves.length;
    const hasSynthesis = state.moves.some((m) => m.move_type === 'synthesis');
    const hasArtifact = state.moves.some((m) => m.move_type === 'artifact_commit');
    const wrongTotal = state.moves.reduce((sum, m) => sum + (m.outcome?.answered?.wrong ?? 0), 0);

    if (state.pending_free_question) {
      return this.fallbackPlan(
        `Answering your question: ${state.pending_free_question.slice(0, 80)}`,
      );
    }

    // §4.2 closing pair.
    if (n >= config.move_cap - 1 && !hasArtifact) {
      return planV1Schema.parse({
        v: 1,
        move: 'artifact_commit',
        params: {
          max_cards: 4,
          include_canvas: state.moves.some((m) => m.move_type === 'visual_spawn'),
        },
        reasoning: 'Saving the key ideas from this lesson to your Library.',
        checkpoint_advance: true,
        session_should_end: false,
      });
    }
    if (n >= config.move_cap - CLOSING_PAIR_SIZE && !hasSynthesis) {
      return planV1Schema.parse({
        v: 1,
        move: 'synthesis',
        params: {},
        reasoning: 'Say it in your own words — one sentence to lock it in.',
        checkpoint_advance: false,
        session_should_end: false,
      });
    }

    // §3.7 second legal entry: straight after a retrieval_check with ≥1 wrong.
    if (afterWrongRetrievalCheck(state) && !hasArtifact) {
      return planV1Schema.parse({
        v: 1,
        move: 'artifact_commit',
        params: { max_cards: 3, include_canvas: false },
        reasoning: 'That one slipped — let’s turn it into a card you’ll see again.',
        checkpoint_advance: true,
        session_should_end: false,
      });
    }

    if (wrongTotal >= 2 && n > 0) {
      return this.fallbackPlan("Let's shore this up first — it'll make the rest click.");
    }

    // §3.4 prereq pulse leads, when the library says it is legal.
    if (
      n === 0 &&
      evaluateMove(moveEntry('prereq_pulse'), this.evalContext(ctx)).legal &&
      profile.prerequisites.length > 0
    ) {
      return planV1Schema.parse({
        v: 1,
        move: 'prereq_pulse',
        params: this.defaultParamsFor('prereq_pulse', ctx),
        reasoning: 'Two quick checks on what this builds on.',
        checkpoint_advance: true,
        session_should_end: false,
      });
    }

    if (n === 0) {
      if (state.goal === 'revision' || preferRetrieval) {
        return this.fallbackPlan('Quick warm-up before we dive in.', { preferRetrieval: true });
      }
      return this.fallbackPlan('Starting with a clear explanation.');
    }

    // §3.2 worked_example requires a procedural/skill topic — asked of the library, not hardcoded.
    if (
      n === 1 &&
      state.goal !== 'revision' &&
      evaluateMove(moveEntry('worked_example'), this.evalContext(ctx)).legal
    ) {
      return planV1Schema.parse({
        v: 1,
        move: 'worked_example',
        params: { problem_statement: ctx.topicTitle, step_count: 4 },
        reasoning: 'Walking through a worked example step by step.',
        checkpoint_advance: false,
        session_should_end: false,
      });
    }
    if (n === 2 && hasExpositionMove(state)) {
      return this.fallbackPlan('Checking what stuck.', { preferRetrieval: true });
    }
    // §3.5 gates on native_representation (the old code read knowledge_type — wrong field).
    if (n === 3 && evaluateMove(moveEntry('visual_spawn'), this.evalContext(ctx)).legal) {
      return planV1Schema.parse({
        v: 1,
        move: 'visual_spawn',
        params: { caption: ctx.topicTitle },
        reasoning: 'Drawing this out so you can see the structure.',
        checkpoint_advance: false,
        session_should_end: false,
      });
    }
    if (
      n === 4 &&
      profile.misconception_richness !== 'low' &&
      evaluateMove(moveEntry('socratic_probe'), this.evalContext(ctx)).legal
    ) {
      return planV1Schema.parse({
        v: 1,
        move: 'socratic_probe',
        params: this.defaultParamsFor('socratic_probe', ctx),
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

  shouldForceClose(state: SessionStateV1, config: Pick<LearnConfig, 'move_cap'>): boolean {
    return state.moves.length >= config.move_cap;
  }

  /** §4.2 — hitting the cap closes the session with `end_reason='move_cap'`. */
  endReasonFor(state: SessionStateV1, config: Pick<LearnConfig, 'move_cap'>): EndReason | undefined {
    if (this.shouldForceClose(state, config)) return 'move_cap';
    return undefined;
  }

  isClosingPhase(state: SessionStateV1, config: Pick<LearnConfig, 'move_cap'>): boolean {
    return isClosingPhase(state, config.move_cap);
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
      probe_chains: { chains_used: 0, open_chain_id: null, turn: null },
      mastery_snapshot: {},
      free_questions_used: 0,
    });
  }

  /** Move → block_type now comes from the move library entry, not a private map. */
  blockTypeForMove(move: MoveType): LearnBlockType {
    return moveEntry(move).block_type;
  }

  requiresResponse(move: MoveType): boolean {
    return moveEntry(move).requires_response;
  }

  countsTowardCheckpoints(move: MoveType): boolean {
    return moveEntry(move).counts_toward_checkpoints;
  }
}
