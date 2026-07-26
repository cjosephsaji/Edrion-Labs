import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AiActionStatus, AiCapability, AiGuardrailDecision, AiMode, FeatureScope, RiskLevel } from '@edrion/shared-types';
import { canAll } from '@edrion/permissions';
import { evaluateGuardrail, redactSecrets, type AiPolicyInput } from '@edrion/copilot';
import type { PetrosBlock, PetrosStreamEvent } from '@edrion/schemas';
import type { PetrosConversation, PetrosMessage, PetrosPendingTurn } from '@edrion/database';
import { PetrosRepository } from './petros.repository';
import {
  PetrosOpenAiService,
  extractUsage,
  type PetrosUsage,
  type ReasoningEffort,
} from './openai-client.service';
import { PetrosToolRegistry } from './tools/registry';
import { buildInstructions, PETROS_PROMPT_VERSION } from './petros-prompt';
import { PortalCopilotRepository } from '../portal-copilot.repository';
import { SettingsService } from '../settings.service';
import { PetrosAttachmentService } from './petros-attachment.service';
import { PetrosTopicalityService } from './petros-topicality.service';
import { PetrosHistoryService } from './context/history';
import { compactToolResult, estimateTokens } from './context/compact';
import { resolveAiPolicy } from '@edrion/copilot';
import type { PortalActionContext } from '../portal-action-context';

const CONFIRMATION_TTL_MS = 15 * 60 * 1000;
const MAX_LOOP_ITERATIONS = 8;

/** Turns whose answer is written prose (or which read a document) get more thinking. See `resolveEffort`. */
const DRAFTING_INTENT =
  /\b(draft|write|compose|rewrite|letter|circular|report|essay|plan|proposal|explain|summar(y|ise|ize)|analy(se|ze)|recommend)/i;
const LONG_PROMPT_CHARS = 400;

export type Emit = (event: PetrosStreamEvent) => void;

/** The built-in multiple-choice clarifier — always available, never a registry tool. */
const ASK_USER_TOOL = {
  type: 'function',
  name: 'ask_user',
  description:
    'Ask the user ONE short multiple-choice question when their request is ambiguous. The stream pauses until they answer.',
  strict: false,
  parameters: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      options: {
        type: 'array',
        items: {
          type: 'object',
          properties: { id: { type: 'string' }, label: { type: 'string' } },
          required: ['id', 'label'],
          additionalProperties: false,
        },
        minItems: 2,
        maxItems: 6,
      },
    },
    required: ['question', 'options'],
    additionalProperties: false,
  },
} as const;

interface LoopState {
  conversation: PetrosConversation;
  message: PetrosMessage;
  blocks: PetrosBlock[];
  input: unknown[];
  usage: PetrosUsage;
  /** How hard the model thinks on this turn. Persisted across a pause so a resumed draft stays a draft. */
  effort: ReasoningEffort;
  /**
   * Read calls already answered on this turn, keyed by tool + arguments. A model that re-asks the
   * same question gets a pointer back to its own earlier result instead of a second full payload —
   * which would otherwise sit in `input` and be re-billed on every remaining iteration.
   */
  memo: Set<string>;
}

/**
 * The Petros agent loop — OpenAI Responses API streaming with a MANUAL tool loop (never an SDK
 * auto-runner): every function_call passes `evaluateGuardrail` before execution. Reads execute
 * inline via the existing audited portal services; mutations create a portal_ai_run and pause the
 * stream on a confirmation card. THE invariant is never relaxed.
 */
@Injectable()
export class PetrosAgentService {
  private readonly logger = new Logger(PetrosAgentService.name);

  constructor(
    private readonly repo: PetrosRepository,
    private readonly openai: PetrosOpenAiService,
    private readonly registry: PetrosToolRegistry,
    private readonly runs: PortalCopilotRepository,
    private readonly attachments: PetrosAttachmentService,
    private readonly topicality: PetrosTopicalityService,
    private readonly settings: SettingsService,
    private readonly history: PetrosHistoryService,
  ) {}

  // ── Turn entrypoints ─────────────────────────────────────────────────────────

