import { boolean, index, integer, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';

/**
 * Document generation engine (Petros Phase 4). Handlebars-in-DB templates (per-institution edits
 * must not require deploys) rendered to PDF by Playwright in a BullMQ worker.
 *
 *   - document_templates: institution_id NULL = platform default (seeded per doc_type ×
 *     institution type); an institution row overrides the default for that doc_type.
 *   - document_renders: one render request → queued → rendering → done|failed; the finished PDF
 *     lands in storage + petros_artifacts.
 */
export const documentTemplates = pgTable(
  'document_templates',
  {
    id: primaryId(),
    /** NULL = platform default template. */
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'cascade' }),
    docType: text('doc_type').notNull(), // exam_paper | assignment | circular | certificate | letter | report
    name: text('name').notNull(),
    engine: text('engine').notNull().default('handlebars'),
    html: text('html').notNull(),
    css: text('css').notNull().default(''),
    /** JSON schema-ish description of the fields the template consumes. */
    fieldsSchema: jsonb('fields_schema').$type<Record<string, unknown>>().default({}),
    /** Logo position; exam papers: toggles/labels for date/time/duration/examiner/marks/roll boxes/instructions. */
    headerConfig: jsonb('header_config').$type<Record<string, unknown>>().default({}),
    /** Institution types the (platform-default) template applies to. Empty = all. */
    appliesToTypes: jsonb('applies_to_types').$type<string[]>().default([]),
    isDefault: boolean('is_default').notNull().default(false),
    /** Human review is required before a completed render may be delivered to a student. */
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
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    templateId: uuid('template_id').references(() => documentTemplates.id, { onDelete: 'set null' }),
    docType: text('doc_type').notNull(),
    requestedBy: uuid('requested_by').notNull(),
    conversationId: uuid('conversation_id'),
    runId: uuid('run_id'),
    title: text('title').notNull(),
    /** Field values merged into the template (sanitized by Handlebars escaping). */
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('queued'), // queued | rendering | done | failed
    artifactId: uuid('artifact_id'),
    storagePath: text('storage_path'),
    errorDetail: text('error_detail'),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('document_renders_institution_idx').on(t.institutionId),
    statusIdx: index('document_renders_status_idx').on(t.status),
    convIdx: index('document_renders_conversation_idx').on(t.conversationId),
  }),
);

export type DocumentTemplate = typeof documentTemplates.$inferSelect;
export type NewDocumentTemplate = typeof documentTemplates.$inferInsert;
export type DocumentRender = typeof documentRenders.$inferSelect;
export type NewDocumentRender = typeof documentRenders.$inferInsert;
