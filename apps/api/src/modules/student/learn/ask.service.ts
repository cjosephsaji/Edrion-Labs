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
import { ASK_FULL_SYSTEM_PROMPT, ASK_HINTS_ONLY_SYSTEM_PROMPT } from '../learn-ai/prompts/ask.prompt';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { SessionsService } from './sessions.service';
import { VisualGroundingService } from '../visual-studio/visual-grounding.service';

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
    @Inject(LEARNING_EVENTS_WRITER)     private readonly ledger: LearningEventsWriter,
    private readonly sessions: SessionsService,
    private readonly visualGrounding: VisualGroundingService,
  ) {}

  async ask(principal: StudentPrincipal, input: AskInput): Promise<AskResponseDto> {
    const prepared = await this.prepareAsk(principal, input);
    if (prepared.refused) return prepared.response;
    if (!this.ai.available) return prepared.response;

    const { result, usage } = await this.ai.completeJson({
      purpose: 'ask',
      tier: 'small',
      system: prepared.system,
      user: prepared.user,
      schema: askOutputSchema,
      schemaName: 'ask_drawer',
      maxOutputTokens: 2000,
      reasoningEffort: 'minimal',
    });
    await this.callLog.log(principal, 'ask', usage);
    await this.logAskEvent(principal, input);

    return {
      answer: result.answer,
      refused: result.refused,
      refusalNote: result.refusalNote,
      policyNotice: prepared.policyNotice,
    };
  }

  async streamAsk(
    principal: StudentPrincipal,
    input: AskInput,
    emit: (event: Record<string, unknown>) => void,
  ): Promise<AskResponseDto> {
    const prepared = await this.prepareAsk(principal, input);
    if (prepared.refused) {
      emit({ type: 'done', ...prepared.response });
      return prepared.response;
    }
    if (!this.ai.available) {
      emit({ type: 'done', ...prepared.response });
      return prepared.response;
    }

    let answer = '';
    for await (const event of this.ai.streamText({
      purpose: 'ask',
      tier: 'small',
      system: prepared.system,
      user: prepared.user,
      maxOutputTokens: 2000,
      reasoningEffort: 'minimal',
    })) {
      if (event.type === 'delta') {
        answer += event.text;
        emit({ type: 'text_delta', delta: event.text });
      } else {
        await this.callLog.log(principal, 'ask', event.usage);
      }
    }

    await this.logAskEvent(principal, input);
    const response: AskResponseDto = {
      answer,
      policyNotice: prepared.policyNotice,
    };
    emit({ type: 'done', ...response });
    return response;
  }

  private async prepareAsk(principal: StudentPrincipal, input: AskInput) {
    const policy = await this.homeworkPolicy.resolve(input.context.kind, input.context.id);

    if (input.context.kind === 'homework' && policy === 'off') {
      return {
        refused: true as const,
        response: {
          answer: '',
          refused: true,
          refusalNote: AI_POLICY_UNAVAILABLE,
          policyNotice: 'AI assistance is turned off for this homework.',
        },
        system: '',
        user: '',
        policyNotice: undefined as string | undefined,
      };
    }

    const policyMode = policy === 'hints_only' ? 'hints_only' : 'full';
    const convo = (input.conversation ?? [])
      .map((t) => `Q: ${t.q}\nA: ${t.a}`)
      .join('\n');
    const system =
      policyMode === 'hints_only' ? ASK_HINTS_ONLY_SYSTEM_PROMPT : ASK_FULL_SYSTEM_PROMPT;

    let user: string;
    if (input.context.kind === 'visual_node') {
      const canvasId = input.context.canvasId ?? input.context.id;
      const grounding = await this.visualGrounding.forNode(
        principal,
        canvasId,
        input.context.nodeId,
      );
      user = `${this.visualGrounding.formatAskUserPrompt(grounding, input.question)}\n${convo ? `${convo}\n` : ''}`;
    } else {
      user = `Context (${input.context.contextLabel}): ${input.context.kind}/${input.context.id}\n${convo}\nQuestion: ${input.question}`;
    }
    const policyNotice =
      policyMode === 'hints_only' ? 'Hints-only mode — direct solutions are not provided.' : undefined;

    if (!this.ai.available) {
      return {
        refused: false as const,
        response: {
          answer: 'Petros is not available right now — try again later or pin a note from your textbook.',
          policyNotice: policyMode === 'hints_only' ? 'Hints-only mode is active for this context.' : undefined,
        },
        system,
        user,
        policyNotice,
      };
    }

    await this.budgets.spend(principal, 'ask', 800);
    return { refused: false as const, response: {} as AskResponseDto, system, user, policyNotice };
  }

  private async logAskEvent(principal: StudentPrincipal, input: AskInput) {
    await this.ledger.log({
      principal,
      eventType: 'drawer.asked',
      payload: {
        contextKind: input.context.kind,
        contextId: input.context.id,
        pinned: false,
      },
    });
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
