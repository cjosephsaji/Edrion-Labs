import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { can } from '@edrion/permissions';
import {
  ALL_INSTITUTION_PERMISSION_KEYS,
  CAMPUS_ADMIN_ASSIGNABLE_ROLE_KEYS,
  INSTITUTION_DEFAULT_ROLES,
  isCampusAdminAssignableRole,
} from '@edrion/permissions/institution';
import type {
  InvitePortalUserInput,
  PortalUserStatusActionInput,
  PortalUsersListQuery,
  SetPortalUserAccessInput,
  UpdatePortalUserInput,
} from '@edrion/schemas';
import { computeEffectiveAccess } from '@edrion/schemas';
import type { InstitutionUser } from '@edrion/database';
import { resolveScopeFilter } from '@edrion/auth';
import { AccountStatus } from '@edrion/shared-types';
import { AUDIT_WRITER } from '../../common/tokens';
import type { ListResult } from './academics.service';
import { PeopleRepository } from './people.repository';
import { UsersRepository } from './users.repository';
import { RolesRepository } from './roles.repository';
import { PortalInviteService } from './portal-invite.service';
import { PortalSessionService } from './portal-session.service';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-users';
const VALID_GRANT_KEYS = new Set<string>(ALL_INSTITUTION_PERMISSION_KEYS);
const DEFAULT_ROLE_KEYS = new Set(INSTITUTION_DEFAULT_ROLES.map((r) => r.key));
const TEACH_PERMISSION = 'academics.teach';
const MESSAGE_PERMISSION = 'messages.use';

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((v) => set.has(v));
}

export interface UserView extends InstitutionUser {
  roleKeys: string[];
  campusIds: string[];
  campusCount: number;
}

