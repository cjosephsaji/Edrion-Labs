import { Injectable } from '@nestjs/common';
import type { PetrosAiModel, PetrosAiProvider } from '@edrion/database';
import { PetrosAiCredentialsService } from './petros-ai-credentials.service';
import { supportedSpeechVoices, supportsTutorInstructions, type PetrosSpeechOptions } from './petros-speech-capabilities';

export interface PetrosAiInputPart {
  type: 'text' | 'image' | 'audio' | 'document';
  text?: string;
  url?: string;
  mediaType?: string;
  dataBase64?: string;
}

export interface PetrosAiNormalizedRequest {
  functionKey: string;
  system?: string;
  input: PetrosAiInputPart[];
  responseFormat: string;
  responseSchema?: Record<string, unknown>;
  maxOutputTokens: number;
  temperature: number;
  reasoningLevel?: string;
  timeoutMs: number;
  signal?: AbortSignal;
  stream: boolean;
  language?: string;
  speech?: PetrosSpeechOptions;
}

export interface PetrosAiNormalizedResponse {
  kind: 'text' | 'json' | 'image' | 'audio';
  content: unknown;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  providerRequestId?: string;
  actualCostMicros?: number;
}

export interface PetrosProviderAdapter {
  execute(provider: PetrosAiProvider, model: PetrosAiModel, request: PetrosAiNormalizedRequest): Promise<PetrosAiNormalizedResponse>;
}

@Injectable()
export class PetrosProviderAdapterRegistry {
  constructor(private readonly credentials: PetrosAiCredentialsService) {}

  adapter(provider: PetrosAiProvider): PetrosProviderAdapter {
    if (provider.adapterType === 'anthropic') return new AnthropicAdapter(this.credentials);
    if (provider.adapterType === 'gemini') return new GeminiAdapter(this.credentials);
    return new OpenAiCompatibleAdapter(this.credentials);
  }
}

abstract class HttpAdapter {
  constructor(protected readonly credentials: PetrosAiCredentialsService) {}

  protected key(provider: PetrosAiProvider): string {
    if (!provider.credentialEnvelope) throw new ProviderCallError('CREDENTIAL_MISSING', 'Provider credential is not configured.', false);
    return this.credentials.decrypt(provider.credentialEnvelope);
  }

  protected async post(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ body: Record<string, unknown>; headers: Headers }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
      const parsed = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok) {
        const message = providerError(parsed) ?? `Provider returned HTTP ${response.status}.`;
        throw new ProviderCallError(`HTTP_${response.status}`, message, response.status === 408 || response.status === 429 || response.status >= 500);
      }
      return { body: parsed, headers: response.headers };
    } catch (error) {
      if (error instanceof ProviderCallError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new ProviderCallError('TIMEOUT', 'Provider request timed out.', true);
      throw new ProviderCallError('NETWORK_ERROR', error instanceof Error ? error.message : 'Provider request failed.', true);
    } finally {
      clearTimeout(timer);
    }
  }

  protected async postBinary(
    url: string,
    headers: Record<string, string>,
    body: unknown,
    timeoutMs: number,
    signal?: AbortSignal,
  ): Promise<{ body: Buffer; headers: Headers }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      });
      if (!response.ok) {
        const parsed = (await response.json().catch(() => ({}))) as Record<string, unknown>;
        throw new ProviderCallError(
          `HTTP_${response.status}`,
          providerError(parsed) ?? `Provider returned HTTP ${response.status}.`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      return { body: Buffer.from(await response.arrayBuffer()), headers: response.headers };
    } catch (error) {
      if (error instanceof ProviderCallError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new ProviderCallError('TIMEOUT', 'Provider request timed out.', true);
      throw new ProviderCallError('NETWORK_ERROR', error instanceof Error ? error.message : 'Provider request failed.', true);
    } finally {
      clearTimeout(timer);
    }
  }
}

