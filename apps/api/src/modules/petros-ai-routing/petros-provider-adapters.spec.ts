import { afterEach, describe, expect, it, vi } from 'vitest';
import { estimateModalityCostMicros, PetrosProviderAdapterRegistry, prepareGeminiJsonSchema } from './petros-provider-adapters';

describe('Petros document execution cancellation', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each(['openai_compatible', 'anthropic', 'gemini'])('propagates cancellation to the actual %s HTTP transport', async (adapterType) => {
    const abort = new AbortController();
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    let transport: AbortSignal | undefined;
    vi.stubGlobal('fetch', vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      transport = init.signal as AbortSignal;
      transport.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')), { once: true });
      entered();
    })));
    const provider = { adapterType, credentialEnvelope: 'synthetic-only' };
    const adapter = new PetrosProviderAdapterRegistry({ decrypt: () => 'synthetic-key' } as never).adapter(provider as never);
    const result = adapter.execute(provider as never, { modelKey: 'synthetic', providerOptions: {} } as never,
      { functionKey: 'hint.generate', input: [{ type: 'text', text: 'Synthetic source' }], responseFormat: 'json',
        maxOutputTokens: 100, temperature: 0, timeoutMs: 5000, stream: false, signal: abort.signal });
    const rejected = expect(result).rejects.toMatchObject({ code: 'TIMEOUT' });
    await started; abort.abort(); await rejected;
    expect(transport?.aborted).toBe(true);
  });
});

describe('Petros provider modality pricing', () => {
  it('meters Groq transcription by audio duration', () => {
    expect(estimateModalityCostMicros(
      { pricingUnit: 'audio_hour', priceMicrosPerHour: 40_000 },
      { audioSeconds: 7.304188 },
    )).toBe(81);
  });

  it('meters OpenAI speech synthesis by submitted characters', () => {
    expect(estimateModalityCostMicros(
      { pricingUnit: 'character', priceMicrosPerMillionCharacters: 15_000_000 },
      { characters: 800 },
    )).toBe(12_000);
  });

  it('does not invent a price when modality pricing is absent', () => {
    expect(estimateModalityCostMicros({}, { audioSeconds: 10 })).toBeUndefined();
  });

  it('selects the exact schema branch for specific teaching render functions', () => {
    const schema = {
      oneOf: [
        { type: 'object', properties: { type: { const: 'hook' }, prompt: { type: 'string' } }, required: ['type', 'prompt'] },
        { type: 'object', properties: { type: { const: 'story' }, setup: { type: 'string' } }, required: ['type', 'setup'] },
      ],
    };
    const prepared = prepareGeminiJsonSchema(schema, {
      functionKey: 'teaching.move.hook.render', input: [], responseFormat: 'json',
      maxOutputTokens: 500, temperature: 0, timeoutMs: 5_000, stream: false,
    }) as Record<string, unknown>;
    expect(prepared).toMatchObject({ properties: { type: { enum: ['hook'] } }, required: ['type', 'prompt'] });
    expect(prepared).not.toHaveProperty('oneOf');
  });

  it('removes Gemini compiler-heavy array bounds from teach-back analysis guidance', () => {
    const prepared = prepareGeminiJsonSchema({
      type: 'object',
      properties: { coverage: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'string', format: 'uuid' } } },
      required: ['coverage'],
    }, {
      functionKey: 'teach_back.explanation.analyse', input: [], responseFormat: 'json',
      maxOutputTokens: 500, temperature: 0, timeoutMs: 5_000, stream: false,
    });
    expect(JSON.stringify(prepared)).not.toMatch(/minItems|maxItems|format/);
  });
});

describe('Petros speech provider requests', () => {
  afterEach(() => vi.unstubAllGlobals());
  const provider = { adapterType: 'openai_compatible', credentialEnvelope: 'test-envelope' };
  const adapter = () => new PetrosProviderAdapterRegistry({ decrypt: () => 'test-key' } as never).adapter(provider as never);
  const request = { functionKey: 'speech.synthesise', input: [{ type: 'text' as const, text: 'One step at a time.' }], responseFormat: 'audio', maxOutputTokens: 500, temperature: 0, timeoutMs: 5_000, stream: false };

  it.each(['cedar', 'marin'] as const)('uses %s with natural delivery and browser-playable WAV', async (voice) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'audio/wav' } }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await adapter().execute(provider as never, { modelKey: 'gpt-4o-mini-tts', providerOptions: {} } as never, { ...request, speech: { voice, speed: 1 } });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body).toMatchObject({ voice, speed: 1, response_format: 'wav', input: 'One step at a time.' });
    expect(body.instructions).toContain('calm helpful tutor');
    expect(result.content).toMatchObject({ mimeType: 'audio/wav' });
  });

  it('keeps legacy TTS requests compatible with their supported voices', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2])));
    vi.stubGlobal('fetch', fetchMock);
    await adapter().execute(provider as never, { modelKey: 'tts-1', providerOptions: {} } as never, { ...request, speech: { voice: 'cedar' } });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.voice).toBe('onyx');
    expect(body).not.toHaveProperty('instructions');
  });

  it.each([
    ['gpt-4o-mini-transcribe', 'json', 'language'],
    ['whisper-large-v3-turbo', 'verbose_json', 'language'],
    ['gpt-transcribe', 'json', 'languages[]'],
  ])('provides English explicitly with a supported format for %s', async (modelKey, format, languageField) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: 'Hi, how are you?' }), { headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    await adapter().execute(provider as never, { modelKey, providerOptions: {} } as never, { ...request, functionKey: 'speech.transcribe', language: 'en', input: [{ type: 'audio', dataBase64: 'AA==', mediaType: 'audio/webm' }] });
    const body = fetchMock.mock.calls[0]![1].body as FormData;
    expect(body.get('response_format')).toBe(format);
    expect(body.get(languageField)).toBe('en');
    expect(body.get('file')).toBeInstanceOf(Blob);
  });
});
