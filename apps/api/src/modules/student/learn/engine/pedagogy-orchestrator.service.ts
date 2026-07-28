import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  answerBlockInputSchema,
  askSessionInputSchema,
  blockV1Schema,
  commitArtifactsInputSchema,
  createLearnSessionInputSchema,
  endSessionInputSchema,
  interactBlockInputSchema,
  isValidOrchestratorTransition,
  learnPolicyV1Schema,
  sessionContextV1Schema,
  sessionStateV1Schema,
  sessionStatusChangedPayloadSchema,
  type BlockV1,
  type EndReason,
  type LearnSessionV1Dto,
  type OrchestratorStatus,
  type PlanV1,
  type SessionGoal,
  type SessionStateV1,
} from '@edrion/schemas';
import type { StudentPrincipal } from '../../student.types';
import { FeatureControlsService } from '../../../feature-controls/feature-controls.service';
import {
  LEARN_PAUSED_ABANDON_HOURS,
  LEARN_TIME_EXTENSION_MINUTES,
  LEARN_TIME_WRAP_MINUTES_BEFORE_END,
} from './constants';
import { LearnSessionsRepository } from './learn-sessions.repository';
import { LearnConfigService, type LearnConfigContext } from './learn-config.service';
import { StudentTutorPolicyService } from './student-tutor-policy.service';
import { TopicProfileService } from './profile.service';
import { MovePlannerService } from './move-planner.service';
import { BlockRendererService } from './block-renderer.service';
import { EvidenceService } from './evidence.service';
import { MasteryService } from './mastery.service';
import { CanvasGraphService } from './canvas-graph.service';
import { InstitutionalContextService } from './institutional-context.service';
import { GradingService } from './grading.service';
import { SessionCompletionService } from './session-completion.service';
import { ArtifactCommitService } from './artifact-commit.service';
import { TopicResolutionService } from './topic-resolution.service';
import { LearnerModelService } from './learner-model.service';

/**
 * Hyperspec §3 fatigue rule threshold. Not one of the 9 tenant-tunable knobs, so
 * it stays a local constant rather than a `LearnConfigService` entry.
 */
const LEARN_FATIGUE_MIN_ELAPSED_MINUTES = 15;

@Injectable()
export class PedagogyOrchestratorService {
  private readonly logger = new Logger(PedagogyOrchestratorService.name);
  constructor(
    private readonly repo: LearnSessionsRepository,
    private readonly policy: StudentTutorPolicyService,
    private readonly profiles: TopicProfileService,
    private readonly planner: MovePlannerService,
    private readonly renderer: BlockRendererService,
    private readonly evidence: EvidenceService,
    private readonly mastery: MasteryService,
    private readonly canvas: CanvasGraphService,
    private readonly features: FeatureControlsService,
    private readonly institutional: InstitutionalContextService,
    private readonly grading: GradingService,
    private readonly completion: SessionCompletionService,
    private readonly artifacts: ArtifactCommitService,
    private readonly config: LearnConfigService,
    private readonly topics: TopicResolutionService,
    private readonly learnerModel: LearnerModelService,
  ) {}

  private readonly speculativePlans = new Map<
    string,
    { plan: PlanV1; basedOnMoveCount: number; generatedAt: number }
  >();

  /** One plan+render at a time per session — concurrent SSE reconnects must not double-plan. */
  private readonly planRenderInFlight = new Map<string, Promise<void>>();

  private configCtx(principal: StudentPrincipal): LearnConfigContext {
    return principal.kind === 'institutional'
      ? {
          institutionId: principal.institutionId,
          campusId: principal.campusId ?? undefined,
          institutionUserId: principal.institutionUserId,
        }
      : { independentUserId: principal.independentUserId };
  }

  /** Title/key for a session that may have a null topic_id (DEC-14 ad-hoc). */
  private async sessionTopicMeta(session: {
    topicId: string | null;
    state: unknown;
    sessionContext: unknown;
  }): Promise<{ learnTopicId: string | null; topicKey: string; title: string; subjectLabel: string }> {
    const state = sessionStateV1Schema.safeParse(session.state ?? {});
    const ctx = sessionContextV1Schema.safeParse(session.sessionContext ?? {});
    if (session.topicId) {
      const topic = await this.repo.getTopic(session.topicId);
      if (topic) {
        return {
          learnTopicId: topic.id,
          topicKey: topic.topicKey,
          title: topic.title,
          subjectLabel: topic.subjectLabel,
        };
      }
    }
    return {
      learnTopicId: null,
      topicKey: state.success ? state.data.topic_key : 'free:unknown',
      title: ctx.success && ctx.data.topic_title ? ctx.data.topic_title : 'Untitled lesson',
      subjectLabel: ctx.success && ctx.data.subject_label ? ctx.data.subject_label : 'General',
    };
  }

  // ---------------------------------------------------------------------------
  // Wall-clock accounting (§5)
  // ---------------------------------------------------------------------------

  /**
   * Real elapsed minutes = (now − started_at) − every paused interval.
   *
   * A paused session must not burn the student's budget, so both the CLOSED
   * pause intervals (`state.paused_ms_total`, accumulated on resume) and the
   * currently OPEN one (`learn_sessions.paused_at`) are subtracted. This is the
   * single source of truth for the fatigue rule, the wrap-up flag, the forced
   * close at budget and the planner digest — all of which read
   * `state.elapsed_minutes`.
   */
  private computeElapsedMinutes(
    session: { startedAt: Date; pausedAt: Date | null },
    state: SessionStateV1,
    now: Date = new Date(),
  ): number {
    const openPauseMs = session.pausedAt
      ? Math.max(0, now.getTime() - session.pausedAt.getTime())
      : 0;
    const grossMs = now.getTime() - session.startedAt.getTime();
    const netMs = grossMs - (state.paused_ms_total ?? 0) - openPauseMs;
    return Math.max(0, Math.floor(netMs / 60_000));
  }

  /**
   * Recompute elapsed and mirror it onto the row so `elapsed_minutes` (DTO,
   * reports) and `state.elapsed_minutes` (planner digest) never diverge.
   * Mutates `state` in place and returns the value.
   */
  private async syncElapsed(
    session: { id: string; startedAt: Date; pausedAt: Date | null },
    state: SessionStateV1,
  ): Promise<number> {
    const elapsed = this.computeElapsedMinutes(session, state);
    if (state.elapsed_minutes !== elapsed) {
      state.elapsed_minutes = elapsed;
      await this.repo.updateSession(session.id, { state, elapsedMinutes: elapsed });
    }
    return elapsed;
  }

  // ---------------------------------------------------------------------------
  // State machine (§5)
  // ---------------------------------------------------------------------------

