import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ApiEnv } from '@edrion/config';
import {
  PETROS_ACTION_KEYS,
  PETROS_COMPANION_SCHEMA_VERSION,
  PETROS_DEFAULT_COMPANION_PREFERENCES,
  petrosCompanionBlockSchema,
  petrosCompanionPreferencesSchema,
  resolvePetrosRoute,
  type PetrosActionKey,
  type PetrosActionResult,
  type PetrosCompanionBlock,
  type PetrosCompanionMessage,
  type PetrosCompanionPreferences,
  type PetrosCompanionThread,
  type PetrosCompanionTurnInput,
  type PetrosCompanionTurnResult,
  type PetrosSurface,
} from '@edrion/schemas';
import { API_ENV } from '../../../common/tokens';
import { PetrosAiGatewayService } from '../../petros-ai-routing/petros-ai-gateway.service';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosActionRegistryService } from './petros-action-registry.service';
import {
  COMPANION_RESPONSE_JSON_SCHEMA,
  PETROS_COMPANION_PROMPT_VERSION,
  buildCompanionSystemPrompt,
  correctCompletionClaim,
  humourAllowed,
  isDistressed,
} from './petros-companion.prompt';
import { COMPANION_VERBATIM_WINDOW, PetrosCompanionRepository } from './petros-companion.repository';
import {
  PetrosStudentContextService,
  type ResolvedPageContext,
} from './petros-student-context.service';

const PROPOSAL_TTL_MINUTES = 30;

const modelReplySchema = z.object({
  answer: z.string().trim().min(1).max(2_000),
  topic: z.string().trim().max(120).optional(),
  suggestedReplies: z.array(z.string().trim().min(1).max(70)).max(3).optional(),
  citedRefs: z.array(z.string().trim().min(1).max(160)).max(6).optional(),
  action: z
    .object({
      actionKey: z.enum(PETROS_ACTION_KEYS),
      // Arguments arrive flattened so the provider's JSON-schema support can describe
      // each field. `arguments` remains accepted for forward compatibility.
      arguments: z.record(z.unknown()).optional(),
      href: z.string().optional(),
      sourceRef: z.string().optional(),
      question: z.string().optional(),
      minutes: z.number().optional(),
      sessionId: z.string().optional(),
      artifactId: z.string().optional(),
      topic: z.string().optional(),
      itemId: z.string().optional(),
      title: z.string().optional(),
      startsAt: z.string().optional(),
      items: z
        .array(z.object({ title: z.string(), startsAt: z.string(), minutes: z.number() }))
        .optional(),
    })
    .optional(),
});

/** Collapses the flattened action fields back into the registry's argument shape. */
function actionArguments(action: NonNullable<z.infer<typeof modelReplySchema>['action']>) {
  const flat: Record<string, unknown> = { ...(action.arguments ?? {}) };
  for (const key of [
    'href',
    'sourceRef',
    'question',
    'minutes',
    'sessionId',
    'artifactId',
    'topic',
    'itemId',
    'title',
    'startsAt',
    'items',
  ] as const) {
    const value = action[key];
    if (value !== undefined) flat[key] = value;
  }
  return flat;
}

type MessageRow = {
  id: string;
  threadId: string;
  role: string;
  blocks: unknown[];
  route: string | null;
  surface: string | null;
  focusRef: string | null;
  createdAt: Date;
};

