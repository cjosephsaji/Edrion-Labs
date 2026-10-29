import { pgTable, uuid, text, integer, jsonb, timestamp, primaryKey } from 'drizzle-orm/pg-core';
/** Rebuildable cache of existing objective ledger events. It never owns evidence. */
export const petrosConceptBeliefs = pgTable(
  'petros_concept_beliefs',
  {
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    objectiveId: uuid('objective_id').notNull(),
    conceptId: uuid('concept_id').notNull(),
    conceptVersion: integer('concept_version').notNull(),
    graphVersion: text('graph_version').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    publicationHash: text('publication_hash').notNull(),
    projection: jsonb('projection').$type<Record<string, unknown>>().notNull(),
    projectionHash: text('projection_hash').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    key: primaryKey({
      columns: [
        t.institutionId,
        t.studentId,
        t.objectiveId,
        t.conceptId,
        t.conceptVersion,
        t.graphVersion,
        t.algorithmVersion,
      ],
    }),
  }),
);
