import { Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import type { AskInput, AskResponseDto, PinAskInput } from '@edrion/schemas';
import { LEARN_AI_PROVIDER, LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearnAiProvider } from '../learn-ai/provider';
import { BudgetsService } from '../learn-ai/budgets.service';
import {
  AI_POLICY_UNAVAILABLE,
  HOMEWORK_POLICY_PORT,
  type HomeworkPolicyPort,
} from '../learn-ai/homework-policy.port';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { SessionsService } from './sessions.service';

const askOutputSchema = z.object({
  answer: z.string(),
  refused: z.boolean().optional(),
  refusalNote: z.string().optional(),
});

@Injectable()
export class AskService {
  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    @Inject(HOMEWORK_POLICY_PORT) private readonly homeworkPolicy: HomeworkPolicyPort,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
    private readonly sessions: SessionsService,
  ) {}

  async ask(principal: StudentPrincipal, input: AskInput): Promise<AskResponseDto> {
    const policy = await this.homeworkPolicy.resolve(input.context.kind, input.context.id);

    if (input.context.kind === 'homework' && policy === 'off') {
      return {
        answer: '',
        refused: true,
        refusalNote: AI_POLICY_UNAVAILABLE,
        policyNotice: 'AI assistance is turned off for this homework.',
      };
    }

    const policyMode = policy === 'hints_only' ? 'hints_only' : 'full';
    const convo = (input.conversation ?? [])
      .map((t) => `Q: ${t.q}\nA: ${t.a}`)
      .join('\n');

    if (!this.ai.available) {
      return {
        answer: 'Petros is not available right now — try again later or pin a note from your textbook.',
        policyNotice: policyMode === 'hints_only' ? 'Hints-only mode is active for this context.' : undefined,
      };
    }

    await this.budgets.spend(principal, 'ask', 800);
    const system =
      policyMode === 'hints_only'
        ? 'You may only give conceptual hints — never direct solutions or final answers.'
        : 'Answer the student question in context. Be concise and helpful.';

    const { result, usage } = await this.ai.completeJson({
      purpose: 'ask',
      tier: 'small',
      system,
      user: `Context (${input.context.contextLabel}): ${input.context.kind}/${input.context.id}\n${convo}\nQuestion: ${input.question}`,
      schema: askOutputSchema,
      schemaName: 'ask_drawer',
      maxOutputTokens: 700,
    });
    await this.callLog.log(principal, 'ask', usage);

    await this.ledger.log({
      principal,
      eventType: 'drawer.asked',
      payload: {
        contextKind: input.context.kind,
        contextId: input.context.id,
        pinned: false,
      },
    });

    return {
      answer: result.answer,
      refused: result.refused,
      refusalNote: result.refusalNote,
      policyNotice: policyMode === 'hints_only' ? 'Hints-only mode — direct solutions are not provided.' : undefined,
    };
  }

  async pin(principal: StudentPrincipal, input: PinAskInput) {
    await this.sessions.pinNote(
      principal,
      input.sessionId,
      input.question,
      input.answer,
      input.blockAfterId,
    );
    await this.ledger.log({
      principal,
      eventType: 'drawer.asked',
      payload: {
        contextKind: 'session',
        contextId: input.sessionId,
        pinned: true,
      },
    });
    return { ok: true };
  }
}