  async startTurn(
    ctx: PortalActionContext,
    conversation: PetrosConversation,
    userText: string,
    emit: Emit,
    attachmentIds: string[] = [],
  ): Promise<void> {
    await this.assertNoActivePendingTurn(conversation.id);

    // Topicality pre-screen (Phase 6). Cheapest-first; resume turns never re-classify, and the
    // turn straight after a decline is a flagged retry that goes to the main model.
    const history = await this.repo.messagesForConversation(conversation.id, 200);
    const lastAssistant = [...history].reverse().find((m) => m.role === 'assistant');
    const isDeclineRetry = lastAssistant?.stopReason === 'topic_declined';
    const policy = resolveAiPolicy(this.policiesFor(ctx), { institutionId: ctx.principal.institutionId });

    await this.repo.insertMessage({
      conversationId: conversation.id,
      institutionId: ctx.principal.institutionId,
      role: 'user',
      content: [
        { type: 'text', text: userText },
        ...attachmentIds.map((attachmentId) => ({ type: 'attachment_ref', attachmentId })),
      ],
      status: 'complete',
    });

    if (policy.topicalityMode === 'enforce' && !isDeclineRetry && !attachmentIds.length) {
      const { decline, category } = await this.topicality.shouldDecline(ctx, userText);
      if (decline && category) {
        await this.topicality.recordDecline(ctx, userText, category);
        const declineText = this.topicality.declineMessage;
        const message = await this.repo.insertMessage({
          conversationId: conversation.id,
          institutionId: ctx.principal.institutionId,
          role: 'assistant',
          content: [{ type: 'text', text: declineText }],
          status: 'complete',
          stopReason: 'topic_declined',
          model: this.openai.modelFor('small'),
        });
        await this.repo.updateConversation(conversation.id, { lastMessageAt: new Date() });
        emit({ type: 'message_start', messageId: message.id, conversationId: conversation.id });
        emit({ type: 'text_delta', delta: declineText });
        emit({ type: 'message_complete', messageId: message.id });
        return;
      }
    }

    // The verbatim window starts at the summary watermark: everything older is already carried by
    // `conversation.summary`, so it is never resent.
    const { input, summary } = await this.history.buildInput(conversation);
    if (attachmentIds.length) {
      // Replace the plain last user message with a multimodal one carrying the file blocks.
      const { blocks } = await this.attachments.toInputBlocks(ctx, attachmentIds);
      input.pop();
      input.push({ role: 'user', content: [{ type: 'input_text', text: userText }, ...blocks] });
    }
    const message = await this.repo.insertMessage({
      conversationId: conversation.id,
      institutionId: ctx.principal.institutionId,
      role: 'assistant',
      content: [],
      status: 'streaming',
      model: this.openai.modelFor('chat'),
    });
    emit({ type: 'message_start', messageId: message.id, conversationId: conversation.id });

    const state: LoopState = {
      conversation: { ...conversation, summary },
      message,
      blocks: [],
      input,
      usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
      effort: this.effortFor(userText, attachmentIds.length > 0),
      memo: new Set(),
    };
    await this.runLoop(ctx, state, emit);
  }

  /**
   * A lookup and a piece of drafting were paying the same reasoning bill. Reading an attachment or
   * producing prose earns the extra thinking; "how many students are in Grade 5A" does not.
   */
  private effortFor(userText: string, hasAttachments: boolean): ReasoningEffort {
    const heavy =
      hasAttachments || userText.length > LONG_PROMPT_CHARS || DRAFTING_INTENT.test(userText);
    return this.openai.resolveEffort(heavy ? 'heavy' : 'light');
  }

  /** Resume after the user answers an ask_user question. */
  async answer(ctx: PortalActionContext, pendingTurnId: string, optionId: string, emit: Emit): Promise<void> {
    const pending = await this.requirePending(ctx, pendingTurnId, 'question');
    const state = await this.restoreState(ctx, pending);

    // Record the answer on the question block so history renders it.
    state.blocks = state.blocks.map((b) =>
      b.type === 'question' ? { ...b, answeredOptionId: optionId } : b,
    );
    state.input.push(fnOutput(pending.pendingCallId, { answer: optionId }));
    await this.repo.resolvePendingTurn(pending.id);
    await this.runLoop(ctx, state, emit);
  }

