import { Inject, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../../common/tokens';
import type {
  LearnAiCompleteOpts,
  LearnAiProvider,
  LearnAiStreamOpts,
  LearnAiTier,
  LearnAiUsage,
} from './provider';

const TIER_MODEL: Record<LearnAiTier, 'nano' | 'small' | 'big'> = {
  nano: 'nano',
  small: 'small',
  large: 'big',
  vision: 'big',
};

@Injectable()
export class OpenAiLearnProvider implements LearnAiProvider {
  private readonly logger = new Logger(OpenAiLearnProvider.name);
  private client: OpenAI | null = null;
  private readonly apiKey: string | undefined;
  private readonly models: Record<'nano' | 'small' | 'big', string>;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.apiKey = env.OPENAI_API_KEY;
    this.models = {
      nano: env.OPENAI_SMALL_MODEL,
      small: env.OPENAI_SMALL_MODEL,
      big: env.OPENAI_BIG_MODEL,
    };
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  private sdk(): OpenAI {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY missing');
    if (!this.client) this.client = new OpenAI({ apiKey: this.apiKey, maxRetries: 0 });
    return this.client;
  }

  private modelFor(tier: LearnAiTier): string {
    return this.models[TIER_MODEL[tier]];
  }

  async completeJson<T>(opts: LearnAiCompleteOpts<T>): Promise<{ result: T; usage: LearnAiUsage }> {
    const started = Date.now();
    const response = (await this.withRetry(() =>
      this.sdk().responses.create({
        model: this.modelFor(opts.tier),
        instructions: opts.system,
        input: this.buildInput(opts),
        max_output_tokens: opts.maxOutputTokens,
        text: {
          format: {
            type: 'json_schema',
            name: opts.schemaName,
            strict: false,
            schema: { type: 'object' },
          },
        },
      } as never),
    )) as { output_text?: string; usage?: { input_tokens?: number; output_tokens?: number } };

    const text = response.output_text ?? '{}';
    const parsed = opts.schema.parse(JSON.parse(text));
    return {
      result: parsed,
      usage: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        model: this.modelFor(opts.tier),
        durationMs: Date.now() - started,
      },
    };
  }

  async *streamJsonArray<T>(opts: LearnAiStreamOpts<T>): AsyncIterable<T> {
    const { result } = await this.completeJson({
      ...opts,
      schema: opts.schema,
    });
    if (Array.isArray(result)) {
      for (const item of result) yield item;
      return;
    }
    const key = opts.arrayKey ?? 'blocks';
    const arr = (result as Record<string, unknown>)[key];
    if (Array.isArray(arr)) {
      for (const item of arr) yield opts.schema.parse(item);
    }
  }

  private buildInput(opts: LearnAiCompleteOpts<unknown>): string | OpenAI.Responses.ResponseInput {
    if (!opts.images?.length) return opts.user;
    return [
      { role: 'user', content: [{ type: 'input_text', text: opts.user }] },
      ...opts.images.map((img) => ({
        role: 'user' as const,
        content: [
          {
            type: 'input_image' as const,
            image_url: `data:${img.mimeType};base64,${img.base64}`,
            detail: 'auto' as const,
          },
        ],
      })),
    ];
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 429 || (typeof status === 'number' && status >= 500)) {
        this.logger.warn(`OpenAI ${status} — retrying once`);
        await new Promise((r) => setTimeout(r, 750));
        return fn();
      }
      throw e;
    }
  }
}
