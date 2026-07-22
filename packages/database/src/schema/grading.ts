import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { academicTerms, classes, subjects } from './academics';
import { campuses } from './campuses';
import { gradeEntries } from './gradebook';
import { institutions } from './institutions';
import { students } from './people';
import { studentRequests } from './requests';

export const GRADING_SCHEME_KINDS = ['points_10', 'cbse', 'us_4', 'percentage'] as const;
export type GradingSchemeKind = (typeof GRADING_SCHEME_KINDS)[number];

export const GPA_FORMULAS = ['credit_weighted', 'simple_average', 'none'] as const;
export type GpaFormula = (typeof GPA_FORMULAS)[number];

export const MARK_RELEASE_STATUSES = [
  'draft',
  'pending_approval',
  'released',
  'retracted',
] as const;
export type MarkReleaseStatus = (typeof MARK_RELEASE_STATUSES)[number];

export const MARK_REVISION_REASON_KINDS = ['revaluation', 'correction'] as const;
export type MarkRevisionReasonKind = (typeof MARK_REVISION_REASON_KINDS)[number];

export const TERM_RECOMPUTE_STATUSES = [
  'pending_approval',
  'approved',
  'rejected',
  'completed',
] as const;
export type TermRecomputeStatus = (typeof TERM_RECOMPUTE_STATUSES)[number];

export type GradingBand = {
  grade: string;
  min_pct: number;
  grade_points: number | null;
  is_pass: boolean;
};

export type WeightMapComponent = {
  key: string;
  label: string;
  weight_pct: number;
  assessments: Array<{ exam_id?: string } | { assessment_name: string }>;
  aggregation: 'sum' | 'average' | 'best_n';
  n?: number;
};

export type MarkReleaseScope = {
  exam_id?: string;
  assessment_name?: string;
  class_ids?: string[];
};

/** Institution grading scheme definitions (bands + GPA formula). */
export const gradingSchemes = pgTable(
  'grading_schemes',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: text('kind').notNull(),
    bands: jsonb('bands').$type<GradingBand[]>().notNull().default([]),
    gpaFormula: text('gpa_formula').notNull().default('credit_weighted'),
    version: integer('version').notNull().default(1),
    isDefault: boolean('is_default').notNull().default(false),
    isActive: boolean('is_active').notNull().default(true),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('grading_schemes_institution_idx').on(t.institutionId),
    defaultUniq: uniqueIndex('grading_schemes_institution_default_uniq')
      .on(t.institutionId)
      .where(sql`${t.isDefault} = true`),
    kindCheck: check(
      'grading_schemes_kind_check',
      sql`${t.kind} IN ('points_10', 'cbse', 'us_4', 'percentage')`,
    ),
    gpaFormulaCheck: check(
      'grading_schemes_gpa_formula_check',
      sql`${t.gpaFormula} IN ('credit_weighted', 'simple_average', 'none')`,
    ),
  }),
);

/** Append-only version snapshots for grading schemes. */
export const gradingSchemeVersions = pgTable(
  'grading_scheme_versions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => gradingSchemes.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdBy: uuid('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    schemeVersionUniq: uniqueIndex('grading_scheme_versions_scheme_version_uniq').on(
      t.schemeId,
      t.version,
    ),
    instIdx: index('grading_scheme_versions_institution_idx').on(t.institutionId),
  }),
);

/** Per subject-term weight maps (assessment → component aggregation). */
export const subjectWeightMaps = pgTable(
  'subject_weight_maps',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').references(() => classes.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'cascade' }),
    creditsOverride: numeric('credits_override', { precision: 4, scale: 1 }),
    components: jsonb('components').$type<WeightMapComponent[]>().notNull().default([]),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    subjectTermClassUniq: uniqueIndex('subject_weight_maps_subject_term_class_uniq').on(
      t.subjectId,
      t.termId,
      t.classId,
    ),
    instIdx: index('subject_weight_maps_institution_idx').on(t.institutionId),
    termIdx: index('subject_weight_maps_term_idx').on(t.termId),
  }),
);

/** Release batch metadata — visibility enforced by grade_entries.published. */
export const markReleaseBatches = pgTable(
  'mark_release_batches',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => campuses.id, { onDelete: 'restrict' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    scope: jsonb('scope').$type<MarkReleaseScope>().notNull(),
    scopeHash: text('scope_hash').generatedAlwaysAs(sql`md5(scope::text)`),
    status: text('status').notNull().default('draft'),
    entryIds: uuid('entry_ids').array().notNull().default(sql`'{}'::uuid[]`),
    releasedBy: uuid('released_by'),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    approvedBy: uuid('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    retractedBy: uuid('retracted_by'),
    retractedAt: timestamp('retracted_at', { withTimezone: true }),
    retractNote: text('retract_note'),
    missingEntryCount: integer('missing_entry_count').notNull().default(0),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('mark_release_batches_institution_idx').on(t.institutionId),
    termSubjectIdx: index('mark_release_batches_term_subject_idx').on(t.termId, t.subjectId),
    activeScopeUniq: uniqueIndex('mark_release_batches_active_scope_uniq')
      .on(t.subjectId, t.termId, t.scopeHash)
      .where(sql`${t.status} IN ('draft', 'pending_approval', 'released')`),
    statusCheck: check(
      'mark_release_batches_status_check',
      sql`${t.status} IN ('draft', 'pending_approval', 'released', 'retracted')`,
    ),
  }),
);

