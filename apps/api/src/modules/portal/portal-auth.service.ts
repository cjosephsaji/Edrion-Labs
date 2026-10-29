import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { eq, schema, type Database, type InstitutionUser } from '@edrion/database';
import { evaluatePermissions, type RoleDef } from '@edrion/permissions';
import { INSTITUTION_DEFAULT_ROLES } from '@edrion/permissions/institution';
import type { InstitutionPrincipal } from '@edrion/auth';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, DATABASE } from '../../common/tokens';

/** Role keys that grant institution-wide reach (all campuses + the "Entire Institution" scope). */
const INSTITUTION_WIDE_ROLES = new Set(['institution_owner', 'institution_admin']);

/**
 * Resolves the InstitutionPrincipal for a portal request from the institution_users /
 * institution_user_roles / campus_user_access tables, evaluating the institution permission set.
 * Mirrors the platform AuthService but for tenant users. The principal is authoritative — guards
 * and services check the evaluated permission set + scope, never a role name.
 */
@Injectable()
export class PortalAuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /**
   * Dev-header path: resolve a principal by email. The recent-auth window is driven by the caller
   * (the guard stamps it `now` for the dev escape hatch, which has no server session).
   */
  async resolveByEmail(email: string, lastAuthAt?: Date): Promise<InstitutionPrincipal> {
    const user = await this.loadActiveByEmail(email);
    if (!user) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'No such institution user' });
    }
    return this.build(user, lastAuthAt ?? user.lastAuthAt ?? null);
  }

  /** Cookie path: resolve by id; recent-auth is driven by the SESSION's lastAuthAt, not the user. */
  async resolveById(
    institutionUserId: string,
    lastAuthAt: Date | null,
    sessionAal?: import('@edrion/auth').Aal,
  ): Promise<InstitutionPrincipal> {
    const [user] = await this.db
      .select()
      .from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.id, institutionUserId))
      .limit(1);
    if (!user || user.status !== 'active' || user.disabledAt) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown or disabled user' });
    }
    return this.build(user, lastAuthAt, sessionAal);
  }

  // --- Login resolution + account lockout (Phase 12) --------------------------

  /** Legacy/dev lookup is safe only for an unambiguous, activated membership. */
  async loadActiveByEmail(email: string): Promise<InstitutionUser | undefined> {
    const users = await this.loadAllActiveByEmail(email);
    return users.length === 1 ? users[0] : undefined;
  }

  async loadActiveByAuthUserId(authUserId: string): Promise<InstitutionUser | undefined> {
    const users = await this.loadAllActiveByAuthUserId(authUserId);
    return users.length === 1 ? users[0] : undefined;
  }

  /** Identity discovery happens outside a tenant transaction; access is still checked per user. */
  async loadAllActiveByEmail(email: string): Promise<InstitutionUser[]> {
    const users = await this.db.select().from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.email, email.trim().toLowerCase()));
    return users.filter((user) => user.status === 'active' && !user.disabledAt);
  }

  async loadAllActiveByAuthUserId(authUserId: string): Promise<InstitutionUser[]> {
    const users = await this.db.select().from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.authUserId, authUserId));
    return users.filter((user) => user.status === 'active' && !user.disabledAt);
  }

  async loadActiveById(id: string): Promise<InstitutionUser | undefined> {
    const [user] = await this.db.select().from(schema.institutionUsers)
      .where(eq(schema.institutionUsers.id, id)).limit(1);
    return user?.status === 'active' && !user.disabledAt ? user : undefined;
  }

  async institutionNames(users: InstitutionUser[]): Promise<Map<string, string>> {
    const names = await Promise.all(users.map(async (user) => {
      const [institution] = await this.db.select({ name: schema.institutions.displayName })
        .from(schema.institutions).where(eq(schema.institutions.id, user.institutionId)).limit(1);
      return [user.institutionId, institution?.name ?? 'Institution'] as const;
    }));
    return new Map(names);
  }

  /** True when the account is currently locked out (failed-login threshold exceeded). */
  isLocked(user: InstitutionUser, now: Date = new Date()): boolean {
    return Boolean(user.lockedUntil && user.lockedUntil.getTime() > now.getTime());
  }

  /**
   * Record a failed login. At the configured threshold the account is locked for the lockout
   * window. Returns whether the account is now locked (so the caller can audit a lockout).
   */
  async registerFailedLogin(userId: string, currentAttempts: number): Promise<boolean> {
    const attempts = currentAttempts + 1;
    const locked = attempts >= this.env.AUTH_MAX_FAILED_LOGINS;
    await this.db
      .update(schema.institutionUsers)
      .set({
        failedLoginAttempts: attempts,
        lockedUntil: locked ? new Date(Date.now() + this.env.AUTH_LOCKOUT_SECONDS * 1000) : null,
        lockedAt: locked ? new Date() : null,
      })
      .where(eq(schema.institutionUsers.id, userId));
    return locked;
  }

  /** Clear the failed-login counter + lockout and stamp lastLoginAt/lastAuthAt — on success. */
  async markLoginSuccess(userId: string, now: Date = new Date()): Promise<void> {
    await this.db
      .update(schema.institutionUsers)
      .set({
        failedLoginAttempts: 0,
        lockedUntil: null,
        lockedAt: null,
        lastLoginAt: now,
        lastAuthAt: now,
      })
      .where(eq(schema.institutionUsers.id, userId));
  }

  /** Build a principal from a loaded institution_users row. */
  private async build(
    user: typeof schema.institutionUsers.$inferSelect,
    lastAuthAt: Date | null,
    sessionAal?: import('@edrion/auth').Aal,
  ): Promise<InstitutionPrincipal> {
    const [roleRows, accessRows, customRoleRows] = await Promise.all([
      this.db
        .select({ roleKey: schema.institutionUserRoles.roleKey })
        .from(schema.institutionUserRoles)
        .where(eq(schema.institutionUserRoles.institutionUserId, user.id)),
      this.db
        .select({ campusId: schema.campusUserAccess.campusId })
        .from(schema.campusUserAccess)
        .where(eq(schema.campusUserAccess.institutionUserId, user.id)),
      this.db
        .select({
          key: schema.institutionRoles.key,
          name: schema.institutionRoles.name,
          description: schema.institutionRoles.description,
          permissions: schema.institutionRoles.permissions,
        })
        .from(schema.institutionRoles)
        .where(eq(schema.institutionRoles.institutionId, user.institutionId)),
    ]);

    const roleKeys = roleRows.map((r) => r.roleKey);
    const allowedCampusIds = accessRows.map((a) => a.campusId);

    // The Roles editor authors per-institution CUSTOM roles in the DB; they layer on top of (and a
    // same-keyed custom role overrides) the code defaults, so editing a role here changes access.
    const customRoleDefs: RoleDef[] = customRoleRows.map((r) => ({
      key: r.key,
      name: r.name,
      description: r.description ?? '',
      permissions: r.permissions ?? [],
    }));

    const permissions = evaluatePermissions(
      {
        roleKeys,
        directGrants: user.directGrants ?? [],
        directDenies: user.directDenies ?? [],
      },
      [...INSTITUTION_DEFAULT_ROLES, ...customRoleDefs],
    );

    const isInstitutionWide =
      permissions.hasWildcard || roleKeys.some((k) => INSTITUTION_WIDE_ROLES.has(k));

    return {
      institutionUserId: user.id,
      institutionId: user.institutionId,
      email: user.email,
      fullName: user.fullName,
      roleKeys,
      permissions,
      allowedCampusIds,
      isInstitutionWide,
      mfaEnrolled: user.mfaEnrolled,
      lastAuthAt,
      sessionAal,
      // institutionName isn't on the principal type; resolved separately where needed.
    } satisfies InstitutionPrincipal;
  }
}
