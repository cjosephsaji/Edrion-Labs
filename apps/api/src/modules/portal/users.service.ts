import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import {
  ALL_INSTITUTION_PERMISSION_KEYS,
  CAMPUS_ADMIN_ASSIGNABLE_ROLE_KEYS,
  INSTITUTION_DEFAULT_ROLES,
  isCampusAdminAssignableRole,
} from '@edrion/permissions/institution';
import type {
  InvitePortalUserInput,
  PortalUsersListQuery,
  SetPortalUserAccessInput,
  UpdatePortalUserInput,
} from '@edrion/schemas';
import type { InstitutionUser } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import type { ListResult } from './academics.service';
import { UsersRepository } from './users.repository';
import { RolesRepository } from './roles.repository';
import { PortalInviteService } from './portal-invite.service';
import { PortalSessionService } from './portal-session.service';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-users';
const VALID_GRANT_KEYS = new Set<string>(ALL_INSTITUTION_PERMISSION_KEYS);
const DEFAULT_ROLE_KEYS = new Set(INSTITUTION_DEFAULT_ROLES.map((r) => r.key));

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
    private readonly roles: RolesRepository,
    private readonly invites: PortalInviteService,
    private readonly sessions: PortalSessionService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: PortalUsersListQuery): Promise<ListResult<UserView>> {
    const institutionId = ctx.principal.institutionId;
    const roleFilterIds = q.roleKey ? await this.repo.userIdsWithRole(institutionId, q.roleKey) : null;
    const page = await this.repo.list(institutionId, roleFilterIds, q);
    const ids = page.items.map((u) => u.id);
    const [roleMap, campusMap] = await Promise.all([this.repo.rolesForUsers(ids), this.repo.campusIdsForUsers(ids)]);
    const items = page.items.map((u) => this.toView(u, roleMap.get(u.id) ?? [], campusMap.get(u.id) ?? []));
    return { items, total: page.total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  async invite(ctx: PortalActionContext, input: InvitePortalUserInput) {
    const institutionId = ctx.principal.institutionId;
    const email = input.email.toLowerCase();
    if (await this.repo.findByEmail(institutionId, email)) {
      throw new ConflictException({ code: 'USER_EXISTS', message: `A user with email "${email}" already exists.` });
    }
    const roleKeys = await this.validateRoleKeys(ctx, input.roleKeys);
    const campusIds = await this.validateCampusIds(institutionId, input.campusIds);

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
      patch.disabledAt = input.status === 'disabled' ? new Date() : null;
    }
    const updated = await this.repo.update(id, input.version, patch);
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'user.update', id, {
      previousState: { status: existing.status, fullName: existing.fullName },
      newState: { status: updated.status, fullName: updated.fullName },
    });
    const [roleKeys, campusIds] = await Promise.all([this.repo.getRoleKeys(id), this.repo.getCampusIds(id)]);
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
    const roleKeys = await this.validateRoleKeys(ctx, input.roleKeys);
    const campusIds = await this.validateCampusIds(institutionId, input.campusIds);
    const directGrants = this.validateOverrides(input.directGrants, 'directGrants');
    const directDenies = this.validateOverrides(input.directDenies, 'directDenies');
    // Direct permission overrides bypass roles entirely — only institution-wide principals may set
    // them. A scope-confined Campus Admin assigns roles from the allowlist, never raw grants/denies.
    if (!ctx.principal.isInstitutionWide && (directGrants.length > 0 || directDenies.length > 0)) {
      throw new ForbiddenException({
        code: 'OVERRIDES_NOT_PERMITTED',
        message: 'You cannot set direct permission overrides. Assign roles instead.',
      });
    }

    const updated = await this.repo.replaceAccess(id, input.version, {
      roleKeys,
      campusIds,
      directGrants,
      directDenies,
      actorId: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'user.access.set', id, {
      previousState: { roleKeys: await this.repo.getRoleKeys(id) },
      newState: {
        roleKeys,
        campusCount: campusIds.length,
        grants: directGrants.length,
        denies: directDenies.length,
        ...(ctx.principal.isInstitutionWide ? {} : { assignedBy: 'campus_admin' }),
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

  // === helpers ===============================================================

  private async require(ctx: PortalActionContext, id: string): Promise<InstitutionUser> {
    const row = await this.repo.find(id, ctx.principal.institutionId);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'User not found' });
    return row;
  }

  private async validateRoleKeys(ctx: PortalActionContext, keys: string[]): Promise<string[]> {
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
    if (!ctx.principal.isInstitutionWide) {
      const notAssignable = cleaned.filter((k) => !isCampusAdminAssignableRole(k));
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
