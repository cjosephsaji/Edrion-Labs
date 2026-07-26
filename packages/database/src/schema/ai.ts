import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { AiCapability } from '@edrion/shared-types';
import {
  actorColumns,
  aiActionRuleEffectEnum,
  aiActionStatusEnum,
  aiCapabilityEnum,
  aiGuardrailDecisionEnum,
  aiModeEnum,
  featureScopeEnum,
  primaryId,
  timestamps,
} from './_helpers';

/**
 * AI governance. Policies attach a Copilot operating mode + guardrails at a scope
 * (global/plan/institution/campus/user/role); action rules layer per-capability / per-action
 * overrides on top. Resolution is deterministic — see packages/copilot + docs/AI-GUARDRAILS.md.
 * The evaluator returns ALLOW / NEEDS_CONFIRMATION / NEEDS_SECOND_APPROVER / BLOCKED + a reason.
 */
export const aiPolicies = pgTable(
  'ai_policies',
  {
    id: primaryId(),
    scope: featureScopeEnum('scope').notNull(),
    /** Id the policy attaches to (plan/institution/campus/user id or role key). Null = global. */
    scopeId: text('scope_id'),
    /** Soft on/off for the policy row itself; a disabled row is ignored on resolution. */
    enabled: boolean('enabled').notNull().default(true),
    /** Operating mode: disabled | read_only | draft_only | full. */
    mode: aiModeEnum('mode').notNull().default('disabled'),
    /** Per-capability enable map. A capability absent from the map defaults to enabled. */
    capabilities: jsonb('capabilities').$type<Partial<Record<AiCapability, boolean>>>().default({}),
    /** Hard ceiling on financial impact (minor units). Over this → BLOCKED. Null = no cap. */
    maxFinancialImpactMinor: integer('max_financial_impact_minor'),
    /** Hard ceiling on affected users. Over this → BLOCKED. Null = no cap. */
    maxAffectedUsers: integer('max_affected_users'),
    /** Financial impact at/above this (minor units) escalates to a second approver. */
    twoPersonThresholdMinor: integer('two_person_threshold_minor'),
    /** Capabilities that always require a second approver when state-changing. */
    secondApproverCapabilities: jsonb('second_approver_capabilities').$type<AiCapability[]>().default([]),
    /** Daily AI-run ceiling for this scope (all employees). Null = use the env default. */
    maxRunsPerDay: integer('max_runs_per_day'),
    /** Daily AI-run ceiling per employee under this scope. Null = use the env default. */
    maxRunsPerEmployeePerDay: integer('max_runs_per_employee_per_day'),
    /** Topicality pre-screen mode: 'enforce' | 'off'. Null = default (enforce). */
    topicalityMode: text('topicality_mode'),
    /** Emergency kill switch — short-circuits every action under this scope to BLOCKED. */
    killSwitch: boolean('kill_switch').notNull().default(false),
    /** Policy family: copilot guardrails vs student_tutor Learn domain config. */
    policyDomain: text('policy_domain').notNull().default('copilot'),
    /** Typed domain payload (LearnPolicyV1 for student_tutor). */
    domainConfig: jsonb('domain_config').$type<Record<string, unknown>>().notNull().default({}),
    reason: text('reason'),
    setByName: text('set_by_name'),
    /** Optimistic-concurrency token for sensitive edits. */
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    scopeIdx: index('ai_policies_scope_idx').on(t.scope, t.scopeId),
    scopeDomainUq: uniqueIndex('ai_policies_scope_domain_uq').on(t.scope, t.scopeId, t.policyDomain),
  }),
);

/** A per-capability or per-action governance override layered on top of the resolved policy. */
export const aiActionRules = pgTable(
  'ai_action_rules',
  {
    id: primaryId(),
    capability: aiCapabilityEnum('capability').notNull(),
    /** Specific underlying action key this rule targets (e.g. `billing.refund`). Null = whole capability. */
    action: text('action'),
    enabled: boolean('enabled').notNull().default(true),
    /** allow | require_confirmation | require_second_approver | block. */
    effect: aiActionRuleEffectEnum('effect').notNull().default('require_confirmation'),
    /** Optional risk classification this rule pins for the matched action. */
    riskLevel: text('risk_level'),
    description: text('description'),
    reason: text('reason'),
    setByName: text('set_by_name'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    capabilityIdx: index('ai_action_rules_capability_idx').on(t.capability, t.action),
  }),
);

// --- Copilot run lifecycle (8b) -----------------------------------------------------------

/**
 * A single Copilot run: an employee prompt + context, the prepared action(s) and their lifecycle.
 * Status flows proposed → awaiting_confirmation → confirmed → executed (or rejected/expired/failed)
 * — see packages/copilot/transitions.ts. No mutation executes without a human confirmation row.
 */
