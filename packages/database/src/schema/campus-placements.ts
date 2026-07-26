import { integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { students } from './people';

export const placementSeasons = pgTable('placement_seasons', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  status: text('status').notNull().default('draft'),
  opensAt: timestamp('opens_at', { withTimezone: true }),
  closesAt: timestamp('closes_at', { withTimezone: true }),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

export const placementCompanies = pgTable('placement_companies', {
  id: primaryId(),
  institutionId: uuid('institution_id')
    .notNull()
    .references(() => institutions.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  sector: text('sector'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const placementDrives = pgTable('placement_drives', {
  id: primaryId(),
  seasonId: uuid('season_id')
    .notNull()
    .references(() => placementSeasons.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id')
    .notNull()
    .references(() => placementCompanies.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  packageBand: text('package_band'),
  eligibility: jsonb('eligibility').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('scheduled'),
  version: integer('version').notNull().default(1),
  ...timestamps,
});

export const placementApplications = pgTable(
  'placement_applications',
  {
    id: primaryId(),
    driveId: uuid('drive_id')
      .notNull()
      .references(() => placementDrives.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('draft'),
    resumeId: uuid('resume_id'),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    driveStudentUq: uniqueIndex('placement_applications_drive_student_uq').on(t.driveId, t.studentId),
  }),
);
