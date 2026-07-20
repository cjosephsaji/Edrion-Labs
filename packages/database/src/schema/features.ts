import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import type { FeatureScope } from '@edrion/shared-types';
import {
  actorColumns,
  featureDefinitionStatusEnum,
  featureReleaseStageEnum,
  featureRolloutTypeEnum,
  featureScopeEnum,
  primaryId,
  timestamps,
} from './_helpers';

/**
 * Feature control. Features live in a registry (feature_definitions), not scattered `if` checks.
 * Values attach at scopes (feature_assignments) and rollouts (feature_rollouts) layer
 * percentage / allow-list / block-list / environment / schedule + emergency kill switch on top.
 * Resolution is deterministic — see packages/feature-flags + docs/FEATURE-RESOLUTION.md.
 */
export const featureDefinitions = pgTable(
  'feature_definitions',
  {
    id: primaryId(),
    key: text('key').notNull().unique(),
    name: text('name').notNull(),
    description: text('description'),
    module: text('module').notNull(),
    status: featureDefinitionStatusEnum('status').notNull().default('active'),
    /** Global default value when no assignment or rollout applies. */
    defaultValue: boolean('default_value').notNull().default(false),
    /** Scopes the registry advertises as assignable for this feature. */
    availableScopes: jsonb('available_scopes').$type<FeatureScope[]>().default([]),
    /** Other feature keys this one depends on. */
    dependencies: jsonb('dependencies').$type<string[]>().default([]),
    releaseStage: featureReleaseStageEnum('release_stage').notNull().default('internal'),
    owner: text('owner'),
    /** Optimistic-concurrency token for sensitive edits. */
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    keyIdx: index('feature_definitions_key_idx').on(t.key),
    moduleIdx: index('feature_definitions_module_idx').on(t.module),
    statusIdx: index('feature_definitions_status_idx').on(t.status),
  }),
);

/** A feature value attached at a scope (global/plan/institution/campus/user/role). */
export const featureAssignments = pgTable(
  'feature_assignments',
  {
    id: primaryId(),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => featureDefinitions.id, { onDelete: 'cascade' }),
    scope: featureScopeEnum('scope').notNull(),
    /** Id the assignment attaches to (plan/institution/campus/user id or role key). Null = global. */
    scopeId: text('scope_id'),
    value: boolean('value').notNull().default(true),
    /** Soft on/off for the assignment row itself; a disabled row is ignored on resolution. */
    enabled: boolean('enabled').notNull().default(true),
    activatesAt: timestamp('activates_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    reason: text('reason'),
    setByName: text('set_by_name'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    featureIdx: index('feature_assignments_feature_idx').on(t.featureId),
    scopeIdx: index('feature_assignments_scope_idx').on(t.scope, t.scopeId),
  }),
);

/** Rollout modifiers + emergency kill switch (type='kill_switch'). */
export const featureRollouts = pgTable(
  'feature_rollouts',
  {
    id: primaryId(),
    featureId: uuid('feature_id')
      .notNull()
      .references(() => featureDefinitions.id, { onDelete: 'cascade' }),
    type: featureRolloutTypeEnum('type').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    /** 0..100 for percentage rollouts. */
    percentage: integer('percentage'),
    allowList: jsonb('allow_list').$type<string[]>().default([]),
    blockList: jsonb('block_list').$type<string[]>().default([]),
    environments: jsonb('environments').$type<string[]>().default([]),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    reason: text('reason'),
    setByName: text('set_by_name'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    featureIdx: index('feature_rollouts_feature_idx').on(t.featureId),
    typeIdx: index('feature_rollouts_type_idx').on(t.type),
  }),
);

/** Read-only analytics/reference mirror of the deployment-controlled student-module catalogue. */
export const studentModules = pgTable('student_modules', {
  key: text('key').primaryKey(),
  category: text('category').notNull(),
  minTier: text('min_tier').notNull(),
  seededAt: timestamp('seeded_at', { withTimezone: true }).notNull().defaultNow(),
});

export type FeatureDefinition = typeof featureDefinitions.$inferSelect;
export type NewFeatureDefinition = typeof featureDefinitions.$inferInsert;
export type FeatureAssignment = typeof featureAssignments.$inferSelect;
export type NewFeatureAssignment = typeof featureAssignments.$inferInsert;
export type FeatureRollout = typeof featureRollouts.$inferSelect;
export type NewFeatureRollout = typeof featureRollouts.$inferInsert;
export type StudentModule = typeof studentModules.$inferSelect;
