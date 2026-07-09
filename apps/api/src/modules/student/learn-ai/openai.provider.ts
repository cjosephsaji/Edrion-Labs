import { Inject, Injectable, Logger } from '@nestjs/common';
import OpenAI from 'openai';
import { z, type ZodSchema } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../../common/tokens';
import { IncrementalJsonArrayParser } from './incremental-json-array';
import type {
  LearnAiCompleteOpts,
  LearnAiProvider,
  LearnAiStreamOpts,
  LearnAiStreamTextOpts,
  LearnAiTextStreamEvent,
  LearnAiTier,
  LearnAiUsage,
} from './provider';

const TIER_MODEL: Record<LearnAiTier, 'nano' | 'small' | 'big'> = {
  nano: 'nano',
  small: 'small',
  large: 'big',
  vision: 'big',
};

type OpenAiResponse = {
  output_text?: string;
  status?: string;
  incomplete_details?: { reason?: string };
  usage?: { input_tokens?: number; output_tokens?: number };
};

@Injectable()
export class OpenAiLearnProvider implements LearnAiProvider {
  private readonly logger = new Logger(OpenAiLearnProvider.name);
  private client: OpenAI | null = null;
  private readonly apiKey: string | undefined;
  private readonly models: Record<'nano' | 'small' | 'big', string>;
  private readonly configuredModels: { chat: string; small: string; big: string };
  private lastError: string | null = null;
  private readonly schemaCache = new Map<string, Record<string, unknown>>();

  constructor(@Inject(API_ENV) env: ApiEnv) {
    this.apiKey = env.OPENAI_API_KEY;
    this.models = {
      nano: env.OPENAI_SMALL_MODEL,
      small: env.OPENAI_SMALL_MODEL,
      big: env.OPENAI_BIG_MODEL,
    };
    this.configuredModels = {
      chat: env.OPENAI_MODEL,
      small: env.OPENAI_SMALL_MODEL,
      big: env.OPENAI_BIG_MODEL,
    };
  }

