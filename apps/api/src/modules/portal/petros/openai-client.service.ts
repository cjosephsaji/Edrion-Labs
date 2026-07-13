import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../../common/tokens';
import { costMicroUsd, parseRateOverrides, type ModelRate, type Usage } from './context/pricing';

/** Which model a call runs on. See the routing table in the Petros plan. */
export type PetrosModelTier = 'chat' | 'small' | 'big';

/**
 * How hard the model thinks before it answers. Reasoning tokens are billed at the OUTPUT rate — the
 * most expensive tokens there are — so this is the main lever on the output side of the bill.
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface PetrosUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

/**
 * Reasoning tokens are drawn from the SAME budget as `max_output_tokens`. A caller that asks for
 * 100 tokens of JSON from a reasoning model can therefore spend all 100 thinking and return an
 * empty string — which is exactly what the topicality classifier was doing. Callers here state the
 * budget for the ANSWER; this table reserves the thinking room on top of it.
 */
const REASONING_HEADROOM: Record<ReasoningEffort, number> = {
  minimal: 256,
  low: 1024,
  medium: 4096,
  high: 8192,
};

/** Reasoning + verbosity are GPT-5 / o-series parameters; older models reject them outright. */
function supportsReasoning(model: string): boolean {
  return /^(gpt-5|o[1345])/i.test(model);
}

interface TunedCall extends Record<string, unknown> {
  /** Budget for the ANSWER. Thinking room is added on top — see REASONING_HEADROOM. */
  maxOutputTokens?: number;
  effort?: ReasoningEffort;
  verbosity?: 'low' | 'medium' | 'high';
}

/**
 * Thin wrapper around the OpenAI SDK: per-call model selection, retry-once with backoff on
 * 429/5xx, usage capture, and the cost-control knobs (`reasoning.effort`, `text.verbosity`,
 * `max_output_tokens`). All Petros model calls flow through here, so cost accounting and future
 * budget enforcement have exactly one seam.
 */
@Injectable()
export class PetrosOpenAiService {
  private readonly logger = new Logger(PetrosOpenAiService.name);
  private client: OpenAI | null = null;
  private readonly models: Record<PetrosModelTier, string>;
  private readonly apiKey: string | undefined;
  private readonly defaultVerbosity: 'low' | 'medium' | 'high';
  private readonly maxOutputTokens: number;
  private readonly configuredEffort: 'auto' | ReasoningEffort;
  private readonly rateOverrides: Record<string, ModelRate> | undefined;

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.apiKey = env.OPENAI_API_KEY;
    this.models = {
      chat: env.OPENAI_MODEL,
      small: env.OPENAI_SMALL_MODEL,
      big: env.OPENAI_BIG_MODEL,
    };
    this.defaultVerbosity = env.PETROS_VERBOSITY;
    this.maxOutputTokens = env.PETROS_MAX_OUTPUT_TOKENS;
    this.configuredEffort = env.PETROS_REASONING_EFFORT;
    this.rateOverrides = parseRateOverrides(env.OPENAI_PRICING_JSON);
  }

  get isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  modelFor(tier: PetrosModelTier): string {
    return this.models[tier];
  }

  /**
   * Reasoning effort for a chat turn. A lookup ("how many students in 5A?") and a piece of drafting
   * ("write the resignation letter") have very different thinking needs but were paying the same
   * price. `heavy` is the caller's signal that the turn produces prose or reads a document; under
   * `PETROS_REASONING_EFFORT=auto` that is the only thing that buys extra thinking. Pinning the env
   * var to a level opts out of the heuristic entirely.
   */
  resolveEffort(weight: 'light' | 'heavy'): ReasoningEffort {
    if (this.configuredEffort !== 'auto') return this.configuredEffort;
    return weight === 'heavy' ? 'medium' : 'low';
  }

  /** Estimated spend for a turn, in millionths of a USD. Telemetry only — not what OpenAI bills. */
  costOf(usage: Usage, tier: PetrosModelTier): number {
    return costMicroUsd(usage, this.modelFor(tier), this.rateOverrides);
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
  async streamResponse(params: TunedCall, tier: PetrosModelTier = 'chat') {
    const model = this.modelFor(tier);
    return this.withRetry(() =>
      this.sdk().responses.create({ ...this.tune(model, params), model, stream: true } as never),
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
      effort?: ReasoningEffort;
    },
  ): Promise<{ result: T; usage: PetrosUsage }> {
    const model = this.modelFor(tier);
    const response = (await this.withRetry(() =>
      this.sdk().responses.create({
        ...this.tune(model, {
          instructions: opts.instructions,
          input: opts.input,
          maxOutputTokens: opts.maxOutputTokens ?? 500,
          // Classification is pattern-matching, not deliberation.
          effort: opts.effort ?? 'minimal',
          text: {
            format: { type: 'json_schema', name: opts.schemaName, strict: true, schema: opts.schema },
          },
        }),
        model,
      } as never),
    )) as { output_text?: string; usage?: unknown };
    const text = response.output_text ?? '{}';
    return { result: JSON.parse(text) as T, usage: extractUsage(response.usage) };
  }

  /** Plain text call (titles, summaries, decline copy). */
  async text(
    tier: PetrosModelTier,
    opts: {
      instructions: string;
      input: string;
      maxOutputTokens?: number;
      effort?: ReasoningEffort;
    },
  ): Promise<{ text: string; usage: PetrosUsage }> {
    const model = this.modelFor(tier);
    const response = (await this.withRetry(() =>
      this.sdk().responses.create({
        ...this.tune(model, {
          instructions: opts.instructions,
          input: opts.input,
          maxOutputTokens: opts.maxOutputTokens ?? 300,
          effort: opts.effort ?? 'minimal',
        }),
        model,
      } as never),
    )) as { output_text?: string; usage?: unknown };
    return { text: (response.output_text ?? '').trim(), usage: extractUsage(response.usage) };
  }

  /**
   * Translate our knobs into the provider's, and drop them entirely for a model that would reject
   * them — `OPENAI_MODEL` is operator-set and may not be a reasoning model at all.
   */
  private tune(model: string, params: TunedCall): Record<string, unknown> {
    const { maxOutputTokens, effort, verbosity, ...rest } = params;
    const out: Record<string, unknown> = { ...rest };
    const budget = maxOutputTokens ?? this.maxOutputTokens;
    const level: ReasoningEffort = effort ?? 'low';

    if (!supportsReasoning(model)) {
      out.max_output_tokens = budget;
      return out;
    }
    out.max_output_tokens = budget + REASONING_HEADROOM[level];
    out.reasoning = { effort: level };
    out.text = { ...((rest.text as Record<string, unknown>) ?? {}), verbosity: verbosity ?? this.defaultVerbosity };
    return out;
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
