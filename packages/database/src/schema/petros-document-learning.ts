import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { students } from './people';
import { classMaterials } from './institutional-bridge';
import { knowledgeItems } from './student-knowledge';
import type { SourceRevision } from '@edrion/schemas';

/** Immutable, shared extraction of one authorized material revision. */
export const petrosDocumentSourceRevisions = pgTable(
  'petros_document_source_revisions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    classMaterialId: uuid('class_material_id').references(() => classMaterials.id, { onDelete: 'cascade' }),
    canonicalKnowledgeItemId: uuid('canonical_knowledge_item_id').references(() => knowledgeItems.id, { onDelete: 'set null' }),
    sourceKey: text('source_key').notNull(),
    title: text('title').notNull(),
    mimeType: text('mime_type'),
    documentVersion: integer('document_version').notNull(),
    checksum: text('checksum').notNull(),
    parserVersion: text('parser_version').notNull(),
    formatVersion: text('format_version').notNull().default('v1'),
    originalSourceId: uuid('original_source_id'),
    v2Revision: jsonb('v2_revision').$type<SourceRevision>(),
    extractionStatus: text('extraction_status').notNull().default('ready'),
    structure: jsonb('structure').$type<Record<string, unknown>>().notNull(),
    warnings: jsonb('warnings').$type<string[]>().notNull().default([]),
    ...timestamps,
  },
  (t) => ({
    revisionUq: uniqueIndex('petros_document_source_revisions_uq').on(
      t.institutionId,
      t.sourceKey,
      t.documentVersion,
      t.checksum,
      t.parserVersion,
    ),
    materialIdx: index('petros_document_source_revisions_material_idx').on(t.institutionId, t.classMaterialId, t.createdAt),
  }),
);

/** Shared document map and progressive generation state. No learner answers live here. */
export const petrosDocumentPreparations = pgTable(
  'petros_document_preparations',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    sourceRevisionId: uuid('source_revision_id').notNull().references(() => petrosDocumentSourceRevisions.id, { onDelete: 'cascade' }),
    requestedConceptId: text('requested_concept_id').notNull().default('recommended'),
    generatorVersion: text('generator_version').notNull(),
    curriculumKey: text('curriculum_key').notNull().default('default'),
    requestContext: jsonb('request_context').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('queued'),
    stage: text('stage').notNull().default('queued'),
    progress: integer('progress').notNull().default(0),
    message: text('message').notNull().default('Petros is preparing the source.'),
    documentMap: jsonb('document_map').$type<Record<string, unknown>>(),
    recommendedConceptId: text('recommended_concept_id'),
    firstLessonId: uuid('first_lesson_id'),
    issueCode: text('issue_code'),
    issueDetail: text('issue_detail'),
    retryable: integer('retryable').notNull().default(1),
    attemptCount: integer('attempt_count').notNull().default(0),
    tokenUsage: jsonb('token_usage').$type<Record<string, number>>().notNull().default({}),
    timing: jsonb('timing').$type<Record<string, number>>().notNull().default({}),
    leaseOwner: text('lease_owner'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    dedupeUq: uniqueIndex('petros_document_preparations_dedupe_uq').on(
      t.institutionId,
      t.sourceRevisionId,
      t.requestedConceptId,
      t.generatorVersion,
      t.curriculumKey,
    ),
    statusIdx: index('petros_document_preparations_status_idx').on(t.status, t.updatedAt),
  }),
);

/** Validated lesson content shared within the source revision's institution/material scope. */
export const petrosDocumentLessonArtifacts = pgTable(
  'petros_document_lesson_artifacts',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    sourceRevisionId: uuid('source_revision_id').notNull().references(() => petrosDocumentSourceRevisions.id, { onDelete: 'cascade' }),
    preparationId: uuid('preparation_id').notNull().references(() => petrosDocumentPreparations.id, { onDelete: 'cascade' }),
    conceptId: text('concept_id').notNull(),
    subject: text('subject').notNull(),
    generatorVersion: text('generator_version').notNull(),
    status: text('status').notNull().default('validating'),
    publicPlan: jsonb('public_plan').$type<Record<string, unknown>>().notNull(),
    privatePlan: jsonb('private_plan').$type<Record<string, unknown>>().notNull(),
    quality: jsonb('quality').$type<Record<string, unknown>>().notNull().default({}),
    provenance: jsonb('provenance').$type<Record<string, unknown>>().notNull().default({}),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => ({
    conceptUq: uniqueIndex('petros_document_lesson_artifacts_concept_uq').on(
      t.institutionId,
      t.sourceRevisionId,
      t.conceptId,
      t.generatorVersion,
    ),
    preparationIdx: index('petros_document_lesson_artifacts_preparation_idx').on(t.preparationId, t.status),
  }),
);

/** Learner-specific order, completion and review state over shared artifacts. */
export const petrosDocumentLearnerPaths = pgTable(
  'petros_document_learner_paths',
  {
    id: primaryId(),
    institutionId: uuid('institution_id').notNull().references(() => institutions.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    knowledgeItemId: uuid('knowledge_item_id').notNull().references(() => knowledgeItems.id, { onDelete: 'cascade' }),
    sourceRevisionId: uuid('source_revision_id').notNull().references(() => petrosDocumentSourceRevisions.id, { onDelete: 'cascade' }),
    preparationId: uuid('preparation_id').notNull().references(() => petrosDocumentPreparations.id, { onDelete: 'cascade' }),
    currentConceptId: text('current_concept_id'),
    progress: jsonb('progress').$type<Record<string, unknown>>().notNull().default({}),
    status: text('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => ({
    learnerRevisionUq: uniqueIndex('petros_document_learner_paths_uq').on(t.institutionId, t.studentId, t.sourceRevisionId),
    learnerIdx: index('petros_document_learner_paths_learner_idx').on(t.institutionId, t.studentId, t.updatedAt),
  }),
);