class OpenAiCompatibleAdapter extends HttpAdapter implements PetrosProviderAdapter {
  async execute(provider: PetrosAiProvider, model: PetrosAiModel, request: PetrosAiNormalizedRequest) {
    if (request.functionKey === 'speech.transcribe') {
      return this.transcribe(provider, model, request);
    }
    if (request.functionKey === 'speech.synthesise') {
      return this.synthesise(provider, model, request);
    }
    if (request.functionKey === 'interaction.spoken') {
      return this.spokenInteraction(provider, model, request);
    }
    const base = provider.baseUrl ?? 'https://api.openai.com/v1';
    const content = request.input.map((part) => {
      if (part.type === 'image' && (part.url || part.dataBase64)) {
        return {
          type: 'image_url',
          image_url: { url: part.url ?? `data:${part.mediaType ?? 'image/jpeg'};base64,${part.dataBase64}` },
        };
      }
      if (part.type === 'audio' && part.dataBase64) {
        return {
          type: 'input_audio',
          input_audio: { data: part.dataBase64, format: audioFormat(part.mediaType) },
        };
      }
      return { type: 'text', text: part.text ?? `[${part.type} input]` };
    });
    const reasoningModel = /^(gpt-5|o[134])(?:-|$)/.test(model.modelKey);
    const structured = request.responseSchema && Object.keys(request.responseSchema).length
      ? openAiStructuredSchema(request.responseSchema)
      : null;
    const { body, headers } = await this.post(
      `${base.replace(/\/$/, '')}/chat/completions`,
      { authorization: `Bearer ${this.key(provider)}` },
      {
        model: model.modelKey,
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          { role: 'user', content },
        ],
        ...(reasoningModel ? { max_completion_tokens: request.maxOutputTokens } : { max_tokens: request.maxOutputTokens }),
        ...(!reasoningModel ? { temperature: request.temperature } : {}),
        ...(request.responseFormat === 'json' || request.responseFormat === 'structured_teaching_block'
          ? structured
            ? { response_format: { type: 'json_schema', json_schema: { name: 'petros_response', strict: false, schema: structured.schema } } }
            : { response_format: { type: 'json_object' } }
          : {}),
        ...(request.reasoningLevel && request.reasoningLevel !== 'none' ? { reasoning_effort: request.reasoningLevel } : {}),
      },
      request.timeoutMs,
      request.signal,
    );
    const choices = body.choices as Array<Record<string, unknown>> | undefined;
    const message = choices?.[0]?.message as Record<string, unknown> | undefined;
    const messageContent = typeof message?.content === 'string' && structured?.enveloped
      ? JSON.stringify((JSON.parse(message.content) as Record<string, unknown>).result)
      : message?.content ?? '';
    const usage = (body.usage ?? {}) as Record<string, unknown>;
    const details = (usage.prompt_tokens_details ?? {}) as Record<string, unknown>;
    return {
      kind: request.responseFormat === 'json' || request.responseFormat === 'structured_teaching_block' ? 'json' as const : 'text' as const,
      content: messageContent,
      inputTokens: number(usage.prompt_tokens),
      outputTokens: number(usage.completion_tokens),
      cachedTokens: number(details.cached_tokens),
      providerRequestId: headers.get('x-request-id') ?? String(body.id ?? ''),
    };
  }

  private async transcribe(
    provider: PetrosAiProvider,
    model: PetrosAiModel,
    request: PetrosAiNormalizedRequest,
  ): Promise<PetrosAiNormalizedResponse> {
    const audio = request.input.find((part) => part.type === 'audio' && part.dataBase64);
    if (!audio?.dataBase64) throw new ProviderCallError('AUDIO_INPUT_REQUIRED', 'Audio input is required.', false);
    const base = provider.baseUrl ?? 'https://api.openai.com/v1';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), request.timeoutMs);
    try {
      const form = new FormData();
      const bytes = Buffer.from(audio.dataBase64, 'base64');
      form.append('file', new Blob([bytes], { type: audio.mediaType ?? 'audio/webm' }), `turn.${audioExtension(audio.mediaType)}`);
      form.append('model', model.modelKey);
      form.append('response_format', /whisper/i.test(model.modelKey) ? 'verbose_json' : 'json');
      if (request.language && request.language !== 'auto') {
        form.append(model.modelKey === 'gpt-transcribe' ? 'languages[]' : 'language', request.language);
      }
      if (model.modelKey === 'gpt-transcribe') {
        form.append('prompt', 'A student in the Edrion learning portal.');
        form.append('keywords[]', 'Petros');
        form.append('keywords[]', 'Edrion');
      } else if (!model.modelKey.includes('diarize')) {
        // Vocabulary hints, not instructions: Whisper treats prompts as transcript context.
        form.append('prompt', 'Petros, Edrion.');
      }
      const response = await fetch(`${base.replace(/\/$/, '')}/audio/transcriptions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${this.key(provider)}` },
        body: form,
        signal: request.signal ? AbortSignal.any([request.signal, controller.signal]) : controller.signal,
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        throw new ProviderCallError(`HTTP_${response.status}`, providerError(body) ?? 'Transcription failed.', response.status === 408 || response.status === 429 || response.status >= 500);
      }
      const text = String(body.text ?? '').trim();
      if (!text) throw new ProviderCallError('EMPTY_TRANSCRIPT', 'The provider returned an empty transcript.', true);
      const segments = Array.isArray(body.segments) ? body.segments as Array<Record<string, unknown>> : [];
      const audioSeconds = transcriptionDurationSeconds(body, segments);
      return {
        kind: 'json',
        content: {
          text,
          language: typeof body.language === 'string' ? body.language : null,
          confidence: transcriptConfidence(segments),
          uncertainSegments: segments
            .filter((segment) => segment.no_speech_prob != null && Number(segment.no_speech_prob) > 0.35)
            .slice(0, 50)
            .map((segment) => ({
              startSeconds: number(segment.start),
              endSeconds: number(segment.end),
              text: String(segment.text ?? '').slice(0, 500),
              confidence: Math.max(0, Math.min(1, 1 - number(segment.no_speech_prob))),
            })),
        },
        inputTokens: 0,
        outputTokens: Math.ceil(text.length / 4),
        cachedTokens: 0,
        providerRequestId: response.headers.get('x-request-id') ?? undefined,
        actualCostMicros: estimateModalityCostMicros({ ...model.providerOptions,
          ...(provider.key === 'groq' && ['whisper-large-v3', 'whisper-large-v3-turbo'].includes(model.modelKey)
            ? { minimumBillableSeconds: Math.max(10, number(model.providerOptions.minimumBillableSeconds)) } : {}),
        }, { audioSeconds }),
      };
    } catch (error) {
      if (error instanceof ProviderCallError) throw error;
      if (error instanceof Error && error.name === 'AbortError') throw new ProviderCallError('TIMEOUT', 'Transcription timed out.', true);
      throw new ProviderCallError('NETWORK_ERROR', error instanceof Error ? error.message : 'Transcription failed.', true);
    } finally {
      clearTimeout(timer);
    }
  }

  private async synthesise(
    provider: PetrosAiProvider,
    model: PetrosAiModel,
    request: PetrosAiNormalizedRequest,
  ): Promise<PetrosAiNormalizedResponse> {
    const text = request.input.map((part) => part.text ?? '').join('\n').trim();
    if (!text) throw new ProviderCallError('TEXT_INPUT_REQUIRED', 'Text input is required.', false);
    const billableText = text.slice(0, 4_096);
    const voices = supportedSpeechVoices(model.modelKey);
    const requestedVoice = request.speech?.voice;
    if (!voices.length || (requestedVoice && !voices.includes(requestedVoice)) || (request.speech?.strictVoice && !requestedVoice)) {
      throw new ProviderCallError('UNSUPPORTED_VOICE', 'The selected voice is unavailable on this speech model. Select a supported voice.', false);
    }
    const effectiveVoice = requestedVoice && voices.includes(requestedVoice)
      ? requestedVoice : supportsTutorInstructions(model.modelKey) ? 'cedar' : 'onyx';
    const base = provider.baseUrl ?? 'https://api.openai.com/v1';
    const response = await this.postBinary(
      `${base.replace(/\/$/, '')}/audio/speech`,
      { authorization: `Bearer ${this.key(provider)}` },
      {
        model: model.modelKey,
        voice: effectiveVoice,
        speed: request.speech?.speed ?? 1,
        response_format: 'wav',
        input: billableText,
        ...(supportsTutorInstructions(model.modelKey)
          ? {
              instructions:
                'Speak naturally and clearly, like a calm helpful tutor in a one-to-one conversation. Use a relaxed, grounded tone and normal pitch. No cartoon character, exaggerated enthusiasm, theatrical delivery, or announcer voice. Read only the supplied text, in its language. Use short natural pauses.',
            }
          : {}),
      },
      request.timeoutMs,
      request.signal,
    );
    return {
      kind: 'audio',
      content: {
        dataBase64: response.body.toString('base64'),
        mimeType: response.headers.get('content-type')?.split(';')[0] ?? 'audio/wav',
        transcript: billableText,
        requestedVoice: requestedVoice ?? null,
        effectiveVoice,
        voiceFallbackUsed: false,
      },
      inputTokens: Math.ceil(billableText.length / 4),
      outputTokens: 0,
      cachedTokens: 0,
      providerRequestId: response.headers.get('x-request-id') ?? undefined,
      actualCostMicros: estimateModalityCostMicros(model.providerOptions, { characters: billableText.length }),
    };
  }

  private async spokenInteraction(
    provider: PetrosAiProvider,
    model: PetrosAiModel,
    request: PetrosAiNormalizedRequest,
  ): Promise<PetrosAiNormalizedResponse> {
    const base = provider.baseUrl ?? 'https://api.openai.com/v1';
    const content = request.input.map((part) =>
      part.type === 'audio' && part.dataBase64
        ? { type: 'input_audio', input_audio: { data: part.dataBase64, format: audioFormat(part.mediaType) } }
        : { type: 'text', text: part.text ?? '' },
    );
    const { body, headers } = await this.post(
      `${base.replace(/\/$/, '')}/chat/completions`,
      { authorization: `Bearer ${this.key(provider)}` },
      {
        model: model.modelKey,
        messages: [
          ...(request.system ? [{ role: 'system', content: request.system }] : []),
          { role: 'user', content },
        ],
        modalities: ['text', 'audio'],
        audio: { voice: 'alloy', format: 'mp3' },
        max_tokens: request.maxOutputTokens,
      },
      request.timeoutMs,
      request.signal,
    );
    const message = ((body.choices as Array<Record<string, unknown>> | undefined)?.[0]?.message ?? {}) as Record<string, unknown>;
    const audio = (message.audio ?? {}) as Record<string, unknown>;
    const dataBase64 = typeof audio.data === 'string' ? audio.data : '';
    if (!dataBase64) throw new ProviderCallError('AUDIO_OUTPUT_MISSING', 'The spoken model did not return audio.', true);
    return {
      kind: 'audio',
      content: {
        dataBase64,
        mimeType: 'audio/mpeg',
        transcript: String(audio.transcript ?? message.content ?? '').slice(0, 8_000),
      },
      inputTokens: number((body.usage as Record<string, unknown> | undefined)?.prompt_tokens),
      outputTokens: number((body.usage as Record<string, unknown> | undefined)?.completion_tokens),
      cachedTokens: 0,
      providerRequestId: headers.get('x-request-id') ?? String(body.id ?? ''),
    };
  }
}