/** Denormalized per-student term results (cache — recomputed by background job). */
export const studentTermResults = pgTable(
  'student_term_results',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'cascade' }),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => gradingSchemes.id, { onDelete: 'restrict' }),
    schemeVersion: integer('scheme_version').notNull(),
    subjects: jsonb('subjects').$type<Array<Record<string, unknown>>>().notNull().default([]),
    termGpa: numeric('term_gpa', { precision: 4, scale: 2 }),
    termPct: numeric('term_pct', { precision: 5, scale: 2 }).notNull(),
    creditsEarned: integer('credits_earned').notNull().default(0),
    creditsTotal: integer('credits_total').notNull().default(0),
    isComplete: boolean('is_complete').notNull().default(false),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
    version: integer('version').notNull().default(0),
  },
  (t) => ({
    studentTermUniq: uniqueIndex('student_term_results_student_term_uniq').on(
      t.studentId,
      t.termId,
    ),
    instTermIdx: index('student_term_results_institution_term_idx').on(
      t.institutionId,
      t.termId,
    ),
  }),
);

/** CGPA snapshot per student at a term boundary. */
export const studentCgpaSnapshots = pgTable(
  'student_cgpa_snapshots',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    asOfTermId: uuid('as_of_term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'cascade' }),
    cgpa: numeric('cgpa', { precision: 4, scale: 2 }).notNull(),
    termsIncluded: jsonb('terms_included')
      .$type<Array<{ term_id: string; scheme_version: number }>>()
      .notNull()
      .default([]),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    studentTermUniq: uniqueIndex('student_cgpa_snapshots_student_term_uniq').on(
      t.studentId,
      t.asOfTermId,
    ),
    instIdx: index('student_cgpa_snapshots_institution_idx').on(t.institutionId),
  }),
);

/** Append-only provenance log for mark score changes. */
export const markRevisions = pgTable(
  'mark_revisions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'cascade' }),
    gradeEntryId: uuid('grade_entry_id')
      .notNull()
      .references(() => gradeEntries.id, { onDelete: 'restrict' }),
    oldScore: integer('old_score').notNull(),
    newScore: integer('new_score').notNull(),
    reasonKind: text('reason_kind').notNull(),
    note: text('note').notNull(),
    requestId: uuid('request_id').references(() => studentRequests.id, { onDelete: 'set null' }),
    revisedBy: uuid('revised_by'),
    revisedAt: timestamp('revised_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    entryIdx: index('mark_revisions_grade_entry_idx').on(t.gradeEntryId),
    studentIdx: index('mark_revisions_student_idx').on(t.studentId),
    instIdx: index('mark_revisions_institution_idx').on(t.institutionId),
    reasonCheck: check(
      'mark_revisions_reason_kind_check',
      sql`${t.reasonKind} IN ('revaluation', 'correction')`,
    ),
  }),
);

export type GradingScheme = typeof gradingSchemes.$inferSelect;
export type NewGradingScheme = typeof gradingSchemes.$inferInsert;
export type GradingSchemeVersion = typeof gradingSchemeVersions.$inferSelect;
export type SubjectWeightMap = typeof subjectWeightMaps.$inferSelect;
export type MarkReleaseBatch = typeof markReleaseBatches.$inferSelect;
export type StudentTermResult = typeof studentTermResults.$inferSelect;
export type StudentCgpaSnapshot = typeof studentCgpaSnapshots.$inferSelect;
export type MarkRevision = typeof markRevisions.$inferSelect;

/** Two-person approval queue for stamped-term recomputation / scheme changes. */
export const termRecomputeRequests = pgTable(
  'term_recompute_requests',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'cascade' }),
    schemeId: uuid('scheme_id')
      .notNull()
      .references(() => gradingSchemes.id, { onDelete: 'restrict' }),
    schemeVersion: integer('scheme_version').notNull(),
    reason: text('reason').notNull(),
    status: text('status').notNull().default('pending_approval'),
    proposedBy: uuid('proposed_by'),
    approvedBy: uuid('approved_by'),
    rejectedNote: text('rejected_note'),
    version: integer('version').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    instStatusIdx: index('term_recompute_requests_institution_status_idx').on(
      t.institutionId,
      t.status,
    ),
    statusCheck: check(
      'term_recompute_requests_status_check',
      sql`${t.status} IN ('pending_approval', 'approved', 'rejected', 'completed')`,
    ),
  }),
);

export type TermRecomputeRequest = typeof termRecomputeRequests.$inferSelect;
