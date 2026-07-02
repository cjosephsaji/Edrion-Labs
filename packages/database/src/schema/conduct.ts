import { boolean, date, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';

/**
 * INSTITUTION-PORTAL student conduct log: behaviour/discipline incidents a student is involved in AND
 * complaints raised against a student. One tenant table covers both (differentiated by `category`).
 * Campus-scoped, version-guarded. Sensitive — gated by `student_conduct.*`. Feeds the student profile.
 */
export const studentIncidents = pgTable(
  'student_incidents',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    /** behavior | discipline | complaint | property_damage | bullying | other. */
    category: text('category').notNull().default('behavior'),
    title: text('title').notNull(),
    description: text('description'),
    /** low | medium | high. */
    severity: text('severity').notNull().default('medium'),
    /** open | resolved | dismissed. */
    status: text('status').notNull().default('open'),
    occurredOn: date('occurred_on'),
    /** Free-text reporter (e.g. a parent complaint) when it isn't a staff member. */
    reporterName: text('reporter_name'),
    /** True when the incident should be visible to the student's guardians. */
    notifyGuardians: boolean('notify_guardians').notNull().default(false),
    resolutionNote: text('resolution_note'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('student_incidents_institution_idx').on(t.institutionId),
    scopeIdx: index('student_incidents_institution_campus_idx').on(t.institutionId, t.campusId),
    studentIdx: index('student_incidents_student_idx').on(t.studentId),
    statusIdx: index('student_incidents_status_idx').on(t.status),
  }),
);

export type StudentIncident = typeof studentIncidents.$inferSelect;
export type NewStudentIncident = typeof studentIncidents.$inferInsert;