  get available(): boolean {
    return Boolean(this.apiKey);
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getConfiguredModels(): { chat: string; small: string; big: string } {
    return this.configuredModels;
  }

  private recordError(modelId: string, err: unknown): void {
    const status = (err as { status?: number }).status;
    const message = (err as Error).message ?? String(err);
    this.lastError = `model=${modelId} status=${status ?? 'n/a'}: ${message}`;
  }

  private sdk(): OpenAI {
    if (!this.apiKey) throw new Error('OPENAI_API_KEY missing');
    if (!this.client) this.client = new OpenAI({ apiKey: this.apiKey, maxRetries: 0 });
    return this.client;
  }

  private modelFor(tier: LearnAiTier): string {
    return this.models[TIER_MODEL[tier]];
  }

  private jsonSchemaFor(schemaName: string, zodSchema: ZodSchema): Record<string, unknown> {
    let cached = this.schemaCache.get(schemaName);
    if (!cached) {
      const raw = zodToJsonSchema(zodSchema, { $refStrategy: 'root' }) as Record<string, unknown>;
      const { $schema: _schema, ...rest } = raw;
      cached = rest;
      this.schemaCache.set(schemaName, cached);
    }
    return cached;
  }

  async completeJson<T>(opts: LearnAiCompleteOpts<T>): Promise<{ result: T; usage: LearnAiUsage }> {
    const started = Date.now();
    const modelId = this.modelFor(opts.tier);

    try {
      let lastText = '';
      let lastError: unknown;

      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const user =
            attempt === 0
              ? opts.user
              : `${opts.user}\n\nYour previous response was invalid: ${String(lastError).slice(0, 500)}. Previous response (truncated): ${lastText.slice(0, 1000)}. Return ONLY a corrected JSON object matching the required schema.`;

          const response = await this.callResponses(modelId, opts, user);
          const text = response.output_text?.trim();
          if (!text) {
            throw new Error(`OpenAI returned empty output (model=${modelId})`);
          }
          lastText = text;

          if (response.status === 'incomplete') {
            const reason = response.incomplete_details?.reason ?? 'unknown';
            throw new Error(`OpenAI incomplete (reason=${reason}, model=${modelId})`);
          }

          const parsed = opts.schema.parse(JSON.parse(text));
          return {
            result: parsed,
            usage: {
              inputTokens: response.usage?.input_tokens ?? 0,
              outputTokens: response.usage?.output_tokens ?? 0,
              model: modelId,
              durationMs: Date.now() - started,
            },
          };
        } catch (err) {
          lastError = err;
          const isParseError =
            err instanceof SyntaxError ||
            (err as { name?: string }).name === 'ZodError' ||
            String(err).includes('JSON');

          if (attempt === 0 && isParseError) {
            this.logger.warn(
              `JSON validation failed for ${opts.purpose}/${opts.schemaName} (model=${modelId}) — retrying once`,
            );
            continue;
          }

          if (attempt === 1) {
            this.logger.error(
              `JSON validation failed after retry: purpose=${opts.purpose} schema=${opts.schemaName} model=${modelId} raw=${lastText.slice(0, 200)}`,
            );
          }
          throw err;
        }
      }

      throw lastError ?? new Error('completeJson failed');
    } catch (err) {
      this.recordError(modelId, err);
      throw err;
    }
  }

  async *streamJsonArray<T>(opts: LearnAiStreamOpts<T>): AsyncIterable<T> {
    const modelId = this.modelFor(opts.tier);
    const arrayKey = opts.arrayKey ?? 'blocks';
    const parser = new IncrementalJsonArrayParser(arrayKey);
    // OpenAI needs the wrapper object; each yielded element is parsed with opts.schema.
    const wrapperSchema = z.object({
      title: z.string().optional(),
      fromLabel: z.string().optional(),
      [arrayKey]: z.array(opts.schema),
    });

    try {
      const stream = (await this.withRetry(
        () =>
          this.sdk().responses.create({
            model: modelId,
            instructions: opts.system,
            input: this.buildInput(opts),
            max_output_tokens: opts.maxOutputTokens,
            reasoning: { effort: opts.reasoningEffort ?? 'low' },
            stream: true,
            text: {
              format: {
                type: 'json_schema',
                name: opts.schemaName,
                strict: false,
                schema: this.jsonSchemaFor(opts.schemaName, wrapperSchema),
              },
              verbosity: opts.verbosity,
            },
          } as never),
        modelId,
      )) as unknown as AsyncIterable<Record<string, unknown>>;

      for await (const event of stream) {
        const type = event.type as string;
        if (type === 'response.output_text.delta') {
          const delta = String((event as { delta?: unknown }).delta ?? '');
          for (const raw of parser.feed(delta)) {
            yield opts.schema.parse(JSON.parse(raw));
          }
        } else if (type === 'response.failed') {
          throw new Error('OpenAI stream failed');
        }
      }
    } catch (err) {
      this.recordError(modelId, err);
      throw err;
    }
  }

  async *streamText(opts: LearnAiStreamTextOpts): AsyncIterable<LearnAiTextStreamEvent> {
    const started = Date.now();
    const modelId = this.modelFor(opts.tier);

    try {
      const stream = (await this.withRetry(
        () =>
          this.sdk().responses.create({
            model: modelId,
            instructions: opts.system,
            input: opts.user,
            max_output_tokens: opts.maxOutputTokens,
            reasoning: { effort: opts.reasoningEffort ?? 'low' },
            stream: true,
            text: { verbosity: opts.verbosity },
          } as never),
        modelId,
      )) as unknown as AsyncIterable<Record<string, unknown>>;

      type CompletedResponse = { usage?: { input_tokens?: number; output_tokens?: number } };
      let completed: CompletedResponse | null = null;

      for await (const event of stream) {
        const type = event.type as string;
        if (type === 'response.output_text.delta') {
          const delta = String((event as { delta?: unknown }).delta ?? '');
          if (delta) yield { type: 'delta', text: delta };
        } else if (type === 'response.completed') {
          completed = ((event as { response?: CompletedResponse }).response ?? null) as CompletedResponse | null;
        } else if (type === 'response.failed') {
          throw new Error('OpenAI stream failed');
        }
      }

      yield {
        type: 'done',
        usage: {
          inputTokens: completed?.usage?.input_tokens ?? 0,
          outputTokens: completed?.usage?.output_tokens ?? 0,
          model: modelId,
          durationMs: Date.now() - started,
        },
      };
    } catch (err) {
      this.recordError(modelId, err);
      throw err;
    }
  }

  private async callResponses(
    modelId: string,
    opts: LearnAiCompleteOpts<unknown>,
    user: string,
  ): Promise<OpenAiResponse> {
    return (await this.withRetry(
      () =>
        this.sdk().responses.create({
          model: modelId,
          instructions: opts.system,
          input: this.buildInput({ ...opts, user }),
          max_output_tokens: opts.maxOutputTokens,
          reasoning: { effort: opts.reasoningEffort ?? 'low' },
          text: {
            format: {
              type: 'json_schema',
              name: opts.schemaName,
              strict: false,
              schema: this.jsonSchemaFor(opts.schemaName, opts.schema),
            },
            verbosity: opts.verbosity,
          },
        } as never),
      modelId,
    )) as OpenAiResponse;
  }

  private buildInput(opts: LearnAiCompleteOpts<unknown>): string | OpenAI.Responses.ResponseInput {
    const hasImages = Boolean(opts.images?.length);
    const hasFiles = Boolean(opts.files?.length);
    if (!hasImages && !hasFiles) return opts.user;

    const content: OpenAI.Responses.ResponseInputContent[] = [
      { type: 'input_text', text: opts.user },
    ];
    for (const img of opts.images ?? []) {
      content.push({
        type: 'input_image',
        image_url: `data:${img.mimeType};base64,${img.base64}`,
        detail: 'auto',
      });
    }
    for (const file of opts.files ?? []) {
      content.push({
        type: 'input_file',
        filename: file.filename,
        file_data: `data:${file.mimeType ?? 'application/pdf'};base64,${file.base64}`,
      } as OpenAI.Responses.ResponseInputContent);
    }
    return [{ role: 'user', content }];
  }

  private async withRetry<T>(fn: () => Promise<T>, modelId: string): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 429 || (typeof status === 'number' && status >= 500)) {
        this.logger.warn(`OpenAI ${status} (model=${modelId}) — retrying once`);
        await new Promise((r) => setTimeout(r, 750));
        return fn();
      }
      throw e;
    }
  }
}