/** OpenAI Structured Outputs accepts a deliberate JSON Schema subset; Edrion still performs the
 * authoritative full-schema validation after parsing the response. */
function openAiCompatibleSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(openAiCompatibleSchema);
  if (!value || typeof value !== 'object') return value;
  const source = value as Record<string, unknown>;
  const unsupported = new Set([
    '$schema', 'propertyNames', 'minLength', 'maxLength', 'pattern', 'format',
    'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf',
    'minItems', 'maxItems', 'uniqueItems', 'default',
  ]);
  const compatible = Object.fromEntries(Object.entries(source)
    .filter(([key]) => !unsupported.has(key))
    .map(([key, item]) => [key, openAiCompatibleSchema(item)]));
  const constraints = [
    typeof source.minLength === 'number' ? `String length must be at least ${source.minLength} characters.` : '',
    typeof source.maxLength === 'number' ? `String length must be at most ${source.maxLength} characters.` : '',
    typeof source.minItems === 'number' ? `Array must contain at least ${source.minItems} items.` : '',
    typeof source.maxItems === 'number' ? `Array must contain at most ${source.maxItems} items.` : '',
    typeof source.minimum === 'number' ? `Number must be at least ${source.minimum}.` : '',
    typeof source.maximum === 'number' ? `Number must be at most ${source.maximum}.` : '',
    source.format === 'uuid' ? 'String must be a valid UUID.' : '',
    source.format === 'date-time' ? 'String must be an ISO 8601 date-time.' : '',
  ].filter(Boolean);
  if (constraints.length) compatible.description = [typeof source.description === 'string' ? source.description : '', ...constraints].filter(Boolean).join(' ');
  return compatible;
}

