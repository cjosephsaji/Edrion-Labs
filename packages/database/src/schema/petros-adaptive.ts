import { pgTable, uuid, text, jsonb, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { primaryId } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { petrosLearningSessions } from './petros-learning';

/** Explicit session opt-in. Its pack identity never silently follows a newer version. */
export const petrosAdaptiveBindings = pgTable('petros_adaptive_bindings', {
  id: primaryId(),
  institutionId: uuid('institution_id').notNull().references(() => institutions.id),
  studentId: uuid('student_id').notNull().references(() => students.id),
  sessionId: uuid('session_id').notNull().references(() => petrosLearningSessions.id),
  commandId: uuid('command_id').notNull(),
  commandHash: text('command_hash').notNull(),
  binding: jsonb('binding').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => ({ session: uniqueIndex('petros_adaptive_bindings_session').on(t.sessionId) }));
