import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { ApiEnv } from '@edrion/config';
import type { IntentResponseDto } from '@edrion/schemas';
import type { StudentPrincipal } from '../student.types';
import { API_ENV, LEARN_AI_PROVIDER } from '../../../common/tokens';
import type { LearnAiProvider } from './provider';
import { BudgetsService } from './budgets.service';
import { LearnAiCallLogger } from './learn-ai-call.logger';

const routerOutputSchema = z.object({
  intent: z.enum(['quick_question', 'learn_topic', 'practice', 'revise', 'prepare_exam', 'continue']),
  subjectLabel: z.string().optional(),
  topicTitle: z.string().optional(),
  depth: z.enum(['quick', 'deep']),
  visualWarranted: z.boolean(),
  archetype: z.string().optional(),
});

@Injectable()
export class RouterService {
  private readonly logger = new Logger(RouterService.name);

  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly budgets: BudgetsService,
    private readonly callLog: LearnAiCallLogger,
  ) {}

  async route(principal: StudentPrincipal, text: string): Promise<IntentResponseDto> {
    if (!this.ai.available) {
      return this.heuristicRoute(text);
    }

    try {
      await this.budgets.spend(principal, 'route', 400);
      const persona = principal.kind === 'independent' ? 'independent learner' : 'school student';
      const { result, usage } = await this.ai.completeJson({
        purpose: 'route',
        tier: 'nano',
        system:
          'Classify the student learning intent. Return JSON only. ' +
          'intent MUST be exactly one of: quick_question, learn_topic, practice, revise, prepare_exam, continue. ' +
          'Also include subjectLabel?, topicTitle?, depth (quick|deep), visualWarranted, archetype (domain archetype slug).',
        user: `Persona: ${persona}\nStudent text: ${text}`,
        schema: routerOutputSchema,
        schemaName: 'intent_router',
        maxOutputTokens: 8192,
      });
      await this.callLog.log(principal, 'route', usage);

      return this.toResponse(result, text);
    } catch (err) {
      const status = (err as { status?: number }).status;
      const message = (err as Error).message ?? String(err);
      const modelId = this.env.OPENAI_SMALL_MODEL;
      this.logger.error(
        `OpenAI error (model=${modelId}, status=${status ?? 'n/a'}): ${message}; falling back to heuristic routing`,
      );
      return this.heuristicRoute(text);
    }
  }

  private heuristicRoute(text: string): IntentResponseDto {
    const trimmed = text.trim();
    const isQuestion = trimmed.endsWith('?');
    const deepPhrases = /\b(teach me|learn about|help me understand|explain)\b/i.test(trimmed);
    if (deepPhrases && !isQuestion) {
      return {
        intent: 'learn_topic',
        topicGuess: trimmed,
        route: '/learn/path',
        depth: 'deep',
        helperCopy: 'Petros will map a learning path for this — press Enter',
      };
    }
    if (isQuestion || trimmed.length < 80) {
      return {
        intent: 'quick_question',
        route: '/learn/quick/new',
        depth: 'quick',
        helperCopy: 'Quick answer, no lesson attached — press Enter',
      };
    }
    return {
      intent: 'learn_topic',
      topicGuess: trimmed,
      route: '/learn/path',
      depth: 'deep',
      helperCopy: 'Petros will map a learning path for this — press Enter',
    };
  }

  private toResponse(
    result: z.infer<typeof routerOutputSchema>,
    text: string,
  ): IntentResponseDto {
    const routeMap: Record<string, string> = {
      quick_question: '/learn/quick/new',
      learn_topic: '/learn/path',
      practice: '/learn/practice/new',
      revise: '/learn/revision',
      prepare_exam: '/lab/mock-exams/new',
      continue: '/learn',
    };
    const helperCopy =
      result.depth === 'deep'
        ? 'Petros will map a learning path for this — press Enter'
        : 'Quick answer, no lesson attached — press Enter';
    return {
      intent: result.intent,
      subjectLabel: result.subjectLabel,
      topicGuess: result.topicTitle ?? text,
      route: routeMap[result.intent] ?? '/learn',
      depth: result.depth,
      helperCopy: result.intent === 'learn_topic' || result.intent === 'quick_question' ? helperCopy : undefined,
    };
  }
}