function openAiStructuredSchema(value: Record<string, unknown>): { schema: Record<string, unknown>; enveloped: boolean } {
  const compatible = openAiCompatibleSchema(value) as Record<string, unknown>;
  if (compatible.type === 'object') return { schema: compatible, enveloped: false };
  return {
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: { result: compatible },
      required: ['result'],
    },
    enveloped: true,
  };
}

class AnthropicAdapter extends HttpAdapter implements PetrosProviderAdapter {
  async execute(provider: PetrosAiProvider, model: PetrosAiModel, request: PetrosAiNormalizedRequest) {
    const base = provider.baseUrl ?? 'https://api.anthropic.com/v1';
    const content = request.input.map((part) => {
      if (part.type === 'image' && part.dataBase64) {
        return { type: 'image', source: { type: 'base64', media_type: part.mediaType ?? 'image/jpeg', data: part.dataBase64 } };
      }
      return { type: 'text', text: part.text ?? `[${part.type} input]` };
    });
    const { body, headers } = await this.post(
      `${base.replace(/\/$/, '')}/messages`,
      { 'x-api-key': this.key(provider), 'anthropic-version': '2023-06-01' },
      {
        model: model.modelKey,
        system: request.system,
        messages: [{ role: 'user', content }],
        max_tokens: request.maxOutputTokens,
        temperature: request.temperature,
      },
      request.timeoutMs,
      request.signal,
    );
    const blocks = body.content as Array<Record<string, unknown>> | undefined;
    const usage = (body.usage ?? {}) as Record<string, unknown>;
    return {
      kind: request.responseFormat === 'json' || request.responseFormat === 'structured_teaching_block' ? 'json' as const : 'text' as const,
      content: blocks?.filter((block) => block.type === 'text').map((block) => String(block.text ?? '')).join('\n') ?? '',
      inputTokens: number(usage.input_tokens),
      outputTokens: number(usage.output_tokens),
      cachedTokens: number(usage.cache_read_input_tokens),
      providerRequestId: headers.get('request-id') ?? String(body.id ?? ''),
    };
  }
}

