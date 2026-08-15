import type { PetrosRouteContext } from '@edrion/schemas';

export interface RoutingFunction {
  id: string;
  key: string;
  enabled: boolean;
  allowedInputTypes: string[];
  requiredCapabilities: string[];
  settings: Record<string, unknown>;
  essential: boolean;
}

export interface RoutingCandidate {
  routeId: string;
  providerId: string;
  providerKey: string;
  providerName: string;
  providerEnabled: boolean;
  providerPaused: boolean;
  providerHealth: string;
  providerLatencyMs: number | null;
  providerDailyBudgetMicros: number | null;
  providerMonthlyBudgetMicros: number | null;
  providerDailySpendMicros: number;
  providerMonthlySpendMicros: number;
  modelId: string;
  modelKey: string;
  modelName: string;
  modelEnabled: boolean;
  capabilities: string[];
  inputCostPerMillionMicros: number;
  outputCostPerMillionMicros: number;
  tier: number;
  trafficPercent: number;
  routeEnabled: boolean;
}

export interface RoutingRule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  functionId: string | null;
  conditions: { all?: RuleCondition[]; any?: RuleCondition[] };
  action: {
    kind: 'route' | 'prefer_cost' | 'prefer_quality' | 'prefer_latency' | 'cache' | 'block';
    providerId?: string;
    modelId?: string;
    maxTier?: number;
    reason?: string;
  };
}

interface RuleCondition {
  field: keyof PetrosRouteContext | 'providerAvailable';
  operator: 'eq' | 'neq' | 'in' | 'not_in' | 'gt' | 'gte' | 'lt' | 'lte';
  value: string | number | boolean | (string | number)[];
}

export interface BudgetState {
  percentUsed: number;
  action: 'none' | 'warn' | 'restrict_expensive' | 'route_to_lower_cost' | 'stop_non_essential';
}

export interface PetrosRoutePlan {
  selected: RoutingCandidate;
  attempts: RoutingCandidate[];
  matchedRules: { id: string; name: string; action: string }[];
  budgetAction: BudgetState['action'];
  cacheAllowed: boolean;
  explanation: string[];
}

export class PetrosRoutingError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** Pure deterministic routing. Provider execution and UI never participate in this decision. */
export function planPetrosRoute(input: {
  context: PetrosRouteContext;
  fn: RoutingFunction;
  candidates: RoutingCandidate[];
  rules: RoutingRule[];
  budget: BudgetState;
}): PetrosRoutePlan {
  const { context, fn, budget } = input;
  if (!fn.enabled) throw new PetrosRoutingError('FUNCTION_DISABLED', 'This Petros function is disabled.');
  if (!fn.allowedInputTypes.includes(context.inputModality)) {
    throw new PetrosRoutingError('INPUT_NOT_ALLOWED', `Input modality ${context.inputModality} is not allowed.`);
  }
  if (budget.action === 'stop_non_essential' && !fn.essential) {
    throw new PetrosRoutingError('BUDGET_NON_ESSENTIAL_STOP', 'The active budget policy paused this non-essential function.');
  }

  let candidates = input.candidates.filter((candidate) =>
    candidate.routeEnabled &&
    candidate.providerEnabled &&
    !candidate.providerPaused &&
    candidate.providerHealth !== 'down' &&
    candidate.modelEnabled &&
    fn.requiredCapabilities.every((capability) => candidate.capabilities.includes(capability)) &&
    !isProviderOverBudget(candidate, Number(fn.settings.maxCostPerRequestMicros ?? 0)),
  );
  if (!candidates.length) {
    throw new PetrosRoutingError('NO_CAPABLE_ROUTE', 'No enabled, healthy route satisfies this function.');
  }

  const enrichedContext = { ...context, providerAvailable: candidates.length > 0 };
  const matched = input.rules
    .filter((rule) => rule.enabled && (!rule.functionId || rule.functionId === fn.id))
    .sort((a, b) => a.priority - b.priority)
    .filter((rule) => matchesConditions(rule.conditions, enrichedContext));
  const explanation: string[] = [];
  let cacheAllowed = Boolean(fn.settings.caching);
  let preference: 'cost' | 'quality' | 'latency' | undefined;
  const explicitTargets = new Set<string>();

  for (const rule of matched) {
    const action = rule.action;
    if (action.kind === 'block') {
      throw new PetrosRoutingError('ROUTING_RULE_BLOCKED', action.reason ?? `Blocked by ${rule.name}.`);
    }
    if (action.maxTier != null) candidates = candidates.filter((candidate) => candidate.tier <= action.maxTier!);
    if (action.kind === 'route') {
      const targeted = candidates.filter((candidate) =>
        (!action.providerId || candidate.providerId === action.providerId) &&
        (!action.modelId || candidate.modelId === action.modelId),
      );
      if (targeted.length) {
        targeted.forEach((candidate) => explicitTargets.add(candidate.routeId));
        candidates = [...targeted, ...candidates.filter((candidate) => !targeted.includes(candidate))];
      }
    }
    if (action.kind === 'prefer_cost') preference = 'cost';
    if (action.kind === 'prefer_quality') preference = 'quality';
    if (action.kind === 'prefer_latency') preference = 'latency';
    if (action.kind === 'cache') cacheAllowed = true;
    explanation.push(`${rule.name}: ${action.reason ?? action.kind.replace(/_/g, ' ')}`);
  }

  if (budget.action === 'restrict_expensive' || budget.action === 'route_to_lower_cost') preference = 'cost';
  if (!candidates.length) throw new PetrosRoutingError('NO_RULE_MATCHING_ROUTE', 'Routing rules removed every available route.');

  const tiers = [...new Set(candidates.map((candidate) => candidate.tier))].sort((a, b) => a - b);
  const attempts: RoutingCandidate[] = [];
  for (const tier of tiers) {
    const tierCandidates = sortCandidates(candidates.filter((candidate) => candidate.tier === tier), preference)
      .sort((a, b) => Number(explicitTargets.has(b.routeId)) - Number(explicitTargets.has(a.routeId)));
    const selected = preference || explicitTargets.has(tierCandidates[0]!.routeId)
      ? tierCandidates[0]!
      : weightedPick(tierCandidates, context.requestId ?? `${context.functionKey}:${context.studentId ?? 'anonymous'}`);
    attempts.push(selected, ...tierCandidates.filter((candidate) => candidate.routeId !== selected.routeId));
  }
  const selected = attempts[0]!;
  explanation.unshift(`Tier ${selected.tier} · ${selected.providerName} · ${selected.modelName}`);
  if (budget.action !== 'none') explanation.push(`Budget policy: ${budget.action.replace(/_/g, ' ')}`);
  return {
    selected,
    attempts,
    matchedRules: matched.map((rule) => ({ id: rule.id, name: rule.name, action: rule.action.kind })),
    budgetAction: budget.action,
    cacheAllowed,
    explanation,
  };
}

