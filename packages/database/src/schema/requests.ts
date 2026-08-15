import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { campuses } from './campuses';
import { documentRenders } from './doc-gen';
import { institutions } from './institutions';
import { students } from './people';
import { institutionUsers } from './users';

export type StudentRequestAttachment = {
  storage_object_id: string;
  filename: string;
  mime: string;
  bytes: number;
};

/**
 * Student-initiated institutional requests. These are operational records owned by an
 * institution-bound student, not dual-owner personal learning artifacts.
 */
export const studentRequests = pgTable(
  'student_requests',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => campuses.id, { onDelete: 'restrict' }),
    /** Nullable only for anonymous sensitive reports (0155); enforced by student_requests_student_id_ck. */
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    payloadSchemaVersion: integer('payload_schema_version').notNull(),
    status: text('status').notNull(),
    humanCode: text('human_code').notNull(),
    assignedRole: text('assigned_role').notNull(),
    assignedUserId: uuid('assigned_user_id').references(() => institutionUsers.id, {
      onDelete: 'set null',
    }),
    decisionNote: text('decision_note'),
    attachments: jsonb('attachments')
      .$type<StudentRequestAttachment[]>()
      .notNull()
      .default([]),
    needsInfoQuestion: text('needs_info_question'),
    slaDueAt: timestamp('sla_due_at', { withTimezone: true }),
    /** Reserved for the Fees feature; its future payable-line target does not exist yet. */
    paymentRequestId: uuid('payment_request_id'),
    fulfilmentDocumentId: uuid('fulfilment_document_id').references(
      (): AnyPgColumn => studentDocumentVault.id,
      { onDelete: 'set null' },
    ),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    statusCheck: check(
      'student_requests_status_check',
      sql`${t.status} IN ('draft', 'submitted', 'in_review', 'needs_info', 'approved', 'rejected', 'fulfilled', 'cancelled', 'expired')`,
    ),
    humanCodeCheck: check(
      'student_requests_human_code_check',
      sql`${t.humanCode} ~ '^[A-Z]{2}-[A-HJ-NP-Z2-9]{4,5}$'`,
    ),
    attachmentsArrayCheck: check(
      'student_requests_attachments_array_check',
      sql`jsonb_typeof(${t.attachments}) = 'array'`,
    ),
    humanCodeUniq: uniqueIndex('student_requests_human_code_uniq').on(
      t.institutionId,
      t.humanCode,
    ),
    studentTimelineIdx: index('student_requests_student_timeline_idx').on(
      t.institutionId,
      t.studentId,
      t.createdAt.desc(),
    ),
    inboxIdx: index('student_requests_inbox_idx')
      .on(t.institutionId, t.assignedRole, t.status)
      .where(
        sql`${t.status} IN ('draft', 'submitted', 'in_review', 'needs_info', 'approved')`,
      ),
    slaIdx: index('student_requests_sla_idx')
      .on(t.institutionId, t.slaDueAt)
      .where(sql`${t.status} IN ('submitted', 'in_review', 'needs_info')`),
  }),
);

/** Immutable per-request event stream. DB grants and a trigger reject UPDATE/DELETE. */
export const studentRequestEvents = pgTable(
  'student_request_events',
  {
    id: primaryId(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => studentRequests.id, { onDelete: 'restrict' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'restrict' }),
    seq: integer('seq').notNull(),
    eventType: text('event_type').notNull(),
    actorKind: text('actor_kind').notNull(),
    /** Historical actor identifier; intentionally not FK-mutated on account deletion. */
    actorUserId: uuid('actor_user_id'),
    actorRole: text('actor_role'),
    note: text('note'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    eventTypeCheck: check(
      'student_request_events_event_type_check',
      sql`${t.eventType} IN ('created', 'submitted', 'claimed', 'unclaimed', 'reassigned', 'info_requested', 'info_provided', 'approved', 'rejected', 'fulfilled', 'cancelled', 'expired', 'note_added')`,
    ),
    actorKindCheck: check(
      'student_request_events_actor_kind_check',
      sql`${t.actorKind} IN ('student', 'staff', 'system')`,
    ),
    seqCheck: check('student_request_events_seq_check', sql`${t.seq} > 0`),
    requestSeqUniq: uniqueIndex('student_request_events_request_seq_uniq').on(
      t.requestId,
      t.seq,
    ),
    requestTimelineIdx: index('student_request_events_request_timeline_idx').on(
      t.requestId,
      t.createdAt,
    ),
    institutionIdx: index('student_request_events_institution_idx').on(t.institutionId),
  }),
);

