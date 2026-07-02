import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL recipient targeting (admin-redesign Phase 3). Announcements/notifications (and,
 * later, messages) target recipients via a small, uniform "target spec" instead of a single audience
 * enum. A target is a `(kind, refId)` pair:
 *   - individuals:  student | parent | teacher | staff          → refId = the person id
 *   - structures:   class | grade | department | campus          → refId = the entity id
 *   - derived:      parents_of_class | parents_of_grade | parents_of_department |
 *                   teachers_of_class | teachers_of_grade | teachers_of_department |
 *                   students_of_class | students_of_grade | students_of_department |
 *                   students_of_subject                          → refId = the anchor entity id
 *   - broadcast:    all | all_students | all_parents | all_teachers | all_staff → refId = null
 *   - group:        group                                        → refId = a recipient_groups id
 * The RecipientResolver expands a target list to concrete, de-duplicated, scope-confined people.
 *
 * `recipient_groups` are reusable saved/custom groups; their members use the SAME target shape, so a
 * group is just a named bundle of targets (a group must not contain another group — the resolver
 * ignores nested groups to stop cycles). References only institutions/campuses, so plain
 * `.references()` is safe.
 */
export const recipientGroups = pgTable(
  'recipient_groups',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('recipient_groups_institution_idx').on(t.institutionId),
    scopeIdx: index('recipient_groups_institution_campus_idx').on(t.institutionId, t.campusId),
  }),
);

/** A member of a saved recipient group — one target spec. Reachable only through its group. */
export const recipientGroupMembers = pgTable(
  'recipient_group_members',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    groupId: uuid('group_id')
      .notNull()
      .references(() => recipientGroups.id, { onDelete: 'cascade' }),
    /** The target kind (see file header). */
    kind: text('kind').notNull(),
    /** The anchor/entity id for the kind; null for broadcast kinds. */
    refId: uuid('ref_id'),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('recipient_group_members_institution_idx').on(t.institutionId),
    groupIdx: index('recipient_group_members_group_idx').on(t.groupId),
  }),
);

export type RecipientGroup = typeof recipientGroups.$inferSelect;
export type NewRecipientGroup = typeof recipientGroups.$inferInsert;
export type RecipientGroupMember = typeof recipientGroupMembers.$inferSelect;
export type NewRecipientGroupMember = typeof recipientGroupMembers.$inferInsert;
