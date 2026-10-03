import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';

/**
 * Provider-independent Petros AI control plane. Provider and model identifiers are data, never
 * feature code. Monetary values use micro-USD (1 USD = 1,000,000) to avoid floating point drift.
 */
export const petrosAiProviders = pgTable(
  'petros_ai_providers',
  {
    id: primaryId(),
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    adapterType: text('adapter_type').notNull(),
    baseUrl: text('base_url'),
    /** AES-256-GCM envelope. It is deliberately never selected into an admin API DTO. */
    credentialEnvelope: text('credential_envelope'),
    credentialHint: text('credential_hint'),
    enabled: boolean('enabled').notNull().default(true),
    paused: boolean('paused').notNull().default(false),
    priority: integer('priority').notNull().default(100),
    dailyBudgetMicros: bigint('daily_budget_micros', { mode: 'number' }),
    monthlyBudgetMicros: bigint('monthly_budget_micros', { mode: 'number' }),
    capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    healthStatus: text('health_status').notNull().default('unknown'),
    latencyMs: integer('latency_ms'),
    lastHealthCheckAt: timestamp('last_health_check_at', { withTimezone: true }),
    lastHealthError: text('last_health_error'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    keyUniq: uniqueIndex('petros_ai_providers_key_uniq').on(t.key),
    enabledPriorityIdx: index('petros_ai_providers_enabled_priority_idx').on(
      t.enabled,
      t.paused,
      t.priority,
    ),
  }),
);

export const petrosAiModels = pgTable(
  'petros_ai_models',
  {
    id: primaryId(),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => petrosAiProviders.id, { onDelete: 'cascade' }),
    modelKey: text('model_key').notNull(),
    displayName: text('display_name').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    custom: boolean('custom').notNull().default(false),
    capabilities: jsonb('capabilities').$type<string[]>().notNull().default([]),
    contextWindow: integer('context_window'),
    maxOutputTokens: integer('max_output_tokens'),
    /** { inputPerMillionMicros, outputPerMillionMicros, cachedInputPerMillionMicros }. */
    pricing: jsonb('pricing').$type<Record<string, number>>().notNull().default({}),
    providerOptions: jsonb('provider_options').$type<Record<string, unknown>>().notNull().default({}),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    providerModelUniq: uniqueIndex('petros_ai_models_provider_model_uniq').on(
      t.providerId,
      t.modelKey,
    ),
    providerIdx: index('petros_ai_models_provider_idx').on(t.providerId, t.enabled),
  }),
);

export interface PetrosAiFunctionSettings {
  maxInputTokens: number;
  maxOutputTokens: number;
  temperature: number;
  reasoningLevel?: string;
  timeoutMs: number;
  maxRetries: number;
  streaming: boolean;
  caching: boolean;
  dailyRequestLimit?: number;
  monthlyRequestLimit?: number;
  maxCostPerRequestMicros?: number;
  maxCostPerStudentMicros?: number;
  maxInstitutionUsage?: number;
}

export const petrosAiFunctions = pgTable(
  'petros_ai_functions',
  {
    id: primaryId(),
    key: text('key').notNull(),
    displayName: text('display_name').notNull(),
    description: text('description').notNull(),
    category: text('category').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    allowedInputTypes: jsonb('allowed_input_types').$type<string[]>().notNull().default(['text']),
    responseFormat: text('response_format').notNull().default('text'),
    requiredCapabilities: jsonb('required_capabilities').$type<string[]>().notNull().default(['text']),
    settings: jsonb('settings').$type<PetrosAiFunctionSettings>().notNull(),
    activePromptVersion: text('active_prompt_version').notNull().default('v1'),
    activeSchemaVersion: text('active_schema_version').notNull().default('v1'),
    source: text('source').notNull().default('builtin'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    keyUniq: uniqueIndex('petros_ai_functions_key_uniq').on(t.key),
    categoryIdx: index('petros_ai_functions_category_idx').on(t.category, t.enabled),
  }),
);

