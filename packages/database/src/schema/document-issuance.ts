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
} from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { campuses } from './campuses';
import { documentRenders, documentTemplates } from './doc-gen';
import { institutions } from './institutions';
import { students } from './people';

/**
 * Institution document request catalog (subtypes for the single document_request type).
 */
export const documentCatalog = pgTable(
  'document_catalog',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    subtypeKey: text('subtype_key').notNull(),
    family: text('family').notNull(),
    docType: text('doc_type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    active: boolean('active').notNull().default(true),
    eligibilityConfig: jsonb('eligibility_config').$type<Record<string, unknown>>().notNull().default({}),
    deliveryModes: jsonb('delivery_modes').$type<string[]>().notNull().default(['digital']),
    templateId: uuid('template_id').references(() => documentTemplates.id, { onDelete: 'set null' }),
    feeHeadId: uuid('fee_head_id'),
    feeAmountMinor: integer('fee_amount_minor').notNull().default(0),
    requiresPayment: boolean('requires_payment').notNull().default(false),
    slaRoutingConfig: jsonb('sla_routing_config').$type<Record<string, unknown>>().notNull().default({}),
    requiredFields: jsonb('required_fields').$type<unknown[]>().notNull().default([]),
    payloadSchemaVersion: integer('payload_schema_version').notNull().default(1),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    subtypeUniq: uniqueIndex('document_catalog_subtype_uniq').on(t.institutionId, t.subtypeKey),
    institutionIdx: index('document_catalog_institution_idx').on(t.institutionId),
    activeIdx: index('document_catalog_active_idx').on(t.institutionId, t.active),
    familyCk: check(
      'document_catalog_family_ck',
      sql`${t.family} IN ('certificate','receipt','hall_ticket','id_card','report_card','individual_report')`,
    ),
    feeCk: check('document_catalog_fee_amount_ck', sql`${t.feeAmountMinor} >= 0`),
  }),
);

export const documentBatches = pgTable(
  'document_batches',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(),
    templateId: uuid('template_id').references(() => documentTemplates.id, { onDelete: 'set null' }),
    templateFingerprint: text('template_fingerprint'),
    scope: jsonb('scope').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('draft'),
    counts: jsonb('counts')
      .$type<{ total: number; rendered: number; failed: number; signed: number; delivered: number }>()
      .notNull()
      .default({ total: 0, rendered: 0, failed: 0, signed: 0, delivered: 0 }),
    populationSnapshot: jsonb('population_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    institutionIdx: index('document_batches_institution_idx').on(t.institutionId),
    statusIdx: index('document_batches_status_idx').on(t.institutionId, t.status),
    kindCk: check(
      'document_batches_kind_ck',
      sql`${t.kind} IN ('hall_ticket','id_card','report_card','manual_upload')`,
    ),
    statusCk: check(
      'document_batches_status_ck',
      sql`${t.status} IN ('draft','generating','review','signing','delivering','completed','completed_with_errors','cancelled')`,
    ),
  }),
);

export const documentBatchItems = pgTable(
  'document_batch_items',
  {
    id: primaryId(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => documentBatches.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('pending'),
    renderId: uuid('render_id').references(() => documentRenders.id, { onDelete: 'set null' }),
    vaultDocumentId: uuid('vault_document_id'),
    error: jsonb('error').$type<{ code: string; field?: string; message?: string } | null>(),
    mergeSnapshot: jsonb('merge_snapshot').$type<Record<string, unknown> | null>(),
    sourceSnapshot: jsonb('source_snapshot').$type<Record<string, unknown> | null>(),
    signState: jsonb('sign_state').$type<unknown[]>().notNull().default([]),
    reviewFlag: jsonb('review_flag').$type<{
      note: string;
      flaggedBy: string;
      flaggedAt: string;
    } | null>(),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    batchStudentUniq: uniqueIndex('document_batch_items_batch_student_uniq').on(t.batchId, t.studentId),
    batchIdx: index('document_batch_items_batch_idx').on(t.batchId, t.status),
    studentIdx: index('document_batch_items_student_idx').on(t.studentId),
    statusCk: check(
      'document_batch_items_status_ck',
      sql`${t.status} IN ('pending','rendering','rendered','failed','excluded','delivered')`,
    ),
  }),
);

export const reportCardReviews = pgTable(
  'report_card_reviews',
  {
    id: primaryId(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => documentBatches.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id').notNull(),
    status: text('status').notNull().default('pending'),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    batchSectionUniq: uniqueIndex('report_card_reviews_batch_section_uniq').on(t.batchId, t.sectionId),
    batchIdx: index('report_card_reviews_batch_idx').on(t.batchId),
    statusCk: check(
      'report_card_reviews_status_ck',
      sql`${t.status} IN ('pending','reviewed','flagged')`,
    ),
  }),
);

export const reportCardRemarks = pgTable(
  'report_card_remarks',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    termId: uuid('term_id').notNull(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    remark: text('remark').notNull(),
    authorId: uuid('author_id'),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    uniq: uniqueIndex('report_card_remarks_uniq').on(t.institutionId, t.termId, t.studentId),
    lenCk: check(
      'report_card_remarks_len_ck',
      sql`char_length(${t.remark}) BETWEEN 1 AND 400`,
    ),
  }),
);

export type DocumentCatalogEntry = typeof documentCatalog.$inferSelect;
export type DocumentBatch = typeof documentBatches.$inferSelect;
export type DocumentBatchItem = typeof documentBatchItems.$inferSelect;
export type ReportCardReview = typeof reportCardReviews.$inferSelect;
export type ReportCardRemark = typeof reportCardRemarks.$inferSelect;
