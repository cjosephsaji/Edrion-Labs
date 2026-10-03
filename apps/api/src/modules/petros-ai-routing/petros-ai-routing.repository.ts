import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  lte,
  schema,
  sql,
  type Database,
  type NewPetrosAiFunctionRoute,
  type NewPetrosAiModel,
  type NewPetrosAiProvider,
  type NewPetrosAiRoutingRule,
  type NewPetrosAiUsageEvent,
} from '@edrion/database';
import type {
  ConfigurePetrosFunctionInput,
  PetrosFunctionDefinition,
  PetrosFunctionSettingsInput,
  PetrosUsageQuery,
} from '@edrion/schemas';
import { PETROS_QUESTION_EXECUTION_VERSION } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

export class PetrosBudgetError extends Error {
  constructor(readonly code: string) { super(code); }
}

@Injectable()
export class PetrosAiRoutingRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async syncBuiltIns(
    definitions: PetrosFunctionDefinition[],
    defaultSettings: PetrosFunctionSettingsInput,
  ): Promise<void> {
    for (const definition of definitions) {
      await this.db
        .insert(schema.petrosAiFunctions)
        .values({
          key: definition.key,
          displayName: definition.displayName,
          description: definition.description,
          category: definition.category,
          allowedInputTypes: definition.allowedInputTypes,
          responseFormat: definition.responseFormat,
          requiredCapabilities: definition.requiredCapabilities,
          settings: defaultSettings,
          source: 'builtin',
        })
        .onConflictDoUpdate({
          target: schema.petrosAiFunctions.key,
          set: {
            displayName: definition.displayName,
            description: definition.description,
            category: definition.category,
            updatedAt: new Date(),
          },
        });
      if (definition.routeTemplateKey) {
        await this.inheritRoutes(definition.key, definition.routeTemplateKey);
      }
    }
  }

  /**
   * Copies a template function's routes onto a function that has none, so a newly
   * registered capability is callable instead of failing with NO_ELIGIBLE_ROUTE until an
   * administrator configures it. A function that already has any route is left alone, so
   * an administrator's choices are never overwritten.
   */
  private async inheritRoutes(targetKey: string, templateKey: string): Promise<void> {
    const [target, template] = await Promise.all([
      this.findFunctionByKey(targetKey),
      this.findFunctionByKey(templateKey),
    ]);
    if (!target || !template) return;
    const existing = await this.db
      .select({ id: schema.petrosAiFunctionRoutes.id })
      .from(schema.petrosAiFunctionRoutes)
      .where(eq(schema.petrosAiFunctionRoutes.functionId, target.id))
      .limit(1);
    if (existing.length) return;
    const templateRoutes = await this.db
      .select()
      .from(schema.petrosAiFunctionRoutes)
      .where(eq(schema.petrosAiFunctionRoutes.functionId, template.id));
    if (!templateRoutes.length) return;
    await this.db
      .insert(schema.petrosAiFunctionRoutes)
      .values(
        templateRoutes.map((route) => ({
          functionId: target.id,
          providerId: route.providerId,
          modelId: route.modelId,
          tier: route.tier,
          trafficPercent: route.trafficPercent,
          enabled: route.enabled,
          overrides: route.overrides,
        })),
      )
      .onConflictDoNothing();
  }

  listProviders() {
    return this.db
      .select()
      .from(schema.petrosAiProviders)
      .orderBy(asc(schema.petrosAiProviders.priority), asc(schema.petrosAiProviders.displayName));
  }

  listModels() {
    return this.db
      .select()
      .from(schema.petrosAiModels)
      .orderBy(asc(schema.petrosAiModels.providerId), asc(schema.petrosAiModels.displayName));
  }

  findProvider(id: string) {
    return this.db
      .select()
      .from(schema.petrosAiProviders)
      .where(eq(schema.petrosAiProviders.id, id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  findProviderByKey(key: string) {
    return this.db
      .select()
      .from(schema.petrosAiProviders)
      .where(eq(schema.petrosAiProviders.key, key))
      .limit(1)
      .then((rows) => rows[0]);
  }

  insertProvider(values: NewPetrosAiProvider) {
    return this.db.insert(schema.petrosAiProviders).values(values).returning().then((rows) => rows[0]!);
  }

  updateProvider(id: string, expectedVersion: number, patch: Partial<NewPetrosAiProvider>) {
    return this.db
      .update(schema.petrosAiProviders)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.petrosAiProviders.id, id), eq(schema.petrosAiProviders.version, expectedVersion)))
      .returning()
      .then((rows) => rows[0]);
  }

  updateProviderHealth(
    id: string,
    patch: { healthStatus: string; latencyMs: number; lastHealthCheckAt: Date; lastHealthError: string | null },
  ) {
    return this.db
      .update(schema.petrosAiProviders)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.petrosAiProviders.id, id))
      .returning()
      .then((rows) => rows[0]);
  }

  findModel(id: string) {
    return this.db
      .select()
      .from(schema.petrosAiModels)
      .where(eq(schema.petrosAiModels.id, id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  findModelByKey(providerId: string, modelKey: string) {
    return this.db
      .select()
      .from(schema.petrosAiModels)
      .where(and(eq(schema.petrosAiModels.providerId, providerId), eq(schema.petrosAiModels.modelKey, modelKey)))
      .limit(1)
      .then((rows) => rows[0]);
  }

  insertModel(values: NewPetrosAiModel) {
    return this.db.insert(schema.petrosAiModels).values(values).returning().then((rows) => rows[0]!);
  }

  updateModel(id: string, expectedVersion: number, patch: Partial<NewPetrosAiModel>) {
    return this.db
      .update(schema.petrosAiModels)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.petrosAiModels.id, id), eq(schema.petrosAiModels.version, expectedVersion)))
      .returning()
      .then((rows) => rows[0]);
  }

  async listFunctions() {
    const [functions, routes] = await Promise.all([
      this.db.select().from(schema.petrosAiFunctions).orderBy(asc(schema.petrosAiFunctions.category), asc(schema.petrosAiFunctions.displayName)),
      this.db
        .select({
          route: schema.petrosAiFunctionRoutes,
          providerKey: schema.petrosAiProviders.key,
          providerName: schema.petrosAiProviders.displayName,
          providerEnabled: schema.petrosAiProviders.enabled,
          providerPaused: schema.petrosAiProviders.paused,
          modelKey: schema.petrosAiModels.modelKey,
          modelName: schema.petrosAiModels.displayName,
          modelEnabled: schema.petrosAiModels.enabled,
          modelCapabilities: schema.petrosAiModels.capabilities,
        })
        .from(schema.petrosAiFunctionRoutes)
        .innerJoin(schema.petrosAiProviders, eq(schema.petrosAiFunctionRoutes.providerId, schema.petrosAiProviders.id))
        .innerJoin(schema.petrosAiModels, eq(schema.petrosAiFunctionRoutes.modelId, schema.petrosAiModels.id))
        .orderBy(asc(schema.petrosAiFunctionRoutes.tier), desc(schema.petrosAiFunctionRoutes.trafficPercent)),
    ]);
    return functions.map((fn) => ({
      ...fn,
      routes: routes.filter((row) => row.route.functionId === fn.id).map((row) => ({ ...row.route, ...row })),
    }));
  }

  findFunction(id: string) {
    return this.db
      .select()
      .from(schema.petrosAiFunctions)
      .where(eq(schema.petrosAiFunctions.id, id))
      .limit(1)
      .then((rows) => rows[0]);
  }

  findFunctionByKey(key: string) {
    return this.db
      .select()
      .from(schema.petrosAiFunctions)
      .where(eq(schema.petrosAiFunctions.key, key))
      .limit(1)
      .then((rows) => rows[0]);
  }

  findActiveFunctionVersion(functionId: string) {
    return this.db.select().from(schema.petrosAiFunctionVersions).where(and(
      eq(schema.petrosAiFunctionVersions.functionId, functionId),
      eq(schema.petrosAiFunctionVersions.status, 'active'),
    )).limit(1).then((rows) => rows[0]);
  }

  async configureFunction(
    functionId: string,
    expectedVersion: number,
    input: ConfigurePetrosFunctionInput,
    actorId: string,
  ) {
    return this.db.transaction(async (tx) => {
      const [fn] = await tx
        .update(schema.petrosAiFunctions)
        .set({
          enabled: input.enabled,
          allowedInputTypes: input.allowedInputTypes,
          responseFormat: input.responseFormat,
          requiredCapabilities: input.requiredCapabilities,
          settings: input.settings,
          version: expectedVersion + 1,
          updatedBy: actorId,
          updatedAt: new Date(),
        })
        .where(and(eq(schema.petrosAiFunctions.id, functionId), eq(schema.petrosAiFunctions.version, expectedVersion)))
        .returning();
      if (!fn) return undefined;
      await tx.delete(schema.petrosAiFunctionRoutes).where(eq(schema.petrosAiFunctionRoutes.functionId, functionId));
      if (input.routes.length) {
        await tx.insert(schema.petrosAiFunctionRoutes).values(
          input.routes.map((route): NewPetrosAiFunctionRoute => ({
            ...route,
            functionId,
            createdBy: actorId,
            updatedBy: actorId,
          })),
        );
      }
      return fn;
    });
  }

  listRules() {
    return this.db
      .select({ rule: schema.petrosAiRoutingRules, functionKey: schema.petrosAiFunctions.key })
      .from(schema.petrosAiRoutingRules)
      .leftJoin(schema.petrosAiFunctions, eq(schema.petrosAiRoutingRules.functionId, schema.petrosAiFunctions.id))
      .orderBy(asc(schema.petrosAiRoutingRules.priority), asc(schema.petrosAiRoutingRules.name));
  }

  findRule(id: string) {
    return this.db.select().from(schema.petrosAiRoutingRules).where(eq(schema.petrosAiRoutingRules.id, id)).limit(1).then((rows) => rows[0]);
  }

  insertRule(values: NewPetrosAiRoutingRule) {
    return this.db.insert(schema.petrosAiRoutingRules).values(values).returning().then((rows) => rows[0]!);
  }

  updateRule(id: string, expectedVersion: number, patch: Partial<NewPetrosAiRoutingRule>) {
    return this.db
      .update(schema.petrosAiRoutingRules)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.petrosAiRoutingRules.id, id), eq(schema.petrosAiRoutingRules.version, expectedVersion)))
      .returning()
      .then((rows) => rows[0]);
  }

  deleteRule(id: string) {
    return this.db.delete(schema.petrosAiRoutingRules).where(eq(schema.petrosAiRoutingRules.id, id));
  }

  listFunctionVersions(functionId: string) {
    return this.db.select().from(schema.petrosAiFunctionVersions)
      .where(eq(schema.petrosAiFunctionVersions.functionId, functionId))
      .orderBy(desc(schema.petrosAiFunctionVersions.createdAt));
  }

  createFunctionVersion(values: typeof schema.petrosAiFunctionVersions.$inferInsert) {
    return this.db.insert(schema.petrosAiFunctionVersions).values(values).returning().then((rows) => rows[0]!);
  }

  async activateFunctionVersion(functionId: string, versionId: string, actorId: string) {
    return this.db.transaction(async (tx) => {
      const [version] = await tx.select().from(schema.petrosAiFunctionVersions)
        .where(and(eq(schema.petrosAiFunctionVersions.id, versionId), eq(schema.petrosAiFunctionVersions.functionId, functionId))).limit(1);
      if (!version) return undefined;
      await tx.update(schema.petrosAiFunctionVersions).set({ status: 'archived', updatedAt: new Date() })
        .where(and(eq(schema.petrosAiFunctionVersions.functionId, functionId), eq(schema.petrosAiFunctionVersions.status, 'active')));
      await tx.update(schema.petrosAiFunctionVersions).set({ status: 'active', updatedBy: actorId, updatedAt: new Date() })
        .where(eq(schema.petrosAiFunctionVersions.id, versionId));
      await tx.update(schema.petrosAiFunctions).set({
        activePromptVersion: version.promptVersion,
        activeSchemaVersion: version.schemaVersion,
        updatedBy: actorId,
        updatedAt: new Date(),
      }).where(eq(schema.petrosAiFunctions.id, functionId));
      return { ...version, status: 'active' as const };
    });
  }

  recordUsage(values: NewPetrosAiUsageEvent) {
    return this.db.insert(schema.petrosAiUsageEvents).values(values).returning().then((rows) => rows[0]!);
  }

  /** Serialize durable paid attempts against every other durable attempt, across workers/tenants. */
  async reserveDocumentAttempt(input: {
    commandId: string; fence: number; attemptKey: string; requestId: string;
    institutionId: string; studentId: string; functionId: string; providerId: string;
    modelId: string; reserveMicros: number;
  }) {
    if (input.requestId !== input.commandId ||
      !input.attemptKey.startsWith(`${input.commandId}:${input.fence}:`))
      throw new PetrosBudgetError('PETROS_BUDGET_SCOPE_INVALID');
    if (!Number.isSafeInteger(input.reserveMicros) || input.reserveMicros <= 0)
      throw new PetrosBudgetError('PETROS_BUDGET_PRICE_UNAVAILABLE');
    const [command] = await this.db.select({ id: schema.petrosSessionCommands.id,
      sessionId: schema.petrosSessionCommands.sessionId })
      .from(schema.petrosSessionCommands)
      .where(and(
        eq(schema.petrosSessionCommands.id, input.commandId),
        eq(schema.petrosSessionCommands.institutionId, input.institutionId),
        eq(schema.petrosSessionCommands.studentId, input.studentId),
        eq(schema.petrosSessionCommands.executionState, 'running'),
        eq(schema.petrosSessionCommands.executionFence, input.fence),
        eq(schema.petrosSessionCommands.executionVersion, PETROS_QUESTION_EXECUTION_VERSION),
        eq(schema.petrosSessionCommands.command, 'document_question.v1'),
      )).limit(1).for('share');
    if (!command) throw new PetrosBudgetError('PETROS_BUDGET_SCOPE_INVALID');
    // Cancellation/failure owns the command row before reconciling budget. Keep the
    // same command -> global-budget lock order here or the two paths can deadlock.
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended('petros-ai-durable-budget', 0))`);
    const reservations = schema.petrosAiAttemptReservations;
    const [existing] = await this.db.select().from(reservations)
      .where(eq(reservations.attemptKey, input.attemptKey)).limit(1);
    if (existing) {
      if (existing.commandId !== input.commandId || existing.executionFence !== input.fence ||
          existing.requestId !== input.requestId || existing.functionId !== input.functionId ||
          existing.providerId !== input.providerId || existing.modelId !== input.modelId ||
          existing.reservedMicros !== input.reserveMicros || existing.state !== 'reserved')
        throw new PetrosBudgetError('PETROS_BUDGET_ATTEMPT_CONFLICT');
      return existing;
    }
    // A crashed earlier fence may have reached the provider. Charge its full hold
    // before admitting a replacement; a later known result cannot be double-posted.
    await this.reconcileDocumentCommand(input.commandId, input.fence);

    const [policy, provider, model, fn, routes] = await Promise.all([
      this.db.select().from(schema.petrosAiBudgetPolicies).where(and(
        eq(schema.petrosAiBudgetPolicies.scope, 'global'), sql`${schema.petrosAiBudgetPolicies.scopeId} is null`,
      )).limit(1).for('share').then(rows => rows[0]),
      this.db.select().from(schema.petrosAiProviders).where(eq(schema.petrosAiProviders.id, input.providerId))
        .limit(1).for('share').then(rows => rows[0]),
      this.findModel(input.modelId),
      this.db.select().from(schema.petrosAiFunctions).where(eq(schema.petrosAiFunctions.id, input.functionId)).limit(1).then(rows => rows[0]),
      this.db.select({ id: schema.petrosAiFunctionRoutes.id }).from(schema.petrosAiFunctionRoutes).where(and(
        eq(schema.petrosAiFunctionRoutes.functionId, input.functionId),
        eq(schema.petrosAiFunctionRoutes.providerId, input.providerId),
        eq(schema.petrosAiFunctionRoutes.modelId, input.modelId),
        eq(schema.petrosAiFunctionRoutes.enabled, true),
      )).limit(1),
    ]);
    if (!policy?.enabled || (policy.dailyBudgetMicros == null && policy.monthlyBudgetMicros == null))
      throw new PetrosBudgetError('PETROS_BUDGET_UNCONFIGURED');
    if (!provider?.enabled || provider.paused || !model?.enabled ||
      model.providerId !== provider.id || !fn?.enabled || fn.key !== 'hint.generate' || !routes.length)
      throw new PetrosBudgetError('PETROS_BUDGET_ROUTE_CHANGED');
    const minimumHold = Math.max(Number(fn.settings.maxCostPerRequestMicros ?? 0), Math.ceil((
      Number(fn.settings.maxInputTokens) * Number(model.pricing.inputPerMillionMicros ?? 0) +
      Number(fn.settings.maxOutputTokens) * Number(model.pricing.outputPerMillionMicros ?? 0)
    ) / 1_000_000));
    if (!Number.isSafeInteger(minimumHold) || minimumHold <= 0 || input.reserveMicros < minimumHold)
      throw new PetrosBudgetError('PETROS_BUDGET_PRICE_UNAVAILABLE');
    const [totals] = await this.db.execute<{
      global_daily: number; global_monthly: number; provider_daily: number;
      provider_monthly: number; student_monthly: number; function_daily_requests: number;
      function_monthly_requests: number; institution_monthly_requests: number;
    }>(sql`select * from edrion_petros_ai_budget_snapshot(
      ${input.commandId}::uuid, ${input.fence}::integer, ${input.functionId}::uuid, ${input.providerId}::uuid
    )`);
    if (!totals) throw new PetrosBudgetError('PETROS_BUDGET_SNAPSHOT_UNAVAILABLE');
    const exceeds = (spent: number, cap: number | null | undefined) =>
      cap != null && Number(spent) + input.reserveMicros > cap;
    if (exceeds(totals.global_daily, policy.dailyBudgetMicros) ||
        exceeds(totals.global_monthly, policy.monthlyBudgetMicros))
      throw new PetrosBudgetError('PETROS_GLOBAL_BUDGET_EXCEEDED');
    if (exceeds(totals.provider_daily, provider.dailyBudgetMicros) ||
        exceeds(totals.provider_monthly, provider.monthlyBudgetMicros))
      throw new PetrosBudgetError('PETROS_PROVIDER_BUDGET_EXCEEDED');
    if (exceeds(totals.student_monthly, fn.settings.maxCostPerStudentMicros))
      throw new PetrosBudgetError('PETROS_STUDENT_BUDGET_EXCEEDED');
    const [seenUsage, seenReservation] = await Promise.all([
      this.db.select({ id: schema.petrosAiUsageEvents.id }).from(schema.petrosAiUsageEvents)
        .where(and(eq(schema.petrosAiUsageEvents.requestId, input.requestId), eq(schema.petrosAiUsageEvents.functionId, input.functionId))).limit(1),
      this.db.select({ id: reservations.id }).from(reservations)
        .where(and(eq(reservations.requestId, input.requestId), eq(reservations.functionId, input.functionId))).limit(1),
    ]);
    if (!seenUsage.length && !seenReservation.length && (
      (fn.settings.dailyRequestLimit != null && Number(totals.function_daily_requests) >= fn.settings.dailyRequestLimit) ||
      (fn.settings.monthlyRequestLimit != null && Number(totals.function_monthly_requests) >= fn.settings.monthlyRequestLimit) ||
      (fn.settings.maxInstitutionUsage != null && Number(totals.institution_monthly_requests) >= fn.settings.maxInstitutionUsage)
    )) throw new PetrosBudgetError('PETROS_FUNCTION_QUOTA_EXCEEDED');
    const [row] = await this.db.insert(reservations).values({
      commandId: input.commandId, sessionId: command.sessionId,
      executionFence: input.fence, attemptKey: input.attemptKey,
      requestId: input.requestId, institutionId: input.institutionId, studentId: input.studentId,
      functionId: input.functionId, providerId: input.providerId, modelId: input.modelId,
      reservedMicros: input.reserveMicros,
    }).returning();
    return row!;
  }

  /** Preserve a full worst-case charge for an attempt whose provider outcome is unknowable. */
  async reconcileDocumentCommand(commandId: string, beforeFence?: number) {
    await this.db.execute(sql`select pg_advisory_xact_lock(hashtextextended('petros-ai-durable-budget', 0))`);
    const reservations = schema.petrosAiAttemptReservations;
    const abandoned = await this.db.select().from(reservations).where(and(
      eq(reservations.commandId, commandId), eq(reservations.state, 'reserved'),
      beforeFence == null ? undefined : sql`${reservations.executionFence} < ${beforeFence}`,
    )).for('update');
    for (const row of abandoned) {
      if (!row.providerDispatchedAt) {
        await this.releaseDocumentAttempt(row.id);
        continue;
      }
      await this.settleDocumentAttempt(row.id, {
        requestId: row.requestId, sessionId: row.sessionId, studentId: row.studentId,
        institutionId: row.institutionId, functionId: row.functionId,
        providerId: row.providerId, modelId: row.modelId,
        estimatedCostMicros: row.reservedMicros, responseTimeMs: 0,
        status: 'failure', errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
        metadata: { commandId: row.commandId, executionFence: row.executionFence, reconciliation: 'conservative' },
      }, 'ambiguous');
    }
    return abandoned.length;
  }

  /** Commit proof that provider transport may begin; recovery treats only marked holds as ambiguous. */
  async markDocumentAttemptDispatched(id: string) {
    const reservations = schema.petrosAiAttemptReservations;
    const [row] = await this.db.update(reservations).set({ providerDispatchedAt: new Date() })
      .where(and(
        eq(reservations.id, id),
        eq(reservations.state, 'reserved'),
        sql`${reservations.providerDispatchedAt} is null`,
      )).returning();
    if (!row) throw new PetrosBudgetError('PETROS_BUDGET_DISPATCH_CONFLICT');
    return row;
  }

  /** The usage event and released hold are one savepoint inside the caller's tenant transaction. */
  async settleDocumentAttempt(
    id: string, values: NewPetrosAiUsageEvent, disposition: 'settled' | 'ambiguous' = 'settled',
  ) {
    return this.db.transaction(async tx => {
      const reservations = schema.petrosAiAttemptReservations;
      const [row] = await tx.select().from(reservations).where(eq(reservations.id, id)).limit(1).for('update');
      if (!row || row.state !== 'reserved' || !row.providerDispatchedAt || row.requestId !== values.requestId ||
          row.functionId !== values.functionId || row.providerId !== values.providerId ||
          row.modelId !== values.modelId || row.studentId !== values.studentId ||
          row.institutionId !== values.institutionId)
        throw new PetrosBudgetError('PETROS_BUDGET_SETTLEMENT_CONFLICT');
      const cost = values.actualCostMicros ?? values.estimatedCostMicros ?? 0;
      if (!Number.isSafeInteger(cost) || cost < 0)
        throw new PetrosBudgetError('PETROS_BUDGET_COST_INVALID');
      const [usage] = await tx.insert(schema.petrosAiUsageEvents)
        .values({ ...values, sessionId: row.sessionId, budgetReservationId: id }).returning();
      await tx.update(reservations).set({
        state: disposition, settledMicros: cost, settledAt: new Date(),
      }).where(eq(reservations.id, id));
      return usage!;
    });
  }

  /** Only call before invoking a provider; a cancelled local attempt has no possible charge. */
  async releaseDocumentAttempt(id: string) {
    const reservations = schema.petrosAiAttemptReservations;
    const [row] = await this.db.update(reservations).set({
      state: 'released', settledMicros: 0, settledAt: new Date(),
    }).where(and(
      eq(reservations.id, id),
      eq(reservations.state, 'reserved'),
      sql`${reservations.providerDispatchedAt} is null`,
    )).returning();
    if (!row) throw new PetrosBudgetError('PETROS_BUDGET_RELEASE_CONFLICT');
  }

  /** Trusted adapter preflight proved that transport was never attempted. */
  async releaseKnownUndispatchedDocumentAttempt(id: string) {
    const reservations = schema.petrosAiAttemptReservations;
    const [row] = await this.db.update(reservations).set({
      state: 'released', settledMicros: 0, settledAt: new Date(),
    }).where(and(eq(reservations.id, id), eq(reservations.state, 'reserved'))).returning();
    if (!row) throw new PetrosBudgetError('PETROS_BUDGET_RELEASE_CONFLICT');
  }

  async usageSummary(query: PetrosUsageQuery) {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
    const to = query.to ? new Date(query.to) : new Date();
    const t = schema.petrosAiUsageEvents;
    const clauses = [gte(t.createdAt, from), lte(t.createdAt, to)];
    if (query.institutionId) clauses.push(eq(t.institutionId, query.institutionId));
    if (query.studentId) clauses.push(eq(t.studentId, query.studentId));
    if (query.functionId) clauses.push(eq(t.functionId, query.functionId));
    if (query.providerId) clauses.push(eq(t.providerId, query.providerId));
    if (query.modelId) clauses.push(eq(t.modelId, query.modelId));
    if (query.door) clauses.push(sql`${t.metadata}->>'door' = ${query.door}`);
    if (query.sessionType)
      clauses.push(sql`${t.metadata}->>'sessionType' = ${query.sessionType}`);
    const where = and(...clauses);
    const [totals] = await this.db.select({
      requests: sql<number>`count(distinct ${t.requestId})::int`,
      attempts: sql<number>`count(*)::int`,
      successful: sql<number>`count(*) filter (where ${t.status} in ('success','cached'))::int`,
      failures: sql<number>`count(*) filter (where ${t.status} = 'failure')::int`,
      fallbacks: sql<number>`count(*) filter (where ${t.fallbackTier} > 0)::int`,
      inputTokens: sql<number>`coalesce(sum(${t.inputTokens}), 0)::bigint`,
      outputTokens: sql<number>`coalesce(sum(${t.outputTokens}), 0)::bigint`,
      cachedTokens: sql<number>`coalesce(sum(${t.cachedTokens}), 0)::bigint`,
      costMicros: sql<number>`coalesce(sum(coalesce(${t.actualCostMicros}, ${t.estimatedCostMicros})), 0)::bigint`,
      averageResponseMs: sql<number>`coalesce(round(avg(${t.responseTimeMs})), 0)::int`,
    }).from(t).where(where);

    const groupExpression = query.groupBy === 'day'
      ? sql<string>`to_char(date_trunc('day', ${t.createdAt}), 'YYYY-MM-DD')`
      : query.groupBy === 'function' ? schema.petrosAiFunctions.displayName
      : query.groupBy === 'provider' ? schema.petrosAiProviders.displayName
      : query.groupBy === 'model' ? schema.petrosAiModels.displayName
      : query.groupBy === 'institution' ? sql<string>`coalesce(${t.institutionId}::text, 'independent')`
      : sql<string>`coalesce(${t.studentId}::text, ${t.independentUserId}::text, 'unknown')`;

    const breakdown = await this.db.select({
      label: groupExpression,
      requests: sql<number>`count(distinct ${t.requestId})::int`,
      attempts: sql<number>`count(*)::int`,
      successes: sql<number>`count(*) filter (where ${t.status} in ('success','cached'))::int`,
      costMicros: sql<number>`coalesce(sum(coalesce(${t.actualCostMicros}, ${t.estimatedCostMicros})), 0)::bigint`,
      averageResponseMs: sql<number>`coalesce(round(avg(${t.responseTimeMs})), 0)::int`,
    }).from(t)
      .leftJoin(schema.petrosAiFunctions, eq(t.functionId, schema.petrosAiFunctions.id))
      .leftJoin(schema.petrosAiProviders, eq(t.providerId, schema.petrosAiProviders.id))
      .leftJoin(schema.petrosAiModels, eq(t.modelId, schema.petrosAiModels.id))
      .where(where)
      .groupBy(groupExpression)
      .orderBy(desc(sql`coalesce(sum(coalesce(${t.actualCostMicros}, ${t.estimatedCostMicros})), 0)`))
      .limit(50);
    return { from: from.toISOString(), to: to.toISOString(), totals: totals!, breakdown };
  }

  async providerSpend(providerIds: string[]) {
    if (!providerIds.length) return [];
    const t = schema.petrosAiUsageEvents;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    return this.db.select({
      providerId: t.providerId,
      dailyMicros: sql<number>`coalesce(sum(coalesce(${t.actualCostMicros}, ${t.estimatedCostMicros})) filter (where ${t.createdAt} >= ${dayStart.toISOString()}), 0)::bigint`,
      monthlyMicros: sql<number>`coalesce(sum(coalesce(${t.actualCostMicros}, ${t.estimatedCostMicros})) filter (where ${t.createdAt} >= ${monthStart.toISOString()}), 0)::bigint`,
    }).from(t).where(inArray(t.providerId, providerIds)).groupBy(t.providerId);
  }

  async functionQuotaSnapshot(functionId: string, studentId?: string, institutionId?: string) {
    const t = schema.petrosAiUsageEvents;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const [counts] = await this.db.select({
      dailyRequests: sql<number>`count(distinct ${t.requestId}) filter (where ${t.createdAt} >= ${dayStart.toISOString()})::int`,
      monthlyRequests: sql<number>`count(distinct ${t.requestId}) filter (where ${t.createdAt} >= ${monthStart.toISOString()})::int`,
    }).from(t).where(eq(t.functionId, functionId));
    let studentCostMicros = 0;
    if (studentId) {
      const [row] = await this.db.select({
        cost: sql<number>`coalesce(sum(coalesce(${t.actualCostMicros}, ${t.estimatedCostMicros})), 0)::bigint`,
      }).from(t).where(and(eq(t.studentId, studentId), gte(t.createdAt, monthStart)));
      studentCostMicros = Number(row?.cost ?? 0);
    }
    let institutionRequests = 0;
    if (institutionId) {
      const [row] = await this.db.select({
        requests: sql<number>`count(distinct ${t.requestId})::int`,
      }).from(t).where(and(eq(t.institutionId, institutionId), gte(t.createdAt, monthStart)));
      institutionRequests = Number(row?.requests ?? 0);
    }
    return {
      dailyRequests: Number(counts?.dailyRequests ?? 0),
      monthlyRequests: Number(counts?.monthlyRequests ?? 0),
      studentCostMicros,
      institutionRequests,
    };
  }

  getGlobalBudget() {
    return this.db.select().from(schema.petrosAiBudgetPolicies)
      .where(and(eq(schema.petrosAiBudgetPolicies.scope, 'global'), sql`${schema.petrosAiBudgetPolicies.scopeId} is null`))
      .limit(1).then((rows) => rows[0]);
  }

  updateGlobalBudget(expectedVersion: number, patch: Partial<typeof schema.petrosAiBudgetPolicies.$inferInsert>) {
    return this.db.update(schema.petrosAiBudgetPolicies)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(
        eq(schema.petrosAiBudgetPolicies.scope, 'global'),
        sql`${schema.petrosAiBudgetPolicies.scopeId} is null`,
        eq(schema.petrosAiBudgetPolicies.version, expectedVersion),
      )).returning().then((rows) => rows[0]);
  }
}