class GeminiAdapter extends HttpAdapter implements PetrosProviderAdapter {
  async execute(provider: PetrosAiProvider, model: PetrosAiModel, request: PetrosAiNormalizedRequest) {
    const base = provider.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta';
    const parts = request.input.map((part) => part.dataBase64
      ? { inlineData: { mimeType: part.mediaType ?? 'application/octet-stream', data: part.dataBase64 } }
      : { text: part.text ?? `[${part.type} input]` });
    const structured = request.responseSchema && Object.keys(request.responseSchema).length
      ? prepareGeminiJsonSchema(request.responseSchema, request)
      : null;
    const structuredConfig = request.responseFormat === 'json' || request.responseFormat === 'structured_teaching_block'
      ? structured && /^gemini-3(?:\.|-)/.test(model.modelKey)
        ? { responseFormat: { text: { mimeType: 'APPLICATION_JSON', schema: structured } } }
        : {
            responseMimeType: 'application/json',
            ...(structured ? { responseJsonSchema: structured } : {}),
          }
      : {};
    const { body } = await this.post(
      `${base.replace(/\/$/, '')}/models/${encodeURIComponent(model.modelKey)}:generateContent?key=${encodeURIComponent(this.key(provider))}`,
      {},
      {
        ...(request.system ? { systemInstruction: { parts: [{ text: request.system }] } } : {}),
        contents: [{ role: 'user', parts }],
        generationConfig: {
          maxOutputTokens: request.maxOutputTokens,
          temperature: request.temperature,
          ...structuredConfig,
        },
      },
      request.timeoutMs,
      request.signal,
    );
    const candidates = body.candidates as Array<Record<string, unknown>> | undefined;
    const content = candidates?.[0]?.content as Record<string, unknown> | undefined;
    const responseParts = content?.parts as Array<Record<string, unknown>> | undefined;
    const usage = (body.usageMetadata ?? {}) as Record<string, unknown>;
    return {
      kind: request.responseFormat === 'json' || request.responseFormat === 'structured_teaching_block' ? 'json' as const : 'text' as const,
      content: responseParts?.map((part) => String(part.text ?? '')).join('\n') ?? '',
      inputTokens: number(usage.promptTokenCount),
      outputTokens: number(usage.candidatesTokenCount),
      cachedTokens: number(usage.cachedContentTokenCount),
    };
  }
}

export class ProviderCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly usage?: PetrosAiNormalizedResponse & { estimatedCostMicros: number },
  ) {
    super(message);
  }
}

