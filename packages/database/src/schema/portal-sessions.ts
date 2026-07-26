import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { institutionUsers } from './users';

/**
 * Server-owned authentication sessions for INSTITUTION-PORTAL users — the tenant-facing twin of
 * `auth_sessions` (which is platform-employee only). The HTTP-only portal cookie carries an
 * API-signed JWT whose `sid` references one of these rows. The row is the authority for
 * revocation and for the recent-auth gate: `lastAuthAt` is stamped here on login + strong re-auth,
 * NOT on the user row, so two concurrent sessions don't clobber each other's recent-auth state.
 * Carries `institution_id` so the tenant RLS policy + the `app.institution_id` GUC bind to it.
 */
export const portalSessions = pgTable(
  'portal_sessions',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    institutionUserId: uuid('institution_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    /** Supabase session id / IdP correlation, when login came via a verified access token. */
    idpSessionId: text('idp_session_id'),
    /** AAL of the authenticating token: 'aal1' (password) or 'aal2' (MFA satisfied). */
    aal: text('aal').notNull().default('aal1'),
    /** Last strong authentication (login or re-auth). Drives the recent-auth window. */
    lastAuthAt: timestamp('last_auth_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** Set when the session is logged out or admin-revoked; a revoked session never resolves. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedReason: text('revoked_reason'),
    ip: text('ip'),
    userAgent: text('user_agent'),
    ...timestamps,
  },
  (t) => ({
    instIdx: index('portal_session_institution_idx').on(t.institutionId),
    byUser: index('portal_session_user_idx').on(t.institutionUserId),
    activeIdx: index('portal_session_active_idx').on(t.revokedAt, t.expiresAt),
  }),
);

/**
 * A pending invitation for an institution user. `users.invite` creates the (status `invited`) user
 * row AND an invitation here, then a real invitation email is sent carrying a signed accept link
 * that references this row. The token itself is never stored (the email link is the bearer);
 * acceptance stamps `acceptedAt`. Expired/accepted invitations can't be re-used.
 */
export const portalInvitations = pgTable(
  'portal_invitations',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    institutionUserId: uuid('institution_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    email: text('email').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('portal_invitation_institution_idx').on(t.institutionId),
    byUser: index('portal_invitation_user_idx').on(t.institutionUserId),
  }),
);

export type PortalSession = typeof portalSessions.$inferSelect;
export type NewPortalSession = typeof portalSessions.$inferInsert;
export type PortalInvitation = typeof portalInvitations.$inferSelect;
export type NewPortalInvitation = typeof portalInvitations.$inferInsert;
