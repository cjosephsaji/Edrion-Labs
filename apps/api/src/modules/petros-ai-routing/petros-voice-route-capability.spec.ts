import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PetrosAiGatewayService } from './petros-ai-gateway.service';
import { ProviderCallError } from './petros-provider-adapters';

/** Exercises the real gateway's final pre-HTTP route/price fence with no network or database. */
describe('voice preview gateway route and price capability fence', () => {
  function fixture(change: 'route' | 'provider' | 'model' | 'price' | 'unpriced' | 'paused' | 'down' | 'missing-key' | 'voice' | 'none', release?: { assertRuntimeVersion: () => Promise<void> }) {
    const provider = { id: '00000000-0000-4000-8000-000000000001', key: change === 'provider' ? 'changed-provider' : 'openai-live-eval', enabled: true, paused: change === 'paused', healthStatus: change === 'down' ? 'down' : 'healthy', credentialEnvelope: change === 'missing-key' ? null : 'synthetic-only' };
    const model = { id: '00000000-0000-4000-8000-000000000002', modelKey: change === 'model' ? 'changed-model' : 'tts-1', enabled: true,
      pricing: {}, providerOptions: change === 'unpriced' ? {} : { pricingUnit: 'character', priceMicrosPerMillionCharacters: change === 'price' ? 100_000_000 : 15_000_000, ...(change === 'voice' ? { qualifiedSpeechVoices: ['nova'] } : {}) } };
    const candidate = { routeId: change === 'route' ? 'changed-route' : 'route-1', providerId: provider.id, modelId: model.id, tier: 0 };
    const repo = { findFunctionByKey: vi.fn(async () => ({ id: '00000000-0000-4000-8000-000000000003', key: 'speech.synthesise', settings: { caching: false, maxInputTokens: 1_000, maxOutputTokens: 100, maxRetries: 2 } })),
      findActiveFunctionVersion: vi.fn(async () => release ? { id: 'synthetic-release', responseSchema: {} } : undefined), functionQuotaSnapshot: vi.fn(async () => ({})), findProvider: vi.fn(async () => provider), findModel: vi.fn(async () => model), recordUsage: vi.fn() };
    const routing = { ensureRegistry: vi.fn(), previewRoute: vi.fn(async () => ({ selected: candidate, attempts: [candidate], matchedRules: [], cacheAllowed: false })) };
    const execute = vi.fn(async () => ({ kind: 'audio', content: { dataBase64: 'AA==', effectiveVoice: 'onyx', mimeType: 'audio/wav' }, inputTokens: 125, outputTokens: 0, cachedTokens: 0, actualCostMicros: 7500 }));
    const gateway = new PetrosAiGatewayService(routing as never, repo as never, { adapter: () => ({ execute }) } as never, {} as never, { PETROS_AI_MODE: 'live' } as never, release as never);
    return { gateway, execute, repo };
  }
  const request = { context: { functionKey: 'speech.synthesise', inputModality: 'text' as const, estimatedTokens: 125, currentCostMicros: 0, previousFailures: 0 },
    input: [{ type: 'text' as const, text: 'Public sample.' }], speech: { voice: 'onyx' as const, strictVoice: true },
    disableCache: true, maxRetries: 0, maxRouteAttempts: 1,
    routeConstraint: { routeId: 'route-1', providerKey: 'openai-live-eval', modelKey: 'tts-1', maxModalityCostMicros: 10_000, units: { characters: 500 } } };
  it.each(['route', 'provider', 'model', 'price', 'unpriced', 'paused', 'down', 'missing-key', 'voice'] as const)('rejects %s drift before provider execution', async (change) => {
    const f = fixture(change);
    await expect(f.gateway.execute(request)).rejects.toMatchObject({ response: { code: 'PETROS_PREVIEW_ROUTE_CHANGED' } });
    expect(f.execute).not.toHaveBeenCalled();
  });
  it('passes the exact effective route and strict voice when the priced fence matches', async () => {
    const f = fixture('none');
    expect(await f.gateway.execute(request)).toMatchObject({ providerKey: 'openai-live-eval', modelKey: 'tts-1', estimatedCostMicros: 7500 });
    expect(f.execute).toHaveBeenCalledOnce();
    expect(f.execute).toHaveBeenCalledWith(expect.anything(), expect.anything(), expect.objectContaining({ speech: { voice: 'onyx', strictVoice: true } }));
  });
  it.each(['approval_expiry', 'client_abort'] as const)('rechecks %s after a deferred final release lookup and before HTTP', async (cause) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-10-11T12:00:00Z'));
      const expires = Date.now() + 1_000;
      let entered!: () => void, resume!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; });
      const pending = new Promise<void>(resolve => { resume = resolve; });
      let checks = 0;
      const release = { assertRuntimeVersion: vi.fn(async () => { if (++checks === 2) { entered(); await pending; } }) };
      const f = fixture('none', release);
      const abort = new AbortController();
      const denied = new ForbiddenException({ code: 'PETROS_PREVIEW_AUTHORIZATION_REQUIRED', message: 'Synthetic approval expired.' });
      const authorizeAttempt = vi.fn(async () => { if (Date.now() >= expires) throw denied; });
      const task = f.gateway.execute({ ...request, signal: abort.signal, authorizeAttempt });
      const rejected = cause === 'approval_expiry' ? expect(task).rejects.toBe(denied) : expect(task).rejects.toMatchObject({ name: 'AbortError' });
      await started;
      if (cause === 'approval_expiry') vi.setSystemTime(new Date(expires + 1)); else abort.abort();
      resume(); await rejected;
      expect(authorizeAttempt).toHaveBeenCalledTimes(2);
      expect(f.execute).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });
  it.each(['failure', 'cancellation'] as const)('commits %s usage in a short database scope before the endpoint rejects', async (cause) => {
    const f = fixture('none'); const abort = new AbortController(); let active = 0, commits = 0;
    const ledger: unknown[] = [];
    const databaseScope = async <T>(work: () => Promise<T>) => {
      active++;
      try { const result = await work(); commits++; return result; }
      finally { active--; }
    };
    f.execute.mockImplementation(async () => {
      expect(active).toBe(0);
      if (cause === 'cancellation') abort.abort();
      throw new ProviderCallError('TIMEOUT', 'Synthetic provider error containing echoed public sample text.', false);
    });
    f.repo.recordUsage.mockImplementation(async (...args: unknown[]) => {
      expect(active).toBe(1); ledger.push(args[0]);
    });
    const task = f.gateway.execute({ ...request, signal: abort.signal, databaseScope });
    if (cause === 'cancellation') await expect(task).rejects.toMatchObject({ name: 'AbortError' });
    else await expect(task).rejects.toMatchObject({ response: { code: 'PETROS_ALL_ROUTES_FAILED' } });
    expect(active).toBe(0); expect(commits).toBeGreaterThan(5);
    expect(ledger).toEqual([expect.objectContaining({ status: 'failure', errorCode: 'TIMEOUT', metadata: expect.objectContaining({ error: 'TIMEOUT' }) })]);
    expect(JSON.stringify(ledger)).not.toContain('echoed public sample text');
  });
});
