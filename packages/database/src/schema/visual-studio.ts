import { sql } from 'drizzle-orm';
import {
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
import type { CanvasGraph } from '@edrion/schemas';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { independentUsers } from './users';
import { knowledgeArtifacts, knowledgeItems } from './student-knowledge';
import { learnSessions, learnTopics } from './learn';

export const visualCanvases = pgTable(
  'visual_canvases',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').references(() => institutions.id, {
      onDelete: 'cascade',
    }),
    studentId: uuid('student_id').references(() => students.id, {
      onDelete: 'cascade',
    }),
    independentUserId: uuid('independent_user_id').references(() => independentUsers.id, {
      onDelete: 'cascade',
    }),
    title: text('title').notNull(),
    archetype: text('archetype').notNull(),
    graph: jsonb('graph').$type<CanvasGraph>().notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    origin: text('origin').notNull(),
    sourceId: uuid('source_id').references(() => knowledgeItems.id, {
      onDelete: 'set null',
    }),
    topicId: uuid('topic_id').references(() => learnTopics.id, {
      onDelete: 'set null',
    }),
    sourceSessionId: uuid('source_session_id').references(() => learnSessions.id, {
      onDelete: 'set null',
    }),
    legacyArtifactId: uuid('legacy_artifact_id').references(() => knowledgeArtifacts.id, {
      onDelete: 'set null',
    }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    ownerSubjectCk: check(
      'visual_canvases_subject_ck',
      sql`
      (${t.studentId} IS NOT NULL AND ${t.independentUserId} IS NULL AND ${t.institutionId} IS NOT NULL)
      OR (${t.studentId} IS NULL AND ${t.independentUserId} IS NOT NULL AND ${t.institutionId} IS NULL)
    `,
    ),
    archetypeCk: check(
      'visual_canvases_archetype_ck',
      sql`${t.archetype} IN ('mind_map','flowchart','cycle','timeline','hierarchy','comparison')`,
    ),
    originCk: check(
      'visual_canvases_origin_ck',
      sql`${t.origin} IN ('prompt','library_source','learn_topic','learn_session','memory','legacy')`,
    ),
    studentUpdatedIdx: index('visual_canvases_student_updated_idx').on(t.studentId, t.updatedAt),
    indepUpdatedIdx: index('visual_canvases_indep_updated_idx').on(t.independentUserId, t.updatedAt),
    sourceIdx: index('visual_canvases_source_idx').on(t.sourceId),
    topicIdx: index('visual_canvases_topic_idx').on(t.topicId),
    legacyUq: uniqueIndex('visual_canvases_legacy_artifact_uq').on(t.legacyArtifactId),
  }),
);

export const visualCanvasRevisions = pgTable(
  'visual_canvas_revisions',
  {
    id: primaryId(),
    canvasId: uuid('canvas_id')
      .notNull()
      .references(() => visualCanvases.id, { onDelete: 'cascade' }),
    revisionNumber: integer('revision_number').notNull(),
    graph: jsonb('graph').$type<CanvasGraph>().notNull(),
    schemaVersion: integer('schema_version').notNull().default(1),
    title: text('title').notNull(),
    archetype: text('archetype').notNull(),
    reason: text('reason').notNull(),
    createdBy: text('created_by').notNull().default('student'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    canvasRevisionUq: uniqueIndex('visual_canvas_revisions_canvas_revision_uq').on(
      t.canvasId,
      t.revisionNumber,
    ),
    canvasCreatedIdx: index('visual_canvas_revisions_canvas_created_idx').on(
      t.canvasId,
      t.createdAt,
    ),
  }),
);

export type VisualCanvas = typeof visualCanvases.$inferSelect;
export type NewVisualCanvas = typeof visualCanvases.$inferInsert;
export type VisualCanvasRevision = typeof visualCanvasRevisions.$inferSelect;

export type VisualManualReason = {
  contextType: 'visual_canvas';
  contextId: string;
  nodeId: string;
  title: string;
  reason: 'shaky' | 'memory_missing';
  queuedAt: string;
};
