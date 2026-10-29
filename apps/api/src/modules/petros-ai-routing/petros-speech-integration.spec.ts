import { afterEach, describe, expect, it, vi } from 'vitest';
import { PetrosAiGatewayService } from './petros-ai-gateway.service';
import { PetrosProviderAdapterRegistry } from './petros-provider-adapters';

afterEach(() => vi.unstubAllGlobals());
function fixture(models: string[]) {
  const candidates = models.map((_, i) => ({ providerId: `p${i}`, modelId: `m${i}`, routeId: `r${i}`, tier: i }));
  const providers = models.map((_, i) => ({ id: `p${i}`, key: `provider-${i}`, adapterType: 'openai', enabled: true, paused: false, credentialEnvelope: 'synthetic', baseUrl: `https://provider-${i}.invalid/v1` }));
  const records = models.map(modelKey => ({ modelKey, enabled: true, pricing: {}, providerOptions: { pricingUnit: 'character', priceMicrosPerMillionCharacters: 15_000_000 } }));
  const repo = { findFunctionByKey: vi.fn(async () => ({ id: 'f', key: 'speech.synthesise', activePromptVersion: 'v1', activeSchemaVersion: 'v1', settings: { caching: false, maxInputTokens: 1_000, maxOutputTokens: 100, maxRetries: 1, timeoutMs: 5_000 } })),
    findActiveFunctionVersion: vi.fn(), functionQuotaSnapshot: vi.fn(async () => ({})), findProvider: vi.fn(async id => providers[Number(id.slice(1))]), findModel: vi.fn(async id => records[Number(id.slice(1))]), recordUsage: vi.fn() };
  const routing = { ensureRegistry: vi.fn(), previewRoute: vi.fn(async () => ({ selected: candidates[0], attempts: candidates, matchedRules: [], cacheAllowed: false })) };
  const adapters = new PetrosProviderAdapterRegistry({ decrypt: () => 'SYNTHETIC-NO-REAL-KEY' } as never);
  const gateway = new PetrosAiGatewayService(routing as never, repo as never, adapters, {} as never, { PETROS_AI_MODE: 'live' } as never);
  const fetch = vi.fn(async () => new Response(new Uint8Array([1, 2]), { headers: { 'content-type': 'audio/wav' } })); vi.stubGlobal('fetch', fetch);
  return { gateway, fetch, repo, records };
}
const request = (voice: 'cedar' | 'marin' | 'onyx' | 'nova') => ({ context: { functionKey: 'speech.synthesise', inputModality: 'text' as const, estimatedTokens: 20, currentCostMicros: 0, previousFailures: 0 },
  input: [{ type: 'text' as const, text: 'The vertical change is six. The horizontal change is three. Their ratio is two.' }], speech: { voice, strictVoice: true }, disableCache: true });
describe('selection through the actual gateway and mocked provider adapter', () => {
  it.each(['cedar', 'marin'] as const)('legacy %s never dispatches Onyx', async voice => {
    const f = fixture(['tts-1', 'tts-1-hd']);
    await expect(f.gateway.execute(request(voice))).rejects.toMatchObject({ response: { code: 'PETROS_UNSUPPORTED_VOICE' } });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(['onyx', 'nova'] as const)('legacy %s reaches the payload and effective receipt unchanged', async voice => {
    const f = fixture(['tts-1']); const result = await f.gateway.execute(request(voice));
    expect(JSON.parse((f.fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).voice).toBe(voice);
    expect(result).toMatchObject({ routeId: 'r0', providerKey: 'provider-0', modelKey: 'tts-1', routeFallbackUsed: false, content: { effectiveVoice: voice, requestedVoice: voice, voiceFallbackUsed: false } });
  });
  it.each(['cedar', 'marin'] as const)('mocked Mini %s remains distinct across a skipped incompatible route', async voice => {
    const f = fixture(['tts-1', 'gpt-4o-mini-tts']); const result = await f.gateway.execute(request(voice));
    expect(f.fetch).toHaveBeenCalledOnce(); expect((f.fetch.mock.calls[0] as unknown[])[0]).toContain('provider-1.invalid');
    expect(JSON.parse((f.fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).voice).toBe(voice);
    expect(result).toMatchObject({ routeId: 'r1', routeFallbackUsed: true, modelKey: 'gpt-4o-mini-tts', providerKey: 'provider-1', content: { effectiveVoice: voice } });
  });
  it('preserves retryable route failure and reports the actual successful route', async () => {
    const f = fixture(['tts-1', 'tts-1-hd']);
    f.fetch.mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(new Response('{}', { status: 503 }));
    const result = await f.gateway.execute(request('nova'));
    expect(result).toMatchObject({ routeId: 'r1', routeFallbackUsed: true, providerKey: 'provider-1', modelKey: 'tts-1-hd', content: { effectiveVoice: 'nova' } });
    expect(f.repo.recordUsage.mock.calls.map(call => call[0].status)).toEqual(['failure', 'failure', 'success']);
  });
  it('does not activate Mini via portal fallback using a fake character price', async () => {
    const f = fixture(['gpt-4o-mini-tts']);
    await expect(f.gateway.execute({ ...request('cedar'), requireQualifiedSpeech: true })).rejects.toMatchObject({ response: { code: 'PETROS_ALL_ROUTES_FAILED' } });
    expect(f.fetch).not.toHaveBeenCalled();
  });
});