/** tier 0 is primary; tiers 1 and 2 are ordered fallbacks. Multiple routes at a tier enable A/B. */
export const petrosAiFunctionRoutes = pgTable(
  'petros_ai_function_routes',
  {
    id: primaryId(),
    functionId: uuid('function_id')
      .notNull()
      .references(() => petrosAiFunctions.id, { onDelete: 'cascade' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => petrosAiProviders.id, { onDelete: 'restrict' }),
    modelId: uuid('model_id')
      .notNull()
      .references(() => petrosAiModels.id, { onDelete: 'restrict' }),
    tier: integer('tier').notNull().default(0),
    trafficPercent: integer('traffic_percent').notNull().default(100),
    enabled: boolean('enabled').notNull().default(true),
    overrides: jsonb('overrides').$type<Record<string, unknown>>().notNull().default({}),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    routeUniq: uniqueIndex('petros_ai_function_routes_uniq').on(
      t.functionId,
      t.tier,
      t.providerId,
      t.modelId,
    ),
    functionTierIdx: index('petros_ai_function_routes_function_tier_idx').on(
      t.functionId,
      t.tier,
      t.enabled,
    ),
  }),
);

export const petrosAiRoutingRules = pgTable(
  'petros_ai_routing_rules',
  {
    id: primaryId(),
    name: text('name').notNull(),
    description: text('description'),
    functionId: uuid('function_id').references(() => petrosAiFunctions.id, { onDelete: 'cascade' }),
    priority: integer('priority').notNull().default(100),
    enabled: boolean('enabled').notNull().default(true),
    /** Validated condition tree: { all?: Condition[], any?: Condition[] }. */
    conditions: jsonb('conditions').$type<Record<string, unknown>>().notNull().default({}),
    /** Route target, quality/cost preference, cache, or deny action. */
    action: jsonb('action').$type<Record<string, unknown>>().notNull(),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    priorityIdx: index('petros_ai_routing_rules_priority_idx').on(t.enabled, t.priority),
    functionIdx: index('petros_ai_routing_rules_function_idx').on(t.functionId),
  }),
);

export const petrosAiFunctionVersions = pgTable(
  'petros_ai_function_versions',
  {
    id: primaryId(),
    functionId: uuid('function_id')
      .notNull()
      .references(() => petrosAiFunctions.id, { onDelete: 'cascade' }),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    promptTemplate: text('prompt_template').notNull(),
    responseSchema: jsonb('response_schema').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('draft'),
    notes: text('notes'),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    versionUniq: uniqueIndex('petros_ai_function_versions_uniq').on(
      t.functionId,
      t.promptVersion,
      t.schemaVersion,
    ),
    functionStatusIdx: index('petros_ai_function_versions_function_status_idx').on(
      t.functionId,
      t.status,
    ),
  }),
);

