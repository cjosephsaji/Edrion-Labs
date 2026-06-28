import { index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL IT module (Phase 13 — IT Staff). Campus-scoped, version-guarded. `devices`
 * (asset register) and `access_requests` (triage queue). IT security actions
 * (users.reset_security / users.revoke_sessions) act on institution_users + portal_sessions and
 * need no new table; security_events.view_limited reads a filtered audit projection.
 */
export const devices = pgTable(
  'devices',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** laptop | desktop | printer | projector | network | other. */
    kind: text('kind').notNull().default('laptop'),
    assetTag: text('asset_tag'),
    assignedTo: text('assigned_to'),
    /** active | repair | retired. */
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('devices_institution_idx').on(t.institutionId),
    scopeIdx: index('devices_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('devices_status_idx').on(t.status),
  }),
);

export const accessRequests = pgTable(
  'access_requests',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    requesterName: text('requester_name').notNull(),
    system: text('system'),
    reason: text('reason'),
    /** low | medium | high. */
    priority: text('priority').notNull().default('medium'),
    /** open | approved | denied | closed. */
    status: text('status').notNull().default('open'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('access_requests_institution_idx').on(t.institutionId),
    scopeIdx: index('access_requests_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('access_requests_status_idx').on(t.status),
  }),
);

export type Device = typeof devices.$inferSelect;
export type NewDevice = typeof devices.$inferInsert;
export type AccessRequest = typeof accessRequests.$inferSelect;
export type NewAccessRequest = typeof accessRequests.$inferInsert;
