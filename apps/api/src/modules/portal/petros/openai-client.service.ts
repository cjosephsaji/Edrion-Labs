import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../../common/tokens';

/** Which model a call runs on. See the routing table in the Petros plan. */
export type PetrosModelTier = 'chat' | 'small' | 'big';

export interface PetrosUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

/**
 * Thin wrapper around the OpenAI SDK: per-call model selection, retry-once with backoff on
 * 429/5xx, usage capture. All Petros model calls flow through here so cost/usage accounting and
 * future budget enforcement have one seam. `big` falls back to the chat model when unavailable.
 */
@Injectable()
export class PetrosOpenAiService {
  private readonly logger = new Logger(PetrosOpenAiService.name);
  private client: OpenAI | null = null;
  private readonly models: Record<PetrosModelTier, string>;
  private readonly apiKey: string | undefined;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.apiKey = env.OPENAI_API_KEY;
    this.models = {
      chat: env.OPENAI_MODEL,
      small: env.OPENAI_SMALL_MODEL,
      big: env.OPENAI_BIG_MODEL,
    };
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  modelFor(tier: PetrosModelTier): string {
    return this.models[tier];
  }

  /** The raw SDK client. Throws a clear 503 when the key is missing. */
  sdk(): OpenAI {
    if (!this.apiKey) {
      throw new ServiceUnavailableException({
        code: 'AI_NOT_CONFIGURED',
        message: 'Petros is not configured on this server (OPENAI_API_KEY is missing).',
      });
    }
    if (!this.client) this.client = new OpenAI({ apiKey: this.apiKey, maxRetries: 0 });
    return this.client;
  }

  /**
   * Streaming Responses call for the agent loop. Retries once (with backoff) on 429/5xx raised
   * BEFORE the stream starts; mid-stream failures surface to the caller.
   */
  async streamResponse(params: Record<string, unknown>, tier: PetrosModelTier = 'chat') {
    return this.withRetry(() =>
      this.sdk().responses.create({ ...(params as object), model: this.modelFor(tier), stream: true } as never),
    );
  }

  /**
   * Non-streaming structured call (classifier/title/suggestion style). When `schema` is given the
   * model is constrained to strict JSON and the parsed object is returned.
   */
  async structured<T = Record<string, unknown>>(
    tier: PetrosModelTier,
    opts: {
      instructions: string;
      input: string;
      schemaName: string;
      schema: Record<string, unknown>;
      maxOutputTokens?: number;
    },
  ): Promise<{ result: T; usage: PetrosUsage }> {
    const response = (await this.withRetry(() =>
      this.sdk().responses.create({
        model: this.modelFor(tier),
        instructions: opts.instructions,
        input: opts.input,
        max_output_tokens: opts.maxOutputTokens ?? 500,
        text: {
          format: {
            type: 'json_schema',
            name: opts.schemaName,
            strict: true,
            schema: opts.schema,
          },
        },
      } as never),
    )) as { output_text?: string; usage?: unknown };
    const text = response.output_text ?? '{}';
    return { result: JSON.parse(text) as T, usage: extractUsage(response.usage) };
  }

  /** Plain text call (titles, decline copy). */
  async text(
    tier: PetrosModelTier,
    opts: { instructions: string; input: string; maxOutputTokens?: number },
  ): Promise<{ text: string; usage: PetrosUsage }> {
    const response = (await this.withRetry(() =>
      this.sdk().responses.create({
        model: this.modelFor(tier),
        instructions: opts.instructions,
        input: opts.input,
        max_output_tokens: opts.maxOutputTokens ?? 300,
      } as never),
    )) as { output_text?: string; usage?: unknown };
    return { text: (response.output_text ?? '').trim(), usage: extractUsage(response.usage) };
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

/** Normalize a Responses API usage object (snake_case, nested cache detail). */
export function extractUsage(raw: unknown): PetrosUsage {
  const u = (raw ?? {}) as {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
  };
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cachedInputTokens: u.input_tokens_details?.cached_tokens ?? 0,
  };
}