/**
 * Institution-portal User Management service (Phase 11) over institution_users +
 * institution_user_roles + campus_user_access + the directGrants/directDenies overrides. Inviting
 * needs `users.invite`; editing/disabling needs the sensitive `users.manage`; assigning
 * roles/campus access/overrides needs the sensitive `users.manage_roles`. Role keys are validated
 * against the default ∪ custom catalogue; campus ids must belong to the institution; override keys
 * against the permission catalogue. A user can't disable or delete themselves (lock-out guard).
 * Every mutation is audited.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly repo: UsersRepository,
    private readonly peopleRepo: PeopleRepository,
    private readonly roles: RolesRepository,
    private readonly invites: PortalInviteService,
    private readonly sessions: PortalSessionService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: PortalUsersListQuery): Promise<ListResult<UserView>> {
    const institutionId = ctx.principal.institutionId;
    const roleFilterIds = q.roleKey ? await this.repo.userIdsWithRole(institutionId, q.roleKey) : null;
    const permissionFilterIds = q.permission ? await this.repo.userIdsWithPermission(institutionId, q.permission) : null;
    const provisionedIds =
      q.provisionedFromStaff === true ? await this.repo.userIdsProvisionedFromStaff(institutionId) : null;
    const excludeProvisionedIds =
      q.provisionedFromStaff === false ? await this.repo.userIdsProvisionedFromStaff(institutionId) : null;
    const page = await this.repo.list(
      institutionId,
      roleFilterIds,
      permissionFilterIds,
      provisionedIds,
      excludeProvisionedIds,
      q,
    );
    const ids = page.items.map((u) => u.id);
    const [roleMap, campusMap] = await Promise.all([this.repo.rolesForUsers(ids), this.repo.campusIdsForUsers(ids)]);
    const items = page.items.map((u) => this.toView(u, roleMap.get(u.id) ?? [], campusMap.get(u.id) ?? []));
    return { items, total: page.total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  async get(ctx: PortalActionContext, id: string): Promise<UserView> {
    const user = await this.require(ctx, id);
    const [roleKeys, campusIds] = await Promise.all([this.repo.getRoleKeys(id), this.repo.getCampusIds(id)]);
    return this.toView(user, roleKeys, campusIds);
  }

  /** Portal users the caller can message — gated by messages.use, not users.view. */
  async listMessagingColleagues(ctx: PortalActionContext) {
    const institutionId = ctx.principal.institutionId;
    const campusIds = resolveScopeFilter(ctx.principal, ctx.scope).campusIds;
    const messageableIds = await this.repo.userIdsWithPermission(institutionId, MESSAGE_PERMISSION);
    const items = await this.repo.listMessagingColleagues(
      institutionId,
      messageableIds,
      campusIds,
      ctx.principal.institutionUserId,
    );
    return { items, total: items.length };
  }

  async invite(
    ctx: PortalActionContext,
    input: InvitePortalUserInput,
    opts?: { skipStaffDirectory?: boolean },
  ) {
    const institutionId = ctx.principal.institutionId;
    const email = input.email.toLowerCase();
    if (await this.repo.findByEmail(institutionId, email)) {
      throw new ConflictException({ code: 'USER_EXISTS', message: `A user with email "${email}" already exists.` });
    }
    const roleKeys = await this.validateRoleKeys(ctx, input.roleKeys);
    const campusIds = await this.validateCampusIds(institutionId, input.campusIds);
    if (roleKeys.length === 0) {
      throw new BadRequestException({
        code: 'ROLE_REQUIRED',
        message: 'Assign at least one role when inviting a portal user.',
      });
    }

    const user = await this.repo.insert({
      institutionId,
      email,
      fullName: input.fullName,
      phone: input.phone ?? null,
      status: 'invited',
      invitedAt: new Date(),
      requireMfa: input.requireMfa,
      createdBy: ctx.principal.institutionUserId,
    });
    if (roleKeys.length > 0 || campusIds.length > 0) {
      await this.repo.replaceAccess(user.id, user.version, {
        roleKeys,
        campusIds,
        directGrants: [],
        directDenies: [],
        actorId: ctx.principal.institutionUserId,
      });
    }

    if (!opts?.skipStaffDirectory) {
      await this.ensureStaffDirectoryRow(ctx, user, roleKeys, campusIds);
    }

    // Send the real invitation email (persists a portal_invitations row + a signed accept link).
    const sent = await this.invites.invite({
      institutionId,
      institutionUserId: user.id,
      email,
      fullName: user.fullName,
      invitedBy: ctx.principal.institutionUserId,
    });

    await this.write(ctx, 'user.invite', user.id, {
      newState: {
        email,
        fullName: user.fullName,
        roleKeys,
        campusCount: campusIds.length,
        invitationId: sent.invitation.id,
        invitationEmailSent: true,
        emailTransport: sent.emailTransport,
      },
    });
    const fresh = (await this.repo.find(user.id, institutionId))!;
    return { ...this.toView(fresh, roleKeys, campusIds), invitationSent: true };
  }

  async update(ctx: PortalActionContext, id: string, input: UpdatePortalUserInput) {
    const existing = await this.require(ctx, id);
    if (input.status && input.status !== existing.status && id === ctx.principal.institutionUserId && input.status !== 'active') {
      throw new ForbiddenException({ code: 'CANNOT_DISABLE_SELF', message: 'You cannot change your own account status.' });
    }
    const patch: Record<string, unknown> = {
      fullName: input.fullName ?? existing.fullName,
      phone: input.phone === undefined ? existing.phone : input.phone,
      requireMfa: input.requireMfa ?? existing.requireMfa,
      updatedBy: ctx.principal.institutionUserId,
    };
    if (input.status) {
      patch.status = input.status;
      if (input.status === AccountStatus.Disabled) {
        patch.disabledAt = new Date();
        patch.disabledReason = input.disabledReason ?? null;
      } else {
        patch.disabledAt = null;
        patch.disabledReason = null;
      }
    }
    const updated = await this.repo.update(id, input.version, patch);
    if (!updated) throw this.versionConflict();
    const [roleKeys, campusIds] = await Promise.all([this.repo.getRoleKeys(id), this.repo.getCampusIds(id)]);
    await this.ensureStaffDirectoryRow(ctx, updated, roleKeys, campusIds, updated.directGrants ?? []);
    await this.syncStaffProfile(ctx, updated);
    await this.write(ctx, 'user.update', id, {
      previousState: { status: existing.status, fullName: existing.fullName },
      newState: {
        status: updated.status,
        fullName: updated.fullName,
        ...(input.status === AccountStatus.Disabled ? { disabledReason: input.disabledReason } : {}),
      },
    });
    return this.toView(updated, roleKeys, campusIds);
  }

  /** Suspend (disable) a portal user. Reason is required and stored on the account. */
  async suspend(ctx: PortalActionContext, id: string, input: PortalUserStatusActionInput) {
    const existing = await this.require(ctx, id);
    if (id === ctx.principal.institutionUserId) {
      throw new ForbiddenException({ code: 'CANNOT_DISABLE_SELF', message: 'You cannot suspend your own account.' });
    }
    if (existing.status === AccountStatus.Disabled) {
      throw new BadRequestException({ code: 'ALREADY_SUSPENDED', message: 'This user is already suspended.' });
    }
    await this.sessions.revokeAllForUser(id, 'user_suspended');
    const updated = await this.repo.update(id, input.version, {
      status: AccountStatus.Disabled,
      disabledAt: new Date(),
      disabledReason: input.reason,
      sessionsRevokedAt: new Date(),
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    const [roleKeys, campusIds] = await Promise.all([this.repo.getRoleKeys(id), this.repo.getCampusIds(id)]);
    await this.write(ctx, 'user.suspend', id, {
      reason: input.reason,
      previousState: { status: existing.status },
      newState: { status: updated.status, disabledReason: input.reason, sessionsRevoked: true },
    });
    return this.toView(updated, roleKeys, campusIds);
  }

  /** Unsuspend (re-enable) a previously suspended portal user. */
  async unsuspend(ctx: PortalActionContext, id: string, input: PortalUserStatusActionInput) {
    const existing = await this.require(ctx, id);
    if (existing.status !== AccountStatus.Disabled && !existing.disabledAt) {
      throw new BadRequestException({ code: 'NOT_SUSPENDED', message: 'This user is not suspended.' });
    }
    const updated = await this.repo.update(id, input.version, {
      status: AccountStatus.Active,
      disabledAt: null,
      disabledReason: null,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    const [roleKeys, campusIds] = await Promise.all([this.repo.getRoleKeys(id), this.repo.getCampusIds(id)]);
    await this.write(ctx, 'user.unsuspend', id, {
      reason: input.reason,
      previousState: { status: existing.status, disabledReason: existing.disabledReason },
      newState: { status: updated.status },
    });
    return this.toView(updated, roleKeys, campusIds);
  }

  async setAccess(ctx: PortalActionContext, id: string, input: SetPortalUserAccessInput) {
    const institutionId = ctx.principal.institutionId;
    const existing = await this.require(ctx, id);
    if (id === ctx.principal.institutionUserId) {
      throw new ForbiddenException({
        code: 'CANNOT_EDIT_OWN_ROLES',
        message: 'You cannot change your own roles or access. Ask another administrator.',
      });
    }
    const roleKeys = await this.validateRoleKeys(ctx, input.roleKeys, id);
    const campusIds = await this.validateCampusIds(institutionId, input.campusIds);
    let directGrants = this.validateOverrides(input.directGrants, 'directGrants');
    let directDenies = this.validateOverrides(input.directDenies, 'directDenies');
    if (!this.canManageRoles(ctx)) {
      const existingGrants = existing.directGrants ?? [];
      const existingDenies = existing.directDenies ?? [];
      if (!sameStringSet(directGrants, existingGrants) || !sameStringSet(directDenies, existingDenies)) {
        throw new ForbiddenException({
          code: 'OVERRIDES_NOT_PERMITTED',
          message: 'You cannot set direct permission overrides. Assign roles instead.',
        });
      }
      directGrants = existingGrants;
      directDenies = existingDenies;
    }

    const updated = await this.repo.replaceAccess(id, input.version, {
      roleKeys,
      campusIds,
      directGrants,
      directDenies,
      actorId: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.ensureStaffDirectoryRow(ctx, updated, roleKeys, campusIds, directGrants);
    await this.write(ctx, 'user.access.set', id, {
      previousState: { roleKeys: await this.repo.getRoleKeys(id) },
      newState: {
        roleKeys,
        campusCount: campusIds.length,
        grants: directGrants.length,
        denies: directDenies.length,
        ...(this.canManageRoles(ctx) ? {} : { assignedBy: 'campus_admin' }),
      },
    });
    void existing;
    return this.toView(updated, roleKeys, campusIds);
  }

  async remove(ctx: PortalActionContext, id: string, version: number) {
    const existing = await this.require(ctx, id);
    if (id === ctx.principal.institutionUserId) {
      throw new ForbiddenException({ code: 'CANNOT_DELETE_SELF', message: 'You cannot delete your own account.' });
    }
    const ok = await this.repo.delete(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'user.delete', id, { previousState: { email: existing.email, fullName: existing.fullName } });
    return { deleted: true };
  }

  /**
   * IT Staff security action — reset a user's security posture: clear lockout + failed-login
   * counters, force a password reset on next sign-in, and revoke every live session. Gated by the
   * sensitive `users.reset_security`. Never targets self via the same lock-out guards as disable.
   */
  async resetSecurity(ctx: PortalActionContext, id: string) {
    const existing = await this.require(ctx, id);
    if (id === ctx.principal.institutionUserId) {
      throw new ForbiddenException({ code: 'CANNOT_RESET_SELF', message: 'You cannot reset your own security.' });
    }
    await this.sessions.revokeAllForUser(id, 'it_security_reset');
    const now = new Date();
    const updated = await this.repo.update(id, existing.version, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lockedAt: null,
      passwordResetRequiredAt: now,
      sessionsRevokedAt: now,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'user.security.reset', id, {
      newState: { passwordResetRequired: true, sessionsRevoked: true, lockoutCleared: true },
    });
    const [roleKeys, campusIds] = await Promise.all([this.repo.getRoleKeys(id), this.repo.getCampusIds(id)]);
    return this.toView(updated, roleKeys, campusIds);
  }

  /**
   * IT Staff security action — revoke every live session for a user (forced sign-out everywhere).
   * Gated by the sensitive `users.revoke_sessions`.
   */
  async revokeSessions(ctx: PortalActionContext, id: string) {
    const existing = await this.require(ctx, id);
    await this.sessions.revokeAllForUser(id, 'it_revoke_sessions');
    const updated = await this.repo.update(id, existing.version, {
      sessionsRevokedAt: new Date(),
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'user.sessions.revoke', id, { newState: { sessionsRevoked: true } });
    const [roleKeys, campusIds] = await Promise.all([this.repo.getRoleKeys(id), this.repo.getCampusIds(id)]);
    return this.toView(updated, roleKeys, campusIds);
  }

  async assignRoleKeys(ctx: PortalActionContext, userId: string, roleKeys: string[], campusIds: string[] = []) {
    if (roleKeys.length === 0) return;
    const existing = await this.require(ctx, userId);
    const campuses = campusIds.length > 0 ? campusIds : await this.repo.getCampusIds(userId);
    return this.setAccess(ctx, userId, {
      roleKeys,
      campusIds: campuses,
      directGrants: existing.directGrants,
      directDenies: existing.directDenies,
      version: existing.version,
    });
  }

  // === helpers ===============================================================

  private async ensureStaffDirectoryRow(
    ctx: PortalActionContext,
    user: InstitutionUser,
    roleKeys: string[],
    campusIds: string[],
    directGrants: string[] = [],
  ): Promise<void> {
    const custom = await this.roles.listCustom(ctx.principal.institutionId);
    const roleDefs = [...INSTITUTION_DEFAULT_ROLES, ...custom.map((r) => ({ key: r.key, permissions: r.permissions }))];
    const effective = computeEffectiveAccess({ roleKeys, directGrants }, roleDefs);
    const needsDirectory =
      effective.permissionKeys.includes(TEACH_PERMISSION) || effective.permissionKeys.includes(MESSAGE_PERMISSION);
    if (!needsDirectory) return;
    if (await this.repo.findStaffByInstitutionUserId(user.id, ctx.principal.institutionId)) return;

    const { firstName, lastName } = this.splitFullName(user.fullName);
    const campusId =
      campusIds.length === 1 ? campusIds[0]! : ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;

    await this.peopleRepo.insertStaff({
      institutionId: ctx.principal.institutionId,
      campusId,
      employeeNo: null,
      firstName,
      middleName: null,
      lastName,
      email: user.email,
      phone: user.phone,
      departmentId: null,
      designation: null,
      employmentType: 'full_time',
      status: 'active',
      joinDate: null,
      institutionUserId: user.id,
      createdBy: ctx.principal.institutionUserId,
    });
  }

  private splitFullName(fullName: string): { firstName: string; lastName: string } {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { firstName: 'User', lastName: 'User' };
    if (parts.length === 1) return { firstName: parts[0]!, lastName: parts[0]! };
    return { firstName: parts[0]!, lastName: parts.slice(1).join(' ') };
  }

  /** Keep the linked staff directory row in sync when an account profile changes. */
  private async syncStaffProfile(ctx: PortalActionContext, user: InstitutionUser): Promise<void> {
    const staff = await this.repo.findStaffByInstitutionUserId(user.id, ctx.principal.institutionId);
    if (!staff) return;
    const { firstName, lastName } = this.splitFullName(user.fullName);
    await this.peopleRepo.updateStaff(staff.id, staff.version, {
      firstName,
      lastName,
      email: user.email,
      phone: user.phone,
      updatedBy: ctx.principal.institutionUserId,
    });
  }

  private async require(ctx: PortalActionContext, id: string): Promise<InstitutionUser> {
    const row = await this.repo.find(id, ctx.principal.institutionId);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    return row;
  }

  /** Full role assignment + direct overrides — institution-wide principals or users.manage_roles. */
  private canManageRoles(ctx: PortalActionContext): boolean {
    return ctx.principal.isInstitutionWide || can(ctx.principal.permissions, 'users.manage_roles');
  }

  private async validateRoleKeys(
    ctx: PortalActionContext,
    keys: string[],
    existingUserId?: string,
  ): Promise<string[]> {
    const institutionId = ctx.principal.institutionId;
    const cleaned = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
    if (cleaned.length === 0) return [];
    const custom = await this.roles.listCustom(institutionId);
    const known = new Set<string>([...DEFAULT_ROLE_KEYS, ...custom.map((r) => r.key)]);
    const invalid = cleaned.filter((k) => !known.has(k));
    if (invalid.length > 0) {
      throw new BadRequestException({ code: 'INVALID_ROLE', message: `Unknown role(s): ${invalid.join(', ')}` });
    }
    // Scope-confined principals (Campus Admins) may only assign the operational staff allowlist —
    // never finance/HR/admin/custom roles. Institution-wide principals (Owner/Admin) assign anything.
    // When editing an existing user, roles they already hold may be kept even if outside the allowlist.
    if (!this.canManageRoles(ctx)) {
      const existingRoleKeys = existingUserId
        ? new Set(await this.repo.getRoleKeys(existingUserId))
        : new Set<string>();
      const notAssignable = cleaned.filter((k) => {
        if (existingRoleKeys.has(k)) return false;
        if (k === 'parent' && can(ctx.principal.permissions, 'parents.manage')) return false;
        return !isCampusAdminAssignableRole(k);
      });
      if (notAssignable.length > 0) {
        throw new ForbiddenException({
          code: 'ROLE_NOT_ASSIGNABLE',
          message:
            `You may only assign these roles within your campuses: ${CAMPUS_ADMIN_ASSIGNABLE_ROLE_KEYS.join(', ')}. ` +
            `Not assignable: ${notAssignable.join(', ')}.`,
        });
      }
    }
    return cleaned;
  }

  private async validateCampusIds(institutionId: string, ids: string[]): Promise<string[]> {
    const cleaned = [...new Set(ids)];
    if (cleaned.length === 0) return [];
    const valid = await this.repo.validCampusIds(institutionId, cleaned);
    const invalid = cleaned.filter((c) => !valid.has(c));
    if (invalid.length > 0) {
      throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown campus id(s): ${invalid.join(', ')}` });
    }
    return cleaned;
  }

  private validateOverrides(keys: string[], field: string): string[] {
    const cleaned = [...new Set(keys.map((k) => k.trim()).filter(Boolean))];
    const invalid = cleaned.filter((k) => !VALID_GRANT_KEYS.has(k));
    if (invalid.length > 0) {
      throw new BadRequestException({ code: 'INVALID_PERMISSION', message: `Unknown ${field} key(s): ${invalid.join(', ')}` });
    }
    return cleaned;
  }

  private toView(u: InstitutionUser, roleKeys: string[], campusIds: string[]): UserView {
    return { ...u, roleKeys, campusIds, campusCount: campusIds.length };
  }

  private async write(ctx: PortalActionContext, action: string, entityId: string, extra: Partial<AuditEventInput> = {}): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType: 'institution_user',
      entityId,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }
}
