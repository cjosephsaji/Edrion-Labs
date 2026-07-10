import { Inject, Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { visualArchetypeSchema } from '@edrion/schemas';
import { LEARN_AI_PROVIDER, LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import { RedisService } from '../../../common/redis/redis.service';
import type { LearnAiProvider } from '../learn-ai/provider';
import { LearnAiCallLogger } from '../learn-ai/learn-ai-call.logger';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { AiUsageLimiter } from '../../copilot/ai-usage-limiter.service';
import { VISUAL_TOPICALITY_SYSTEM } from './visual-prompts';
import { newDeclineRetryToken } from './visual-job-event-store';
import { topicDeclined } from './visual.errors';

const CONFIDENCE_FLOOR = 0.7;
const RETRY_TOKEN_TTL_SECONDS = 10 * 60;

const OBVIOUS_STUDY =
  /\b(learn|study|explain|map|diagram|chapter|lesson|exam|homework|assignment|math|physics|chemistry|biology|history|geography|language|economics|computer|topic|concept|process)\b/i;

export const visualTopicalityAiSchema = z
  .object({
    on_topic: z.boolean(),
    category: z.string().nullable(),
    confidence: z.number().min(0).max(1),
  })
  .strict();

export const visualProposalAiSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    archetype: visualArchetypeSchema,
    estimated_nodes: z
      .object({
        min: z.number().int().min(0).max(60),
        max: z.number().int().min(0).max(60),
      })
      .strict(),
    rationale: z.string().trim().min(1).max(240),
  })
  .strict();

@Injectable()
export class VisualTopicalityService {
  private readonly logger = new Logger(VisualTopicalityService.name);

  constructor(
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly limiter: AiUsageLimiter,
    private readonly callLog: LearnAiCallLogger,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
    private readonly redis: RedisService,
  ) {}

  async assertPromptAllowed(
    principal: StudentPrincipal,
    input: {
      mode: 'prompt' | 'source' | 'topic' | 'session';
      prompt?: string;
      declineRetryToken?: string;
      operationId: string;
      previousPrompt?: string;
    },
  ): Promise<void> {
    if (input.mode !== 'prompt') return;
    const prompt = input.prompt?.trim() ?? '';
    if (!prompt) return;

    if (input.declineRetryToken) {
      const valid = await this.consumeRetryToken(input.declineRetryToken, prompt, input.previousPrompt);
      if (valid) return;
    }

    if (OBVIOUS_STUDY.test(prompt) || prompt.length < 8) return;

    if (!this.ai.available) return;

    await this.limiter.acquireStudentCall(
      principal,
      'visual.topicality',
      `${input.operationId}:topicality`,
    );

    try {
      const { result, usage } = await this.ai.completeJson({
        purpose: 'visual_propose',
        tier: 'nano',
        system: VISUAL_TOPICALITY_SYSTEM,
        user: prompt.slice(0, 2000),
        schema: visualTopicalityAiSchema,
        schemaName: 'visual_topicality',
        maxOutputTokens: 120,
        privacySensitive: true,
      });
      await this.callLog.log(principal, 'visual_propose', usage);

      if (result.on_topic || result.confidence < CONFIDENCE_FLOOR || !result.category) return;

      const token = newDeclineRetryToken();
      await this.redis.set(`visual:decline-retry:${token}`, '1', RETRY_TOKEN_TTL_SECONDS);
      await this.ledger.log({
        principal,
        eventType: 'visual.topic_declined',
        payload: { category: result.category },
      });
      throw topicDeclined({ decline_retry_token: token, category: result.category });
    } catch (err) {
      if (err && typeof err === 'object' && 'getResponse' in (err as object)) throw err;
      this.logger.warn(`topicality classifier failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private async consumeRetryToken(token: string, prompt: string, previousPrompt?: string): Promise<boolean> {
    const key = `visual:decline-retry:${token}`;
    const exists = await this.redis.get(key);
    if (!exists) return false;
    const added = countNonWhitespace(prompt) - countNonWhitespace(previousPrompt ?? '');
    if (added < 12) return false;
    await this.redis.del(key);
    return true;
  }

  async assertCanvasIsStudyContext(
    _principal: StudentPrincipal,
    canvas: { title: string; topicId?: string | null; sourceId?: string | null },
  ): Promise<void> {
    if (canvas.topicId || canvas.sourceId) return;
    const title = canvas.title.trim();
    if (OBVIOUS_STUDY.test(title) || title.length < 8) return;
    // Grounded canvases and obvious study titles pass without classifier.
  }
}

function countNonWhitespace(text: string): number {
  return text.replace(/\s+/g, '').length;
}