@Injectable()
export class PetrosCompanionService {
  constructor(
    private readonly repo: PetrosCompanionRepository,
    private readonly context: PetrosStudentContextService,
    private readonly actions: PetrosActionRegistryService,
    private readonly gateway: PetrosAiGatewayService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  private scope(principal: InstitutionalStudentPrincipal) {
    return { institutionId: principal.institutionId, studentId: principal.studentId };
  }

  /* ---------------------------------------------------------------- *
   * Threads
   * ---------------------------------------------------------------- */

  /**
   * Always returns an envelope. A bare `null` body serialises to an empty HTTP response,
   * which a JSON client cannot distinguish from a parse failure.
   */
  async openThread(
    principal: InstitutionalStudentPrincipal,
    threadId?: string,
  ): Promise<{ thread: PetrosCompanionThread | null }> {
    const scope = this.scope(principal);
    const thread = threadId
      ? await this.repo.findThread(scope, threadId)
      : await this.repo.latestActiveThread(scope);
    if (!thread) return { thread: null };
    await this.syncSessionResults(principal, thread.id);
    const messages = await this.repo.listMessages(scope, thread.id);
    return { thread: this.threadDto(thread, messages as MessageRow[]) };
  }

  /**
   * Closes the loop on a teaching session the companion started.
   *
   * When the student finishes a session they came to from this thread, the thread should say
   * so rather than ending on "Session ready." The summary is assembled from stored session
   * state, never a model, and the derived idempotency key means it lands exactly once
   * however many times the thread is reloaded.
   */
  private async syncSessionResults(principal: InstitutionalStudentPrincipal, threadId: string) {
    const scope = this.scope(principal);
    const proposals = await this.repo.listProposals(scope, threadId);
    const sessionProposals = proposals.filter(
      (proposal) =>
        proposal.status === 'executed' &&
        proposal.resultRef &&
        (proposal.actionKey === 'session.preview_and_start' || proposal.actionKey === 'session.resume'),
    );
    if (!sessionProposals.length) return;

    for (const proposal of sessionProposals) {
      const summary = await this.actions.closedSessionSummary(principal, proposal.resultRef!);
      if (!summary) continue;
      const blocks: PetrosCompanionBlock[] = [
        {
          type: 'text',
          text: summary.artifactCount
            ? `You finished ${summary.topic}. ${summary.completed} of ${summary.total} checkpoints done, and you saved ${summary.artifactCount} ${summary.artifactCount === 1 ? 'thing' : 'things'} to review later.`
            : `You finished ${summary.topic}. ${summary.completed} of ${summary.total} checkpoints done.`,
        },
        { type: 'status', label: 'Session complete', tone: 'positive' },
      ];
      if (summary.artifactCount) {
        blocks.push({ type: 'navigation', label: 'Open what you saved', href: '/petros/artifacts' });
      }
      await this.repo.insertMessage({
        institutionId: principal.institutionId,
        studentId: principal.studentId,
        threadId,
        role: 'petros',
        blocks,
        route: '/petros/session',
        surface: 'unknown',
        idempotencyKey: derivedUuid(proposal.resultRef!, 'session-result'),
        schemaVersion: PETROS_COMPANION_SCHEMA_VERSION,
      });
    }
  }

  async listThreads(principal: InstitutionalStudentPrincipal) {
    const threads = await this.repo.listThreads(this.scope(principal));
    return {
      items: threads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        activeTopic: thread.activeTopic,
        status: thread.status,
        lastActivityAt: thread.lastActivityAt.toISOString(),
      })),
    };
  }

  async archiveThread(principal: InstitutionalStudentPrincipal, threadId: string) {
    const archived = await this.repo.archiveThread(this.scope(principal), threadId);
    if (!archived) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    return { id: archived.id, status: archived.status };
  }

  async deleteThread(principal: InstitutionalStudentPrincipal, threadId: string) {
    const removed = await this.repo.deleteThread(this.scope(principal), threadId);
    if (!removed) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    return { id: removed.id, deleted: true };
  }

  /* ---------------------------------------------------------------- *
   * Preferences
   * ---------------------------------------------------------------- */

  async preferences(principal: InstitutionalStudentPrincipal): Promise<PetrosCompanionPreferences> {
    const row = await this.repo.findPreferences(this.scope(principal));
    if (!row) return PETROS_DEFAULT_COMPANION_PREFERENCES;
    return petrosCompanionPreferencesSchema.parse({
      preferredName: row.preferredName,
      responseDepth: row.responseDepth,
      energy: row.energy,
      humour: row.humour,
      proactiveCheckIns: row.proactiveCheckIns,
      language: row.language,
      quietMode: row.quietMode,
    });
  }

  async savePreferences(
    principal: InstitutionalStudentPrincipal,
    input: PetrosCompanionPreferences,
  ): Promise<PetrosCompanionPreferences> {
    const row = await this.repo.upsertPreferences(this.scope(principal), {
      preferredName: input.preferredName,
      responseDepth: input.responseDepth,
      energy: input.energy,
      humour: input.humour,
      proactiveCheckIns: input.proactiveCheckIns,
      language: input.language,
      quietMode: input.quietMode,
    });
    return petrosCompanionPreferencesSchema.parse({
      preferredName: row.preferredName,
      responseDepth: row.responseDepth,
      energy: row.energy,
      humour: row.humour,
      proactiveCheckIns: row.proactiveCheckIns,
      language: row.language,
      quietMode: row.quietMode,
    });
  }

  /* ---------------------------------------------------------------- *
   * Turns
   * ---------------------------------------------------------------- */

  async turn(
    principal: InstitutionalStudentPrincipal,
    input: PetrosCompanionTurnInput,
  ): Promise<PetrosCompanionTurnResult> {
    const scope = this.scope(principal);

    // Replay: the same key must never make a second AI call or a second message.
    const replayedStudent = await this.repo.findMessageByKey(scope, input.idempotencyKey, 'student');
    if (replayedStudent) {
      const replayedReply = await this.repo.findMessageByKey(scope, input.idempotencyKey, 'petros');
      if (replayedReply) {
        return {
          schemaVersion: PETROS_COMPANION_SCHEMA_VERSION,
          threadId: replayedStudent.threadId,
          studentMessage: this.messageDto(replayedStudent as MessageRow),
          reply: this.messageDto(replayedReply as MessageRow),
          replayed: true,
        };
      }
    }

    const rule = resolvePetrosRoute(input.route);
    const context = await this.context.resolve(principal, {
      route: input.route,
      surface: input.surface,
      candidates: input.visibleCandidates,
      ...(input.focusRef ? { focusRef: input.focusRef } : {}),
    });

    const thread =
      (input.threadId ? await this.repo.findThread(scope, input.threadId) : null) ??
      (await this.repo.createThread(scope, {
        title: input.message.slice(0, 80),
        activeTopic: context.focus?.title ?? rule.label,
        campusId: principal.campusId,
      }));

    const [history, preferences] = await Promise.all([
      this.repo.listMessages(scope, thread.id) as Promise<MessageRow[]>,
      this.preferences(principal),
    ]);
    const compacted = await this.compact(principal, thread, history);

    const studentMessage =
      replayedStudent ??
      (await this.repo.insertMessage({
        institutionId: principal.institutionId,
        studentId: principal.studentId,
        threadId: thread.id,
        role: 'student',
        blocks: [{ type: 'text', text: input.message }],
        route: context.route,
        surface: context.surface,
        focusRef: context.focus?.ref ?? null,
        idempotencyKey: input.idempotencyKey,
        schemaVersion: PETROS_COMPANION_SCHEMA_VERSION,
      })) ??
      (await this.repo.findMessageByKey(scope, input.idempotencyKey, 'student'));

    if (!studentMessage) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });

    const blocks = await this.generate({
      principal,
      thread: { id: thread.id, summary: compacted },
      history,
      context,
      preferences,
      input,
      messageId: studentMessage.id,
    });

    const reply =
      (await this.repo.insertMessage({
        institutionId: principal.institutionId,
        studentId: principal.studentId,
        threadId: thread.id,
        role: 'petros',
        blocks,
        route: context.route,
        surface: context.surface,
        focusRef: context.focus?.ref ?? null,
        idempotencyKey: input.idempotencyKey,
        promptVersion: PETROS_COMPANION_PROMPT_VERSION,
        schemaVersion: PETROS_COMPANION_SCHEMA_VERSION,
      })) ?? (await this.repo.findMessageByKey(scope, input.idempotencyKey, 'petros'));

    if (!reply) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });

    await this.repo.touchThread(scope, thread.id, {
      activeTopic: context.focus?.title ?? thread.activeTopic,
      activeFocusRef: context.focus?.ref ?? null,
    });

    return {
      schemaVersion: PETROS_COMPANION_SCHEMA_VERSION,
      threadId: thread.id,
      studentMessage: this.messageDto(studentMessage as MessageRow),
      reply: this.messageDto(reply as MessageRow),
      replayed: false,
    };
  }

  /**
   * Folds turns older than the verbatim window into a short thread summary.
   *
   * Without this a long conversation silently loses everything past the last dozen turns:
   * the prompt would simply stop including it and Petros would forget what was agreed
   * earlier with no sign that anything had gone. Returns the summary to use for this turn.
   */
  private async compact(
    principal: InstitutionalStudentPrincipal,
    thread: { id: string; summary: string | null; summaryWatermark: number },
    history: MessageRow[],
  ): Promise<string | null> {
    const foldTo = history.length - COMPANION_VERBATIM_WINDOW;
    if (foldTo <= thread.summaryWatermark) return thread.summary;

    const pending = history.slice(thread.summaryWatermark, foldTo);
    if (!pending.length) return thread.summary;

    const transcript = pending
      .map((message) => `${message.role === 'petros' ? 'Petros' : 'Student'}: ${blockText(message.blocks)}`)
      .join('\n');

    let summary = deterministicSummary(thread.summary, pending);
    if (this.env.PETROS_AI_MODE === 'live') {
      try {
        const result = await this.gateway.execute({
          context: {
            functionKey: 'companion.thread.summarize',
            topic: 'companion thread',
            sessionType: 'doubt',
            inputModality: 'text',
            language: 'en',
            institutionId: principal.institutionId,
            studentId: principal.studentId,
            estimatedTokens: 600,
            currentCostMicros: 0,
            previousFailures: 0,
            requiredReasoningQuality: 0.3,
          },
          system:
            'Compress a study conversation into a short factual note for continuity. Record what the student asked about, what was agreed, and anything they accepted or declined. Keep every specific name, date and number that was discussed. No advice, no invention, no personality judgements about the student. Plain text, at most 120 words. Return strict JSON.',
          input: [
            {
              type: 'text',
              text: JSON.stringify({ previousSummary: thread.summary, olderTurns: transcript }),
            },
          ],
          responseSchema: {
            type: 'object',
            additionalProperties: false,
            required: ['summary'],
            properties: { summary: { type: 'string', maxLength: 900 } },
          },
          correlationId: thread.id,
          metadata: { surface: 'student_companion_summary' },
        });
        const parsed = z.object({ summary: z.string().trim().min(1).max(900) }).safeParse(result.content);
        if (parsed.success) summary = parsed.data.summary;
      } catch {
        // Keep the deterministic fold rather than losing the older turns entirely.
      }
    }

    await this.repo.touchThread(this.scope(principal), thread.id, {
      summary,
      summaryWatermark: foldTo,
    });
    return summary;
  }

  /** Builds the reply blocks. Never throws: a failure degrades to an honest status block. */
  private async generate(args: {
    principal: InstitutionalStudentPrincipal;
    thread: { id: string; summary: string | null };
    history: MessageRow[];
    context: ResolvedPageContext;
    preferences: PetrosCompanionPreferences;
    input: PetrosCompanionTurnInput;
    messageId: string;
  }): Promise<PetrosCompanionBlock[]> {
    const { principal, context, preferences, input } = args;

    const availableActions = this.availableActions(context);
    const distressed = isDistressed(input.message);
    const recentSetback = this.recentSetback(context);
    // Resolved with the page context; querying the institution's timezone twice per turn
    // added a round trip to every message for no new information.
    const system = buildCompanionSystemPrompt({
      clock: context.clock,
      preferences,
      context,
      studentFirstName: principal.fullName.split(' ')[0] ?? 'there',
      allowHumour: humourAllowed({
        preferences,
        surface: context.surface,
        message: input.message,
        recentSetback,
      }),
      distressed,
      greetedAlready: args.history.some((message) => message.role === 'petros'),
      availableActions,
    });

    if (this.env.PETROS_AI_MODE !== 'live') {
      return this.offlineReply(context);
    }

    let parsed: z.infer<typeof modelReplySchema>;
    try {
      const result = await this.gateway.execute({
        context: {
          functionKey: 'companion.turn',
          topic: context.focus?.title ?? context.label,
          sessionType: 'doubt',
          inputModality: 'text',
          language: preferences.language,
          institutionId: principal.institutionId,
          studentId: principal.studentId,
          estimatedTokens: 900,
          currentCostMicros: 0,
          previousFailures: 0,
          requiredReasoningQuality: distressed ? 0.6 : 0.5,
        },
        system,
        input: [
          {
            type: 'text',
            text: JSON.stringify({
              conversationSummary: args.thread.summary,
              recentTurns: this.recentTurns(args.history),
              studentMessage: input.message,
            }),
          },
        ],
        responseSchema: COMPANION_RESPONSE_JSON_SCHEMA,
        correlationId: input.idempotencyKey,
        metadata: { surface: 'student_companion', route: context.route },
      });
      parsed = modelReplySchema.parse(result.content);
    } catch {
      return this.offlineReply(context);
    }

    let proposalBlock: PetrosCompanionBlock | null = null;
    if (parsed.action) {
      const validated = await this.actions.validate(principal, context, {
        actionKey: parsed.action.actionKey,
        arguments: actionArguments(parsed.action),
      });
      if (validated) {
        const proposal = await this.repo.insertProposal({
          institutionId: principal.institutionId,
          studentId: principal.studentId,
          threadId: args.thread.id,
          messageId: args.messageId,
          actionKey: validated.actionKey,
          arguments: validated.arguments,
          preview: validated.preview,
          confirmationRequired: validated.confirmationRequired,
          expiresAt: new Date(Date.now() + PROPOSAL_TTL_MINUTES * 60_000),
        });
        proposalBlock = {
          type: 'action_proposal',
          proposalId: proposal.id,
          actionKey: validated.actionKey,
          title: validated.title,
          preview: validated.preview,
          confirmationRequired: validated.confirmationRequired,
          status: 'proposed',
        };
      }
    }

    // A reply must never assert that something already happened: at this point nothing has.
    const answer = correctCompletionClaim(parsed.answer, Boolean(proposalBlock));
    const blocks: PetrosCompanionBlock[] = [{ type: 'text', text: answer }];

    // Sources: only refs the API itself resolved. A forged ref is dropped silently.
    for (const ref of parsed.citedRefs ?? []) {
      const candidate = context.candidates.find((item) => item.ref === ref);
      if (!candidate) continue;
      blocks.push({
        type: 'source',
        label: candidate.title,
        sourceRef: candidate.ref,
        ...(candidate.href ? { href: candidate.href } : {}),
      });
    }

    if (proposalBlock) blocks.push(proposalBlock);

    const replies = (parsed.suggestedReplies ?? []).filter(Boolean).slice(0, 3);
    if (replies.length) {
      blocks.push({
        type: 'suggested_replies',
        replies: replies.map((label, index) => ({
          id: `r${index}`,
          label,
          payload: label,
        })),
      });
    }

    return blocks.map((block) => petrosCompanionBlockSchema.parse(block));
  }

  /** Actions worth offering on this screen, given what actually resolved. */
  private availableActions(context: ResolvedPageContext): PetrosActionKey[] {
    if (context.support !== 'supported') return ['navigate.open'];
    const keys: PetrosActionKey[] = ['navigate.open', 'planner.create', 'review.open_due'];
    if (context.focus) keys.push('session.preview_and_start', 'teach_back.start');
    if (context.candidates.some((item) => item.entityType === 'petros_session')) {
      keys.push('session.resume');
    }
    return keys;
  }

  /** A published mark below 40% counts as a setback for tone purposes. */
  private recentSetback(context: ResolvedPageContext) {
    return context.candidates.some((candidate) => {
      if (candidate.entityType !== 'result') return false;
      const marks = Number(candidate.facts.marksObtained);
      const max = Number(candidate.facts.maxMarks);
      return Number.isFinite(marks) && Number.isFinite(max) && max > 0 && marks / max < 0.4;
    });
  }

  private recentTurns(history: MessageRow[]) {
    return history.slice(-COMPANION_VERBATIM_WINDOW).map((message) => ({
      role: message.role,
      text: blockText(message.blocks),
      route: message.route,
      focusRef: message.focusRef,
    }));
  }

  /**
   * The honest fallback. It never claims a fact and never pretends an action ran; it says
   * what Petros can see and offers the one thing that still works.
   */
  private offlineReply(context: ResolvedPageContext): PetrosCompanionBlock[] {
    if (context.support !== 'supported') {
      return [
        { type: 'text', text: context.reason ?? 'I cannot read this screen.' },
        { type: 'status', label: 'Not connected to this screen', tone: 'neutral' },
      ];
    }
    if (context.focus) {
      const facts = Object.entries(context.focus.facts)
        .filter(([, value]) => value !== null && value !== '')
        .slice(0, 3)
        .map(([key, value]) => `${humanize(key)}: ${value}`)
        .join(', ');
      return [
        {
          type: 'text',
          text: `Here is what your record says about ${context.focus.title}${facts ? ` — ${facts}` : ''}. I cannot give you a personalized answer right now, so try again in a moment.`,
        },
        { type: 'status', label: 'Personalized answers unavailable', tone: 'warning' },
      ];
    }
    return [
      {
        type: 'text',
        text: `I can see ${context.candidates.length} item${context.candidates.length === 1 ? '' : 's'} on ${context.label}. Pick one with "Ask Petros about this" and I will work from its exact record. I cannot generate a personalized answer right now.`,
      },
      { type: 'status', label: 'Personalized answers unavailable', tone: 'warning' },
    ];
  }

  /* ---------------------------------------------------------------- *
   * Action confirmation
   * ---------------------------------------------------------------- */

  async decideAction(
    principal: InstitutionalStudentPrincipal,
    proposalId: string,
    input: { decision: 'confirm' | 'decline'; idempotencyKey: string },
  ): Promise<PetrosActionResult> {
    const scope = this.scope(principal);
    await this.repo.expireStaleProposals(scope);
    const proposal = await this.repo.findProposal(scope, proposalId);
    if (!proposal) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    const actionKey = proposal.actionKey as PetrosActionKey;

    if (input.decision === 'decline') {
      // Declining never touches product state.
      await this.repo.settleProposal(scope, proposalId, { status: 'declined' });
      return {
        proposalId,
        actionKey,
        status: 'declined',
        href: null,
        message: 'Left it as it was.',
      };
    }

    if (proposal.status === 'executed') {
      return {
        proposalId,
        actionKey,
        status: 'executed',
        href: null,
        message: 'That is already done.',
      };
    }
    if (proposal.status !== 'proposed') {
      return {
        proposalId,
        actionKey,
        status: proposal.status as PetrosActionResult['status'],
        href: null,
        message: 'That suggestion is no longer current. Ask me again and I will redo it.',
      };
    }
    if (proposal.expiresAt.getTime() < Date.now()) {
      await this.repo.settleProposal(scope, proposalId, { status: 'expired' });
      return {
        proposalId,
        actionKey,
        status: 'expired',
        href: null,
        message: 'That suggestion expired. Ask me again and I will redo it.',
      };
    }

    // Everything checkable is checked before the first write. A student request runs inside
    // one institution-scoped transaction, so a statement that fails a database constraint
    // aborts the request and no recovery write can land afterwards.
    if (!this.actions.revalidate(actionKey, proposal.arguments)) {
      await this.repo.settleProposal(scope, proposalId, {
        status: 'failed',
        failureReason: 'arguments no longer valid',
      });
      return {
        proposalId,
        actionKey,
        status: 'failed',
        href: null,
        message: 'That suggestion is out of date now, so I left everything alone. Ask me again?',
      };
    }

    // Exactly-once: only the update that flips `proposed -> confirmed` may execute.
    const claimed = await this.repo.claimProposal(scope, proposalId, input.idempotencyKey);
    if (!claimed) {
      return {
        proposalId,
        actionKey,
        status: 'confirmed',
        href: null,
        message: 'Already handling that one.',
      };
    }

    try {
      const execution = await this.actions.execute(
        principal,
        actionKey,
        proposal.arguments,
        input.idempotencyKey,
      );
      await this.repo.settleProposal(scope, proposalId, {
        status: 'executed',
        resultRef: execution.resultRef,
      });
      return {
        proposalId,
        actionKey,
        status: 'executed',
        href: execution.href,
        message: execution.message,
      };
    } catch (error) {
      // Only reachable for failures that did not poison the request transaction. When a
      // database constraint did fail, the whole request rolls back: the proposal stays
      // `proposed`, nothing was written, and the student can simply confirm again.
      await this.repo.settleProposal(scope, proposalId, {
        status: 'failed',
        failureReason: error instanceof Error ? error.message.slice(0, 400) : 'unknown',
      });
      return {
        proposalId,
        actionKey,
        status: 'failed',
        href: null,
        message: 'That did not go through, so nothing changed. Want me to try again?',
      };
    }
  }

  /* ---------------------------------------------------------------- *
   * DTOs
   * ---------------------------------------------------------------- */

  private threadDto(
    thread: {
      id: string;
      title: string | null;
      activeTopic: string | null;
      status: string;
      lastActivityAt: Date;
    },
    messages: MessageRow[],
  ): PetrosCompanionThread {
    return {
      schemaVersion: PETROS_COMPANION_SCHEMA_VERSION,
      id: thread.id,
      title: thread.title,
      activeTopic: thread.activeTopic,
      status: thread.status === 'archived' ? 'archived' : 'active',
      lastActivityAt: thread.lastActivityAt.toISOString(),
      messages: messages.map((message) => this.messageDto(message)),
    };
  }

  private messageDto(message: MessageRow): PetrosCompanionMessage {
    return {
      id: message.id,
      threadId: message.threadId,
      role: message.role === 'petros' ? 'petros' : 'student',
      blocks: (message.blocks as PetrosCompanionBlock[]) ?? [],
      route: message.route,
      surface: (message.surface as PetrosSurface | null) ?? null,
      focusRef: message.focusRef,
      createdAt: message.createdAt.toISOString(),
    };
  }
}

/** Stable key per session, so the result message is inserted exactly once. */
function derivedUuid(value: string, purpose: string) {
  const hex = createHash('sha256').update(`${value}:${purpose}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/**
 * The fallback fold: the older turns in the student's own words, truncated. Loses nuance,
 * but never loses the thread.
 */
function deterministicSummary(previous: string | null, pending: MessageRow[]) {
  const lines = pending
    .map((message) => {
      const text = blockText(message.blocks).trim();
      if (!text) return '';
      return `${message.role === 'petros' ? 'Petros' : 'Student'}: ${text.slice(0, 140)}`;
    })
    .filter(Boolean);
  return [previous, ...lines].filter(Boolean).join(' | ').slice(-900);
}

function blockText(blocks: unknown[]) {
  return (blocks as PetrosCompanionBlock[])
    .filter((block): block is Extract<PetrosCompanionBlock, { type: 'text' }> => block?.type === 'text')
    .map((block) => block.text)
    .join(' ')
    .slice(0, 600);
}

function humanize(key: string) {
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}
