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
  PetrosTopicProfile,
  PetrosTopicProfileOverridePatch,
} from '@edrion/schemas';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { learnTopics } from './learn';

/** Canonical identity and cache head. The content itself is immutable in profile-version rows. */
export const petrosTopicProfiles = pgTable(
  'petros_topic_profiles',
  {
    id: primaryId(),
    learnTopicId: uuid('learn_topic_id').references(() => learnTopics.id, { onDelete: 'set null' }),
    topicKey: text('topic_key').notNull(),
    canonicalTitle: text('canonical_title').notNull(),
    subjectKey: text('subject_key').notNull(),
    subjectLabel: text('subject_label').notNull(),
    gradeBand: text('grade_band').notNull(),
    curriculumKey: text('curriculum_key').notNull(),
    curriculumLabel: text('curriculum_label').notNull(),
    status: text('status').notNull().default('draft'),
    publishedVersionId: uuid('published_version_id'),
    cacheKey: text('cache_key').notNull(),
    cacheVersion: integer('cache_version').notNull().default(1),
    cacheHitCount: integer('cache_hit_count').notNull().default(0),
    invalidationInputs: jsonb('invalidation_inputs')
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    staleReason: text('stale_reason'),
    version: integer('version').notNull().default(1),
    ...timestamps,
  },
  (t) => ({
    identityUniq: uniqueIndex('petros_topic_profiles_identity_uniq').on(
      t.topicKey,
      t.curriculumKey,
      t.gradeBand,
    ),
    cacheKeyUniq: uniqueIndex('petros_topic_profiles_cache_key_uniq').on(t.cacheKey),
    filterIdx: index('petros_topic_profiles_filter_idx').on(
      t.status,
      t.subjectKey,
      t.curriculumKey,
      t.gradeBand,
    ),
  }),
);

/** Append-only reviewable content versions. Human edits never mutate generated source versions. */
export const petrosTopicProfileVersions = pgTable(
  'petros_topic_profile_versions',
  {
    id: primaryId(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => petrosTopicProfiles.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: text('status').notNull().default('draft'),
    source: text('source').notNull(),
    profile: jsonb('profile').$type<PetrosTopicProfile>().notNull(),
    profileHash: text('profile_hash').notNull(),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull().default({}),
    confidenceBasisPoints: integer('confidence_basis_points').notNull(),
    generatorVersion: text('generator_version').notNull(),
    promptVersion: text('prompt_version').notNull(),
    schemaVersion: text('schema_version').notNull(),
    basedOnVersion: integer('based_on_version'),
    changeSummary: text('change_summary').notNull(),
    generatedRequestId: uuid('generated_request_id'),
    routeReference: jsonb('route_reference').$type<Record<string, unknown> | null>(),
    createdBy: text('created_by'),
    reviewedBy: text('reviewed_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUniq: uniqueIndex('petros_topic_profile_versions_version_uniq').on(
      t.profileId,
      t.version,
    ),
    statusIdx: index('petros_topic_profile_versions_status_idx').on(
      t.profileId,
      t.status,
      t.createdAt,
    ),
  }),
);

/** Normalized links copied from each version for search, integrity checks, and future graph joins. */
export const petrosTopicProfilePrerequisites = pgTable(
  'petros_topic_profile_prerequisites',
  {
    id: primaryId(),
    profileVersionId: uuid('profile_version_id')
      .notNull()
      .references(() => petrosTopicProfileVersions.id, { onDelete: 'cascade' }),
    conceptKey: text('concept_key').notNull(),
    label: text('label').notNull(),
    requiredness: text('requiredness').notNull(),
    sourceReferences: jsonb('source_references').$type<Record<string, unknown>[]>().notNull().default([]),
    sequence: integer('sequence').notNull(),
  },
  (t) => ({
    versionConceptUniq: uniqueIndex('petros_topic_profile_prerequisites_uniq').on(
      t.profileVersionId,
      t.conceptKey,
    ),
    conceptIdx: index('petros_topic_profile_prerequisites_concept_idx').on(t.conceptKey),
  }),
);

/** Sourced misconception metadata; unsourced model guesses cannot enable misconception demolition. */
export const petrosTopicProfileMisconceptions = pgTable(
  'petros_topic_profile_misconceptions',
  {
    id: primaryId(),
    profileVersionId: uuid('profile_version_id')
      .notNull()
      .references(() => petrosTopicProfileVersions.id, { onDelete: 'cascade' }),
    misconceptionKey: text('misconception_key').notNull(),
    summary: text('summary').notNull(),
    correctionAnchor: text('correction_anchor').notNull(),
    sourceReferences: jsonb('source_references').$type<Record<string, unknown>[]>().notNull().default([]),
    sequence: integer('sequence').notNull(),
  },
  (t) => ({
    versionKeyUniq: uniqueIndex('petros_topic_profile_misconceptions_uniq').on(
      t.profileVersionId,
      t.misconceptionKey,
    ),
    keyIdx: index('petros_topic_profile_misconceptions_key_idx').on(t.misconceptionKey),
  }),
);

/** Institution overlay versions. A published overlay wins only inside its institution boundary. */
export const petrosTopicProfileOverrides = pgTable(
  'petros_topic_profile_overrides',
  {
    id: primaryId(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => petrosTopicProfiles.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: text('status').notNull().default('draft'),
    patch: jsonb('patch').$type<PetrosTopicProfileOverridePatch>().notNull(),
    basedOnCanonicalVersion: integer('based_on_canonical_version').notNull(),
    changeSummary: text('change_summary').notNull(),
    createdBy: text('created_by'),
    reviewedBy: text('reviewed_by'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    versionUniq: uniqueIndex('petros_topic_profile_overrides_version_uniq').on(
      t.profileId,
      t.institutionId,
      t.version,
    ),
    resolutionIdx: index('petros_topic_profile_overrides_resolution_idx').on(
      t.institutionId,
      t.profileId,
      t.status,
      t.version,
    ),
  }),
);

export const petrosTopicProfileInvalidations = pgTable(
  'petros_topic_profile_invalidations',
  {
    id: primaryId(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => petrosTopicProfiles.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    previousInputs: jsonb('previous_inputs').$type<Record<string, string>>().notNull().default({}),
    nextInputs: jsonb('next_inputs').$type<Record<string, string>>().notNull().default({}),
    regenerated: boolean('regenerated').notNull().default(false),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    profileIdx: index('petros_topic_profile_invalidations_profile_idx').on(
      t.profileId,
      t.createdAt,
    ),
  }),
);

/** Product-local history shown in Topic Profiles; the platform audit writer receives the same mutations. */
export const petrosTopicProfileAudits = pgTable(
  'petros_topic_profile_audits',
  {
    id: primaryId(),
    profileId: uuid('profile_id')
      .notNull()
      .references(() => petrosTopicProfiles.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id').references(() => institutions.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    actorRef: text('actor_ref'),
    reason: text('reason').notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    profileIdx: index('petros_topic_profile_audits_profile_idx').on(t.profileId, t.createdAt),
    institutionIdx: index('petros_topic_profile_audits_institution_idx').on(
      t.institutionId,
      t.createdAt,
    ),
  }),
);

export type PetrosTopicProfileRow = typeof petrosTopicProfiles.$inferSelect;
export type PetrosTopicProfileVersionRow = typeof petrosTopicProfileVersions.$inferSelect;
export type PetrosTopicProfileOverrideRow = typeof petrosTopicProfileOverrides.$inferSelect;
