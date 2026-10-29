import {
  pgTable,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import type { M4Evaluation, M4Response } from '@edrion/schemas';
import { petrosLearningSessions } from './petros-learning';
const owner = {
  institutionId: uuid('institution_id').notNull(),
  studentId: uuid('student_id').notNull(),
};
export const petrosV2Tasks = pgTable(
  'petros_v2_tasks',
  {
    id: uuid('id').primaryKey(),
    ...owner,
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id),
    candidateId: uuid('candidate_id').notNull(),
    reviewId: uuid('review_id').notNull(),
    contractHash: text('contract_hash').notNull(),
    instanceHash: text('instance_hash').notNull(),
    equivalenceKey: text('equivalence_key').notNull(),
    publicTask: jsonb('public_task').$type<Record<string, unknown>>().notNull(),
    issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ session: index('petros_v2_tasks_session_idx').on(t.sessionId, t.issuedAt) }),
);
export const petrosV2Responses = pgTable(
  'petros_v2_responses',
  {
    id: uuid('id').primaryKey(),
    ...owner,
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id),
    taskId: uuid('task_id')
      .notNull()
      .references(() => petrosV2Tasks.id),
    commandId: uuid('command_id').notNull(),
    response: jsonb('response').$type<M4Response>().notNull(),
    responseHash: text('response_hash').notNull(),
    taskInstanceHash: text('task_instance_hash').notNull(),
    sessionRevision: integer('session_revision').notNull(),
    epoch: integer('epoch').notNull(),
    canvasRevision: integer('canvas_revision').notNull(),
    checkpointId: uuid('checkpoint_id'),
    snapshotHash: text('snapshot_hash'),
    exposure: jsonb('exposure')
      .$type<{ assisted: boolean; repeated: boolean; outsideHelp: 'unknown'; eventIds: string[] }>()
      .notNull(),
    committedAt: timestamp('committed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    task: uniqueIndex('petros_v2_response_task_uq').on(t.taskId),
    command: uniqueIndex('petros_v2_response_command_uq').on(t.sessionId, t.commandId),
  }),
);
export const petrosV2Evaluations = pgTable(
  'petros_v2_evaluations',
  {
    id: uuid('id').primaryKey(),
    ...owner,
    sessionId: uuid('session_id')
      .notNull()
      .references(() => petrosLearningSessions.id),
    responseId: uuid('response_id')
      .notNull()
      .references(() => petrosV2Responses.id),
    publicationHash: text('publication_hash').notNull(),
    contractHash: text('contract_hash').notNull(),
    result: jsonb('result').$type<M4Evaluation>().notNull(),
    supersedes: uuid('supersedes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ correction: uniqueIndex('petros_v2_evaluation_supersedes_uq').on(t.supersedes) }),
);
