import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import type { AuditWriter } from '@edrion/audit';
import type { PetrosAiModel, PetrosAiProvider } from '@edrion/database';
import {
  DEFAULT_PETROS_FUNCTION_SETTINGS,
  PETROS_FUNCTION_CATALOG,
  type ConfigurePetrosFunctionInput,
  type CreatePetrosFunctionVersionInput,
  type PetrosRouteContext,
  type PetrosUsageQuery,
  type UpdatePetrosBudgetPolicyInput,
  type UpsertPetrosModelInput,
  type UpsertPetrosProviderInput,
  type UpsertPetrosRoutingRuleInput,
} from '@edrion/schemas';
import { RiskLevel } from '@edrion/shared-types';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { PetrosAiCredentialsService } from './petros-ai-credentials.service';
import { PetrosAiRoutingRepository } from './petros-ai-routing.repository';
import { PetrosProviderConnectivityService } from './petros-provider-connectivity.service';
import { PetrosReleaseService } from '../petros-quality/petros-release.service';
import {
  planPetrosRoute,
  type BudgetState,
  type RoutingCandidate,
  type RoutingRule,
} from './petros-routing-engine';

const MODULE = 'petros-ai-routing';

@Injectable()
export class PetrosAiRoutingService implements OnModuleInit {
  private registrySynced = false;

  constructor(
    private readonly repo: PetrosAiRoutingRepository,
    private readonly credentials: PetrosAiCredentialsService,
    private readonly connectivity: PetrosProviderConnectivityService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly release?: PetrosReleaseService,
  ) {}

  async onModuleInit(): Promise<void> {
    // Keep startup resilient during deploys where the app can start just before migrations finish.
    await this.syncRegistry().catch(() => undefined);
  }

  private async syncRegistry() {
    if (this.registrySynced) return;
    await this.repo.syncBuiltIns(PETROS_FUNCTION_CATALOG, DEFAULT_PETROS_FUNCTION_SETTINGS);
    this.registrySynced = true;
  }

  async ensureRegistry() {
    await this.syncRegistry();
  }

  async overview() {
    await this.syncRegistry();
    const [providers, functions, rules, usage, budget] = await Promise.all([
      this.repo.listProviders(),
      this.repo.listFunctions(),
      this.repo.listRules(),
      this.repo.usageSummary({ groupBy: 'day' }),
      this.repo.getGlobalBudget(),
    ]);
    return {
      providerCount: providers.length,
      healthyProviderCount: providers.filter((p) => p.enabled && !p.paused && p.healthStatus === 'healthy').length,
      configuredFunctionCount: functions.filter((fn) => fn.routes.some((route) => route.enabled)).length,
      functionCount: functions.length,
      enabledRuleCount: rules.filter((row) => row.rule.enabled).length,
      monthlyCostMicros: Number(usage.totals.costMicros),
      monthlyBudgetMicros: budget?.monthlyBudgetMicros ?? null,
      failureRate: Number(usage.totals.attempts) > 0 ? Number(usage.totals.failures) / Number(usage.totals.attempts) : 0,
      averageResponseMs: Number(usage.totals.averageResponseMs),
      fallbackRate: Number(usage.totals.attempts) > 0 ? Number(usage.totals.fallbacks) / Number(usage.totals.attempts) : 0,
    };
  }

  async providers() {
    const [providers, models] = await Promise.all([this.repo.listProviders(), this.repo.listModels()]);
    return providers.map((provider) => ({
      ...this.safeProvider(provider),
      models: models.filter((model) => model.providerId === provider.id),
    }));
  }