  /** Confirm a mutation run raised from chat: execute the tool, then resume the loop. */
  async confirmRun(ctx: PortalActionContext, runId: string, emit: Emit): Promise<void> {
    const run = await this.runs.findRun(runId, ctx.principal.institutionId);
    if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Run not found' });
    if (run.status !== AiActionStatus.AwaitingConfirmation) {
      throw new ConflictException({ code: 'NOT_AWAITING_CONFIRMATION', message: `Run is ${run.status}.` });
    }
    const pending = await this.repo.findPendingTurnByRun(runId, ctx.principal.institutionId);
    if (!pending) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No paused chat turn for this run' });
    if (pending.expiresAt.getTime() < Date.now()) {
      await this.expirePending(pending, run.id);
      throw new ConflictException({ code: 'RUN_EXPIRED', message: 'This confirmation has expired.' });
    }

    const [toolCall] = await this.runs.toolCallsForRun(runId);
    const tool = toolCall && this.registry.get(toolCall.toolKey);
    if (!toolCall || !tool) {
      throw new ConflictException({ code: 'TOOL_MISSING', message: 'The prepared tool is no longer available.' });
    }
    // Per-tool permission re-assert at confirm time — the confirming human must hold the keys.
    if (!canAll(ctx.principal.permissions, [...tool.requiredPermissions])) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: `Missing required permission: ${tool.requiredPermissions.join(', ')}` });
    }

    await this.runs.updateRun(runId, { status: AiActionStatus.Confirmed });
    await this.runs.insertConfirmation({
      runId,
      institutionId: ctx.principal.institutionId,
      institutionUserId: ctx.principal.institutionUserId,
      userName: ctx.principal.fullName,
      method: 'recent_auth',
      reason: null,
    });

    const state = await this.restoreState(ctx, pending);
    let output: unknown;
    let ok = true;
    emit({ type: 'tool_started', toolName: tool.name, humanStatus: tool.humanStatus });
    try {
      output = await tool.execute(ctx, (toolCall.args ?? {}) as Record<string, unknown>);
      await this.runs.updateToolCall(toolCall.id, {
        status: AiActionStatus.Executed,
        result: redactSecrets(output ?? {}) as Record<string, unknown>,
        executedAt: new Date(),
      });
      await this.runs.updateRun(runId, { status: AiActionStatus.Executed, completedAt: new Date() });
    } catch (e) {
      ok = false;
      output = { error: e instanceof Error ? e.message : 'execution failed' };
      await this.runs.updateToolCall(toolCall.id, {
        status: AiActionStatus.Failed,
        errorDetail: e instanceof Error ? e.message : 'execution failed',
      });
      await this.runs.updateRun(runId, { status: AiActionStatus.Failed, completedAt: new Date() });
    }
    emit({ type: 'tool_finished', toolName: tool.name, ok });
    state.blocks.push({
      type: 'tool_activity',
      toolName: tool.name,
      status: ok ? 'done' : 'failed',
      summary: ok ? `${tool.humanStatus.replace(/…$/, '')} — done` : 'Action failed',
    });
    const artifactId = (output as { artifactId?: string } | undefined)?.artifactId;
    if (ok && typeof artifactId === 'string' && artifactId) {
      const artifact = await this.repo.findArtifact(artifactId, ctx.principal.institutionId);
      if (artifact) {
        state.blocks.push({ type: 'artifact_ref', artifactId });
        emit({ type: 'artifact', artifactId, kind: artifact.kind, title: artifact.title });
      }
    }

    state.input.push(fnOutput(pending.pendingCallId, redactSecrets(output ?? {})));
    await this.repo.resolvePendingTurn(pending.id);
    await this.runLoop(ctx, state, emit);
  }

  /** Reject a mutation run raised from chat — the thread must not dead-end. */
  async rejectRun(ctx: PortalActionContext, runId: string, emit: Emit): Promise<void> {
    const run = await this.runs.findRun(runId, ctx.principal.institutionId);
    if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Run not found' });
    const pending = await this.repo.findPendingTurnByRun(runId, ctx.principal.institutionId);
    if (!pending) throw new NotFoundException({ code: 'NOT_FOUND', message: 'No paused chat turn for this run' });

    if (run.status === AiActionStatus.AwaitingConfirmation) {
      await this.runs.updateRun(runId, { status: AiActionStatus.Rejected, completedAt: new Date() });
      const calls = await this.runs.toolCallsForRun(runId);
      for (const c of calls) {
        if (c.status === AiActionStatus.AwaitingConfirmation) {
          await this.runs.updateToolCall(c.id, { status: AiActionStatus.Rejected });
        }
      }
    }

    const state = await this.restoreState(ctx, pending);
    state.input.push(fnOutput(pending.pendingCallId, { status: 'rejected_by_user' }));
    await this.repo.resolvePendingTurn(pending.id);
    await this.runLoop(ctx, state, emit);
  }

  // ── The loop ─────────────────────────────────────────────────────────────────

  private async runLoop(ctx: PortalActionContext, state: LoopState, emit: Emit): Promise<void> {
    const institution = await this.repo.institutionBasics(ctx.principal.institutionId);
    const effective = await this.settings.getEffective(ctx);
    const tools = this.registry.availableFor(ctx.principal.permissions, institution?.type ?? 'school');
    const instructions = buildInstructions({
      institutionName: institution?.name ?? 'this institution',
      institutionType: institution?.type ?? 'school',
      nomenclature: effective.nomenclature,
      fullName: ctx.principal.fullName,
      roleKeys: ctx.principal.roleKeys,
      permissions: ctx.principal.permissions,
      tools,
      conversationSummary: state.conversation.summary,
    });
    const openaiTools = [...this.registry.toOpenAiTools(tools), ASK_USER_TOOL];

    try {
      for (let i = 0; i < MAX_LOOP_ITERATIONS; i += 1) {
        const stream = (await this.openai.streamResponse({
          instructions,
          input: state.input,
          tools: openaiTools,
          effort: state.effort,
          // Keyed on the conversation so every iteration of every turn in this thread lands on the
          // same cache prefix. The input array only ever grows at the tail, which is precisely the
          // shape prefix caching rewards.
          prompt_cache_key: state.conversation.id,
        })) as unknown as AsyncIterable<Record<string, unknown>>;

        let text = '';
        type CompletedResponse = { output?: Record<string, unknown>[]; usage?: unknown };
        let response: CompletedResponse | null = null;
        for await (const event of stream) {
          const type = event.type as string;
          if (type === 'response.output_text.delta') {
            const delta = String((event as { delta?: unknown }).delta ?? '');
            text += delta;
            emit({ type: 'text_delta', delta });
          } else if (type === 'response.completed') {
            response = (event as { response?: CompletedResponse }).response ?? null;
          } else if (type === 'response.failed') {
            throw new Error('The model provider reported a failure for this turn.');
          }
        }
        if (text) state.blocks.push({ type: 'text', text });
        const usage = extractUsage(response?.usage);
        state.usage.inputTokens += usage.inputTokens;
        state.usage.outputTokens += usage.outputTokens;
        state.usage.cachedInputTokens += usage.cachedInputTokens;

        const outputItems = response?.output ?? [];
        const calls = outputItems.filter((o) => o.type === 'function_call');
        // Echo the model's own output back into the input for the next iteration.
        state.input.push(...outputItems);

        if (!calls.length) {
          await this.finishMessage(state, 'complete', emit);
          return;
        }

        for (const call of calls) {
          const paused = await this.handleFunctionCall(ctx, state, call, emit);
          if (paused) return; // stream ends; a pending turn holds the loop state
        }
      }
      // Iteration cap reached — close out gracefully.
      state.blocks.push({ type: 'text', text: 'I had to stop here — this request needed too many steps. Try narrowing it down.' });
      await this.finishMessage(state, 'complete', emit);
    } catch (e) {
      this.logger.error(`Petros turn failed: ${e instanceof Error ? e.message : e}`);
      await this.repo.updateMessage(state.message.id, {
        content: state.blocks as Record<string, unknown>[],
        status: 'error',
        stopReason: e instanceof Error ? e.message.slice(0, 500) : 'error',
      });
      emit({ type: 'error', code: 'TURN_FAILED', message: e instanceof Error ? e.message : 'The turn failed.' });
    }
  }

  /** Returns true when the loop paused (question or confirmation) and the stream must end. */
  private async handleFunctionCall(
    ctx: PortalActionContext,
    state: LoopState,
    call: Record<string, unknown>,
    emit: Emit,
  ): Promise<boolean> {
    const name = String(call.name ?? '');
    const callId = String(call.call_id ?? '');
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(String(call.arguments ?? '{}')) as Record<string, unknown>;
    } catch {
      state.input.push(fnOutput(callId, { error: 'Arguments were not valid JSON.' }));
      return false;
    }

    if (name === 'ask_user') {
      const question = String(args.question ?? 'Could you clarify?');
      const options = Array.isArray(args.options)
        ? (args.options as { id: string; label: string }[]).slice(0, 6)
        : [];
      state.blocks.push({ type: 'question', question, options, answeredOptionId: null });
      const pending = await this.pause(ctx, state, 'question', callId, null, { question, options });
      emit({ type: 'question', pendingTurnId: pending.id, question, options });
      await this.finishMessage(state, 'awaiting_input', emit);
      return true;
    }

    const tool = this.registry.get(name);
    if (!tool) {
      state.input.push(fnOutput(callId, { error: `Unknown tool: ${name}` }));
      return false;
    }
    const parsed = tool.inputSchema.safeParse(args);
    if (!parsed.success) {
      state.input.push(fnOutput(callId, { error: `Invalid arguments: ${parsed.error.issues.map((i) => i.message).join('; ')}` }));
      return false;
    }
    // Layer 2: per-tool permission re-assert (layer 1 was registry filtering).
    if (!canAll(ctx.principal.permissions, [...tool.requiredPermissions])) {
      state.input.push(fnOutput(callId, { error: 'You lack the permission required for this action.' }));
      return false;
    }

    const guardrail = evaluateGuardrail({
      proposed: {
        capability: tool.capability === 'read' ? AiCapability.Analysis : AiCapability.Communications,
        action: tool.name,
        requiredPermission: tool.requiredPermissions[0],
        financialImpactMinor: 0,
        affectedUsers: 0,
        reversible: tool.capability === 'read',
      },
      policies: this.policiesFor(ctx),
      rules: [],
      context: { institutionId: ctx.principal.institutionId },
    });

    if (guardrail.decision === AiGuardrailDecision.Blocked) {
      state.blocks.push({ type: 'tool_activity', toolName: tool.name, status: 'blocked', summary: guardrail.reason });
      state.input.push(fnOutput(callId, { error: `Blocked by guardrails: ${guardrail.reason}` }));
      return false;
    }

    if (tool.capability === 'read' && guardrail.decision === AiGuardrailDecision.Allow) {
      // Already answered this exact question on this turn. Re-running it would put a second copy of
      // the payload into `input`, where every remaining iteration would pay for it again — so point
      // the model back at its own result instead. Only ever fires on an exact argument match, which
      // means the model is going round in circles.
      const key = memoKey(tool.name, parsed.data as Record<string, unknown>);
      if (state.memo.has(key)) {
        state.input.push({
          type: 'function_call_output',
          call_id: callId,
          output: `Already answered above — the earlier ${tool.name} call in this turn used identical arguments and its result has not changed. Use that result.`,
        });
        return false;
      }
      state.memo.add(key);

      emit({ type: 'tool_started', toolName: tool.name, humanStatus: tool.humanStatus });
      try {
        const result = await tool.execute(ctx, {
          ...(parsed.data as Record<string, unknown>),
          __conversationId: state.conversation.id,
        });
        state.blocks.push({
          type: 'tool_activity',
          toolName: tool.name,
          status: 'done',
          summary: tool.humanStatus.replace(/…$/, ''),
        });
        emit({ type: 'tool_finished', toolName: tool.name, ok: true });
        const readArtifactId = (result as { artifactId?: string } | undefined)?.artifactId;
        if (typeof readArtifactId === 'string' && readArtifactId) {
          const artifact = await this.repo.findArtifact(readArtifactId, ctx.principal.institutionId);
          if (artifact) {
            state.blocks.push({ type: 'artifact_ref', artifactId: readArtifactId });
            emit({ type: 'artifact', artifactId: readArtifactId, kind: artifact.kind, title: artifact.title });
          }
        }
        const out = fnOutput(callId, redactSecrets(result ?? {}));
        // Tool results are the tail of the input array, so they are re-billed on every remaining
        // iteration. This is the line to watch when a tool starts getting expensive.
        this.logger.debug(`tool ${tool.name} → ~${estimateTokens(String(out.output))} tokens`);
        state.input.push(out);
      } catch (e) {
        state.blocks.push({ type: 'tool_activity', toolName: tool.name, status: 'failed', summary: 'Lookup failed' });
        emit({ type: 'tool_finished', toolName: tool.name, ok: false });
        state.input.push(fnOutput(callId, { error: e instanceof Error ? e.message : 'tool failed' }));
      }
      return false;
    }

    // Mutation (or anything the guardrail says needs confirmation): create a run + pause.
    const preview = tool.impactPreview
      ? await tool.impactPreview(ctx, parsed.data as Record<string, unknown>)
      : { summary: tool.description };
    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const run = await this.runs.insertRun({
      institutionId: ctx.principal.institutionId,
      campusId,
      institutionUserId: ctx.principal.institutionUserId,
      userName: ctx.principal.fullName,
      prompt: `Petros chat action: ${tool.name}`,
      context: { conversationId: state.conversation.id },
      contextSources: ['petros_conversation'],
      status: AiActionStatus.AwaitingConfirmation,
      summary: String(preview.summary ?? tool.description),
      model: this.openai.modelFor('chat'),
      promptVersion: PETROS_PROMPT_VERSION,
      riskLevel: RiskLevel.Medium,
      conversationId: state.conversation.id,
      messageId: state.message.id,
      expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
      createdBy: ctx.principal.institutionUserId,
    });
    await this.runs.insertToolCall({
      runId: run.id,
      institutionId: ctx.principal.institutionId,
      toolKey: tool.name,
      capability: AiCapability.Communications,
      args: redactSecrets({
        ...(parsed.data as Record<string, unknown>),
        __conversationId: state.conversation.id,
      }) as Record<string, unknown>,
      requiredPermission: tool.requiredPermissions[0],
      decision: AiGuardrailDecision.NeedsConfirmation,
      decisionLayer: 'petros_mutation',
      decisionReason: 'State-changing action — requires human confirmation.',
      riskLevel: RiskLevel.Medium,
      reversible: false,
      impactPreview: preview,
      status: AiActionStatus.AwaitingConfirmation,
    });

    state.blocks.push({ type: 'confirmation_ref', runId: run.id });
    const pending = await this.pause(ctx, state, 'confirmation', callId, run.id, {});
    emit({
      type: 'confirmation_required',
      runId: run.id,
      pendingTurnId: pending.id,
      card: { summary: preview.summary, toolName: tool.name, impact: preview },
    });
    await this.finishMessage(state, 'awaiting_confirmation', emit);
    return true;
  }

  // ── Plumbing ─────────────────────────────────────────────────────────────────

  private policiesFor(ctx: PortalActionContext): AiPolicyInput[] {
    return [
      {
        scope: FeatureScope.Institution,
        scopeId: ctx.principal.institutionId,
        enabled: true,
        mode: AiMode.Full,
      },
    ];
  }

  private async pause(
    ctx: PortalActionContext,
    state: LoopState,
    kind: 'question' | 'confirmation',
    callId: string,
    runId: string | null,
    payload: Record<string, unknown>,
  ): Promise<PetrosPendingTurn> {
    return this.repo.insertPendingTurn({
      conversationId: state.conversation.id,
      institutionId: ctx.principal.institutionId,
      kind,
      runId,
      messageId: state.message.id,
      apiInput: redactSecrets(state.input) as unknown[],
      pendingCallId: callId,
      // `effort` rides along so a resumed turn keeps the thinking budget the turn was started with:
      // confirming a drafted circular must not finish it at lookup effort.
      payload: { ...payload, effort: state.effort },
      expiresAt: new Date(Date.now() + CONFIRMATION_TTL_MS),
    });
  }

  private async finishMessage(state: LoopState, status: string, emit: Emit): Promise<void> {
    const costMicroUsd = this.openai.costOf(state.usage, 'chat');
    await this.repo.updateMessage(state.message.id, {
      content: state.blocks as Record<string, unknown>[],
      status,
      inputTokens: state.usage.inputTokens,
      outputTokens: state.usage.outputTokens,
      cachedInputTokens: state.usage.cachedInputTokens,
      costMicroUsd,
    });
    await this.repo.updateConversation(state.conversation.id, { lastMessageAt: new Date() });
    const usage = { ...state.usage, costMicroUsd };
    if (status === 'complete') {
      const title = await this.maybeTitle(state.conversation);
      emit({ type: 'message_complete', messageId: state.message.id, usage, title });
      // Compact the history AFTER the user has their answer — the nano round-trip must never sit in
      // front of the response.
      await this.history.maybeSummarize(state.conversation);
    } else {
      emit({ type: 'message_complete', messageId: state.message.id, usage });
    }
  }

  /** Fire-and-forget nano title after the first exchange. */
  private async maybeTitle(conversation: PetrosConversation): Promise<string | null> {
    if (conversation.title) return conversation.title;
    try {
      const messages = await this.repo.messagesForConversation(conversation.id, 4);
      const seed = messages
        .map((m) => `${m.role}: ${(m.content as { type: string; text?: string }[]).filter((b) => b.type === 'text').map((b) => b.text).join(' ')}`)
        .join('\n')
        .slice(0, 1500);
      const { text } = await this.openai.text('small', {
        instructions: 'Write a 3-6 word title for this conversation. Output only the title, no quotes.',
        input: seed,
        maxOutputTokens: 60,
      });
      const title = text.slice(0, 120) || null;
      if (title) await this.repo.updateConversation(conversation.id, { title });
      return title;
    } catch {
      return null;
    }
  }

  private async restoreState(ctx: PortalActionContext, pending: PetrosPendingTurn): Promise<LoopState> {
    const conversation = await this.repo.findConversation(pending.conversationId, ctx.principal.institutionId);
    if (!conversation) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Conversation not found' });
    if (conversation.institutionUserId !== ctx.principal.institutionUserId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Conversations are private to their owner.' });
    }
    const messages = await this.repo.messagesForConversation(conversation.id);
    const message = messages.find((m) => m.id === pending.messageId);
    if (!message) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Paused message not found' });
    const saved = (pending.payload as { effort?: ReasoningEffort } | null)?.effort;
    return {
      conversation,
      message,
      blocks: (message.content ?? []) as PetrosBlock[],
      input: [...(pending.apiInput ?? [])],
      usage: {
        inputTokens: message.inputTokens ?? 0,
        outputTokens: message.outputTokens ?? 0,
        cachedInputTokens: message.cachedInputTokens ?? 0,
      },
      effort: saved ?? this.openai.resolveEffort('heavy'),
      // The memo is a within-turn dedupe; a resumed turn starts a fresh one rather than trusting a
      // result the user may have spent fifteen minutes deciding about.
      memo: new Set(),
    };
  }

  private async requirePending(
    ctx: PortalActionContext,
    id: string,
    kind: 'question' | 'confirmation',
  ): Promise<PetrosPendingTurn> {
    const pending = await this.repo.findPendingTurn(id, ctx.principal.institutionId);
    if (!pending || pending.status !== 'pending' || pending.kind !== kind) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'No such paused turn' });
    }
    if (pending.expiresAt.getTime() < Date.now()) {
      await this.expirePending(pending, pending.runId);
      throw new ConflictException({ code: 'TURN_EXPIRED', message: 'This paused turn has expired. Send a new message.' });
    }
    return pending;
  }

  private async expirePending(pending: PetrosPendingTurn, runId: string | null): Promise<void> {
    await this.repo.resolvePendingTurn(pending.id, 'expired');
    await this.repo.updateMessage(pending.messageId, { status: 'complete', stopReason: 'expired' });
    if (runId) {
      await this.runs.updateRun(runId, { status: AiActionStatus.Expired, completedAt: new Date() });
    }
  }

  private async assertNoActivePendingTurn(conversationId: string): Promise<void> {
    const active = await this.repo.activePendingTurnForConversation(conversationId);
    if (!active) return;
    if (active.expiresAt.getTime() < Date.now()) {
      await this.expirePending(active, active.runId);
      return;
    }
    throw new ConflictException({
      code: 'TURN_PENDING',
      message: 'This conversation is waiting for an answer or confirmation. Resolve it first.',
    });
  }

}

/**
 * A tool result as the model sees it. `compactToolResult` is what stands between the model and a
 * raw `db.select()` row — see `context/compact.ts` for what it strips and why.
 */
function fnOutput(callId: string, output: unknown): Record<string, unknown> {
  return { type: 'function_call_output', call_id: callId, output: compactToolResult(output) };
}

/** Memo key for a read call. Key order must not matter, and the injected conversation id is constant. */
function memoKey(toolName: string, args: Record<string, unknown>): string {
  const entries = Object.entries(args)
    .filter(([k]) => !k.startsWith('__'))
    .sort(([a], [b]) => a.localeCompare(b));
  return `${toolName}(${JSON.stringify(entries)})`;
}
