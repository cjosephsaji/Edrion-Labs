import { boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';

/**
 * INSTITUTION-PORTAL custom roles (Phase 11). The default institution roles live in
 * @edrion/permissions/institution as code (the seed source). This table holds the per-institution
 * CUSTOM roles an admin authors over the institution permission catalogue. The portal auth service
 * merges these on top of the code defaults when evaluating a user's permissions, so editing a role
 * here actually changes access (DB-authoritative, as the roles doc promises).
 *
 * `key` is unique within the institution (a friendly 409 on collision). `is_system` is false for
 * custom roles; the API also surfaces the code default roles as read-only system entries (never
 * stored here). Version-guarded. References only institutions, so plain `.references()` is safe.
 */
export const institutionRoles = pgTable(
  'institution_roles',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    /** Role key, unique within the institution. Lower-snake, e.g. "exam_officer". */
    key: text('key').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    /** The bag of institution permission keys this role grants. */
    permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
    /** Custom roles are never system; reserved for future seeded-into-DB roles. */
    isSystem: boolean('is_system').notNull().default(false),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('institution_roles_institution_idx').on(t.institutionId),
    keyUniq: uniqueIndex('institution_roles_key_uniq').on(t.institutionId, t.key),
  }),
);

export type InstitutionRole = typeof institutionRoles.$inferSelect;
export type NewInstitutionRole = typeof institutionRoles.$inferInsert;
