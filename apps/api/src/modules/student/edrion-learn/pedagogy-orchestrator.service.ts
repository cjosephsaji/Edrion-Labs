import { ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';import {
  answerBlockInputSchema,
  askSessionInputSchema,
  blockV1Schema,
  commitArtifactsInputSchema,
  createLearnSessionInputSchema,
  endSessionInputSchema,
  interactBlockInputSchema,
  learnPolicyV1Schema,
  sessionContextV1Schema,
  sessionStateV1Schema,
  type LearnSessionV1Dto,
  type SessionGoal,
} from '@edrion/schemas';
import type { StudentPrincipal } from '../student.types';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import {
  LEARN_DAILY_SESSION_CAP,
  LEARN_DEFAULT_SESSION_MINUTES,
  LEARN_MAX_FREE_QUESTIONS,
  LEARN_MOVE_CAP,
} from './constants';
import { EdrionLearnRepository } from './edrion-learn.repository';
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
@Injectable()
export class PedagogyOrchestratorService {
  constructor(
    private readonly repo: EdrionLearnRepository,
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
  ) {}
  async assertOrchestratorEnabled(principal: StudentPrincipal) {
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
      if (!resolution.value) {
        throw new ForbiddenException({
          code: 'LEARN_ORCHESTRATOR_DISABLED',
          message: 'Edrion Learn is unavailable right now. Try a quick Petros answer instead.',
        });
      }
    } catch (e) {
      if (e instanceof ForbiddenException) throw e;
    }
  }
  async createSession(
    principal: StudentPrincipal,
    raw: unknown,
  ): Promise<{ session: LearnSessionV1Dto; streamUrl: string }> {
    await this.assertOrchestratorEnabled(principal);
    const input = createLearnSessionInputSchema.parse(raw);
    const daily = await this.repo.countSessionsToday(principal);
    if (daily >= LEARN_DAILY_SESSION_CAP) {
      throw new HttpException(
        { code: 'DAILY_SESSION_CAP', message: "You've had a full day of lessons â€” come back tomorrow." },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const active = await this.repo.findActiveOrchestratorSession(principal);
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
    const topicKey = institutionalCtx.topicKey ?? input.topicKey ?? `session:${input.idempotencyKey.slice(0, 8)}`;
    const topicTitle = institutionalCtx.topicTitle ?? topicKey;
    const subjectLabel = institutionalCtx.subjectLabel ?? 'General';
    const curriculumKey = principal.kind === 'institutional' ? 'institution' : 'generic';
    const topic = await this.repo.upsertTopic(
      topicKey,
      topicTitle,
      subjectLabel,
      curriculumKey,
      principal.kind === 'institutional' ? principal.institutionId : null,
    );
    const { profile, profileId } = await this.profiles.resolve(principal, {
      learnTopicId: topic.id,
      topicKey,
      title: topic.title,
    });
    const timeBudget =
      institutionalCtx.timeBudgetMinutes ?? input.timeBudgetMinutes ?? LEARN_DEFAULT_SESSION_MINUTES;
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
      ...institutionalCtx.sessionContextExtras,
    });
    const entryRef =
      institutionalCtx.entryRef ??
      (input.pathItemId
        ? { learning_path_item_id: input.pathItemId }
        : input.knowledgeItemId
          ? { knowledge_item_id: input.knowledgeItemId }
          : {});
    const resolvedEntryPoint = institutionalCtx.entryPoint ?? input.entryPoint;
    const session = await this.repo.createSession({
      ...owner,
      topicId: topic.id,
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
      spine: [],
      sessionPlan: { orchestrator: true, goal },
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
    await this.repo.updateSession(session.id, { state, orchestratorStatus: 'active' });
    await this.repo.appendSessionEvent(session.id, 1, 'session_created', { entry_point: resolvedEntryPoint });
    return {
      session: await this.toDto(principal, session.id),
      streamUrl: `/student/learn/sessions/${session.id}/stream`,
    };
  }
  async getSession(principal: StudentPrincipal, sessionId: string): Promise<LearnSessionV1Dto> {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Session not found.' });
    return this.toDto(principal, sessionId);
  }
  async stream(
    principal: StudentPrincipal,
    sessionId: string,
    lastSeq: number,
    emit: (event: Record<string, unknown>) => void,
  ) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    const events = await this.repo.listSessionEventsSince(sessionId, lastSeq);
    for (const ev of events) {
      emit({ type: 'replay', seq: ev.seq, eventType: ev.eventType, payload: ev.payload });
    }
    if (session.orchestratorStatus === 'closed' || session.orchestratorStatus === 'paused') return;
    if (session.orchestratorStatus === 'awaiting_response') return;
    const blocks = await this.repo.listBlocks(sessionId);
    const last = blocks[blocks.length - 1];
    const lastMove = (last?.moveType ?? 'direct_explanation') as import('@edrion/schemas').MoveType;
    const shouldPlan =
      session.orchestratorStatus === 'active' &&
      (!blocks.length || (last?.renderStatus === 'complete' && !this.planner.requiresResponse(lastMove)));
    if (shouldPlan) {
      await this.planAndRenderNextBlock(principal, sessionId, emit);
    }
  }
  async planAndRenderNextBlock(
    principal: StudentPrincipal,
    sessionId: string,
    emit?: (event: Record<string, unknown>) => void,
  ) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session || session.orchestratorStatus === 'closed') return;
    const policySnapshot = await this.policy.resolve(principal);
    if (policySnapshot.effective_mode === 'disabled') {
      await this.closeSession(principal, sessionId, 'policy_kill');
      return;
    }
    const state = sessionStateV1Schema.parse(session.state ?? {});
    const topic = await this.repo.getTopic(session.topicId);
    if (!topic) return;
    const { profile } = await this.profiles.resolve(principal, {
      learnTopicId: topic.id,
      topicKey: topic.topicKey,
      title: topic.title,
    });
    const sessionCtx = sessionContextV1Schema.safeParse(session.sessionContext ?? {});
    const preferRetrieval =
      (sessionCtx.success && sessionCtx.data.active_assignment_overlap) ||
      policySnapshot.answer_directness === 'never_direct_on_assignment' ||
      policySnapshot.answer_directness === 'guided';
    if (state.pending_free_question) {
      state.pending_free_question = null;
      await this.repo.updateSession(sessionId, { state });
    }
    const plan = await this.planner.planMove(
      principal,
      {
        state,
        profile,
        policy: policySnapshot,
        topicTitle: topic.title,
        hardRules: [],
        preferRetrieval: Boolean(preferRetrieval),
      },
      { sessionId },
    );
    if (plan.session_should_end || this.planner.shouldForceClose(state)) {
      await this.closeSession(principal, sessionId, state.moves.length >= LEARN_MOVE_CAP ? 'move_cap' : 'goal_met');
      return;
    }
    const seq = await this.repo.nextBlockSequence(sessionId);
    const streamSeq = await this.repo.nextStreamSeq(sessionId);
    const blockRow = await this.repo.insertBlock({
      sessionId,
      sequence: seq,
      blockType: this.planner.blockTypeForMove(plan.move),
      spineStep: 'understand',
      content: {},
      moveType: plan.move,
      streamSeq,
      reasoning: plan.reasoning,
      renderStatus: 'streaming',
    });
    emit?.({ type: 'block_start', seq: streamSeq, blockId: blockRow.id, moveType: plan.move });
    let { block, degraded } = await this.renderer.render(principal, {
      sessionId,
      blockId: blockRow.id,
      blockSeq: seq,
      plan,
      topicTitle: topic.title,
    });
    if (plan.move === 'visual_spawn') {
      const graphResult = await this.canvas.generateForSession(principal, {
        sessionId,
        blockId: blockRow.id,
        topicTitle: topic.title,
      });
      if (graphResult) {
        block = blockV1Schema.parse({
          block_type: 'canvas_embed',
          graph_json_ref: `canvas:${graphResult.canvasId}`,
          canvas_id: graphResult.canvasId,
          caption: topic.title,
        });
        await this.repo.updateBlock(blockRow.id, {
          interactionState: { graph: graphResult.graph },
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
    const eventSeq = Number(session.lastEventSeq ?? 0) + 1;
    await this.repo.appendSessionEvent(sessionId, eventSeq, 'block_stream_end', {
      block_id: blockRow.id,
      stream_seq: streamSeq,
    });
    await this.repo.updateSession(sessionId, {
      state,
      planMoveCount: (session.planMoveCount ?? 0) + 1,
      orchestratorStatus: awaiting ? 'awaiting_response' : 'active',
      lastEventSeq: eventSeq,
      checkpointsDone: state.checkpoints.done,
      checkpointsTotal: state.checkpoints.total,
    });
    emit?.({
      type: 'block',
      seq: streamSeq,
      block: {
        id: blockRow.id,
        streamSeq,
        moveType: plan.move,
        block,
        reasoning: plan.reasoning,
        degraded,
        renderStatus: 'complete',
      },
    });
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
    const evaluation = { correct, score: correct === true ? 1 : correct === false ? 0 : null, feedback };
    const result = await this.evidence.recordAnswer(principal, {
      sessionId,
      blockId,
      questionId: input.questionId,
      atomId: question.atom_id,
      difficulty: question.difficulty,
      kind: content.purpose === 'prereq' ? 'learn_prereq' : 'learn_retrieval',
      input: { question_id: input.questionId, response: input.response },
      evaluation,
      hintsUsed: 0,
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
    await this.repo.updateBlock(blockId, {
      interactionState: { ...((block.interactionState as object) ?? {}), answered: input.questionId, evaluation },
    });
    await this.repo.updateSession(sessionId, { state, orchestratorStatus: 'active' });
    if (!result.duplicate) {
      await this.planAndRenderNextBlock(principal, sessionId);
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
        if (input.data?.prediction) interaction[`prediction_${step}`] = input.data.prediction;
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
      case 'synthesis_submit':
        interaction.synthesisText = input.data?.text;
        break;
      case 'synthesis_skip':
        interaction.synthesisSkipped = true;
        if (state.moves.length) {
          const last = state.moves[state.moves.length - 1]!;
          last.outcome.skipped = true;
        }
        break;
      case 'notice_action':
        if (input.data?.key === 'extend_time') {
          state.time_budget_minutes += 5;
        }
        break;
      default:
        break;
    }
    await this.repo.updateBlock(blockId, { interactionState: interaction });
    await this.repo.updateSession(sessionId, { state, orchestratorStatus: 'active' });
    const doneActions = new Set(['probe_escape', 'synthesis_submit', 'synthesis_skip']);
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
    const state = sessionStateV1Schema.parse(session.state ?? {});
    if (state.free_questions_used >= LEARN_MAX_FREE_QUESTIONS) {
      throw new ConflictException({
        code: 'FREE_QUESTION_CAP',
        message: "Let's finish this lesson â€” then ask me anything in chat.",
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
    const topic = await this.repo.getTopic(session.topicId);
    const result = await this.artifacts.commitCards(principal, sessionId, cards, topic?.title ?? 'Lesson cards');
    await this.repo.updateBlock(commitBlock.id, {
      interactionState: { committed: true, deckId: result.deckId, cardCount: result.cardCount },
    });
    const state = sessionStateV1Schema.parse(session.state ?? {});
    if (state.moves.length) {
      const last = state.moves[state.moves.length - 1]!;
      last.outcome.skipped = false;
    }
    await this.repo.updateSession(sessionId, { state, orchestratorStatus: 'active' });
    await this.planAndRenderNextBlock(principal, sessionId);
    return { deckId: result.deckId, cardCount: result.cardCount, session: await this.toDto(principal, sessionId) };
  }
  async pause(principal: StudentPrincipal, sessionId: string) {
    await this.repo.updateSession(sessionId, { orchestratorStatus: 'paused', pausedAt: new Date() });
    return this.getSession(principal, sessionId);
  }
  async resume(principal: StudentPrincipal, sessionId: string) {
    await this.repo.updateSession(sessionId, { orchestratorStatus: 'active', pausedAt: null });
    const session = await this.getSession(principal, sessionId);
    if (session.orchestratorStatus === 'active' && !session.blocks.some((b) => b.renderStatus === 'streaming')) {
      await this.planAndRenderNextBlock(principal, sessionId);
    }
    return this.getSession(principal, sessionId);
  }
  async end(principal: StudentPrincipal, sessionId: string, raw?: unknown) {
    endSessionInputSchema.parse(raw ?? {});
    await this.closeSession(principal, sessionId, 'student_exit');
    return this.getSession(principal, sessionId);
  }
  private async closeSession(
    principal: StudentPrincipal,
    sessionId: string,
    endReason: 'goal_met' | 'time_budget' | 'move_cap' | 'student_exit' | 'policy_kill',
  ) {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session || session.orchestratorStatus === 'closed') return;
    const state = sessionStateV1Schema.parse(session.state ?? {});
    await this.repo.updateSession(sessionId, {
      orchestratorStatus: 'closed',
      status: 'completed',
      endReason,
      endedAt: new Date(),
      completedAt: new Date(),
    });
    await this.completion.finalize(principal, sessionId, endReason, state);
  }
  private async toDto(principal: StudentPrincipal, sessionId: string): Promise<LearnSessionV1Dto> {
    const session = await this.repo.getSession(principal, sessionId);
    if (!session) throw new NotFoundException();
    const topic = await this.repo.getTopic(session.topicId);
    const blocks = await this.repo.listBlocks(sessionId);
    const policySnapshot = learnPolicyV1Schema.parse(session.policySnapshot ?? {});
    return {
      id: session.id,
      topicId: session.topicId,
      topicKey: topic?.topicKey ?? '',
      topicTitle: topic?.title ?? '',
      subjectLabel: topic?.subjectLabel ?? 'General',
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
      blocks: blocks.map((b) => ({
        id: b.id,
        sessionId,
        sequence: b.sequence,
        streamSeq: b.streamSeq,
        moveType: b.moveType,
        block: blockV1Schema.parse(b.content),
        blockSchemaVersion: 1,
        reasoning: b.reasoning,
        degraded: b.degraded ?? false,
        interactionState: (b.interactionState as Record<string, unknown>) ?? {},
        renderStatus: b.renderStatus,
        version: 1,
        createdAt: b.createdAt.toISOString(),
        updatedAt: b.updatedAt.toISOString(),
      })),
      pathItemId: session.pathItemId,
      groundingKnowledgeItemId: session.groundingKnowledgeItemId,
      evidence: session.evidence ?? [],
      startedAt: session.startedAt.toISOString(),
      pausedAt: session.pausedAt?.toISOString() ?? null,
      endedAt: session.endedAt?.toISOString() ?? null,
      completedAt: session.completedAt?.toISOString() ?? null,
      readOnly: session.orchestratorStatus === 'closed',
      version: session.version,
    };
  }
}
