import { boolean, index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accountStatusEnum, actorColumns, primaryId, timestamps } from './_helpers';

/** Edrion employees. A separate account type — never trusted implicitly. */
export const platformEmployees = pgTable(
  'platform_employees',
  {
    id: primaryId(),
    /** Links to the Supabase Auth identity (subject). */
    authUserId: uuid('auth_user_id').unique(),
    email: text('email').notNull().unique(),
    fullName: text('full_name').notNull(),
    title: text('title'),
    /** bcrypt hash of the employee's native password (super-admin email+password login). */
    passwordHash: text('password_hash'),
    /** SHA-256(token + pepper) of a single-use password-reset token. */
    passwordResetTokenHash: text('password_reset_token_hash'),
    passwordResetExpiresAt: timestamp('password_reset_expires_at', { withTimezone: true }),
    status: accountStatusEnum('status').notNull().default('active'),
    mfaEnrolled: boolean('mfa_enrolled').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    lastAuthAt: timestamp('last_auth_at', { withTimezone: true }),
    /** Consecutive failed logins; reset to 0 on success. Drives account lockout. */
    failedLoginAttempts: integer('failed_login_attempts').notNull().default(0),
    /** When set and in the future, login is refused (account lockout). */
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    avatarUrl: text('avatar_url'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().default({}),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    emailIdx: index('employees_email_idx').on(t.email),
    statusIdx: index('employees_status_idx').on(t.status),
  }),
);

/** Platform roles — bags of permissions (see @edrion/permissions). DB is authoritative. */
export const platformRoles = pgTable('platform_roles', {
  id: primaryId(),
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  /** System roles cannot be deleted; their permissions may still be edited. */
  isSystem: boolean('is_system').notNull().default(false),
  ...timestamps,
});

/** The permission catalogue, mirrored into the DB for joins and admin UIs. */
export const platformPermissions = pgTable('platform_permissions', {
  key: text('key').primaryKey(),
  group: text('group').notNull(),
  description: text('description').notNull(),
  sensitive: boolean('sensitive').notNull().default(false),
});

export const platformRolePermissions = pgTable(
  'platform_role_permissions',
  {
    id: primaryId(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => platformRoles.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key')
      .notNull()
      .references(() => platformPermissions.key, { onDelete: 'cascade' }),
  },
  (t) => ({
    uniq: index('role_permission_uniq').on(t.roleId, t.permissionKey),
  }),
);

export const employeeRoleAssignments = pgTable(
  'employee_role_assignments',
  {
    id: primaryId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => platformEmployees.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => platformRoles.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by'),
    ...timestamps,
  },
  (t) => ({
    uniq: index('employee_role_uniq').on(t.employeeId, t.roleId),
    byEmployee: index('employee_role_employee_idx').on(t.employeeId),
  }),
);

/**
 * Server-owned authentication sessions. The HTTP-only cookie carries an API-signed JWT whose
 * `sid` references one of these rows. The row is the authority for revocation and for the
 * recent-auth gate: `lastAuthAt` is stamped here on login + strong re-auth, NOT on the
 * employee, so two concurrent sessions don't clobber each other's recent-auth state.
 */
export const authSessions = pgTable(
  'auth_sessions',
  {
    id: primaryId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => platformEmployees.id, { onDelete: 'cascade' }),
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
    byEmployee: index('auth_session_employee_idx').on(t.employeeId),
    activeIdx: index('auth_session_active_idx').on(t.revokedAt, t.expiresAt),
  }),
);

/** Explicit per-employee permission overrides (grants/denies) on top of roles. */
export const employeePermissionOverrides = pgTable(
  'employee_permission_overrides',
  {
    id: primaryId(),
    employeeId: uuid('employee_id')
      .notNull()
      .references(() => platformEmployees.id, { onDelete: 'cascade' }),
    permissionKey: text('permission_key').notNull(),
    /** true = grant, false = deny. Deny wins in evaluation. */
    granted: boolean('granted').notNull(),
    reason: text('reason'),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    byEmployee: index('employee_override_employee_idx').on(t.employeeId),
  }),
);

export type PlatformEmployee = typeof platformEmployees.$inferSelect;
export type NewPlatformEmployee = typeof platformEmployees.$inferInsert;
export type PlatformRole = typeof platformRoles.$inferSelect;
export type NewPlatformRole = typeof platformRoles.$inferInsert;
export type PlatformRolePermission = typeof platformRolePermissions.$inferSelect;
export type EmployeeRoleAssignment = typeof employeeRoleAssignments.$inferSelect;
export type NewEmployeeRoleAssignment = typeof employeeRoleAssignments.$inferInsert;
export type EmployeePermissionOverride = typeof employeePermissionOverrides.$inferSelect;
export type AuthSession = typeof authSessions.$inferSelect;
export type NewAuthSession = typeof authSessions.$inferInsert;
