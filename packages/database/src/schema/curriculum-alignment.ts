import { foreignKey, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId } from './_helpers';
import { institutions } from './institutions';
import { courses } from './institutional-bridge';

/** Append-only records belong to the existing course curriculum, not to learner state. */
export const courseCurriculumRecords = pgTable('course_curriculum_records', {
  id: primaryId(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  courseId: uuid('course_id').notNull(),
  kind: text('kind').notNull(),
  recordId: uuid('record_id').notNull(),
  recordVersion: integer('record_version').notNull(),
  contentHash: text('content_hash').notNull(),
  content: jsonb('content').$type<Record<string, unknown>>().notNull(),
  actorId: uuid('actor_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  courseTenant: foreignKey({ columns: [t.courseId, t.institutionId], foreignColumns: [courses.id, courses.institutionId] }),
  identity: uniqueIndex('course_curriculum_record_uq').on(t.courseId, t.kind, t.recordId, t.recordVersion),
}));

export const courseCurriculumRevisions = pgTable('course_curriculum_revisions', {
  id: primaryId(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  courseId: uuid('course_id').notNull(),
  revision: integer('revision').notNull(),
  schemaVersion: text('schema_version').notNull(),
  commandId: uuid('command_id').notNull(),
  requestHash: text('request_hash').notNull(),
  syllabusHash: text('syllabus_hash').notNull(),
  subjectId: uuid('subject_id'),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  actorId: uuid('actor_id').notNull(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  courseTenant: foreignKey({ columns: [t.courseId, t.institutionId], foreignColumns: [courses.id, courses.institutionId] }),
  revisionUq: uniqueIndex('course_curriculum_revision_uq').on(t.courseId, t.revision),
  commandUq: uniqueIndex('course_curriculum_command_uq').on(t.courseId, t.commandId),
  tenantIdx: index('course_curriculum_tenant_idx').on(t.institutionId, t.courseId),
}));