function number(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function audioFormat(mimeType?: string) {
  if (mimeType?.includes('wav')) return 'wav';
  if (mimeType?.includes('mp4')) return 'mp4';
  if (mimeType?.includes('ogg')) return 'ogg';
  if (mimeType?.includes('mpeg')) return 'mp3';
  return 'webm';
}

function audioExtension(mimeType?: string) {
  return audioFormat(mimeType);
}

function transcriptConfidence(segments: Array<Record<string, unknown>>) {
  if (!segments.length) return 0.8;
  const probabilities = segments.map((segment) => Math.max(0, Math.min(1, 1 - number(segment.no_speech_prob))));
  return probabilities.reduce((sum, value) => sum + value, 0) / probabilities.length;
}

function transcriptionDurationSeconds(
  body: Record<string, unknown>,
  segments: Array<Record<string, unknown>>,
) {
  const reported = number(body.duration);
  if (reported > 0) return reported;
  return segments.reduce((longest, segment) => Math.max(longest, number(segment.end)), 0);
}

/** Converts provider-specific audio/character units into micro-USD for modality usage records. */
export function estimateModalityCostMicros(
  providerOptions: Record<string, unknown>,
  units: { audioSeconds?: number; characters?: number },
): number | undefined {
  if (providerOptions.pricingUnit === 'audio_hour') {
    const seconds = Math.max(number(units.audioSeconds), number(providerOptions.minimumBillableSeconds));
    const rate = number(providerOptions.priceMicrosPerHour);
    return seconds > 0 && rate > 0 ? Math.round((seconds * rate) / 3_600) : undefined;
  }
  if (providerOptions.pricingUnit === 'character') {
    const characters = number(units.characters);
    const rate = number(providerOptions.priceMicrosPerMillionCharacters);
    return characters > 0 && rate > 0 ? Math.round((characters * rate) / 1_000_000) : undefined;
  }
  return undefined;
}

/** Gemini accepts a documented subset of JSON Schema and rejects unrelated Zod annotations. */
export function normalizeGeminiJsonSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeGeminiJsonSchema);
  if (!value || typeof value !== 'object') return value;
  const source = collapseGeminiUnion(value as Record<string, unknown>);
  const supported = new Set([
    '$id', '$defs', '$ref', '$anchor', 'type', 'format', 'title', 'description', 'enum',
    'items', 'prefixItems', 'minItems', 'maxItems', 'minimum', 'maximum', 'anyOf', 'oneOf',
    'properties', 'additionalProperties', 'required',
  ]);
  const entries = Object.entries(source)
      .filter(([key]) => supported.has(key))
      .map(([key, child]) => {
        if ((key === 'properties' || key === '$defs') && child && typeof child === 'object' && !Array.isArray(child)) {
          return [key, Object.fromEntries(Object.entries(child as Record<string, unknown>).map(([name, schema]) => [name, normalizeGeminiJsonSchema(schema)]))];
        }
        return [key, normalizeGeminiJsonSchema(child)];
      });
  if ('const' in source && !('enum' in source)) entries.push(['enum', [source.const]]);
  return Object.fromEntries(entries);
}

export function prepareGeminiJsonSchema(
  schema: Record<string, unknown>,
  request: PetrosAiNormalizedRequest,
): unknown {
  const normalized = normalizeGeminiJsonSchema(selectGeminiResponseVariant(schema, request));
  if (request.functionKey === 'document.teaching.plan') {
    return compactGeminiDocumentTeachingSchema(relaxGeminiCompilerHints(normalized));
  }
  return request.functionKey === 'teach_back.explanation.analyse'
    ? relaxGeminiCompilerHints(normalized)
    : normalized;
}

/**
 * Gemini rejects the complete document-activity discriminated union as too
 * deeply nested. Keep the exact outer lesson contract, but replace only that
 * union with a declarative object hint. The API still applies the full Zod and
 * semantic validators before an artifact can be published.
 */
function compactGeminiDocumentTeachingSchema(value: unknown): unknown {
  if (!isSchemaRecord(value)) return value;
  const copy = structuredClone(value);
  if (!isSchemaRecord(copy.properties)) return copy;
  const scenes = copy.properties.scenes;
  if (!isSchemaRecord(scenes) || !isSchemaRecord(scenes.items) || !isSchemaRecord(scenes.items.properties)) return copy;
  scenes.items.properties.activitySpec = {
    type: 'object',
    additionalProperties: true,
    description: 'Typed visual specification whose kind exactly equals activity. Use only the fields for that kind: code_trace={kind,language,code:string[],frames:[{id,line,variables,output?}],predictionPrompt,accessibleSummary}; coordinate_graph={kind,xAxis:{label,min,max,unit},yAxis:{label,min,max,unit},functions:[{coefficients,label,color}],area?,annotations,accessibleSummary}; equation_steps={kind,lines:[{id,expression,explanation,highlight:string[],support}],correspondence,accessibleSummary}; process_diagram={kind,orientation,nodes:[{id,label,detail?,group?}],edges:[{from,to,label?}],revealOrder,relationship,accessibleSummary}; timeline_evidence={kind,events:[{id,label,dateLabel,evidence}],question,accessibleSummary}; scenario={kind,setting,evidence:string[],focus}; sequence={kind,steps:[{id,label,detail?}]}; worked_steps={kind,steps:[{label,detail}]}; comparison={kind,columns:string[],rows:[{label,values:string[]}]}; annotated_text={kind,passage,annotations:[{phrase,note}]}; classification={kind,categories:[{id,label}],items:[{id,label,categoryId}]}; concept_map={kind,layout,nodes,edges,annotations}; numeric_exploration={kind,variable:{label,min,max,step,initial,unit},outputs:[{label,unit,initial,steps:[{operation:add|subtract|multiply|divide,operand:{source:input}|{source:constant,value:number}}]}]}. Never encode numeric steps or highlights as booleans or strings.',
  };
  return copy;
}

