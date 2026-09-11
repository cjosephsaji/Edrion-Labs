import { index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { knowledgeItems } from './student-knowledge';

/**
 * Versioned, owner-scoped preprocessing output for document teaching.
 *
 * Raw pages remain in knowledge_item_pages. Petros reads those pages once per document
 * version, stores a compact teaching outline here, and subsequently retrieves only the
 * page range for the selected lesson topic.
 */
export const petrosDocumentLessonOutlines = pgTable(
  'petros_document_lesson_outlines',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    knowledgeItemId: uuid('knowledge_item_id')
      .notNull()
      .references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    documentVersion: integer('document_version').notNull(),
    sourceFingerprint: text('source_fingerprint').notNull(),
    outline: jsonb('outline').$type<Record<string, unknown>>().notNull(),
    lessonPlan: jsonb('lesson_plan').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => ({
    versionUq: uniqueIndex('petros_document_lesson_outlines_version_uq').on(
      t.institutionId,
      t.studentId,
      t.knowledgeItemId,
      t.documentVersion,
      t.sourceFingerprint,
    ),
    ownerItemIdx: index('petros_document_lesson_outlines_owner_item_idx').on(
      t.institutionId,
      t.studentId,
      t.knowledgeItemId,
    ),
  }),
);
