import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import {
  actorColumns,
  primaryId,
  riskLevelEnum,
  supportAccessSessionStatusEnum,
  supportCaseStatusEnum,
  timestamps,
} from './_helpers';
import { institutions } from './institutions';
import { platformEmployees } from './identity';

export const supportCases = pgTable(
  'support_cases',
  {
    id: primaryId(),
    publicId: text('public_id').notNull().unique(),
    institutionId: uuid('institution_id').references(() => institutions.id, {
      onDelete: 'set null',
    }),
    independentUserId: uuid('independent_user_id'),
    subject: text('subject').notNull(),
    category: text('category').notNull().default('general'),
    priority: text('priority').notNull().default('normal'),
    status: supportCaseStatusEnum('status').notNull().default('open'),
    assignedEmployeeId: uuid('assigned_employee_id').references(() => platformEmployees.id, {
      onDelete: 'set null',
    }),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
    resolution: text('resolution'),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    statusIdx: index('support_cases_status_idx').on(t.status),
    instIdx: index('support_cases_institution_idx').on(t.institutionId),
    assigneeIdx: index('support_cases_assignee_idx').on(t.assignedEmployeeId),
  }),
);

export const supportMessages = pgTable(
  'support_messages',
  {
    id: primaryId(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => supportCases.id, { onDelete: 'cascade' }),
    authorType: text('author_type').notNull(),
    authorId: uuid('author_id'),
    body: text('body').notNull(),
    internal: jsonb('internal').$type<{ note: boolean }>().default({ note: false }),
    ...timestamps,
  },
  (t) => ({ caseIdx: index('support_messages_case_idx').on(t.caseId) }),
);

/**
 * Edrion Support Access Session — controlled, time-boxed, audited entry into an institution
 * portal. The employee acts as themselves. Lifecycle is tracked via status + audit events.
 */
export const supportAccessSessions = pgTable(
  'support_access_sessions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => platformEmployees.id, { onDelete: 'restrict' }),
    employeeName: text('employee_name').notNull(),
    employeeRole: text('employee_role'),

    /** Scope of access granted for this session (subset of the employee's permissions). */
    accessLevel: text('access_level').notNull().default('support'),
    reason: text('reason').notNull(),
    caseRef: text('case_ref'),
    campusId: uuid('campus_id'),

    status: supportAccessSessionStatusEnum('status').notNull().default('requested'),
    riskLevel: riskLevelEnum('risk_level').notNull().default('medium'),

    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    /** Hard expiry; the banner counts down to this. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    durationMinutes: integer('duration_minutes').notNull().default(60),

    ip: text('ip'),
    userAgent: text('user_agent'),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('support_sessions_institution_idx').on(t.institutionId),
    employeeIdx: index('support_sessions_employee_idx').on(t.employeeId),
    statusIdx: index('support_sessions_status_idx').on(t.status),
    expiresIdx: index('support_sessions_expires_idx').on(t.expiresAt),
  }),
);

export type SupportAccessSession = typeof supportAccessSessions.$inferSelect;
export type NewSupportAccessSession = typeof supportAccessSessions.$inferInsert;
export type SupportCase = typeof supportCases.$inferSelect;
export type NewSupportCase = typeof supportCases.$inferInsert;
export type SupportMessage = typeof supportMessages.$inferSelect;
export type NewSupportMessage = typeof supportMessages.$inferInsert;
