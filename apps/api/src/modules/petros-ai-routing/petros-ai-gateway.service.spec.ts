import { describe, expect, it, vi } from 'vitest';
import { PetrosAiGatewayService } from './petros-ai-gateway.service';
import { PetrosRoutingError } from './petros-routing-engine';

describe('PetrosAiGatewayService validation fallback', () => {
  it('classifies a missing eligible route as an infrastructure gateway failure', async () => {
    const fn = {
      id: '11111111-1111-4111-8111-111111111111', key: 'evaluation.teaching_quality.judge',
      responseFormat: 'json', activePromptVersion: 'judge-prompt-v1', activeSchemaVersion: 'judge-schema-v1',
      settings: { maxInputTokens: 10_000, maxOutputTokens: 500, temperature: 0, timeoutMs: 5_000, maxRetries: 1, streaming: false, caching: false },
    };
    const repo = {
      findFunctionByKey: vi.fn(async () => fn),
      findActiveFunctionVersion: vi.fn(async () => undefined),
    };
    const routing = {
      ensureRegistry: vi.fn(async () => undefined),
      previewRoute: vi.fn(async () => { throw new PetrosRoutingError('NO_CAPABLE_ROUTE', 'paused'); }),
    };
    const gateway = new PetrosAiGatewayService(routing as never, repo as never, {} as never, {} as never);

    await expect(gateway.execute({
      context: { functionKey: fn.key, inputModality: 'text', estimatedTokens: 10, currentCostMicros: 0, previousFailures: 0 },
      input: [{ type: 'text', text: 'synthetic transcript' }],
    })).rejects.toMatchObject({
      status: 502,
      response: {
        code: 'PETROS_NO_CAPABLE_ROUTE',
        meta: { failureType: 'infrastructure', routingCode: 'NO_CAPABLE_ROUTE' },
      },
    });
  });

  it('retries an invalid structured response and then uses the configured fallback route', async () => {
    const primaryExecute = vi.fn(async () => ({ kind: 'json' as const, content: { wrong: true }, inputTokens: 5, outputTokens: 3, cachedTokens: 0 }));
    const fallbackExecute = vi.fn(async () => ({ kind: 'json' as const, content: { ok: true }, inputTokens: 6, outputTokens: 4, cachedTokens: 0 }));
    const usage: Array<Record<string, unknown>> = [];
    const fn = {
      id: '11111111-1111-4111-8111-111111111111', key: 'teaching.next_action.select',
      responseFormat: 'json', activePromptVersion: 'plan-prompt-v1', activeSchemaVersion: 'plan-schema-v1',
      settings: { maxInputTokens: 10_000, maxOutputTokens: 500, temperature: 0, timeoutMs: 5_000, maxRetries: 1, streaming: false, caching: false },
    };
    const providers = {
      primary: { id: '22222222-2222-4222-8222-222222222222', key: 'primary', adapterType: 'openai_compatible' },
      fallback: { id: '33333333-3333-4333-8333-333333333333', key: 'fallback', adapterType: 'openai_compatible' },
    };
    const models = {
      primary: { id: '44444444-4444-4444-8444-444444444444', modelKey: 'primary-model', pricing: {} },
      fallback: { id: '55555555-5555-4555-8555-555555555555', modelKey: 'fallback-model', pricing: {} },
    };
    const repo = {
      findFunctionByKey: vi.fn(async () => fn),
      findActiveFunctionVersion: vi.fn(async () => undefined),
      functionQuotaSnapshot: vi.fn(async () => ({ dailyRequests: 0, monthlyRequests: 0, studentCostMicros: 0, institutionRequests: 0 })),
      findProvider: vi.fn(async (id: string) => id === providers.primary.id ? providers.primary : providers.fallback),
      findModel: vi.fn(async (id: string) => id === models.primary.id ? models.primary : models.fallback),
      recordUsage: vi.fn(async (row: Record<string, unknown>) => { usage.push(row); return row; }),
    };
    const routing = {
      ensureRegistry: vi.fn(async () => undefined),
      previewRoute: vi.fn(async () => ({
        selected: { providerId: providers.primary.id, modelId: models.primary.id, tier: 0 },
        attempts: [
          { providerId: providers.primary.id, modelId: models.primary.id, tier: 0 },
          { providerId: providers.fallback.id, modelId: models.fallback.id, tier: 1 },
        ],
        cacheAllowed: false,
        matchedRules: [],
      })),
    };
    const adapters = {
      adapter: vi.fn((provider: { key: string }) => ({ execute: provider.key === 'primary' ? primaryExecute : fallbackExecute })),
    };
    const redis = { enabled: false, get: vi.fn(), set: vi.fn() };
    const gateway = new PetrosAiGatewayService(routing as never, repo as never, adapters as never, redis as never);

    const result = await gateway.execute({
      context: {
        functionKey: fn.key,
        inputModality: 'text', estimatedTokens: 10, currentCostMicros: 0, previousFailures: 0,
      },
      input: [{ type: 'text', text: 'explicit state' }],
      responseSchema: {
        type: 'object', required: ['ok'], additionalProperties: false,
        properties: { ok: { type: 'boolean' } },
      },
      correlationId: '66666666-6666-4666-8666-666666666666',
    });

    expect(primaryExecute).toHaveBeenCalledTimes(2);
    expect(fallbackExecute).toHaveBeenCalledTimes(1);
    expect(usage.map((row) => [row.status, row.errorCode, row.fallbackTier])).toEqual([
      ['failure', 'RESPONSE_VALIDATION_FAILED', 0],
      ['failure', 'RESPONSE_VALIDATION_FAILED', 0],
      ['success', undefined, 1],
    ]);
    expect(usage[0]).toMatchObject({ inputTokens: 5, outputTokens: 3, cachedTokens: 0, estimatedCostMicros: 0 });
    expect(usage[1]).toMatchObject({ inputTokens: 5, outputTokens: 3, cachedTokens: 0, estimatedCostMicros: 0 });
    expect(result).toMatchObject({ content: { ok: true }, providerKey: 'fallback', modelKey: 'fallback-model', fallbackTier: 1 });
  });
});
