import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  actorColumns,
  aiActionStatusEnum,
  aiCapabilityEnum,
  aiGuardrailDecisionEnum,
  primaryId,
  timestamps,
} from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL Copilot run lifecycle (Phase 10). The tenant-facing counterpart of the platform
 * `ai_runs`/`ai_tool_calls`/`ai_confirmations` (schema/ai.ts): the actor is an INSTITUTION user, the
 * run is tenant-scoped (institution_id + campus_id) and the guardrail engine + lifecycle are reused
 * from @edrion/copilot. No mutation executes without a human confirmation row.
 *
 *   - portal_ai_runs: one institution-user prompt + context, the prepared action(s) and their status.
 *     Status flows proposed → awaiting_confirmation → confirmed → executed (or rejected/expired/failed)
 *     — see packages/copilot/transitions.ts.
 *   - portal_ai_tool_calls: a single prepared tool within a run — its guardrail decision, impact
 *     preview and result. Child of a run (no campus_id; inherits the run's campus), reachable only
 *     through a run the caller can see.
 *   - portal_ai_confirmations: the human confirmation that authorises a run's execution.
 */
export const portalAiRuns = pgTable(
  'portal_ai_runs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    /** The institution user who started the run (the actor on every audit event). */
    institutionUserId: uuid('institution_user_id').notNull(),
    userName: text('user_name'),
    prompt: text('prompt').notNull(),
    /** Resolution context the run was planned + evaluated against. */
    context: jsonb('context').$type<Record<string, unknown>>().default({}),
    /** Context sources the assistant drew on (for the audit surface). */
    contextSources: jsonb('context_sources').$type<string[]>().default([]),
    status: aiActionStatusEnum('status').notNull().default('proposed'),
    /** Petros chat linkage: set when this run was raised from a conversation turn. */
    conversationId: uuid('conversation_id'),
    messageId: uuid('message_id'),
    /** Concise, user-facing summary. NEVER chain-of-thought. */
    summary: text('summary'),
    model: text('model').notNull().default('stub-planner'),
    promptVersion: text('prompt_version'),
    /** Highest risk across the prepared actions. */
    riskLevel: text('risk_level'),
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
    instIdx: index('portal_ai_runs_institution_idx').on(t.institutionId),
    scopeIdx: index('portal_ai_runs_institution_campus_idx').on(t.institutionId, t.campusId),
    userIdx: index('portal_ai_runs_user_idx').on(t.institutionUserId),
    statusIdx: index('portal_ai_runs_status_idx').on(t.status),
    startedIdx: index('portal_ai_runs_started_idx').on(t.startedAt),
  }),
);

/** A single prepared tool/action within a portal run: its guardrail decision, impact preview + result. */
export const portalAiToolCalls = pgTable(
  'portal_ai_tool_calls',
  {
    id: primaryId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => portalAiRuns.id, { onDelete: 'cascade' }),
    /** Tenant key (no campus_id — the tool inherits the run's campus). */
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** Underlying audited portal-service action key (e.g. announcements.draft). */
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
    runIdx: index('portal_ai_tool_calls_run_idx').on(t.runId),
    instIdx: index('portal_ai_tool_calls_institution_idx').on(t.institutionId),
  }),
);

/** The human confirmation that authorises a portal run's execution. No row → nothing executes. */
export const portalAiConfirmations = pgTable(
  'portal_ai_confirmations',
  {
    id: primaryId(),
    runId: uuid('run_id')
      .notNull()
      .references(() => portalAiRuns.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    institutionUserId: uuid('institution_user_id').notNull(),
    userName: text('user_name'),
    /** How the human confirmed: typed phrase / recent auth. */
    method: text('method').notNull().default('typed'),
    confirmationText: text('confirmation_text'),
    reason: text('reason'),
    ...timestamps,
  },
  (t) => ({
    runIdx: index('portal_ai_confirmations_run_idx').on(t.runId),
    instIdx: index('portal_ai_confirmations_institution_idx').on(t.institutionId),
  }),
);

export type PortalAiRun = typeof portalAiRuns.$inferSelect;
export type NewPortalAiRun = typeof portalAiRuns.$inferInsert;
export type PortalAiToolCall = typeof portalAiToolCalls.$inferSelect;
export type NewPortalAiToolCall = typeof portalAiToolCalls.$inferInsert;
export type PortalAiConfirmation = typeof portalAiConfirmations.$inferSelect;
export type NewPortalAiConfirmation = typeof portalAiConfirmations.$inferInsert;
