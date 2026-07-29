import { boolean, index, integer, jsonb, pgTable, text, uuid, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { independentUsers } from './users';
import { students } from './people';

/**
 * Document generation engine (Petros Phase 4 + Documents Issuance).
 * Templates: institution_id NULL = platform default. Renders queue through documents.render.
 */
export const documentTemplates = pgTable(
  'document_templates',
  {
    id: primaryId(),
    /** NULL = platform default template. */
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    docType: text('doc_type').notNull(),
    /** Catalog family mapped from doc_type; keep doc_type for compatibility. */
    family: text('family'),
    name: text('name').notNull(),
    engine: text('engine').notNull().default('handlebars'),
    html: text('html').notNull(),
    css: text('css').notNull().default(''),
    fieldsSchema: jsonb('fields_schema').$type<Record<string, unknown>>().default({}),
    headerConfig: jsonb('header_config').$type<Record<string, unknown>>().default({}),
    appliesToTypes: jsonb('applies_to_types').$type<string[]>().default([]),
    isDefault: boolean('is_default').notNull().default(false),
    active: boolean('active').notNull().default(true),
    platformTemplateKey: text('platform_template_key'),
    requiresSignOff: boolean('requires_sign_off').notNull().default(false),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('document_templates_institution_idx').on(t.institutionId),
    typeIdx: index('document_templates_doc_type_idx').on(t.docType),
  }),
);

export const documentRenders = pgTable(
  'document_renders',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'set null',
    }),
    templateId: uuid('template_id').references(() => documentTemplates.id, { onDelete: 'set null' }),
    docType: text('doc_type').notNull(),
    family: text('family'),
    purpose: text('purpose').notNull().default('issuance'),
    refType: text('ref_type'),
    refId: uuid('ref_id'),
    batchItemId: uuid('batch_item_id'),
    templateFingerprint: text('template_fingerprint'),
    attemptNo: integer('attempt_no').notNull().default(1),
    idempotencyKey: text('idempotency_key'),
    generationKey: text('generation_key'),
    requestedBy: uuid('requested_by').notNull(),
    conversationId: uuid('conversation_id'),
    runId: uuid('run_id'),
    title: text('title').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('queued'),
    artifactId: uuid('artifact_id'),
    storagePath: text('storage_path'),
    errorDetail: text('error_detail'),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('document_renders_institution_idx').on(t.institutionId),
    statusIdx: index('document_renders_status_idx').on(t.status),
    convIdx: index('document_renders_conversation_idx').on(t.conversationId),
    purposeIdx: index('document_renders_purpose_idx').on(t.purpose, t.status),
    refIdx: index('document_renders_ref_idx').on(t.refType, t.refId),
    ownerCk: check(
      'document_renders_owner_ck',
      sql`(
        (${t.institutionId} IS NOT NULL AND ${t.studentId} IS NOT NULL AND ${t.independentUserId} IS NULL)
        OR (${t.institutionId} IS NULL AND ${t.studentId} IS NULL AND ${t.independentUserId} IS NOT NULL)
        OR (${t.institutionId} IS NOT NULL AND ${t.studentId} IS NULL AND ${t.independentUserId} IS NULL)
      )`,
    ),
    purposeCk: check(
      'document_renders_purpose_ck',
      sql`${t.purpose} IN ('issuance','preview','batch','reissue','signature')`,
    ),
  }),
);

export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type NewDocumentTemplate = typeof documentTemplates.$inferInsert;
export type DocumentRender = typeof documentRenders.$inferSelect;
export type NewDocumentRender = typeof documentRenders.$inferInsert;

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
    deliveryModes: jsonb('delivery_modes').$type<unknown[]>().notNull().default([]),
    templateId: uuid('template_id').references(() => documentTemplates.id, { onDelete: 'set null' }),
    feeHeadId: uuid('fee_head_id'),
    feeAmountMinor: integer('fee_amount_minor').notNull().default(0),
    requiresPayment: boolean('requires_payment').notNull().default(false),
    slaConfig: jsonb('sla_config').$type<Record<string, unknown>>().notNull().default({}),
    payloadSchemaVersion: integer('payload_schema_version').notNull().default(1),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    instSubtypeUq: uniqueIndex('document_catalog_inst_subtype_uq').on(t.institutionId, t.subtypeKey),
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
    counts: jsonb('counts').$type<Record<string, unknown>>().notNull().default({}),
    populationSnapshot: jsonb('population_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    createdBy: uuid('created_by'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    instStatusIdx: index('document_batches_inst_status_idx').on(t.institutionId, t.status),
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
    documentRenderId: uuid('document_render_id').references(() => documentRenders.id, { onDelete: 'set null' }),
    vaultId: uuid('vault_id'),
    error: jsonb('error').$type<Record<string, unknown> | null>(),
    mergeSnapshot: jsonb('merge_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    sourceSnapshot: jsonb('source_snapshot').$type<Record<string, unknown>>().notNull().default({}),
    signState: jsonb('sign_state').$type<Record<string, unknown>>().notNull().default({}),
    reviewFlag: boolean('review_flag').notNull().default(false),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    batchStudentUq: uniqueIndex('document_batch_items_batch_student_uq').on(t.batchId, t.studentId),
  }),
);

export const reportCardReviews = pgTable(
  'report_card_reviews',
  {
    id: primaryId(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => documentBatches.id, { onDelete: 'cascade' }),
    sectionId: text('section_id').notNull(),
    status: text('status').notNull().default('pending'),
    reviewerId: uuid('reviewer_id'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    batchSectionUq: uniqueIndex('report_card_reviews_batch_section_uq').on(t.batchId, t.sectionId),
  }),
);