function relaxGeminiCompilerHints(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(relaxGeminiCompilerHints);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([key]) => !['format', 'minItems', 'maxItems'].includes(key))
    .map(([key, child]) => [key, relaxGeminiCompilerHints(child)]));
}

function selectGeminiResponseVariant(
  schema: Record<string, unknown>,
  request: PetrosAiNormalizedRequest,
): Record<string, unknown> {
  const specificRender = request.functionKey.match(/^teaching\.move\.([a-z_]+)\.render$/)?.[1];
  if (request.functionKey !== 'teaching.block.render' && !specificRender) return schema;
  const selectedMove = specificRender ?? request.input.flatMap((part) => {
    if (!part.text) return [];
    try {
      const parsed = JSON.parse(part.text) as Record<string, unknown>;
      const decision = isSchemaRecord(parsed.decision) ? parsed.decision : null;
      return typeof decision?.selectedMoveType === 'string' ? [decision.selectedMoveType] : [];
    } catch {
      return [];
    }
  })[0];
  if (!selectedMove) return schema;
  const union = Array.isArray(schema.oneOf)
    ? schema.oneOf
    : Array.isArray(schema.anyOf)
      ? schema.anyOf
      : [];
  const selected = union.find((branch) => {
    if (!isSchemaRecord(branch) || !isSchemaRecord(branch.properties)) return false;
    const discriminator = branch.properties.type;
    if (!isSchemaRecord(discriminator)) return false;
    if (discriminator.const === selectedMove) return true;
    return Array.isArray(discriminator.enum) && discriminator.enum.length === 1 && discriminator.enum[0] === selectedMove;
  });
  return isSchemaRecord(selected) ? selected : schema;
}

/**
 * Gemini rejects very large repeated discriminated unions. Collapse only large object unions into
 * one object with a discriminator enum and the union of possible fields. The gateway still applies
 * the original Zod schema after generation, so this relaxes provider guidance without relaxing the
 * application contract.
 */
