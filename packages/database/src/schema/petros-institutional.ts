import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  PetrosInstitutionPolicyConfig,
  PetrosResolvedPolicy,
  PetrosTeacherHandoffCreateInput,
} from '@edrion/schemas';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';
import { classes, gradeLevels, subjects } from './academics';
import { institutionUsers } from './users';
import { students, staff } from './people';
import { petrosLearningSessions } from './petros-learning';

export const petrosInstitutionPolicyVersions = pgTable(
  'petros_institution_policy_versions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    programmeId: uuid('programme_id'),
    gradeId: uuid('grade_id').references(() => gradeLevels.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    scopeLevel: text('scope_level').notNull(),
    version: integer('version').notNull(),
    status: text('status').notNull().default('draft'),
    schemaVersion: text('schema_version').notNull(),
    config: jsonb('config').$type<PetrosInstitutionPolicyConfig>().notNull(),
    reason: text('reason').notNull(),
    authorId: uuid('author_id').notNull(),
    supersedesId: uuid('supersedes_id'),
    effectiveFrom: timestamp('effective_from', { withTimezone: true }),
    effectiveUntil: timestamp('effective_until', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    rolledBackAt: timestamp('rolled_back_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    scopeVersionUniq: uniqueIndex('petros_policy_scope_version_uniq').on(t.institutionId, t.scopeLevel, t.campusId, t.programmeId, t.gradeId, t.subjectId, t.version),
    effectiveIdx: index('petros_policy_effective_idx').on(t.institutionId, t.status, t.effectiveFrom),
  }),
);

export const petrosPolicySessionSnapshots = pgTable(
  'petros_policy_session_snapshots',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull().references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    policyVersionIds: uuid('policy_version_ids').array().notNull(),
    resolvedPolicy: jsonb('resolved_policy').$type<PetrosResolvedPolicy>().notNull(),
    policyHash: text('policy_hash').notNull(),
    stableForSession: boolean('stable_for_session').notNull().default(true),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionUniq: uniqueIndex('petros_policy_session_snapshot_session_uniq').on(t.institutionId, t.studentId, t.sessionId),
    versionIdx: index('petros_policy_session_snapshot_version_idx').on(t.institutionId, t.policyHash),
  }),
);

export const petrosPolicyDisclosureReceipts = pgTable(
  'petros_policy_disclosure_receipts',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    snapshotId: uuid('snapshot_id').notNull().references(() => petrosPolicySessionSnapshots.id, { onDelete: 'cascade' }),
    disclosureHash: text('disclosure_hash').notNull(),
    shownAt: timestamp('shown_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    locale: text('locale').notNull().default('en'),
  },
  (t) => ({
    snapshotUniq: uniqueIndex('petros_policy_disclosure_snapshot_uniq').on(t.snapshotId),
    ownerIdx: index('petros_policy_disclosure_owner_idx').on(t.institutionId, t.studentId, t.shownAt),
  }),
);

export const petrosHomeworkPolicyMatches = pgTable(
  'petros_homework_policy_matches',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull(),
    studentId: uuid('student_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    assignmentId: uuid('assignment_id').notNull(),
    snapshotId: uuid('snapshot_id').notNull().references(() => petrosPolicySessionSnapshots.id, { onDelete: 'cascade' }),
    relationBasisPoints: integer('relation_basis_points').notNull(),
    related: boolean('related').notNull(),
    active: boolean('active').notNull(),
    reasonCode: text('reason_code').notNull(),
    studentCorrected: boolean('student_corrected').notNull().default(false),
    correctionReason: text('correction_reason'),
    evaluatedAt: timestamp('evaluated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    sessionAssignmentUniq: uniqueIndex('petros_homework_match_session_assignment_uniq').on(t.sessionId, t.assignmentId),
    ownerIdx: index('petros_homework_match_owner_idx').on(t.institutionId, t.studentId, t.evaluatedAt),
  }),
);

export const petrosTeacherHandoffs = pgTable(
  'petros_teacher_handoffs',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'set null' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').notNull().references(() => petrosLearningSessions.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    teacherId: uuid('teacher_id').references(() => staff.id, { onDelete: 'set null' }),
    policySnapshotId: uuid('policy_snapshot_id').notNull().references(() => petrosPolicySessionSnapshots.id, { onDelete: 'restrict' }),
    summary: jsonb('summary').$type<PetrosTeacherHandoffCreateInput['summary']>().notNull(),
    status: text('status').notNull().default('preview'),
    consentedAt: timestamp('consented_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    functionKey: text('function_key').notNull(),
    validationPassed: boolean('validation_passed').notNull().default(true),
    retryCount: integer('retry_count').notNull().default(0),
    ...timestamps,
  },
  (t) => ({
    ownerKeyUniq: uniqueIndex('petros_teacher_handoff_owner_key_uniq').on(t.institutionId, t.studentId, t.idempotencyKey),
    teacherStatusIdx: index('petros_teacher_handoff_teacher_status_idx').on(t.institutionId, t.teacherId, t.status),
  }),
);

