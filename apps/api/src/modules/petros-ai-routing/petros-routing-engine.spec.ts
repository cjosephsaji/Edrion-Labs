import { describe, expect, it } from 'vitest';
import { planPetrosRoute, PetrosRoutingError, type RoutingCandidate, type RoutingFunction } from './petros-routing-engine';

const fn: RoutingFunction = {
  id: 'function-1',
  key: 'explanation.deep',
  enabled: true,
  allowedInputTypes: ['text'],
  requiredCapabilities: ['text', 'structured_output'],
  settings: { caching: true },
  essential: false,
};

function candidate(patch: Partial<RoutingCandidate> = {}): RoutingCandidate {
  return {
    routeId: 'route-primary',
    providerId: 'provider-a',
    providerKey: 'provider-a',
    providerName: 'Provider A',
    providerEnabled: true,
    providerPaused: false,
    providerHealth: 'healthy',
    providerLatencyMs: 800,
    providerDailyBudgetMicros: null,
    providerMonthlyBudgetMicros: null,
    providerDailySpendMicros: 0,
    providerMonthlySpendMicros: 0,
    modelId: 'model-a',
    modelKey: 'model-a',
    modelName: 'Model A',
    modelEnabled: true,
    capabilities: ['text', 'structured_output'],
    inputCostPerMillionMicros: 1_000_000,
    outputCostPerMillionMicros: 2_000_000,
    tier: 0,
    trafficPercent: 100,
    routeEnabled: true,
    ...patch,
  };
}

const context = {
  functionKey: fn.key,
  inputModality: 'text' as const,
  estimatedTokens: 1_000,
  currentCostMicros: 0,
  previousFailures: 0,
  requestId: '852523a4-f8ce-48ad-9cca-ccad3ddc7231',
};

describe('Petros routing engine', () => {
  it('orders the chosen route, same-tier experiment alternate, then fallback', () => {
    const result = planPetrosRoute({
      context,
      fn,
      candidates: [
        candidate({ trafficPercent: 80 }),
        candidate({ routeId: 'route-experiment', providerId: 'provider-b', providerKey: 'provider-b', modelId: 'model-b', modelKey: 'model-b', trafficPercent: 20 }),
        candidate({ routeId: 'route-fallback', providerId: 'provider-c', providerKey: 'provider-c', modelId: 'model-c', modelKey: 'model-c', tier: 1 }),
      ],
      rules: [],
      budget: { percentUsed: 20, action: 'none' },
    });
    expect(result.attempts).toHaveLength(3);
    expect(result.attempts[0]?.tier).toBe(0);
    expect(result.attempts[1]?.tier).toBe(0);
    expect(result.attempts[2]?.tier).toBe(1);
  });

  it('uses cost preference after the configured budget threshold', () => {
    const result = planPetrosRoute({
      context,
      fn,
      candidates: [
        candidate({ routeId: 'expensive', trafficPercent: 50, inputCostPerMillionMicros: 20_000_000 }),
        candidate({ routeId: 'cheap', providerId: 'cheap', providerKey: 'cheap', modelId: 'cheap', modelKey: 'cheap', trafficPercent: 50, inputCostPerMillionMicros: 100_000 }),
      ],
      rules: [],
      budget: { percentUsed: 95, action: 'route_to_lower_cost' },
    });
    expect(result.selected.routeId).toBe('cheap');
    expect(result.budgetAction).toBe('route_to_lower_cost');
  });

  it('routes difficult, repeatedly failed work to the explicit quality model', () => {
    const quality = candidate({ routeId: 'quality', providerId: 'provider-q', providerKey: 'provider-q', modelId: 'model-q', modelKey: 'model-q', capabilities: ['text', 'structured_output', 'reasoning'] });
    const result = planPetrosRoute({
      context: { ...context, difficultyLevel: 0.9, previousFailures: 2 },
      fn,
      candidates: [candidate(), quality],
      rules: [{
        id: 'rule-1', name: 'Escalate repeated struggle', priority: 1, enabled: true, functionId: null,
        conditions: { all: [{ field: 'difficultyLevel', operator: 'gte', value: 0.8 }, { field: 'previousFailures', operator: 'gte', value: 2 }] },
        action: { kind: 'route', modelId: 'model-q', reason: 'Use stronger reasoning after repeated failure.' },
      }],
      budget: { percentUsed: 10, action: 'none' },
    });
    expect(result.selected.modelId).toBe('model-q');
    expect(result.matchedRules[0]?.name).toBe('Escalate repeated struggle');
  });

  it('removes paused, unhealthy, over-budget, and incapable candidates', () => {
    const result = planPetrosRoute({
      context,
      fn,
      candidates: [
        candidate({ routeId: 'paused', providerPaused: true }),
        candidate({ routeId: 'down', providerId: 'down', modelId: 'down', providerHealth: 'down' }),
        candidate({ routeId: 'over-budget', providerId: 'budget', modelId: 'budget', providerMonthlyBudgetMicros: 10, providerMonthlySpendMicros: 10 }),
        candidate({ routeId: 'incapable', providerId: 'incapable', modelId: 'incapable', capabilities: ['text'] }),
        candidate({ routeId: 'valid', providerId: 'valid', modelId: 'valid' }),
      ],
      rules: [],
      budget: { percentUsed: 10, action: 'none' },
    });
    expect(result.selected.routeId).toBe('valid');
    expect(result.attempts).toHaveLength(1);
  });

  it('requires modality-specific OCR capability and preserves a compatible fallback', () => {
    const photoFunction: RoutingFunction = {
      ...fn,
      key: 'vision.question.extract',
      allowedInputTypes: ['image'],
      requiredCapabilities: ['vision', 'ocr', 'structured_output'],
    };
    const result = planPetrosRoute({
      context: { ...context, functionKey: photoFunction.key, inputModality: 'image' },
      fn: photoFunction,
      candidates: [
        candidate({ routeId: 'vision-only', capabilities: ['vision', 'structured_output'] }),
        candidate({ routeId: 'ocr-fallback', providerId: 'ocr', modelId: 'ocr', tier: 1, capabilities: ['vision', 'ocr', 'structured_output'] }),
      ],
      rules: [],
      budget: { percentUsed: 10, action: 'none' },
    });
    expect(result.selected.routeId).toBe('ocr-fallback');
    expect(result.attempts).toHaveLength(1);
  });

  it('reserves the configured per-request maximum before dispatch', () => {
    expect(() => planPetrosRoute({
      context,
      fn: { ...fn, settings: { ...fn.settings, maxCostPerRequestMicros: 20 } },
      candidates: [candidate({ providerMonthlyBudgetMicros: 100, providerMonthlySpendMicros: 90 })],
      rules: [],
      budget: { percentUsed: 10, action: 'none' },
    })).toThrowError(PetrosRoutingError);
  });

  it('preserves essential functions while stopping non-essential work at 100%', () => {
    expect(() => planPetrosRoute({
      context,
      fn,
      candidates: [candidate()],
      rules: [],
      budget: { percentUsed: 100, action: 'stop_non_essential' },
    })).toThrowError(PetrosRoutingError);
    const essential = planPetrosRoute({
      context,
      fn: { ...fn, essential: true },
      candidates: [candidate()],
      rules: [],
      budget: { percentUsed: 100, action: 'stop_non_essential' },
    });
    expect(essential.selected.routeId).toBe('route-primary');
  });
});
