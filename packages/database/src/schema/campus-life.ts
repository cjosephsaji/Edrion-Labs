import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, customType } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';
import { institutionUsers } from './users';
import { studentRequests } from './requests';
import { libraryLoans } from './library';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const sensitiveReportSeals = pgTable('sensitive_report_seals', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  requestId: uuid('request_id')
    .notNull()
    .unique()
    .references(() => studentRequests.id, { onDelete: 'cascade' }),
  sealedPayload: bytea('sealed_payload').notNull(),
  keyVersion: integer('key_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const studentSensitiveReportOwnership = pgTable(
  'student_sensitive_report_ownership',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    requestId: uuid('request_id')
      .notNull()
      .unique()
      .references(() => studentRequests.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentIdx: index('student_sensitive_report_ownership_student_idx').on(t.studentId),
  }),
);

export const sensitiveReportUnsealApprovals = pgTable('sensitive_report_unseal_approvals', {
  id: primaryId(),
  sealId: uuid('seal_id')
    .notNull()
    .references(() => sensitiveReportSeals.id, { onDelete: 'cascade' }),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  approverUserId: uuid('approver_user_id')
    .notNull()
    .references(() => institutionUsers.id, { onDelete: 'cascade' }),
  purpose: text('purpose').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sensitiveReportAuditLog = pgTable(
  'sensitive_report_audit_log',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    sealId: uuid('seal_id').references(() => sensitiveReportSeals.id, { onDelete: 'set null' }),
    requestId: uuid('request_id').references(() => studentRequests.id, { onDelete: 'set null' }),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    action: text('action').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    instIdx: index('sensitive_report_audit_log_institution_idx').on(t.institutionId, t.createdAt),
  }),
);

export const clubs = pgTable('clubs', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const clubMemberships = pgTable(
  'club_memberships',
  {
    id: primaryId(),
    clubId: uuid('club_id')
      .notNull()
      .references(() => clubs.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    joinedAt: timestamp('joined_at', { withTimezone: true }),
  },
  (t) => ({
    clubStudentUq: uniqueIndex('club_memberships_club_student_uq').on(t.clubId, t.studentId),
  }),
);

export const studentDiaryPages = pgTable(
  'student_diary_pages',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    pageDate: date('page_date').notNull(),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    studentDateUq: uniqueIndex('student_diary_pages_student_date_uq').on(t.studentId, t.pageDate),
  }),
);

export const studentDiaryEntries = pgTable('student_diary_entries', {
  id: primaryId(),
  pageId: uuid('page_id')
    .notNull()
    .references(() => studentDiaryPages.id, { onDelete: 'cascade' }),
  assignmentId: uuid('assignment_id'),
  kind: text('kind').notNull().default('note'),
  body: text('body').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const libraryFineInvoiceLinks = pgTable(
  'library_fine_invoice_links',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    loanId: uuid('loan_id')
      .notNull()
      .references(() => libraryLoans.id, { onDelete: 'cascade' }),
    feeInvoiceItemId: uuid('fee_invoice_item_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idempotencyUq: uniqueIndex('library_fine_invoice_links_idempotency_uq').on(
      t.institutionId,
      t.idempotencyKey,
    ),
  }),
);

export const principalMetricRollups = pgTable(
  'principal_metric_rollups',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    metricKey: text('metric_key').notNull(),
    asOf: date('as_of').notNull(),
    value: jsonb('value').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    rollupUq: uniqueIndex('principal_metric_rollups_uq').on(t.institutionId, t.metricKey, t.asOf),
  }),
);
export const mfaFactors = pgTable('mfa_factors', {
  id: primaryId(),
  institutionUserId: uuid('institution_user_id').references(() => institutionUsers.id, {
    onDelete: 'cascade',
  }),
  independentUserId: uuid('independent_user_id'),
  kind: text('kind').notNull().default('totp'),
  secretEncrypted: text('secret_encrypted').notNull(),
  label: text('label'),
  verifiedAt: timestamp('verified_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const mfaRecoveryCodes = pgTable(
  'mfa_recovery_codes',
  {
    id: primaryId(),
    institutionUserId: uuid('institution_user_id').references(() => institutionUsers.id, {
      onDelete: 'cascade',
    }),
    independentUserId: uuid('independent_user_id'),
    codeHash: text('code_hash').notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    instUserIdx: index('mfa_recovery_codes_institution_user_idx').on(t.institutionUserId),
  }),
);
