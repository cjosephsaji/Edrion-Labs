import { boolean, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL Documents & Policies (Administration). Admins publish handbooks / consent-forms
 * / policies for staff to view. No file-storage service exists yet, so a document is metadata + an
 * external `url`; `storageKey` is the reserved seam for a real uploaded object later. Campus-scoped
 * (campus_id null = institution-wide), version-guarded.
 */
export const institutionDocuments = pgTable(
  'institution_documents',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** policy | handbook | form | other. */
    category: text('category').notNull().default('policy'),
    description: text('description'),
    /** External link to the document (https). */
    url: text('url').notNull(),
    /** Reserved seam: object key once a real file-storage service is wired. TODO: swap in upload. */
    storageKey: text('storage_key'),
    requiresAck: boolean('requires_ack').notNull().default(false),
    published: boolean('published').notNull().default(false),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('institution_documents_institution_idx').on(t.institutionId),
    scopeIdx: index('institution_documents_institution_campus_idx').on(t.institutionId, t.campusId),
    categoryIdx: index('institution_documents_category_idx').on(t.category),
  }),
);

export type InstitutionDocument = typeof institutionDocuments.$inferSelect;
export type NewInstitutionDocument = typeof institutionDocuments.$inferInsert;
