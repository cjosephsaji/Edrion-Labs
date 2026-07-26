import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { actorTypeEnum, auditResultEnum, primaryId, riskLevelEnum } from './_helpers';

/**
 * APPEND-ONLY records. The application DB role is granted INSERT/SELECT only on these tables
 * (see migrations/zzz_grants.sql). No UPDATE/DELETE through the app. All writes flow through
 * @edrion/audit.
 */

/** Compliance-grade immutable audit trail. */
export const auditEvents = pgTable(
  'audit_events',
  {
    id: primaryId(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),

    actorType: actorTypeEnum('actor_type').notNull(),
    actorId: uuid('actor_id'),
    actorName: text('actor_name'),
    actorRole: text('actor_role'),

    institutionId: uuid('institution_id'),
    institutionName: text('institution_name'),
    campusId: uuid('campus_id'),
    supportSessionId: uuid('support_session_id'),
    caseRef: text('case_ref'),

    action: text('action').notNull(),
    module: text('module').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),

    previousState: jsonb('previous_state').$type<Record<string, unknown>>(),
    newState: jsonb('new_state').$type<Record<string, unknown>>(),
    reason: text('reason'),

    result: auditResultEnum('result').notNull().default('success'),
    riskLevel: riskLevelEnum('risk_level').notNull().default('low'),
    errorDetail: text('error_detail'),

    ip: text('ip'),
    userAgent: text('user_agent'),
    requestId: text('request_id'),
    correlationId: text('correlation_id'),
    apiEndpoint: text('api_endpoint'),

    aiInvolved: boolean('ai_involved').notNull().default(false),
    aiRunId: uuid('ai_run_id'),
    confirmation: jsonb('confirmation').$type<Record<string, unknown>>(),
  },
  (t) => ({
    occurredIdx: index('audit_occurred_idx').on(t.occurredAt),
    actorIdx: index('audit_actor_idx').on(t.actorType, t.actorId),
    institutionIdx: index('audit_institution_idx').on(t.institutionId),
    // The institution-portal audit viewer + dashboard recent-activity both filter by institution_id
    // and order by occurred_at desc; a composite satisfies the filter + sort from one index instead
    // of an institution scan + sort over the append-only volume. (Phase 12 perf.)
    institutionOccurredIdx: index('audit_institution_occurred_idx').on(t.institutionId, t.occurredAt),
    moduleIdx: index('audit_module_idx').on(t.module),
    sessionIdx: index('audit_session_idx').on(t.supportSessionId),
    correlationIdx: index('audit_correlation_idx').on(t.correlationId),
    // Copilot run-detail loads every audit event for a run by ai_run_id on each view. Partial
    // (most events are not AI-involved) keeps the index small. Avoids a seq scan that grows with
    // the append-only audit volume. (EXPLAIN-verified — Phase 9a.)
    aiRunIdx: index('audit_ai_run_idx')
      .on(t.aiRunId)
      .where(sql`${t.aiRunId} IS NOT NULL`),
  }),
);

/** Security-relevant events (logins, lockouts, MFA, suspicious access). Append-only. */
export const securityEvents = pgTable(
  'security_events',
  {
    id: primaryId(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    eventType: text('event_type').notNull(),
    actorType: actorTypeEnum('actor_type').notNull(),
    actorId: uuid('actor_id'),
    institutionId: uuid('institution_id'),
    riskLevel: riskLevelEnum('risk_level').notNull().default('low'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    detail: jsonb('detail').$type<Record<string, unknown>>(),
    flagged: boolean('flagged').notNull().default(false),
  },
  (t) => ({
    occurredIdx: index('security_occurred_idx').on(t.occurredAt),
    typeIdx: index('security_type_idx').on(t.eventType),
    actorIdx: index('security_actor_idx').on(t.actorType, t.actorId),
  }),
);

/** Human-readable activity feed (denormalised, may be derived from audit). Append-only. */
export const activityEvents = pgTable(
  'activity_events',
  {
    id: primaryId(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    category: text('category').notNull(),
    actorName: text('actor_name'),
    summary: text('summary').notNull(),
    institutionId: uuid('institution_id'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    riskLevel: riskLevelEnum('risk_level').notNull().default('low'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  },
  (t) => ({
    occurredIdx: index('activity_occurred_idx').on(t.occurredAt),
    categoryIdx: index('activity_category_idx').on(t.category),
  }),
);

export type AuditEvent = typeof auditEvents.$inferSelect;
export type NewAuditEvent = typeof auditEvents.$inferInsert;
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type NewSecurityEvent = typeof securityEvents.$inferInsert;
