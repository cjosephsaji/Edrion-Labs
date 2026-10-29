import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { PetrosAiGatewayService } from '../../petros-ai-routing/petros-ai-gateway.service';
import { PetrosBudgetError } from '../../petros-ai-routing/petros-ai-routing.repository';
import { M2_PROMPT, type InterpretationAuthorization } from './petros-content-interpretation';
import type { SourceRevision } from '@edrion/schemas';
const controlledRouteId = randomUUID();
export function controlledGateway(content: unknown, denyBudget = false) {
  const provider = { id: randomUUID(), key: 'controlled', adapterType: 'openai_compatible' },
    model = {
      id: randomUUID(),
      modelKey: 'controlled-model',
      pricing: { inputPerMillionMicros: 1000, outputPerMillionMicros: 1000 },
    };
  const candidate = {
    providerId: provider.id,
    modelId: model.id,
    tier: 0,
    routeId: controlledRouteId,
  };
  const repo = {
    findFunctionByKey: vi.fn(async () => ({
      id: randomUUID(),
      key: 'document.understand',
      activePromptVersion: M2_PROMPT,
      activeSchemaVersion: M2_PROMPT,
      responseFormat: 'json',
      settings: {
        maxInputTokens: 18000,
        maxOutputTokens: 3000,
        maxRetries: 0,
        caching: true,
        timeoutMs: 15000,
      },
    })),
    findActiveFunctionVersion: vi.fn(async () => ({
      promptTemplate: 'Existing gateway guidance.',
      responseSchema: { type: 'object', required: ['legacyField'] },
    })),
    functionQuotaSnapshot: vi.fn(async () => ({
      dailyRequests: 0,
      monthlyRequests: 0,
      studentCostMicros: 0,
      institutionRequests: 0,
    })),
    findProvider: vi.fn(async () => provider),
    findModel: vi.fn(async () => model),
    recordUsage: vi.fn(),
    reserveDocumentAttempt: vi.fn(async () => {
      if (denyBudget) throw new PetrosBudgetError('PETROS_BUDGET_PRICE_UNAVAILABLE');
      return { id: randomUUID(), reservedMicros: 100 };
    }),
    reserveSourceAttempt: vi.fn(async () => {
      if (denyBudget) throw new PetrosBudgetError('PETROS_BUDGET_PRICE_UNAVAILABLE');
      return { id: randomUUID(), reservedMicros: 100 };
    }),
    releaseDocumentAttempt: vi.fn(),
    markDocumentAttemptDispatched: vi.fn(),
    settleDocumentAttempt: vi.fn(),
  };
  const routing = {
    ensureRegistry: vi.fn(),
    previewRoute: vi.fn(async () => ({
      selected: candidate,
      attempts: [candidate],
      cacheAllowed: true,
      matchedRules: [],
    })),
  };
  const execute = vi.fn(async () => ({
    kind: 'json' as const,
    content,
    inputTokens: 10,
    outputTokens: 8,
    cachedTokens: 0,
    actualCostMicros: 0,
  }));
  const redis = { get: vi.fn(), set: vi.fn() };
  const gateway = new PetrosAiGatewayService(
    routing as never,
    repo as never,
    { adapter: () => ({ execute }) } as never,
    redis as never,
    { PETROS_AI_MODE: 'live', NODE_ENV: 'test', PETROS_M2_ISOLATED_ENABLED: true } as never,
  );
  return { gateway, execute, repo, redis };
}
export const controlledAuthorization = (r: SourceRevision): InterpretationAuthorization => ({
  approved: true,
  mode: 'controlled',
  context: {
    functionKey: 'document.understand',
    institutionId: r.source.institutionId,
    inputModality: 'text',
    estimatedTokens: 10,
    currentCostMicros: 0,
    previousFailures: 0,
  },
  databaseScope: (work) => work(),
  authorizeAttempt: async () => {},
  sourceReservation: {
    kind: 'staff_source',
    institutionId: r.source.institutionId,
    staffActorId: r.processing.createdBy,
    sourceRevisionId: r.id,
    sourceHash: r.source.originalHash,
    preparationId: randomUUID(),
    fence: 1,
    stage: 'document.understand',
    interpretationVersion: M2_PROMPT,
    requestId: randomUUID(),
    approvalId: randomUUID(),
    routeId: controlledRouteId,
    providerKey: 'controlled',
    modelKey: 'controlled-model',
    maxSpendMicros: 100000,
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  },
});