  /**
   * The ONLY writer of `orchestrator_status`. Rejects illegal edges in the
   * application layer (the column is still free `text` with no DB CHECK), and
   * writes exactly one audit event in the same transaction as the UPDATE.
   * Returns false when a concurrent request already moved the session — the
   * caller no-ops rather than writing a second event.
   */
  private async transition(
    sessionId: string,
    from: OrchestratorStatus,
    to: OrchestratorStatus,
    reason: string,
    opts?: {
      patch?: Parameters<LearnSessionsRepository['updateSession']>[1];
      endReason?: EndReason;
      elapsedMinutes?: number;
    },
  ): Promise<boolean> {
    if (from === to) return true;
    if (!isValidOrchestratorTransition(from, to)) {
      throw new ConflictException({
        code: 'ILLEGAL_SESSION_TRANSITION',
        message: `Cannot move a lesson from ${from} to ${to}.`,
      });
    }
    const result = await this.repo.transitionSessionStatus({
      sessionId,
      from: [from],
      to,
      eventType: to === 'closed' ? 'session_closed' : 'status_changed',
      payload: sessionStatusChangedPayloadSchema.parse({
        from,
        to,
        reason,
        end_reason: opts?.endReason,
        elapsed_minutes: opts?.elapsedMinutes,
      }),
      patch: opts?.patch,
    });
    if (!result) {
      this.logger.debug(`transition ${from}→${to} lost the race for session ${sessionId}`);
      return false;
    }
    return true;
  }

  private status(session: { orchestratorStatus: string | null }): OrchestratorStatus {
    // Legacy fixed-sequence rows carry a NULL orchestrator_status; treat them as
    // `active` so the machine has a defined starting edge.
    return (session.orchestratorStatus ?? 'active') as OrchestratorStatus;
  }