export const aiRuns = pgTable(
  'ai_runs',
  {
    id: primaryId(),
    employeeId: uuid('employee_id').notNull(),
    employeeName: text('employee_name'),
    prompt: text('prompt').notNull(),
    /** Resolution context the run was planned + evaluated against (institution/campus/etc.). */
    context: jsonb('context').$type<Record<string, unknown>>().default({}),
    /** Context sources the assistant drew on (for the audit surface). */
    contextSources: jsonb('context_sources').$type<string[]>().default([]),
    status: aiActionStatusEnum('status').notNull().default('proposed'),
    /** Concise, user-facing summary. NEVER chain-of-thought. */
    summary: text('summary'),
    model: text('model').notNull().default('stub-planner'),
    promptVersion: text('prompt_version'),
    /** Highest risk across the prepared actions. */
    riskLevel: text('risk_level'),
    /** Token usage when a real model is wired; null for the stub. */
    inputTokens: integer('input_tokens'),
    outputTokens: integer('output_tokens'),
    durationMs: integer('duration_ms'),
    errorDetail: text('error_detail'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    employeeIdx: index('ai_runs_employee_idx').on(t.employeeId),
    statusIdx: index('ai_runs_status_idx').on(t.status),
    startedIdx: index('ai_runs_started_idx').on(t.startedAt),
  }),
);

/** A single prepared tool/action within a run: its guardrail decision, impact preview + result. */
export const aiToolCalls = pgTable(
  'ai_tool_calls',
  {
    id: primaryId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => aiRuns.id, { onDelete: 'cascade' }),
    /** Underlying audited-service action key (e.g. institutions.suspend). */
    toolKey: text('tool_key').notNull(),
    capability: aiCapabilityEnum('capability').notNull(),
    args: jsonb('args').$type<Record<string, unknown>>().default({}),
    explanation: text('explanation'),
    requiredPermission: text('required_permission'),
    /** Guardrail outcome at preparation time. Re-evaluated server-side before execution. */
    decision: aiGuardrailDecisionEnum('decision').notNull(),
    decisionLayer: text('decision_layer'),
    decisionReason: text('decision_reason'),
    riskLevel: text('risk_level'),
    reversible: boolean('reversible').notNull().default(true),
    financialImpactMinor: integer('financial_impact_minor'),
    affectedUsers: integer('affected_users'),
    /** The exact-impact preview shown on the confirmation screen (before/after, audit preview). */
    impactPreview: jsonb('impact_preview').$type<Record<string, unknown>>().default({}),
    status: aiActionStatusEnum('status').notNull().default('proposed'),
    /** Result returned by the audited service on execution. */
    result: jsonb('result').$type<Record<string, unknown>>(),
    /** The audit event id written by the executed service (links the run to the audit trail). */
    auditEventId: uuid('audit_event_id'),
    errorDetail: text('error_detail'),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    runIdx: index('ai_tool_calls_run_idx').on(t.runId),
  }),
);

/** The human confirmation that authorises a run's execution. No row → nothing executes. */
export const aiConfirmations = pgTable(
  'ai_confirmations',
  {
    id: primaryId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => aiRuns.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id').notNull(),
    employeeName: text('employee_name'),
    /** How the human confirmed: typed phrase / recent auth / mfa. */
    method: text('method').notNull().default('typed'),
    confirmationText: text('confirmation_text'),
    reason: text('reason'),
    ...timestamps,
  },
  (t) => ({
    runIdx: index('ai_confirmations_run_idx').on(t.runId),
  }),
);

/** A second-approver sign-off for high-risk runs (ai.approve_sensitive_action). */
export const aiApprovals = pgTable(
  'ai_approvals',
  {
    id: primaryId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => aiRuns.id, { onDelete: 'cascade' }),
    approverId: uuid('approver_id').notNull(),
    approverName: text('approver_name'),
    approved: boolean('approved').notNull().default(true),
    reason: text('reason'),
    ...timestamps,
  },
  (t) => ({
    runIdx: index('ai_approvals_run_idx').on(t.runId),
  }),
);

export type AiPolicy = typeof aiPolicies.$inferSelect;
export type NewAiPolicy = typeof aiPolicies.$inferInsert;
export type AiActionRule = typeof aiActionRules.$inferSelect;
export type NewAiActionRule = typeof aiActionRules.$inferInsert;
export type AiRun = typeof aiRuns.$inferSelect;
export type NewAiRun = typeof aiRuns.$inferInsert;
export type AiToolCall = typeof aiToolCalls.$inferSelect;
export type NewAiToolCall = typeof aiToolCalls.$inferInsert;
export type AiConfirmation = typeof aiConfirmations.$inferSelect;
export type NewAiConfirmation = typeof aiConfirmations.$inferInsert;
export type AiApproval = typeof aiApprovals.$inferSelect;
export type NewAiApproval = typeof aiApprovals.$inferInsert;
