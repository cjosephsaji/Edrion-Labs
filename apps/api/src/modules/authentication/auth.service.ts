import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { and, eq, inArray, schema, type Database, type PlatformEmployee } from '@edrion/database';
import type { EmployeePrincipal, PrincipalContext, SupportAccessContext } from '@edrion/auth';
import type { EvaluatedPermissions } from '@edrion/permissions';
import type { ApiEnv } from '@edrion/config';
import { API_ENV, DATABASE } from '../../common/tokens';

/**
 * Resolves the authenticated employee + their effective permissions from the database.
 *
 * Identity arrives one of two ways (see AuthGuard): the verified session cookie (production), or
 * — only when AUTH_DEV_HEADER is enabled — the legacy `x-employee-email` header. Either way the
 * permission set is loaded authoritatively from the DB, never from the client, and `lastAuthAt`
 * (which drives the recent-auth gate) comes from the session, not from the request.
 */
@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  // --- Principal resolution (used by the guard on every request) --------------

  /** Dev-header path: resolve by email, recent-auth driven by the employee's own lastAuthAt. */
  async resolveByEmail(email: string): Promise<PrincipalContext> {
    const employee = await this.findActiveByEmail(email);
    if (!employee) {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown or inactive employee' });
    }
    return this.buildPrincipalContext(employee, employee.lastAuthAt);
  }

  /** Cookie path: resolve by employee id, recent-auth driven by the SESSION's lastAuthAt. */
  async resolveById(employeeId: string, lastAuthAt: Date | null): Promise<PrincipalContext> {
    const [employee] = await this.db
      .select()
      .from(schema.platformEmployees)
      .where(eq(schema.platformEmployees.id, employeeId))
      .limit(1);
    if (!employee || employee.status !== 'active') {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Unknown or inactive employee' });
    }
    return this.buildPrincipalContext(employee, lastAuthAt);
  }

  /** Load roles + overrides and assemble the principal context. The single evaluation path. */
  private async buildPrincipalContext(
    employee: PlatformEmployee,
    lastAuthAt: Date | null,
  ): Promise<PrincipalContext> {
    const assignments = await this.db
      .select({ roleId: schema.employeeRoleAssignments.roleId, key: schema.platformRoles.key })
      .from(schema.employeeRoleAssignments)
      .innerJoin(schema.platformRoles, eq(schema.platformRoles.id, schema.employeeRoleAssignments.roleId))
      .where(eq(schema.employeeRoleAssignments.employeeId, employee.id));

    const roleIds = assignments.map((a) => a.roleId);
    const roleKeys = assignments.map((a) => a.key);

    const rolePerms = roleIds.length
      ? await this.db
          .select({ key: schema.platformRolePermissions.permissionKey })
          .from(schema.platformRolePermissions)
          .where(inArray(schema.platformRolePermissions.roleId, roleIds))
      : [];

    const overrides = await this.db
      .select()
      .from(schema.employeePermissionOverrides)
      .where(eq(schema.employeePermissionOverrides.employeeId, employee.id));

    const keys = new Set<string>(rolePerms.map((p) => p.key));
    for (const o of overrides) {
      if (o.granted) keys.add(o.permissionKey);
      else keys.delete(o.permissionKey);
    }

    const permissions: EvaluatedPermissions = { keys, hasWildcard: keys.has('*') };

    const principal: EmployeePrincipal = {
      employeeId: employee.id,
      email: employee.email,
      fullName: employee.fullName,
      roleKeys,
      permissions,
      mfaEnrolled: employee.mfaEnrolled,
      lastAuthAt,
    };

    return { principal };
  }

  // --- Login resolution + account lockout -------------------------------------

  async findActiveByEmail(email: string): Promise<PlatformEmployee | undefined> {
    const [employee] = await this.db
      .select()
      .from(schema.platformEmployees)
      .where(eq(schema.platformEmployees.email, email))
      .limit(1);
    return employee && employee.status === 'active' ? employee : undefined;
  }

  async findActiveByAuthUserId(authUserId: string): Promise<PlatformEmployee | undefined> {
    const [employee] = await this.db
      .select()
      .from(schema.platformEmployees)
      .where(eq(schema.platformEmployees.authUserId, authUserId))
      .limit(1);
    return employee && employee.status === 'active' ? employee : undefined;
  }

  /** True when the account is currently locked out (failed-login threshold exceeded). */
  isLocked(employee: PlatformEmployee, now: Date = new Date()): boolean {
    return Boolean(employee.lockedUntil && employee.lockedUntil.getTime() > now.getTime());
  }

  /**
   * Record a failed login. At the configured threshold the account is locked for the lockout
   * window. Returns whether the account is now locked (so the caller can audit a lockout).
   */
  async registerFailedLogin(employeeId: string, currentAttempts: number): Promise<boolean> {
    const attempts = currentAttempts + 1;
    const locked = attempts >= this.env.AUTH_MAX_FAILED_LOGINS;
    await this.db
      .update(schema.platformEmployees)
      .set({
        failedLoginAttempts: attempts,
        lockedUntil: locked ? new Date(Date.now() + this.env.AUTH_LOCKOUT_SECONDS * 1000) : null,
      })
      .where(eq(schema.platformEmployees.id, employeeId));
    return locked;
  }

  /** Clear the failed-login counter + lockout, and stamp lastLoginAt — on a successful login. */
  async markLoginSuccess(employeeId: string, now: Date = new Date()): Promise<void> {
    await this.db
      .update(schema.platformEmployees)
      .set({ failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: now, lastAuthAt: now })
      .where(eq(schema.platformEmployees.id, employeeId));
  }

  // --- Support access (unchanged) ---------------------------------------------

  /** Load + validate a live support-access session for the support-mode banner + audit. */
  async resolveSupportSession(sessionId: string, employeeId: string): Promise<SupportAccessContext | undefined> {
    const [session] = await this.db
      .select()
      .from(schema.supportAccessSessions)
      .where(
        and(
          eq(schema.supportAccessSessions.id, sessionId),
          eq(schema.supportAccessSessions.employeeId, employeeId),
        ),
      )
      .limit(1);

    if (!session || session.status !== 'active' || session.expiresAt.getTime() < Date.now()) {
      return undefined;
    }
    const [inst] = await this.db
      .select({ name: schema.institutions.displayName })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, session.institutionId))
      .limit(1);

    return {
      sessionId: session.id,
      institutionId: session.institutionId,
      institutionName: inst?.name ?? 'Institution',
      reason: session.reason,
      caseRef: session.caseRef ?? undefined,
      expiresAt: session.expiresAt,
      accessLevel: session.accessLevel,
    };
  }
}