  async createProvider(input: UpsertPetrosProviderInput, ctx: ActionContext) {
    if (await this.repo.findProviderByKey(input.key)) throw this.conflict('A provider with this key already exists.');
    const credential = input.apiKey ? this.credentials.encrypt(input.apiKey) : undefined;
    const row = await this.repo.insertProvider({
      key: input.key,
      displayName: input.displayName,
      adapterType: input.adapterType,
      baseUrl: input.baseUrl ?? null,
      credentialEnvelope: credential?.envelope,
      credentialHint: credential?.hint,
      enabled: input.enabled,
      paused: input.paused,
      priority: input.priority,
      dailyBudgetMicros: input.dailyBudgetMicros ?? null,
      monthlyBudgetMicros: input.monthlyBudgetMicros ?? null,
      capabilities: input.capabilities,
      metadata: input.metadata,
      createdBy: ctx.principalContext.principal.employeeId,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    await this.write(ctx, 'petros.provider.create', 'petros_ai_provider', row.id, input.reason, undefined, this.safeProvider(row));
    return this.safeProvider(row);
  }

  async updateProvider(id: string, input: UpsertPetrosProviderInput, ctx: ActionContext) {
    const existing = await this.requireProvider(id);
    if (input.key !== existing.key) {
      const duplicate = await this.repo.findProviderByKey(input.key);
      if (duplicate && duplicate.id !== id) throw this.conflict('A provider with this key already exists.');
    }
    const credential = input.apiKey ? this.credentials.encrypt(input.apiKey) : undefined;
    const row = await this.repo.updateProvider(id, input.version ?? existing.version, {
      key: input.key,
      displayName: input.displayName,
      adapterType: input.adapterType,
      baseUrl: input.baseUrl ?? null,
      ...(credential ? { credentialEnvelope: credential.envelope, credentialHint: credential.hint } : {}),
      enabled: input.enabled,
      paused: input.paused,
      priority: input.priority,
      dailyBudgetMicros: input.dailyBudgetMicros ?? null,
      monthlyBudgetMicros: input.monthlyBudgetMicros ?? null,
      capabilities: input.capabilities,
      metadata: input.metadata,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!row) throw this.conflict('Provider settings changed. Reload and try again.');
    await this.write(ctx, 'petros.provider.update', 'petros_ai_provider', id, input.reason, this.safeProvider(existing), this.safeProvider(row));
    return this.safeProvider(row);
  }

  async testProvider(id: string) {
    const provider = await this.requireProvider(id);
    const result = await this.connectivity.test(provider);
    await this.repo.updateProviderHealth(id, {
      healthStatus: result.ok ? 'healthy' : 'down',
      latencyMs: result.latencyMs,
      lastHealthCheckAt: new Date(),
      lastHealthError: result.error ?? null,
    });
    return result;
  }

  async createModel(input: UpsertPetrosModelInput, ctx: ActionContext) {
    await this.requireProvider(input.providerId);
    if (await this.repo.findModelByKey(input.providerId, input.modelKey)) throw this.conflict('This model already exists for the provider.');
    const row = await this.repo.insertModel({
      providerId: input.providerId,
      modelKey: input.modelKey,
      displayName: input.displayName,
      enabled: input.enabled,
      custom: input.custom,
      capabilities: input.capabilities,
      contextWindow: input.contextWindow ?? null,
      maxOutputTokens: input.maxOutputTokens ?? null,
      pricing: input.pricing,
      providerOptions: input.providerOptions,
      createdBy: ctx.principalContext.principal.employeeId,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    await this.write(ctx, 'petros.model.create', 'petros_ai_model', row.id, input.reason, undefined, row);
    return row;
  }

  async updateModel(id: string, input: UpsertPetrosModelInput, ctx: ActionContext) {
    const existing = await this.requireModel(id);
    await this.requireProvider(input.providerId);
    const row = await this.repo.updateModel(id, input.version ?? existing.version, {
      providerId: input.providerId,
      modelKey: input.modelKey,
      displayName: input.displayName,
      enabled: input.enabled,
      custom: input.custom,
      capabilities: input.capabilities,
      contextWindow: input.contextWindow ?? null,
      maxOutputTokens: input.maxOutputTokens ?? null,
      pricing: input.pricing,
      providerOptions: input.providerOptions,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!row) throw this.conflict('Model settings changed. Reload and try again.');
    await this.write(ctx, 'petros.model.update', 'petros_ai_model', id, input.reason, existing, row);
    return row;
  }

  async functions() {
    await this.syncRegistry();
    return this.repo.listFunctions();
  }

  async configureFunction(id: string, input: ConfigurePetrosFunctionInput, ctx: ActionContext) {
    const existing = await this.repo.findFunction(id);
    if (!existing) throw this.notFound('Petros function not found.');
    for (const route of input.routes) {
      const [provider, model] = await Promise.all([this.requireProvider(route.providerId), this.requireModel(route.modelId)]);
      if (model.providerId !== provider.id) throw this.conflict('A route model must belong to its selected provider.');
      const missing = input.requiredCapabilities.filter((capability) => !(model.capabilities ?? []).includes(capability));
      if (missing.length) throw this.conflict(`${model.displayName} is missing: ${missing.join(', ')}.`);
    }
    const row = await this.repo.configureFunction(
      id,
      input.version ?? existing.version,
      input,
      ctx.principalContext.principal.employeeId,
    );
    if (!row) throw this.conflict('Function settings changed. Reload and try again.');
    await this.write(ctx, 'petros.function.configure', 'petros_ai_function', id, input.reason, existing, row);
    return row;
  }

  rules() {
    return this.repo.listRules().then((rows) => rows.map((row) => ({ ...row.rule, functionKey: row.functionKey })));
  }

  async createRule(input: UpsertPetrosRoutingRuleInput, ctx: ActionContext) {
    if (input.functionId) await this.requireFunction(input.functionId);
    await this.validateRuleTarget(input);
    const row = await this.repo.insertRule({
      name: input.name,
      description: input.description ?? null,
      functionId: input.functionId ?? null,
      priority: input.priority,
      enabled: input.enabled,
      conditions: input.conditions,
      action: input.action,
      createdBy: ctx.principalContext.principal.employeeId,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    await this.write(ctx, 'petros.rule.create', 'petros_ai_routing_rule', row.id, input.reason, undefined, row);
    return row;
  }

  async updateRule(id: string, input: UpsertPetrosRoutingRuleInput, ctx: ActionContext) {
    const existing = await this.repo.findRule(id);
    if (!existing) throw this.notFound('Routing rule not found.');
    if (input.functionId) await this.requireFunction(input.functionId);
    await this.validateRuleTarget(input);
    const row = await this.repo.updateRule(id, input.version ?? existing.version, {
      name: input.name,
      description: input.description ?? null,
      functionId: input.functionId ?? null,
      priority: input.priority,
      enabled: input.enabled,
      conditions: input.conditions,
      action: input.action,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!row) throw this.conflict('Routing rule changed. Reload and try again.');
    await this.write(ctx, 'petros.rule.update', 'petros_ai_routing_rule', id, input.reason, existing, row);
    return row;
  }

  async removeRule(id: string, reason: string, ctx: ActionContext) {
    const existing = await this.repo.findRule(id);
    if (!existing) throw this.notFound('Routing rule not found.');
    await this.repo.deleteRule(id);
    await this.write(ctx, 'petros.rule.remove', 'petros_ai_routing_rule', id, reason, existing, undefined);
  }

  functionVersions(functionId: string) {
    return this.requireFunction(functionId).then(() => this.repo.listFunctionVersions(functionId));
  }

  async createFunctionVersion(functionId: string, input: CreatePetrosFunctionVersionInput, ctx: ActionContext) {
    await this.requireFunction(functionId);
    const row = await this.repo.createFunctionVersion({
      functionId,
      promptVersion: input.promptVersion,
      schemaVersion: input.schemaVersion,
      promptTemplate: input.promptTemplate,
      responseSchema: input.responseSchema,
      status: input.status === 'active' ? 'draft' : input.status,
      notes: input.notes ?? null,
      createdBy: ctx.principalContext.principal.employeeId,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    await this.write(ctx, 'petros.function_version.create', 'petros_ai_function_version', row.id, input.reason, undefined, row);
    return input.status === 'active' ? this.activateFunctionVersion(functionId, row.id, input.reason, ctx) : row;
  }

  async activateFunctionVersion(functionId: string, versionId: string, reason: string, ctx: ActionContext) {
    if (!this.release) throw new ConflictException({ code: 'PETROS_RELEASE_REQUIRED' });
    return this.release.activation(functionId, versionId, async () => {
      const row = await this.repo.activateFunctionVersion(functionId, versionId, ctx.principalContext.principal.employeeId);
      if (!row) throw this.notFound('Prompt/schema version not found.');
      await this.write(ctx, 'petros.function_version.activate', 'petros_ai_function_version', versionId, reason,
        undefined, { id: row.id, promptVersion: row.promptVersion, schemaVersion: row.schemaVersion, status: row.status });
      return row;
    });
  }

  usage(query: PetrosUsageQuery) {
    return this.repo.usageSummary(query);
  }

  async budget() {
    const row = await this.repo.getGlobalBudget();
    if (!row) throw this.notFound('Global Petros budget policy is missing. Run the latest migration.');
    return row;
  }

  async updateBudget(input: UpdatePetrosBudgetPolicyInput, ctx: ActionContext) {
    const existing = await this.budget();
    const row = await this.repo.updateGlobalBudget(input.version ?? existing.version, {
      monthlyBudgetMicros: input.monthlyBudgetMicros ?? null,
      dailyBudgetMicros: input.dailyBudgetMicros ?? null,
      thresholds: input.thresholds,
      preserveEssentialFunctions: input.preserveEssentialFunctions,
      enabled: input.enabled,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!row) throw this.conflict('Budget policy changed. Reload and try again.');
    await this.write(ctx, 'petros.budget.update', 'petros_ai_budget_policy', row.id, input.reason, existing, row);
    return row;
  }

  async previewRoute(context: PetrosRouteContext, options?: { calendarMonth?: boolean }) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const [functions, providers, models, rawRules, budget, usage] = await Promise.all([
      this.functions(),
      this.repo.listProviders(),
      this.repo.listModels(),
      this.repo.listRules(),
      this.budget(),
      this.repo.usageSummary({ groupBy: 'day', ...(options?.calendarMonth ? { from: monthStart.toISOString() } : {}) }),
    ]);
    const fn = functions.find((candidate) => candidate.key === context.functionKey);
    if (!fn) throw this.notFound('Petros function not found.');
    const definition = PETROS_FUNCTION_CATALOG.find((candidate) => candidate.key === fn.key);
    const spends = await this.repo.providerSpend(providers.map((provider) => provider.id));
    const candidates: RoutingCandidate[] = fn.routes.map((joined) => {
      const route = joined.route;
      const provider = providers.find((candidate) => candidate.id === route.providerId)!;
      const model = models.find((candidate) => candidate.id === route.modelId)!;
      const spend = spends.find((candidate) => candidate.providerId === provider.id);
      return {
        routeId: route.id,
        providerId: provider.id,
        providerKey: provider.key,
        providerName: provider.displayName,
        providerEnabled: provider.enabled,
        providerPaused: provider.paused,
        providerHealth: provider.healthStatus,
        providerLatencyMs: provider.latencyMs,
        providerDailyBudgetMicros: provider.dailyBudgetMicros,
        providerMonthlyBudgetMicros: provider.monthlyBudgetMicros,
        providerDailySpendMicros: Number(spend?.dailyMicros ?? 0),
        providerMonthlySpendMicros: Number(spend?.monthlyMicros ?? 0),
        modelId: model.id,
        modelKey: model.modelKey,
        modelName: model.displayName,
        modelEnabled: model.enabled,
        capabilities: model.capabilities,
        inputCostPerMillionMicros: Number(model.pricing.inputPerMillionMicros ?? 0),
        outputCostPerMillionMicros: Number(model.pricing.outputPerMillionMicros ?? 0),
        tier: route.tier,
        trafficPercent: route.trafficPercent,
        routeEnabled: route.enabled,
      };
    });
    const rules = rawRules.map((row) => row.rule as unknown as RoutingRule);
    const budgetState = this.budgetState(budget, Number(usage.totals.costMicros));
    return planPetrosRoute({
      context,
      fn: {
        id: fn.id,
        key: fn.key,
        enabled: fn.enabled,
        allowedInputTypes: fn.allowedInputTypes,
        requiredCapabilities: fn.requiredCapabilities,
        settings: fn.settings as unknown as Record<string, unknown>,
        essential: definition?.essential ?? false,
      },
      candidates,
      rules,
      budget: budgetState,
    });
  }

  private budgetState(policy: Awaited<ReturnType<PetrosAiRoutingService['budget']>>, spentMicros: number): BudgetState {
    if (!policy.enabled || !policy.monthlyBudgetMicros) return { percentUsed: 0, action: 'none' };
    const percentUsed = (spentMicros / policy.monthlyBudgetMicros) * 100;
    const active = [...policy.thresholds].sort((a, b) => a.percent - b.percent).filter((threshold) => percentUsed >= threshold.percent).at(-1);
    return { percentUsed, action: active?.action ?? 'none' };
  }

  private async validateRuleTarget(input: UpsertPetrosRoutingRuleInput) {
    if (input.action.providerId) await this.requireProvider(input.action.providerId);
    if (input.action.modelId) {
      const model = await this.requireModel(input.action.modelId);
      if (input.action.providerId && model.providerId !== input.action.providerId) {
        throw this.conflict('The routing rule model does not belong to the selected provider.');
      }
    }
  }

  private safeProvider(provider: PetrosAiProvider) {
    const { credentialEnvelope: _credential, ...safe } = provider;
    return { ...safe, credentialConfigured: Boolean(provider.credentialEnvelope) };
  }

  private async requireProvider(id: string): Promise<PetrosAiProvider> {
    const row = await this.repo.findProvider(id);
    if (!row) throw this.notFound('Provider not found.');
    return row;
  }

  private async requireModel(id: string): Promise<PetrosAiModel> {
    const row = await this.repo.findModel(id);
    if (!row) throw this.notFound('Model not found.');
    return row;
  }

  private async requireFunction(id: string) {
    const row = await this.repo.findFunction(id);
    if (!row) throw this.notFound('Petros function not found.');
    return row;
  }

  private async write(
    ctx: ActionContext,
    action: string,
    entityType: string,
    entityId: string,
    reason: string,
    previousState?: unknown,
    newState?: unknown,
  ) {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
      reason,
      riskLevel: RiskLevel.High,
      previousState: previousState as Record<string, unknown> | undefined,
      newState: newState as Record<string, unknown> | undefined,
    } as Parameters<AuditWriter['logAudit']>[0]);
  }

  private notFound(message: string) {
    return new NotFoundException({ code: 'NOT_FOUND', message });
  }

  private conflict(message: string) {
    return new ConflictException({ code: 'CONFLICT', message });
  }
}