function isProviderOverBudget(candidate: RoutingCandidate, reservedRequestMicros: number): boolean {
  const exhausted = (spent: number, budget: number) => reservedRequestMicros > 0
    ? spent + reservedRequestMicros > budget
    : spent >= budget;
  return (
    (candidate.providerDailyBudgetMicros != null && exhausted(candidate.providerDailySpendMicros, candidate.providerDailyBudgetMicros)) ||
    (candidate.providerMonthlyBudgetMicros != null && exhausted(candidate.providerMonthlySpendMicros, candidate.providerMonthlyBudgetMicros))
  );
}

function matchesConditions(
  conditions: RoutingRule['conditions'],
  context: PetrosRouteContext & { providerAvailable: boolean },
): boolean {
  const all = conditions.all ?? [];
  const any = conditions.any ?? [];
  return all.every((condition) => matchesCondition(condition, context)) &&
    (any.length === 0 || any.some((condition) => matchesCondition(condition, context)));
}

function matchesCondition(
  condition: RuleCondition,
  context: PetrosRouteContext & { providerAvailable: boolean },
): boolean {
  const actual = context[condition.field as keyof typeof context];
  const expected = condition.value;
  switch (condition.operator) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'in': return Array.isArray(expected) && expected.includes(actual as never);
    case 'not_in': return Array.isArray(expected) && !expected.includes(actual as never);
    case 'gt': return Number(actual) > Number(expected);
    case 'gte': return Number(actual) >= Number(expected);
    case 'lt': return Number(actual) < Number(expected);
    case 'lte': return Number(actual) <= Number(expected);
  }
}

function sortCandidates(candidates: RoutingCandidate[], preference?: 'cost' | 'quality' | 'latency') {
  return [...candidates].sort((a, b) => {
    if (preference === 'cost') {
      return (a.inputCostPerMillionMicros + a.outputCostPerMillionMicros) -
        (b.inputCostPerMillionMicros + b.outputCostPerMillionMicros);
    }
    if (preference === 'latency') return (a.providerLatencyMs ?? Number.MAX_SAFE_INTEGER) - (b.providerLatencyMs ?? Number.MAX_SAFE_INTEGER);
    if (preference === 'quality') return Number(b.capabilities.includes('reasoning')) - Number(a.capabilities.includes('reasoning'));
    return a.providerKey.localeCompare(b.providerKey) || a.modelKey.localeCompare(b.modelKey);
  });
}

function weightedPick(candidates: RoutingCandidate[], seed: string): RoutingCandidate {
  if (candidates.length === 1) return candidates[0]!;
  const total = candidates.reduce((sum, candidate) => sum + candidate.trafficPercent, 0);
  let point = stableHash(seed) % Math.max(total, 1);
  for (const candidate of candidates) {
    point -= candidate.trafficPercent;
    if (point < 0) return candidate;
  }
  return candidates[0]!;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