  /**
   * §5: `paused --24h--> closed(abandoned)`. Evaluated lazily on every read of a
   * paused session (no sweep job), which is enough because a paused session is
   * only reachable through its owner's requests or a new-session attempt.
   * Returns true when the session was closed.
   */
  private async autoCloseIfAbandoned(
    principal: StudentPrincipal,
    session: Awaited<ReturnType<LearnSessionsRepository['getSession']>>,
  ): Promise<boolean> {
    if (!session || this.status(session) !== 'paused' || !session.pausedAt) return false;
    const pausedForHours = (Date.now() - session.pausedAt.getTime()) / 3_600_000;
    if (pausedForHours < LEARN_PAUSED_ABANDON_HOURS) return false;
    await this.closeSession(principal, session.id, 'abandoned');
    return true;
  }
  private orchestratorDisabled() {
    return new ForbiddenException({
      code: 'LEARN_ORCHESTRATOR_DISABLED',
      message: 'Edrion Learn is unavailable right now. Try a quick Petros answer instead.',
    });
  }
  async assertOrchestratorEnabled(principal: StudentPrincipal) {
    // Hard gate: this must fail CLOSED. A flag-resolution failure is not a grant.
    let enabled: boolean;
    try {
      const resolution = await this.features.resolveByKey(
        'learn.orchestrator',
        principal.kind === 'institutional'
          ? {
              institutionId: principal.institutionId,
              campusId: principal.campusId ?? undefined,
              institutionUserId: principal.institutionUserId,
            }
          : { independentUserId: principal.independentUserId },
      );
      enabled = Boolean(resolution.value);
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
      this.logger.error(
        `learn.orchestrator flag resolution failed; denying access: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw this.orchestratorDisabled();
    }
    if (!enabled) throw this.orchestratorDisabled();
  }
  async createSession(
    principal: StudentPrincipal,
    raw: unknown,
  ): Promise<{ session: LearnSessionV1Dto; streamUrl: string }> {
    await this.assertOrchestratorEnabled(principal);
    const input = createLearnSessionInputSchema.parse(raw);
    const cfg = await this.config.getAll(this.configCtx(principal));
    const daily = await this.repo.countSessionsToday(principal);
    if (daily >= cfg.daily_session_cap_per_user) {
      throw new HttpException(
        { code: 'DAILY_SESSION_CAP', message: "You've had a full day of lessons — come back tomorrow." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    let active = await this.repo.findActiveOrchestratorSession(principal);
    // A session paused for 24h is abandoned, not active — reclaim it here so the
    // student is never permanently locked out by a session they walked away from.
    if (active && (await this.autoCloseIfAbandoned(principal, active))) {
      active = await this.repo.findActiveOrchestratorSession(principal);
    }
    if (active) {
      throw new ConflictException({
        code: 'SESSION_ACTIVE',
        activeSessionId: active.id,
        message: 'You already have a lesson in progress.',
      });
    }
    const policySnapshot = await this.policy.resolve(principal);
    if (policySnapshot.effective_mode === 'disabled') {
      throw new ForbiddenException({
        code: 'POLICY_DISABLED',
        message: 'Learning sessions are paused by your institution.',
      });
    }
    const institutionalCtx = await this.institutional.resolve(principal, input);
    // DEC-14: resolve canonical topic keys; ad-hoc topics keep learn_topic_id null.
    const resolved = await this.topics.resolve(principal, {
      ...input,
      topicKey: institutionalCtx.topicKey ?? input.topicKey,
    });
    const topicKey = resolved.topicKey;
    const topicTitle = institutionalCtx.topicTitle ?? resolved.title;
    const subjectLabel = institutionalCtx.subjectLabel ?? resolved.subjectLabel;
    const learnTopicId = resolved.learnTopicId;
    const { profile, profileId } = await this.profiles.resolve(principal, {
      learnTopicId,
      topicKey,
      title: topicTitle,
      syllabusContext: resolved.syllabusContext,
      materialOutline: resolved.materialOutline,
      materialFirstChunk: resolved.materialFirstChunk,
    });
    const timeBudget =
      institutionalCtx.timeBudgetMinutes ?? input.timeBudgetMinutes ?? cfg.default_session_minutes;
    const goal: SessionGoal = institutionalCtx.goal ?? input.goal ?? 'acquisition';
    const emotionalContext = institutionalCtx.emotionalContext ?? input.emotionalContext ?? 'neutral';
    const owner =
      principal.kind === 'institutional'
        ? { institutionId: principal.institutionId, studentId: principal.studentId, independentUserId: null }
        : { institutionId: null, studentId: null, independentUserId: principal.independentUserId };
    const sessionContext = sessionContextV1Schema.parse({
      v: 1,
      time_budget_minutes: timeBudget,
      emotional_context: emotionalContext,
      policy_snapshot: policySnapshot,
      grounding_knowledge_item_id: input.knowledgeItemId,
      subject_label: subjectLabel,
      topic_title: topicTitle,
      ...institutionalCtx.sessionContextExtras,
      ...resolved.sessionContextExtras,
    });
    const entryRef =
      institutionalCtx.entryRef ??
      resolved.entryRef ??
      (input.knowledgeItemId ? { material_id: input.knowledgeItemId } : {});
    const resolvedEntryPoint =
      institutionalCtx.entryPoint ?? resolved.entryPoint ?? input.entryPoint;
    const session = await this.repo.createSession({
      ...owner,
      topicId: learnTopicId,
      topicProfileId: profileId,
      pathItemId: input.pathItemId ?? null,
      groundingKnowledgeItemId: input.knowledgeItemId ?? null,
      entryPoint: resolvedEntryPoint,
      entryRef,
      status: 'active',
      orchestratorStatus: 'created',
      state: {},
      sessionContext,
      policySnapshot,
      // `spine` / `session_plan` are Plan-02 fixed-sequence concepts the orchestrator
      // does not model. Left NULL rather than stubbed (migration 0103 makes them nullable).
      timeBudgetMinutes: timeBudget,
      evidence: [],
    });
    const state = this.planner.initialState({
      sessionId: session.id,
      topicKey,
      goal,
      emotionalContext,
      timeBudgetMinutes: timeBudget,
    });
    state.mastery_snapshot = await this.mastery.snapshot(principal, profile.prerequisites.map((p) => p.atom_id).filter(Boolean) as string[]);
    // §5: the session stays `created` until the FIRST RENDER START. Flipping to
    // `active` here would make `created` unobservable.
    await this.repo.updateSession(session.id, { state });
    // Sequence is allocated atomically from learn_sessions.last_event_seq so the
    // committed event and the column can never diverge.
    await this.repo.appendSessionEvent(session.id, 'session_created', { entry_point: resolvedEntryPoint });
    return {
      session: await this.toDto(principal, session.id),
      streamUrl: `/student/learn/sessions/${session.id}/stream`,
    };
  }
  async getSession(principal: StudentPrincipal, sessionId: string): Promise<LearnSessionV1Dto> {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session not found.' });
    await this.autoCloseIfAbandoned(principal, session);
    return this.toDto(principal, sessionId);
  }
  async stream(
    principal: StudentPrincipal,
    sessionId: string,
    lastSeq: number,
    emit: (event: Record<string, unknown>) => void,
  ) {
    await this.assertOrchestratorEnabled(principal);
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    const abandoned = await this.autoCloseIfAbandoned(principal, session);
    const events = await this.repo.listSessionEventsSince(sessionId, lastSeq);
    for (const ev of events) {
      emit({ type: 'replay', seq: ev.seq, eventType: ev.eventType, payload: ev.payload });
    }
    // F5: also re-emit persisted blocks so a reconnect recovers content, not just events.
    const blocks = await this.repo.listBlocks(sessionId);
    for (const b of blocks) {
      if ((b.streamSeq ?? 0) <= lastSeq) continue;
      const parsed = blockV1Schema.safeParse(b.content);
      if (!parsed.success) continue;
      emit({
        type: 'block',
        seq: b.streamSeq ?? b.sequence,
        block: {
          id: b.id,
          streamSeq: b.streamSeq,
          moveType: b.moveType,
          block: this.redactServerOnly(parsed.data),
          reasoning: b.reasoning,
          degraded: b.degraded ?? false,
          renderStatus: b.renderStatus,
          interactionState: (b.interactionState as Record<string, unknown>) ?? {},
        },
      });
    }
    const status = this.status(session);
    if (abandoned || status === 'closed' || status === 'paused') return;
    if (status === 'awaiting_response') return;
    if (status === 'closing') {
      await this.runClosingSequence(principal, sessionId, 'goal_met', emit);
      return;
    }
    const last = blocks[blocks.length - 1];
    const lastMove = (last?.moveType ?? 'direct_explanation') as import('@edrion/schemas').MoveType;
    const shouldPlan =
      (status === 'active' || status === 'created') &&
      (!blocks.length || (last?.renderStatus === 'complete' && !this.planner.requiresResponse(lastMove)));
    if (shouldPlan) {
      await this.planAndRenderNextBlock(principal, sessionId, emit);
    }
  }

  async planAndRenderNextBlock(
    principal: StudentPrincipal,
    sessionId: string,
    emit?: (event: Record<string, unknown>) => void,
  ): Promise<void> {
    const existing = this.planRenderInFlight.get(sessionId);
    if (existing) {
      await existing;
      return;
    }
    const work = this.executePlanAndRenderNextBlock(principal, sessionId, emit);
    this.planRenderInFlight.set(sessionId, work);
    try {
      await work;
    } finally {
      if (this.planRenderInFlight.get(sessionId) === work) {
        this.planRenderInFlight.delete(sessionId);
      }
    }
  }

  private async executePlanAndRenderNextBlock(
    principal: StudentPrincipal,
    sessionId: string,
    emit?: (event: Record<string, unknown>) => void,
  ): Promise<void> {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) return;
    const status = this.status(session);
    // `closing` runs the forced pair through runClosingSequence and nothing else
    // (§5: no planner calls in `closing` except the pair). `paused` burns no budget.
    if (status === 'closed' || status === 'closing' || status === 'paused') return;
    if (await this.autoCloseIfAbandoned(principal, session)) return;
    const policySnapshot = await this.policy.resolve(principal);
    if (policySnapshot.effective_mode === 'disabled') {
      await this.closeSession(principal, sessionId, 'policy_kill');
      return;
    }
    const cfg = await this.config.getAll(this.configCtx(principal));
    const state = sessionStateV1Schema.parse(session.state ?? {});
    const elapsed = await this.syncElapsed(session, state);
    const budget = state.time_budget_minutes;

    // §5 budget rules. Both branches are live now that elapsed actually advances.
    if (elapsed >= budget) {
      await this.runClosingSequence(principal, sessionId, 'time_budget', emit);
      return;
    }
    if (elapsed >= budget - LEARN_TIME_WRAP_MINUTES_BEFORE_END) {
      if (!state.wrap_up) {
        state.wrap_up = true;
        await this.repo.updateSession(sessionId, { state });
      }
      // The "+5 minutes" offer — the only thing that makes `notice_action`
      // reachable — is shown once, when the wrap-up window opens.
      if (!state.budget_notice_sent && !state.budget_extended) {
        await this.emitSystemNotice(
          principal,
          sessionId,
          {
            kind: 'budget',
            body_md: `You're close to the end of your ${budget}-minute lesson. Want a little longer?`,
            actions: [
              { key: 'extend_time', label: '+5 minutes' },
              { key: 'wrap_up', label: 'Wrap up' },
            ],
          },
          emit,
        );
        state.budget_notice_sent = true;
        await this.repo.updateSession(sessionId, { state });
        return;
      }
    }

    // §5: `created → active` on FIRST RENDER START.
    if (status === 'created') {
      if (!(await this.transition(sessionId, 'created', 'active', 'first_render_start'))) return;
    }

    const topicMeta = await this.sessionTopicMeta(session);
    const { profile } = await this.profiles.resolve(principal, {
      learnTopicId: topicMeta.learnTopicId,
      topicKey: topicMeta.topicKey,
      title: topicMeta.title,
    });
    const sessionCtx = sessionContextV1Schema.safeParse(session.sessionContext ?? {});
    const preferRetrieval =
      (sessionCtx.success && sessionCtx.data.active_assignment_overlap) ||
      policySnapshot.answer_directness === 'never_direct_on_assignment' ||
      policySnapshot.answer_directness === 'guided';
    const hadFreeQuestion = Boolean(state.pending_free_question);
    const planCtx = {
      state,
      profile,
      policy: policySnapshot,
      topicTitle: topicMeta.title,
      config: cfg,
      hardRules: state.wrap_up
        ? ['Time is almost up — steer toward closing and keep this short.']
        : [],
      preferRetrieval: Boolean(preferRetrieval),
    };
    // F3: consume speculative N+1 when still valid for this move count; else re-plan.
    const speculative = this.speculativePlans.get(sessionId);
    this.speculativePlans.delete(sessionId);
    const speculativeFresh =
      speculative &&
      speculative.basedOnMoveCount === state.moves.length &&
      Date.now() - speculative.generatedAt < 90_000;
    let plan: PlanV1;
    if (speculativeFresh && speculative) {
      const planned = this.planner.enforcePlan(speculative.plan, planCtx);
      plan = planned.plan;
      this.planner.applyPlanToState(state, plan);
    } else {
      plan = (await this.planner.planNextMove(principal, planCtx, { sessionId })).plan;
    }
    if (hadFreeQuestion) {
      state.pending_free_question = null;
    }
    if (plan.session_should_end || state.moves.length >= cfg.move_cap) {
      await this.runClosingSequence(
        principal,
        sessionId,
        state.moves.length >= cfg.move_cap ? 'move_cap' : 'goal_met',
        emit,
      );
      return;
    }
    await this.renderPlannedBlock(principal, sessionId, state, plan, topicMeta.title, emit);
  }

  /**
   * Renders one planned block and advances the state machine for it.
   * Extracted from `planAndRenderNextBlock` so the forced closing pair can reuse
   * the exact same render path without going near the planner.
   */
  private async renderPlannedBlock(
    principal: StudentPrincipal,
    sessionId: string,
    state: SessionStateV1,
    plan: PlanV1,
    topicTitle: string,
    emit?: (event: Record<string, unknown>) => void,
    opts?: { closing?: boolean },
  ) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) return;
    const freshState = sessionStateV1Schema.parse(session.state ?? {});
    const expectedMoveCount = state.moves.length;
    if (freshState.moves.length !== expectedMoveCount) {
      this.logger.debug(
        `skip render for ${sessionId}: move digest advanced (${expectedMoveCount}→${freshState.moves.length})`,
      );
      return;
    }
    state = freshState;
    const sessionVersion = session.version;
    const priorBlocks = await this.repo.listBlocks(sessionId);
    const recentBlocks = this.recentBlockDigestsForRender(priorBlocks);
    const topic = { title: topicTitle };
    // One atomic allocation serves both the block sequence and the stream sequence:
    // both are unique-per-session and a shared counter keeps them collision-free.
    const seq = await this.repo.nextBlockSequence(sessionId);
    const streamSeq = seq;
    const blockRow = await this.repo.insertBlock({
      sessionId,
      sequence: seq,
      blockType: this.planner.blockTypeForMove(plan.move),
      content: {},
      moveType: plan.move,
      streamSeq,
      reasoning: plan.reasoning,
      renderStatus: 'streaming',
    });
    emit?.({ type: 'block_start', seq: streamSeq, blockId: blockRow.id, moveType: plan.move });
    // F3: when speculative_planning is on, fire plan for N+1 as soon as render starts.
    const cfg = await this.config.getAll(this.configCtx(principal));
    if (cfg.speculative_planning && !opts?.closing) {
      void this.prefetchSpeculativePlan(principal, sessionId, state.moves.length + 1).catch(() => undefined);
    }
    const heartbeat = setInterval(() => {
      emit?.({ type: 'heartbeat', ts: Date.now() });
    }, 8_000);
    let block: BlockV1;
    let degraded: boolean;
    try {
      const rendered = await this.renderer.render(principal, {
        sessionId,
        blockId: blockRow.id,
        blockSeq: seq,
        plan,
        topicTitle: topic.title,
        learnTopicId: session.topicId,
        recentBlocks,
        onProgress: (p) => {
          emit?.({
            type: 'block_delta',
            blockId: blockRow.id,
            seq: streamSeq,
            text: p.text,
            firstTokenMs: p.firstTokenMs,
          });
        },
      });
      block = rendered.block;
      degraded = rendered.degraded;
    } finally {
      clearInterval(heartbeat);
    }
    if (
      plan.move === 'direct_explanation' &&
      plan.params?.remediation === true &&
      block.block_type === 'explanation'
    ) {
      const lead = "Let's shore this up first — it'll make the rest click.";
      block = {
        ...block,
        body_md: block.body_md.startsWith(lead) ? block.body_md : `${lead}\n\n${block.body_md}`,
      };
    }
    if (plan.move === 'visual_spawn') {
      const graphResult = await this.canvas
        .generateForSession(principal, {
          sessionId,
          blockId: blockRow.id,
          topicTitle: topic.title,
          topicId: session.topicId,
        })
        .catch(() => null);
      if (graphResult) {
        block = blockV1Schema.parse({
          block_type: 'canvas_embed',
          graph_json_ref: `canvas:${graphResult.canvasId}`,
          canvas_id: graphResult.canvasId,
          caption: topic.title,
        });
        await this.repo.updateBlock(blockRow.id, {
          interactionState: { canvasId: graphResult.canvasId },
        });
      } else {
        block = blockV1Schema.parse({
          block_type: 'explanation',
          body_md: `Here's the idea behind **${topic.title}** in words instead of a diagram.`,
        });
        degraded = true;
      }
    }
    await this.repo.updateBlock(blockRow.id, {
      content: block,
      renderStatus: 'complete',
      completedAt: new Date(),
      degraded,
    });
    state.moves.push({ seq, move_type: plan.move, checkpoint_advance: plan.checkpoint_advance, outcome: {} });
    if (plan.checkpoint_advance) {
      state.checkpoints.done = Math.min(state.checkpoints.done + 1, state.checkpoints.total);
    }
    const awaiting = this.planner.requiresResponse(plan.move);
    await this.repo.appendSessionEvent(sessionId, 'block_stream_end', {
      block_id: blockRow.id,
      stream_seq: streamSeq,
    });
    const patch = {
      state,
      planMoveCount: (session.planMoveCount ?? 0) + 1,
      checkpointsDone: state.checkpoints.done,
      checkpointsTotal: state.checkpoints.total,
    };
    if (awaiting && !opts?.closing && this.status(session) === 'active') {
      const moved = await this.transition(
        sessionId,
        'active',
        'awaiting_response',
        `block_requires_response:${plan.move}`,
        { patch },
      );
      if (!moved) {
        const updated = await this.repo.updateSession(sessionId, patch, sessionVersion);
        if (!updated) {
          this.logger.warn(`state version conflict after render for session ${sessionId}`);
          return;
        }
      }
    } else {
      const updated = await this.repo.updateSession(sessionId, patch, sessionVersion);
      if (!updated) {
        this.logger.warn(`state version conflict after render for session ${sessionId}`);
        return;
      }
    }
    emit?.({
      type: 'block',
      seq: streamSeq,
      block: {
        id: blockRow.id,
        streamSeq,
        moveType: plan.move,
        block: this.redactServerOnly(block),
        reasoning: plan.reasoning,
        degraded,
        renderStatus: 'complete',
        interactionState:
          plan.move === 'visual_spawn' && 'canvas_id' in block
            ? { canvasId: (block as { canvas_id?: string }).canvas_id }
            : {},
      },
    });
  }

  private recentBlockDigestsForRender(
    blocks: Awaited<ReturnType<LearnSessionsRepository['listBlocks']>>,
  ): { move: string | null; title?: string; body_excerpt?: string }[] {
    return blocks
      .filter((b) => b.renderStatus === 'complete')
      .slice(-3)
      .map((b) => {
        const content = b.content as Record<string, unknown>;
        const body =
          typeof content.body_md === 'string'
            ? content.body_md
            : typeof content.problem_md === 'string'
              ? content.problem_md
              : '';
        return {
          move: b.moveType,
          title: typeof content.title === 'string' ? content.title : undefined,
          body_excerpt: body.slice(0, 200) || undefined,
        };
      });
  }

  /** Speculative N+1 plan (F3). Discarded if move count changes before use. */
  private async prefetchSpeculativePlan(
    principal: StudentPrincipal,
    sessionId: string,
    basedOnMoveCount: number,
  ): Promise<void> {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) return;
    const state = sessionStateV1Schema.parse(session.state ?? {});
    if (state.moves.length !== basedOnMoveCount - 1) return;
    const topicMeta = await this.sessionTopicMeta(session);
    const { profile } = await this.profiles.resolve(principal, {
      learnTopicId: topicMeta.learnTopicId,
      topicKey: topicMeta.topicKey,
      title: topicMeta.title,
    });
    const policy = learnPolicyV1Schema.parse(session.policySnapshot ?? {});
    const cfg = await this.config.getAll(this.configCtx(principal));
    const plan = await this.planner.planMove(
      principal,
      {
        state,
        profile,
        policy,
        topicTitle: topicMeta.title,
        config: cfg,
        hardRules: [],
        preferRetrieval: false,
      },
      { sessionId, speculative: true },
    );
    this.speculativePlans.set(sessionId, { plan, basedOnMoveCount, generatedAt: Date.now() });
  }

  /**
   * §5 `closing`: the forced closing pair (synthesis + artifact_commit) renders
   * IN the `closing` state and no planner call happens there — `closingPlan` is
   * deterministic, not an LLM call. Previously this state was declared but never
   * assigned and the pair never rendered at all: the session jumped straight to
   * `closed`.
   */
  private async runClosingSequence(
    principal: StudentPrincipal,
    sessionId: string,
    endReason: EndReason,
    emit?: (event: Record<string, unknown>) => void,
  ) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) return;
    const from = this.status(session);
    if (from === 'closed') return;
    if (from !== 'closing') {
      // Record the intended end reason on the row as we enter `closing`, so a
      // crash mid-pair resumes and closes with the SAME reason rather than a
      // guessed one.
      const moved = await this.transition(sessionId, from, 'closing', `forced_close:${endReason}`, {
        endReason,
        patch: { endReason },
      });
      if (!moved) return;
    }
    const topicMeta = await this.sessionTopicMeta(session);
    const topicTitle = topicMeta.title;
    const state = sessionStateV1Schema.parse(session.state ?? {});
    // Two iterations at most: closingPlan yields artifact_commit then synthesis.
    for (let i = 0; i < 2; i += 1) {
      const hasSynthesis = state.moves.some((m) => m.move_type === 'synthesis');
      const hasArtifact = state.moves.some((m) => m.move_type === 'artifact_commit');
      if (hasSynthesis && hasArtifact) break;
      const plan = this.planner.closingPlan(state);
      await this.renderPlannedBlock(principal, sessionId, state, plan, topicTitle, emit, {
        closing: true,
      });
    }
    await this.closeSession(principal, sessionId, endReason);
  }

  /**
   * Emits a service-authored `system_notice` block (§3/§4.1). It is persisted as
   * a real block row so it survives reconnect, and it reaches the SSE consumer
   * through BOTH paths a normal block uses: the live `emit` callback when the
   * stream is open, and the `block_stream_end` audit event that
   * `GET /sessions/:id/stream?last_seq=` replays when it is not.
   *
   * It deliberately does NOT push to `state.moves` and does NOT bump
   * `plan_move_count` or the checkpoints — §3: a notice never counts toward the
   * move cap or checkpoints.
   */
  private async emitSystemNotice(
    principal: StudentPrincipal,
    sessionId: string,
    notice: {
      kind: 'break' | 'budget' | 'degraded' | 'policy';
      body_md: string;
      actions: { key: string; label: string }[];
    },
    emit?: (event: Record<string, unknown>) => void,
  ) {
    const block = blockV1Schema.parse({ block_type: 'system_notice', ...notice });
    const seq = await this.repo.nextBlockSequence(sessionId);
    const blockRow = await this.repo.insertBlock({
      sessionId,
      sequence: seq,
      blockType: 'system_notice',
      content: block,
      moveType: 'system_notice',
      streamSeq: seq,
      reasoning: null,
      renderStatus: 'complete',
      completedAt: new Date(),
    });
    await this.repo.appendSessionEvent(sessionId, 'system_notice_emitted', {
      block_id: blockRow.id,
      stream_seq: seq,
      kind: notice.kind,
    });
    await this.repo.appendSessionEvent(sessionId, 'block_stream_end', {
      block_id: blockRow.id,
      stream_seq: seq,
    });
    // A notice always waits for the student: it carries actions and nothing else
    // may render until one is chosen.
    const session = await this.repo.getSession(principal, sessionId);
    const from = session ? this.status(session) : 'active';
    if (from === 'active' || from === 'created') {
      if (from === 'created') {
        await this.transition(sessionId, 'created', 'active', 'first_render_start');
      }
      await this.transition(sessionId, 'active', 'awaiting_response', `system_notice:${notice.kind}`);
    }
    emit?.({
      type: 'block',
      seq,
      block: {
        id: blockRow.id,
        streamSeq: seq,
        moveType: 'system_notice',
        block,
        reasoning: null,
        degraded: false,
        renderStatus: 'complete',
      },
    });
    return blockRow;
  }

  /**
   * §3 fatigue rule: last 3 GRADED answers wrong AND elapsed ≥ 15 min → exactly
   * one break card. `recent_graded` is the rolling window; `fatigue_notice_sent`
   * is the once-per-session latch.
   */
  private async maybeEmitFatigueNotice(
    principal: StudentPrincipal,
    sessionId: string,
    state: SessionStateV1,
    emit?: (event: Record<string, unknown>) => void,
  ): Promise<boolean> {
    if (state.fatigue_notice_sent) return false;
    if (state.elapsed_minutes < LEARN_FATIGUE_MIN_ELAPSED_MINUTES) return false;
    if (state.recent_graded.length < 3) return false;
    if (!state.recent_graded.every((r) => r === 'wrong')) return false;
    state.fatigue_notice_sent = true;
    await this.repo.updateSession(sessionId, { state });
    await this.emitSystemNotice(
      principal,
      sessionId,
      {
        kind: 'break',
        body_md:
          "That last stretch was rough — that's normal, and a short break usually helps more than pushing through.",
        actions: [
          { key: 'pause', label: 'Take a break' },
          { key: 'keep_going', label: 'Keep going' },
        ],
      },
      emit,
    );
    return true;
  }

  async answerBlock(principal: StudentPrincipal, sessionId: string, blockId: string, raw: unknown) {
    const input = answerBlockInputSchema.parse(raw);
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    const block = await this.repo.getBlock(sessionId, blockId);
    if (!block) throw new NotFoundException();
    const content = blockV1Schema.parse(block.content);
    if (content.block_type !== 'question_set') {
      throw new ConflictException({ code: 'NOT_A_QUESTION', message: 'This block does not accept answers.' });
    }
    const question = content.questions.find((q) => q.id === input.questionId);
    if (!question) throw new NotFoundException({ code: 'QUESTION_NOT_FOUND', message: 'Question not found.' });

    // F8 / DM-096 / AC8: duplicate returns the STORED evaluation — never re-grades.
    const existing = await this.repo.findAttemptByQuestion(sessionId, blockId, input.questionId);
    if (existing) {
      return {
        evaluation: existing.evaluation as { correct?: boolean | null; feedback?: string },
        session: await this.toDto(principal, sessionId),
        duplicate: true as const,
      };
    }

    // Invalidate speculative N+1 — answering may change the legal plan.
    this.speculativePlans.delete(sessionId);

    // E10: never write mastery against invented atom ids (FK would 23503).
    const atomIdRaw = question.atom_id ?? null;
    const validAtoms =
      session.topicId && atomIdRaw
        ? await this.repo.filterValidAtomIds(session.topicId, [atomIdRaw])
        : new Set<string>();
    const atomId = atomIdRaw && validAtoms.has(atomIdRaw) ? atomIdRaw : null;

    let correct: boolean | null = null;
    let feedback = question.why_md ?? '';
    if (question.type === 'mcq_single' && question.correct_option_id) {
      const response = input.response as { optionId?: string };
      correct = response.optionId === question.correct_option_id;
    } else if (question.type === 'short_text' || question.type === 'numeric') {
      const graded = await this.grading.grade(principal, {
        sessionId,
        blockId,
        questionId: input.questionId,
        promptMd: question.prompt_md,
        response: input.response,
      });
      correct = graded.correct;
      feedback = graded.feedback;
    }
    const evaluation = {
      correct,
      score: correct === true ? 1 : correct === false ? 0 : null,
      feedback:
        correct === false && question.type === 'mcq_single' && question.correct_option_id
          ? question.why_md ?? feedback
          : feedback ||
            (atomId
              ? ''
              : correct === null
                ? "Recorded — couldn't auto-check this one."
                : 'Recorded — concept link unavailable.'),
      ...(correct === false && question.type === 'mcq_single' && question.correct_option_id
        ? { correctOptionId: question.correct_option_id }
        : {}),
    };
    const result = await this.evidence.recordAnswer(principal, {
      sessionId,
      blockId,
      questionId: input.questionId,
      atomId,
      difficulty: question.difficulty,
      kind: content.purpose === 'prereq' ? 'learn_prereq' : 'learn_retrieval',
      input: { question_id: input.questionId, response: input.response },
      evaluation,
      hintsUsed: input.hintsUsed ?? 0,
      idempotencyKey: input.idempotencyKey,
    });
    const state = sessionStateV1Schema.parse(session.state ?? {});
    const lastMove = state.moves[state.moves.length - 1];
    if (lastMove) {
      lastMove.outcome = {
        answered: {
          correct: correct === true ? 1 : 0,
          wrong: correct === false ? 1 : 0,
          null: correct === null ? 1 : 0,
        },
      };
    }
    // §3 fatigue window: only GRADED answers (`correct === null` means we could
    // not auto-check it, so it carries no signal) enter the rolling last-3.
    if (!result.duplicate && correct !== null) {
      const outcome: 'correct' | 'wrong' = correct ? 'correct' : 'wrong';
      state.recent_graded = [...state.recent_graded, outcome].slice(-3);
    }
    await this.syncElapsed(session, state);
    const priorInteraction = (block.interactionState as Record<string, unknown>) ?? {};
    const answeredMap = {
      ...((priorInteraction.answeredMap as Record<string, unknown>) ?? {}),
      [input.questionId]: evaluation,
    };
    await this.repo.updateBlock(blockId, {
      interactionState: {
        ...priorInteraction,
        answered: input.questionId,
        evaluation,
        answeredMap,
      },
    });
    const from = this.status(session);
    if (from === 'awaiting_response') {
      const moved = await this.transition(sessionId, from, 'active', 'answer_recorded', {
        patch: { state },
      });
      if (!moved) await this.repo.updateSession(sessionId, { state });
    } else {
      await this.repo.updateSession(sessionId, { state });
    }
    if (!result.duplicate) {
      const fatigued = await this.maybeEmitFatigueNotice(principal, sessionId, state);
      if (!fatigued) {
        await this.planAndRenderNextBlock(principal, sessionId);
      }
    }
    return {
      evaluation,
      session: await this.toDto(principal, sessionId),
      duplicate: result.duplicate,
    };
  }
  async interactBlock(principal: StudentPrincipal, sessionId: string, blockId: string, raw: unknown) {
    const input = interactBlockInputSchema.parse(raw);
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    const block = await this.repo.getBlock(sessionId, blockId);
    if (!block) throw new NotFoundException();
    const content = blockV1Schema.parse(block.content);
    const interaction = { ...((block.interactionState as Record<string, unknown>) ?? {}) };
    const state = sessionStateV1Schema.parse(session.state ?? {});
    switch (input.action) {
      case 'reveal_step': {
        const step = Number(input.data?.stepIndex ?? 0);
        const revealed = new Set((interaction.revealedSteps as number[]) ?? []);
        revealed.add(step);
        interaction.revealedSteps = [...revealed];
        if (input.data?.prediction) {
          interaction[`prediction_${step}`] = input.data.prediction;
          if (state.moves.length) {
            const last = state.moves[state.moves.length - 1]!;
            last.outcome = { ...last.outcome, prediction_text: String(input.data.prediction) };
          }
        }
        break;
      }
      case 'probe_answer':
        interaction.probeAnswer = input.data?.text;
        break;
      case 'probe_escape':
        interaction.probeEscaped = true;
        if (state.moves.length) {
          const last = state.moves[state.moves.length - 1]!;
          last.outcome.probe_escaped = true;
        }
        break;
      case 'synthesis_submit': {
        const text = String(input.data?.text ?? '');
        interaction.synthesisText = text;
        if (content.block_type === 'synthesis') {
          const graded = await this.grading.gradeSynthesis(principal, {
            sessionId,
            blockId,
            promptMd: content.prompt_md,
            text,
          });
          interaction.synthesisTightened = graded.tightened;
        }
        break;
      }
      case 'synthesis_skip':
        interaction.synthesisSkipped = true;
        if (state.moves.length) {
          const last = state.moves[state.moves.length - 1]!;
          last.outcome.skipped = true;
        }
        break;
      case 'notice_action': {
        const key = String(input.data?.key ?? '');
        interaction.noticeAction = key;
        if (key === 'extend_time') {
          // §5: "+5 minutes" extends the budget EXACTLY ONCE per session.
          if (state.budget_extended) {
            throw new ConflictException({
              code: 'BUDGET_ALREADY_EXTENDED',
              message: "You've already added extra time to this lesson.",
            });
          }
          state.time_budget_minutes = Math.min(
            120,
            state.time_budget_minutes + LEARN_TIME_EXTENSION_MINUTES,
          );
          state.budget_extended = true;
          state.wrap_up = false;
          await this.repo.appendSessionEvent(sessionId, 'budget_extended', {
            added_minutes: LEARN_TIME_EXTENSION_MINUTES,
            time_budget_minutes: state.time_budget_minutes,
          });
        }
        if (key === 'wrap_up') state.wrap_up = true;
        break;
      }
      case 'expand_deeper': {
        interaction.expandedDeeper = true;
        if (state.moves.length) {
          const last = state.moves[state.moves.length - 1]!;
          last.outcome.expanded_deeper = true;
        }
        await this.learnerModel.recordExpandedDeeper(principal, block.moveType ?? 'direct_explanation');
        break;
      }
      case 'dwell': {
        const dwellMs = Number(input.data?.ms ?? 0);
        if (Number.isFinite(dwellMs) && dwellMs > 0) {
          interaction.lastDwellMs = dwellMs;
          await this.learnerModel.recordDwell(principal, dwellMs);
        }
        break;
      }
      case 'acknowledge':
        interaction.acknowledged = true;
        break;
      case 'skip_step':
        interaction.skipped = true;
        if (state.moves.length) {
          const last = state.moves[state.moves.length - 1]!;
          last.outcome = { ...last.outcome, skipped: true };
        }
        break;
      default:
        break;
    }
    await this.repo.updateBlock(blockId, { interactionState: interaction });
    const interactFrom = this.status(session);
    if (interactFrom === 'awaiting_response') {
      const moved = await this.transition(sessionId, interactFrom, 'active', `interact:${input.action}`, {
        patch: { state },
      });
      if (!moved) await this.repo.updateSession(sessionId, { state });
    } else {
      await this.repo.updateSession(sessionId, { state });
    }
    // "Take a break" on the fatigue card is a real pause, not a continuation.
    if (input.action === 'notice_action' && interaction.noticeAction === 'pause') {
      return { session: await this.pause(principal, sessionId) };
    }
    const doneActions = new Set([
      'probe_escape',
      'probe_answer',
      'synthesis_submit',
      'synthesis_skip',
      'notice_action',
      'acknowledge',
      'skip_step',
    ]);
    if (doneActions.has(input.action) || (input.action === 'reveal_step' && content.block_type === 'worked_example')) {
      const revealed = (interaction.revealedSteps as number[]) ?? [];
      const allRevealed = content.block_type === 'worked_example' && revealed.length >= content.steps.length;
      if (allRevealed || doneActions.has(input.action)) {
        await this.planAndRenderNextBlock(principal, sessionId);
      }
    }
    return { session: await this.toDto(principal, sessionId) };
  }
  async askSession(principal: StudentPrincipal, sessionId: string, raw: unknown) {
    const input = askSessionInputSchema.parse(raw);
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    const cfg = await this.config.getAll(this.configCtx(principal));
    const state = sessionStateV1Schema.parse(session.state ?? {});
    if (state.free_questions_used >= cfg.max_free_questions_per_session) {
      throw new ConflictException({
        code: 'FREE_QUESTION_CAP',
        message: "Let's finish this lesson — then ask me anything in chat.",
      });
    }
    state.pending_free_question = input.text;
    state.free_questions_used += 1;
    await this.repo.updateSession(sessionId, { state });
    if (session.orchestratorStatus !== 'awaiting_response') {
      await this.planAndRenderNextBlock(principal, sessionId);
    }
    return { session: await this.toDto(principal, sessionId) };
  }
  async commitArtifacts(principal: StudentPrincipal, sessionId: string, raw: unknown) {
    const input = commitArtifactsInputSchema.parse(raw);
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    const blocks = await this.repo.listBlocks(sessionId);
    const commitBlock = blocks.find((b) => {
      const c = blockV1Schema.safeParse(b.content);
      return c.success && c.data.block_type === 'artifact_commit';
    });
    if (!commitBlock) throw new NotFoundException({ code: 'NO_ARTIFACT_BLOCK', message: 'No artifact block.' });
    const content = blockV1Schema.parse(commitBlock.content);
    if (content.block_type !== 'artifact_commit') throw new ConflictException();
    const selected = content.cards.filter((c) => input.cardSelections.includes(c.source_block_id) || input.cardSelections.length === 0);
    const cards = selected.length ? selected : content.cards;
    const topicMeta = await this.sessionTopicMeta(session);
    const result = await this.artifacts.commitCards(principal, sessionId, cards, topicMeta.title);
    await this.repo.updateBlock(commitBlock.id, {
      interactionState: { committed: true, deckId: result.deckId, cardCount: result.cardCount },
    });
    const state = sessionStateV1Schema.parse(session.state ?? {});
    if (state.moves.length) {
      const last = state.moves[state.moves.length - 1]!;
      last.outcome.skipped = false;
    }
    const from = this.status(session);
    if (from === 'awaiting_response') {
      const moved = await this.transition(sessionId, from, 'active', 'artifacts_committed', {
        patch: { state },
      });
      if (!moved) await this.repo.updateSession(sessionId, { state });
    } else {
      await this.repo.updateSession(sessionId, { state });
    }
    await this.planAndRenderNextBlock(principal, sessionId);
    return { deckId: result.deckId, cardCount: result.cardCount, session: await this.toDto(principal, sessionId) };
  }
  async pause(principal: StudentPrincipal, sessionId: string) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    const from = this.status(session);
    if (from === 'paused') return this.getSession(principal, sessionId);
    const state = sessionStateV1Schema.parse(session.state ?? {});
    const elapsed = await this.syncElapsed(session, state);
    // `paused_at` opens the pause interval; every minute between now and resume
    // is subtracted from elapsed, so a paused session burns no budget.
    await this.transition(sessionId, from, 'paused', 'student_pause', {
      patch: { pausedAt: new Date() },
      elapsedMinutes: elapsed,
    });
    return this.getSession(principal, sessionId);
  }
  async resume(principal: StudentPrincipal, sessionId: string) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    if (await this.autoCloseIfAbandoned(principal, session)) {
      return this.getSession(principal, sessionId);
    }
    const from = this.status(session);
    if (from === 'paused') {
      const state = sessionStateV1Schema.parse(session.state ?? {});
      // Close the open pause interval into the running total BEFORE clearing
      // `paused_at` — otherwise the paused minutes silently rejoin the budget.
      if (session.pausedAt) {
        state.paused_ms_total =
          (state.paused_ms_total ?? 0) + Math.max(0, Date.now() - session.pausedAt.getTime());
      }
      state.elapsed_minutes = this.computeElapsedMinutes(
        { startedAt: session.startedAt, pausedAt: null },
        state,
      );
      await this.transition(sessionId, 'paused', 'active', 'student_resume', {
        patch: { pausedAt: null, state, elapsedMinutes: state.elapsed_minutes },
        elapsedMinutes: state.elapsed_minutes,
      });
    }
    const dto = await this.getSession(principal, sessionId);
    if (dto.orchestratorStatus === 'active' && !dto.blocks.some((b) => b.renderStatus === 'streaming')) {
      await this.planAndRenderNextBlock(principal, sessionId);
    }
    return this.getSession(principal, sessionId);
  }
  async end(principal: StudentPrincipal, sessionId: string, raw?: unknown) {
    endSessionInputSchema.parse(raw ?? {});
    await this.closeSession(principal, sessionId, 'student_exit');
    return this.getSession(principal, sessionId);
  }
  /**
   * `any non-terminal → closed` (§5). Every end reason in `endReasonSchema` is
   * reachable: `time_budget` from the budget rule, `abandoned` from the 24h
   * paused sweep, `move_cap`/`goal_met` from the closing sequence,
   * `student_exit` from `POST /end`, `policy_kill` from a mid-session policy
   * revocation.
   */
  private async closeSession(principal: StudentPrincipal, sessionId: string, endReason: EndReason) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) return;
    const from = this.status(session);
    if (from === 'closed') return;
    const state = sessionStateV1Schema.parse(session.state ?? {});
    // An abandoned session stopped accruing time at `paused_at`, which
    // computeElapsedMinutes already excludes.
    const elapsed = this.computeElapsedMinutes(session, state);
    state.elapsed_minutes = elapsed;
    const now = new Date();
    const moved = await this.transition(sessionId, from, 'closed', `close:${endReason}`, {
      endReason,
      elapsedMinutes: elapsed,
      patch: {
        status: 'completed',
        endReason,
        endedAt: now,
        completedAt: now,
        elapsedMinutes: elapsed,
        state,
        summary: {
          end_reason: endReason,
          elapsed_minutes: elapsed,
          time_budget_minutes: state.time_budget_minutes,
          budget_extended: state.budget_extended,
          moves: state.moves.length,
          checkpoints: state.checkpoints,
        },
      },
    });
    if (!moved) return;
    await this.completion.finalize(principal, sessionId, endReason, state);
  }
  /**
   * Hyperspec §4.1: `correct_option_id` is server-only. Strip it at the DTO/emit
   * boundary; the persisted block keeps it so grading still works server-side.
   */
  private redactServerOnly(block: BlockV1): BlockV1 {
    if (block.block_type !== 'question_set') return block;
    return {
      ...block,
      questions: block.questions.map(({ correct_option_id: _omit, ...q }) => q),
    };
  }
  private async toDto(principal: StudentPrincipal, sessionId: string): Promise<LearnSessionV1Dto> {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    const topicMeta = await this.sessionTopicMeta(session);
    const blocks = await this.repo.listBlocks(sessionId);
    const policySnapshot = learnPolicyV1Schema.parse(session.policySnapshot ?? {});
    return {
      id: session.id,
      topicId: session.topicId,
      topicKey: topicMeta.topicKey,
      topicTitle: topicMeta.title,
      subjectLabel: topicMeta.subjectLabel,
      entryPoint: session.entryPoint as LearnSessionV1Dto['entryPoint'],
      orchestratorStatus: session.orchestratorStatus as LearnSessionV1Dto['orchestratorStatus'],
      status: (session.status as LearnSessionV1Dto['status']) ?? 'active',
      state: (session.state as Record<string, unknown>) ?? {},
      sessionContext: (session.sessionContext as Record<string, unknown>) ?? {},
      policySnapshot,
      timeBudgetMinutes: session.timeBudgetMinutes,
      elapsedMinutes: session.elapsedMinutes ?? 0,
      checkpointsTotal: session.checkpointsTotal ?? 0,
      checkpointsDone: session.checkpointsDone ?? 0,
      planMoveCount: session.planMoveCount ?? 0,
      endReason: session.endReason as LearnSessionV1Dto['endReason'],
      blocks: blocks.flatMap((b) => {
        // A block is inserted with `content: {}` at renderStatus 'streaming' and filled
        // in later, so an in-flight or abandoned row is never parseable. Skip it instead
        // of failing the whole session read.
        const parsed = blockV1Schema.safeParse(b.content);
        if (!parsed.success) return [];
        return [
          {
            id: b.id,
            sessionId,
            sequence: b.sequence,
            streamSeq: b.streamSeq,
            moveType: b.moveType,
            block: this.redactServerOnly(parsed.data),
            blockSchemaVersion: 1,
            reasoning: b.reasoning,
            degraded: b.degraded ?? false,
            interactionState: (b.interactionState as Record<string, unknown>) ?? {},
            renderStatus: b.renderStatus,
            version: 1,
            createdAt: b.createdAt.toISOString(),
            updatedAt: b.updatedAt.toISOString(),
          },
        ];
      }),
      pathItemId: session.pathItemId,
      groundingKnowledgeItemId: session.groundingKnowledgeItemId,
      evidence: session.evidence ?? [],
      summary: (session.summary as Record<string, unknown> | null) ?? null,
      startedAt: session.startedAt.toISOString(),
      pausedAt: session.pausedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      readOnly: session.orchestratorStatus === 'closed',
      version: session.version,
    };
  }
}
