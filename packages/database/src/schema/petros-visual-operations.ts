import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { petrosTeachingBlocks } from './petros-learning';
import { institutions } from './institutions';
import { students } from './people';

/** Immutable command receipts extend the existing block/checkpoint owner. No learning evidence. */
export const petrosVisualOperations = pgTable('petros_visual_operations', {
  id: uuid('id').primaryKey().defaultRandom(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  blockId: uuid('block_id').notNull().references(() => petrosTeachingBlocks.id),
  operationId: uuid('operation_id').notNull(),
  commandHash: text('command_hash').notNull(),
  status: text('status').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown> | null>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({
  operation: uniqueIndex('petros_visual_operations_key').on(t.blockId, t.operationId),
  owner: index('petros_visual_operations_owner').on(t.institutionId, t.studentId, t.blockId),
}));
