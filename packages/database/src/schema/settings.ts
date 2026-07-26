import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL settings tree (Phase 11). A flat, campus-scoped, version-guarded key/value
 * store the web renders as a grouped tree (by `category`). A setting belongs to the whole
 * institution (campus_id NULL) or to a single campus. `(institution_id, campus_id, category, key)`
 * is logically unique — the service pre-checks it for a friendly 409 (a unique index can't express
 * "NULL campus = institution-owned" cleanly, since SQL treats NULLs as distinct).
 *
 * Reads need `institution_settings.view`; writes need the sensitive `institution_settings.manage`
 * (campus-level writes also accept `campus_settings.manage`). References only institutions/campuses,
 * so plain `.references()` is safe (no Drizzle type cycle).
 */
export const institutionSettings = pgTable(
  'institution_settings',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    /** Group in the settings tree, e.g. general | academic | branding | localization | notifications | security. */
    category: text('category').notNull(),
    /** Setting key, unique within (institution, campus, category). */
    key: text('key').notNull(),
    /** Human label shown in the tree. */
    label: text('label').notNull(),
    /** string | number | boolean | json — how the value text is interpreted. */
    valueType: text('value_type').notNull().default('string'),
    /** Serialized value (numbers/booleans/json stored as text; the type drives parsing). */
    value: text('value'),
    description: text('description'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('institution_settings_institution_idx').on(t.institutionId),
    scopeIdx: index('institution_settings_institution_campus_idx').on(t.institutionId, t.campusId),
    categoryIdx: index('institution_settings_category_idx').on(t.institutionId, t.category),
  }),
);

export type InstitutionSetting = typeof institutionSettings.$inferSelect;
export type NewInstitutionSetting = typeof institutionSettings.$inferInsert;
