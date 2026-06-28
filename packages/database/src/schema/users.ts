import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accountStatusEnum, actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * Institution users belong to EXACTLY ONE institution (enforced by the FK + service rules)
 * but may be granted access to MANY campuses within it. Never combined with independent users.
 */
export const institutionUsers = pgTable(
  'institution_users',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    authUserId: uuid('auth_user_id'),
    email: text('email').notNull(),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    status: accountStatusEnum('status').notNull().default('invited'),
    invitedAt: timestamp('invited_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    mfaEnrolled: boolean('mfa_enrolled').notNull().default(false),
    /** Admin-enforced MFA: the user must enrol before they can next sign in. */
    requireMfa: boolean('require_mfa').notNull().default(false),
    /** Last strong authentication (login or re-auth) — drives the sensitive-action recent-auth gate. */
    lastAuthAt: timestamp('last_auth_at', { withTimezone: true }),
    /** Consecutive failed logins; reset to 0 on success. Drives account lockout. */
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    /** When set and in the future, sign-in is refused (account lockout). */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    /** Direct permission grants/denies layered on top of the user's institution roles. */
    directGrants: jsonb('direct_grants').$type<string[]>().notNull().default([]),
    directDenies: jsonb('direct_denies').$type<string[]>().notNull().default([]),
    /** Security lifecycle stamps — drive the "security" directory filter + audit timeline. */
    passwordResetRequiredAt: timestamp('password_reset_required_at', { withTimezone: true }),
    sessionsRevokedAt: timestamp('sessions_revoked_at', { withTimezone: true }),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    disabledAt: timestamp('disabled_at', { withTimezone: true }),
    disabledReason: text('disabled_reason'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('institution_users_institution_idx').on(t.institutionId),
    emailUniq: index('institution_users_inst_email_uniq').on(t.institutionId, t.email),
    statusIdx: index('institution_users_status_idx').on(t.status),
    // Portal login resolves identity by email across institutions (the composite above leads with
    // institution_id, so it can't serve an email-only probe). (Phase 12 perf.)
    emailLookupIdx: index('institution_users_email_idx').on(t.email),
  }),
);

/** Institution roles (per-institution role keys). */
export const institutionUserRoles = pgTable('institution_user_roles', {
  id: primaryId(),
  institutionUserId: uuid('institution_user_id')
    .notNull()
    .references(() => institutionUsers.id, { onDelete: 'cascade' }),
  roleKey: text('role_key').notNull(),
  ...timestamps,
});

/** Campus access grants — the mechanism that lets one user manage several campuses. */
export const campusUserAccess = pgTable(
  'campus_user_access',
  {
    id: primaryId(),
    institutionUserId: uuid('institution_user_id')
      .notNull()
      .references(() => institutionUsers.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id')
      .notNull()
      .references(() => campuses.id, { onDelete: 'cascade' }),
    /** Access level within the campus (e.g. manage, view). */
    accessLevel: text('access_level').notNull().default('manage'),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    userIdx: index('campus_access_user_idx').on(t.institutionUserId),
    campusIdx: index('campus_access_campus_idx').on(t.campusId),
    uniq: index('campus_access_uniq').on(t.institutionUserId, t.campusId),
  }),
);

/** Independent users — direct learning-product consumers. Entirely separate domain. */
export const independentUsers = pgTable(
  'independent_users',
  {
    id: primaryId(),
    authUserId: uuid('auth_user_id'),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    country: text('country'),
    signupSource: text('signup_source'),
    status: accountStatusEnum('status').notNull().default('active'),
    lastActivityAt: timestamp('last_activity_at', { withTimezone: true }),
    aiUsageLimit: integer('ai_usage_limit'),
    riskFlags: jsonb('risk_flags').$type<string[]>().default([]),
    profile: jsonb('profile').$type<Record<string, unknown>>().default({}),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    statusIdx: index('independent_users_status_idx').on(t.status),
    emailIdx: index('independent_users_email_idx').on(t.email),
  }),
);

export type InstitutionUser = typeof institutionUsers.$inferSelect;
export type NewInstitutionUser = typeof institutionUsers.$inferInsert;
export type InstitutionUserRole = typeof institutionUserRoles.$inferSelect;
export type NewInstitutionUserRole = typeof institutionUserRoles.$inferInsert;
export type CampusUserAccess = typeof campusUserAccess.$inferSelect;
export type NewCampusUserAccess = typeof campusUserAccess.$inferInsert;
export type IndependentUser = typeof independentUsers.$inferSelect;