/** One row per provider attempt, including retries and fallbacks. Append-only application data. */
export const petrosAiUsageEvents = pgTable(
  'petros_ai_usage_events',
  {
    id: primaryId(),
    requestId: uuid('request_id').notNull(),
    sessionId: uuid('session_id'),
    studentId: uuid('student_id'),
    independentUserId: uuid('independent_user_id'),
    institutionId: uuid('institution_id'),
    functionId: uuid('function_id')
      .notNull()
      .references(() => petrosAiFunctions.id, { onDelete: 'restrict' }),
    providerId: uuid('provider_id')
      .notNull()
      .references(() => petrosAiProviders.id, { onDelete: 'restrict' }),
    modelId: uuid('model_id')
      .notNull()
      .references(() => petrosAiModels.id, { onDelete: 'restrict' }),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    cachedTokens: integer('cached_tokens').notNull().default(0),
    estimatedCostMicros: bigint('estimated_cost_micros', { mode: 'number' }).notNull().default(0),
    actualCostMicros: bigint('actual_cost_micros', { mode: 'number' }),
    responseTimeMs: integer('response_time_ms').notNull(),
    status: text('status').notNull(),
    errorCode: text('error_code'),
    retryCount: integer('retry_count').notNull().default(0),
    fallbackTier: integer('fallback_tier').notNull().default(0),
    cacheStatus: text('cache_status').notNull().default('miss'),
    experimentKey: text('experiment_key'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    budgetReservationId: uuid('budget_reservation_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    requestIdx: index('petros_ai_usage_events_request_idx').on(t.requestId),
    reservationUniq: uniqueIndex('petros_ai_usage_events_reservation_uniq').on(t.budgetReservationId),
    createdIdx: index('petros_ai_usage_events_created_idx').on(t.createdAt),
    functionCreatedIdx: index('petros_ai_usage_events_function_created_idx').on(
      t.functionId,
      t.createdAt,
    ),
    providerCreatedIdx: index('petros_ai_usage_events_provider_created_idx').on(
      t.providerId,
      t.createdAt,
    ),
    institutionCreatedIdx: index('petros_ai_usage_events_institution_created_idx').on(
      t.institutionId,
      t.createdAt,
    ),
    studentCreatedIdx: index('petros_ai_usage_events_student_created_idx').on(
      t.studentId,
      t.createdAt,
    ),
  }),
);

/** One durable document-question provider attempt. The usage event settles this hold atomically. */
export const petrosAiAttemptReservations = pgTable(
  'petros_ai_attempt_reservations',
  {
    id: primaryId(),
    commandId: uuid('command_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    executionFence: integer('execution_fence').notNull(),
    attemptKey: text('attempt_key').notNull(),
    requestId: uuid('request_id').notNull(),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    functionId: uuid('function_id').notNull().references(() => petrosAiFunctions.id, { onDelete: 'restrict' }),
    providerId: uuid('provider_id').notNull().references(() => petrosAiProviders.id, { onDelete: 'restrict' }),
    modelId: uuid('model_id').notNull().references(() => petrosAiModels.id, { onDelete: 'restrict' }),
    reservedMicros: bigint('reserved_micros', { mode: 'number' }).notNull(),
    state: text('state').notNull().default('reserved'),
    settledMicros: bigint('settled_micros', { mode: 'number' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    providerDispatchedAt: timestamp('provider_dispatched_at', { withTimezone: true }),
    settledAt: timestamp('settled_at', { withTimezone: true }),
  },
  (t) => ({
    attemptUniq: uniqueIndex('petros_ai_attempt_reservations_key_uniq').on(t.attemptKey),
    ownerIdx: index('petros_ai_attempt_reservations_owner_idx').on(t.institutionId, t.studentId, t.createdAt),
    providerIdx: index('petros_ai_attempt_reservations_provider_idx').on(t.providerId, t.createdAt),
    commandIdx: index('petros_ai_attempt_reservations_command_idx').on(t.commandId),
  }),
);

export interface PetrosBudgetThreshold {
  percent: number;
  action: 'warn' | 'restrict_expensive' | 'route_to_lower_cost' | 'stop_non_essential';
}

export const petrosAiBudgetPolicies = pgTable('petros_ai_budget_policies', {
  id: primaryId(),
  scope: text('scope').notNull().default('global'),
  scopeId: text('scope_id'),
  monthlyBudgetMicros: bigint('monthly_budget_micros', { mode: 'number' }),
  dailyBudgetMicros: bigint('daily_budget_micros', { mode: 'number' }),
  thresholds: jsonb('thresholds').$type<PetrosBudgetThreshold[]>().notNull().default([]),
  preserveEssentialFunctions: boolean('preserve_essential_functions').notNull().default(true),
  enabled: boolean('enabled').notNull().default(true),
  version: integer('version').notNull().default(0),
  ...actorColumns,
  ...timestamps,
});

export type PetrosAiProvider = typeof petrosAiProviders.$inferSelect;
export type NewPetrosAiProvider = typeof petrosAiProviders.$inferInsert;
export type PetrosAiModel = typeof petrosAiModels.$inferSelect;
export type NewPetrosAiModel = typeof petrosAiModels.$inferInsert;
export type PetrosAiFunction = typeof petrosAiFunctions.$inferSelect;
export type NewPetrosAiFunction = typeof petrosAiFunctions.$inferInsert;
export type PetrosAiFunctionRoute = typeof petrosAiFunctionRoutes.$inferSelect;
export type NewPetrosAiFunctionRoute = typeof petrosAiFunctionRoutes.$inferInsert;
export type PetrosAiRoutingRule = typeof petrosAiRoutingRules.$inferSelect;
export type NewPetrosAiRoutingRule = typeof petrosAiRoutingRules.$inferInsert;
export type PetrosAiFunctionVersion = typeof petrosAiFunctionVersions.$inferSelect;
export type PetrosAiUsageEvent = typeof petrosAiUsageEvents.$inferSelect;
export type NewPetrosAiUsageEvent = typeof petrosAiUsageEvents.$inferInsert;
export type PetrosAiAttemptReservation = typeof petrosAiAttemptReservations.$inferSelect;
export type PetrosAiBudgetPolicy = typeof petrosAiBudgetPolicies.$inferSelect;