export const petrosClassStruggleSignals = pgTable(
  'petros_class_struggle_signals',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    classId: uuid('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id').notNull().references(() => subjects.id, { onDelete: 'cascade' }),
    conceptKey: text('concept_key').notNull(),
    curriculumArea: text('curriculum_area').notNull(),
    sourceHash: text('source_hash').notNull(),
    cohortSize: integer('cohort_size'),
    eligibleCount: integer('eligible_count').notNull().default(0),
    evidenceCoveredCount: integer('evidence_covered_count').notNull().default(0),
    independentAttemptCount: integer('independent_attempt_count').notNull().default(0),
    affectedLearnerCount: integer('affected_learner_count').notNull().default(0),
    successfulAttemptCount: integer('successful_attempt_count').notNull().default(0),
    exclusionCounts: jsonb('exclusion_counts').$type<Record<string, number>>().notNull().default({}),
    membershipAsOf: timestamp('membership_as_of', { withTimezone: true }),
    windowStart: timestamp('window_start', { withTimezone: true }),
    windowEnd: timestamp('window_end', { withTimezone: true }),
    evidenceVersions: jsonb('evidence_versions').$type<Record<string, string[]>>().notNull().default({}),
    threshold: integer('threshold').notNull(),
    evidenceCount: integer('evidence_count').notNull(),
    uncertaintyBasisPoints: integer('uncertainty_basis_points').notNull(),
    freshestAt: timestamp('freshest_at', { withTimezone: true }).notNull(),
    suppressed: boolean('suppressed').notNull(),
    suggestedNextStep: text('suggested_next_step').notNull(),
    algorithmVersion: text('algorithm_version').notNull(),
    ...timestamps,
  },
  (t) => ({
    scopeHashUniq: uniqueIndex('petros_class_signal_scope_hash_uniq').on(t.institutionId, t.classId, t.subjectId, t.conceptKey, t.sourceHash),
    teacherIdx: index('petros_class_signal_teacher_idx').on(t.institutionId, t.classId, t.subjectId, t.suppressed),
  }),
);

export const petrosParentDigestPreferences = pgTable(
  'petros_parent_digest_preferences',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id').notNull().references(() => institutionUsers.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    optedOut: boolean('opted_out').notNull().default(false),
    language: text('language').notNull().default('en'),
    deliveryChannels: text('delivery_channels').array().notNull().default(['portal']),
    ...timestamps,
  },
  (t) => ({ guardianStudentUniq: uniqueIndex('petros_parent_digest_preference_uniq').on(t.institutionId, t.guardianUserId, t.studentId) }),
);

export const petrosParentDigests = pgTable(
  'petros_parent_digests',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    guardianUserId: uuid('guardian_user_id').notNull().references(() => institutionUsers.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    policyVersionIds: uuid('policy_version_ids').array().notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    language: text('language').notNull(),
    content: jsonb('content').$type<Record<string, unknown>>().notNull(),
    status: text('status').notNull().default('preview'),
    deliveryChannels: text('delivery_channels').array().notNull(),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxRetryCount: integer('max_retry_count').notNull().default(3),
    nextRetryAt: timestamp('next_retry_at', { withTimezone: true }),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    errorCode: text('error_code'),
    idempotencyKey: uuid('idempotency_key').notNull(),
    functionKey: text('function_key').notNull(),
    validationPassed: boolean('validation_passed').notNull().default(true),
    ...timestamps,
  },
  (t) => ({
    guardianKeyUniq: uniqueIndex('petros_parent_digest_guardian_key_uniq').on(t.institutionId, t.guardianUserId, t.idempotencyKey),
    historyIdx: index('petros_parent_digest_history_idx').on(t.institutionId, t.guardianUserId, t.studentId, t.periodEnd),
    retryIdx: index('petros_parent_digest_retry_idx').on(t.status, t.nextRetryAt),
  }),
);

export const petrosInstitutionalEvents = pgTable(
  'petros_institutional_events',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull(),
    actorId: uuid('actor_id'),
    actorKind: text('actor_kind').notNull(),
    studentId: uuid('student_id'),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id'),
    type: text('type').notNull(),
    purpose: text('purpose'),
    functionKey: text('function_key'),
    durationMs: integer('duration_ms'),
    retryCount: integer('retry_count').notNull().default(0),
    fallbackTier: integer('fallback_tier'),
    estimatedCostMicros: integer('estimated_cost_micros').notNull().default(0),
    actualCostMicros: integer('actual_cost_micros'),
    validationPassed: boolean('validation_passed').notNull().default(true),
    errorCode: text('error_code'),
    idempotencyKey: uuid('idempotency_key').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    institutionKeyUniq: uniqueIndex('petros_institutional_event_key_uniq').on(t.institutionId, t.idempotencyKey),
    typeIdx: index('petros_institutional_event_type_idx').on(t.type, t.createdAt),
    functionIdx: index('petros_institutional_event_function_idx').on(t.functionKey, t.createdAt),
  }),
);