function collapseGeminiUnion(source: Record<string, unknown>): Record<string, unknown> {
  const union = Array.isArray(source.oneOf)
    ? source.oneOf
    : Array.isArray(source.anyOf)
      ? source.anyOf
      : null;
  if (!union || union.length <= 8 || !union.every(isSchemaRecord)) return source;
  const branches = union as Array<Record<string, unknown>>;
  const branchProperties = branches.map((branch) => isSchemaRecord(branch.properties) ? branch.properties : {});
  const names = [...new Set(branchProperties.flatMap((properties) => Object.keys(properties)))];
  const discriminator = names.find((name) => branchProperties.every((properties) => {
    const schema = properties[name];
    return isSchemaRecord(schema) && ('const' in schema || (Array.isArray(schema.enum) && schema.enum.length === 1));
  }));
  const discriminatorValues = discriminator
    ? branchProperties.map((properties) => {
        const schema = properties[discriminator] as Record<string, unknown>;
        return 'const' in schema ? schema.const : (schema.enum as unknown[])[0];
      })
    : [];
  const mergedProperties = Object.fromEntries(names.map((name) => {
    const schemas = branchProperties.map((properties) => properties[name]).filter(isSchemaRecord);
    if (name === discriminator) {
      return [name, { type: 'string', enum: [...new Set(discriminatorValues)] }];
    }
    if (name === 'selectionPolicy') return [name, compactGeminiSelectionPolicy()];
    if (name === 'moveParameters' && schemas.length === branches.length) {
      return [name, {
        type: 'object',
        additionalProperties: true,
        description: branches.map((_branch, index) => {
          const schema = schemas[index];
          const properties = isSchemaRecord(schema?.properties) ? schema.properties : {};
          const required = Array.isArray(schema?.required) ? schema.required.map(String) : [];
          const hints = required.map((field) => `${field}${geminiFieldHint(properties[field])}`);
          return `${String(discriminatorValues[index])}(${hints.join(', ')})`;
        }).join('; '),
      }];
    }
    const unique = new Map(schemas.map((schema) => [JSON.stringify(schema), schema]));
    if (unique.size === 1) return [name, schemas[0]];
    if (schemas.length === branches.length && schemas.every((schema) => schema.type === 'object')) {
      const merged = mergeGeminiObjectSchemas(schemas);
      if (discriminator) {
        merged.description = branches.map((_branch, index) => {
          const schema = branchProperties[index]?.[name];
          const required = isSchemaRecord(schema) && Array.isArray(schema.required) ? schema.required.join(', ') : 'no required fields';
          return `${String(discriminatorValues[index])}: ${required}`;
        }).join('; ');
      }
      return [name, merged];
    }
    return [name, schemas[0]];
  }));
  const requiredSets = branches.map((branch) => new Set(Array.isArray(branch.required) ? branch.required.map(String) : []));
  const required = names.filter((name) => requiredSets.every((set) => set.has(name)));
  const variantRequirements = discriminator
    ? branches.map((branch, index) => {
        const branchRequired = Array.isArray(branch.required) ? branch.required.map(String) : [];
        const variantOnly = branchRequired.filter((name) => !required.includes(name));
        return `${String(discriminatorValues[index])}: ${variantOnly.length ? variantOnly.join(', ') : 'use only its matching fields'}`;
      }).join('; ')
    : '';
  return {
    type: 'object',
    properties: mergedProperties,
    required,
    additionalProperties: false,
    ...(variantRequirements ? { description: `Variant requirements — ${variantRequirements}` } : {}),
  };
}

function compactGeminiSelectionPolicy(): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      normalizedCandidateWeights: {
        type: 'object',
        additionalProperties: { type: 'number', minimum: 0, maximum: 1 },
        description: 'One normalized 0..1 weight for every declared Petros move type.',
      },
      exclusions: {
        type: 'array',
        maxItems: 18,
        items: {
          type: 'object',
          properties: { move: { type: 'string' }, reason: { type: 'string' } },
          required: ['move', 'reason'],
          additionalProperties: false,
        },
      },
      selectedWeight: { type: 'number', minimum: 0, maximum: 1 },
      override: {
        anyOf: [
          {
            type: 'object',
            properties: {
              policy: { type: 'string' }, from: { type: ['string', 'null'] },
              to: { type: 'string' }, reason: { type: 'string' },
            },
            required: ['policy', 'from', 'to', 'reason'],
            additionalProperties: false,
          },
          { type: 'null' },
        ],
      },
      capabilityFallback: { type: ['string', 'null'] },
    },
    required: ['normalizedCandidateWeights', 'exclusions', 'selectedWeight', 'override', 'capabilityFallback'],
    additionalProperties: false,
  };
}

function geminiFieldHint(value: unknown): string {
  if (!isSchemaRecord(value)) return '';
  if (Array.isArray(value.enum)) return `=${value.enum.map(String).join('|')}`;
  if (value.type === 'array') return ':array';
  if (Array.isArray(value.type)) return `:${value.type.map(String).join('|')}`;
  return typeof value.type === 'string' ? `:${value.type}` : '';
}

function mergeGeminiObjectSchemas(schemas: Array<Record<string, unknown>>): Record<string, unknown> {
  const propertyMaps = schemas.map((schema) => isSchemaRecord(schema.properties) ? schema.properties : {});
  const names = [...new Set(propertyMaps.flatMap((properties) => Object.keys(properties)))];
  const properties = Object.fromEntries(names.map((name) => {
    const candidates = propertyMaps.map((map) => map[name]).filter(isSchemaRecord);
    return [name, candidates[0]];
  }));
  const requiredSets = schemas.map((schema) => new Set(Array.isArray(schema.required) ? schema.required.map(String) : []));
  return {
    type: 'object',
    properties,
    required: names.filter((name) => requiredSets.every((set) => set.has(name))),
    additionalProperties: false,
  };
}

function isSchemaRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function providerError(body: Record<string, unknown>): string | undefined {
  const error = body.error;
  if (typeof error === 'string') return error.slice(0, 500);
  if (error && typeof error === 'object') {
    const message = (error as Record<string, unknown>).message;
    if (typeof message === 'string') return message.slice(0, 500);
  }
  return undefined;
}