/** Institution-wide overrides for the code-defined request type registry. */
export const institutionRequestTypeConfig = pgTable(
  'institution_request_type_config',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    typeKey: text('type_key').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    routingRoleOverride: text('routing_role_override'),
    slaDaysOverride: integer('sla_days_override'),
    labelOverride: text('label_override'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    typeUniq: uniqueIndex('institution_request_type_config_type_uniq').on(
      t.institutionId,
      t.typeKey,
    ),
    institutionIdx: index('institution_request_type_config_institution_idx').on(t.institutionId),
    slaDaysCheck: check(
      'institution_request_type_config_sla_days_check',
      sql`${t.slaDaysOverride} IS NULL OR ${t.slaDaysOverride} >= 0`,
    ),
  }),
);

/**
 * Dual-owner issued-document vault (evolved in place — not vault_documents).
 * Institutional: institution_id + student_id. Independent: independent_user_id only.
 * Abandoned send-backs keep an audit tombstone (abandoned_at) and are hidden from projections.
 */
export const studentDocumentVault = pgTable(
  'student_document_vault',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'cascade' }),
    independentUserId: uuid('independent_user_id'),
    requestId: uuid('request_id').references(() => studentRequests.id, { onDelete: 'set null' }),
    documentRenderId: uuid('document_render_id').references(() => documentRenders.id, {
      onDelete: 'restrict',
    }),
    storageKey: text('storage_key'),
    title: text('title').notNull(),
    docType: text('doc_type').notNull(),
    family: text('family'),
    source: text('source').notNull().default('request'),
    templateId: uuid('template_id'),
    templateFingerprint: text('template_fingerprint'),
    batchId: uuid('batch_id'),
    batchItemId: uuid('batch_item_id'),
    academicYear: text('academic_year'),
    verifyCode: text('verify_code').notNull(),
    verifyCodeVersion: integer('verify_code_version').notNull().default(0),
    issuedBy: uuid('issued_by').references(() => institutionUsers.id, { onDelete: 'restrict' }),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    deliveryMode: text('delivery_mode'),
    pickupReadyAt: timestamp('pickup_ready_at', { withTimezone: true }),
    pickupNote: text('pickup_note'),
    collectedAt: timestamp('collected_at', { withTimezone: true }),
    collectedBy: uuid('collected_by'),
    supersededBy: uuid('superseded_by'),
    supersedes: uuid('supersedes'),
    reissueReason: text('reissue_reason'),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    abandonedAt: timestamp('abandoned_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    verifyCodeCheck: check(
      'student_document_vault_verify_code_check',
      sql`char_length(${t.verifyCode}) = 12`,
    ),
    ownerCk: check(
      'student_document_vault_owner_ck',
      sql`(
        (${t.institutionId} IS NOT NULL AND ${t.studentId} IS NOT NULL AND ${t.independentUserId} IS NULL)
        OR (${t.institutionId} IS NULL AND ${t.studentId} IS NULL AND ${t.independentUserId} IS NOT NULL)
      )`,
    ),
    sourceCk: check(
      'student_document_vault_source_ck',
      sql`${t.source} IN ('request','batch','manual_upload','system')`,
    ),
    verifyCodeUniq: uniqueIndex('student_document_vault_verify_code_uniq').on(t.verifyCode),
    studentIdx: index('student_document_vault_student_idx').on(t.institutionId, t.studentId),
    requestIdx: index('student_document_vault_request_idx').on(t.requestId),
  }),
);

export type StudentRequest = typeof studentRequests.$inferSelect;
export type NewStudentRequest = typeof studentRequests.$inferInsert;
export type StudentRequestEvent = typeof studentRequestEvents.$inferSelect;
export type NewStudentRequestEvent = typeof studentRequestEvents.$inferInsert;
export type InstitutionRequestTypeConfig = typeof institutionRequestTypeConfig.$inferSelect;
export type NewInstitutionRequestTypeConfig = typeof institutionRequestTypeConfig.$inferInsert;
export type StudentDocumentVaultEntry = typeof studentDocumentVault.$inferSelect;
export type NewStudentDocumentVaultEntry = typeof studentDocumentVault.$inferInsert;
