import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AccountStatus } from '@edrion/shared-types';
import {
  applyProposedChange,
  computeEffectiveAccess,
  type AddPermissionOverrideInput,
  type CampusGrant,
  type ChangeCampusAccessInput,
  type ChangeRoleInput,
  type EffectiveAccess,
  type InviteInstitutionUserInput,
  type ListInstitutionUsersQuery,
  type PreviewAccessChangeInput,
  type RemovePermissionOverrideInput,
  type RequireMfaInput,
  type ResendInviteInput,
  type SecurityActionInput,
  type UpdateInstitutionUserInput,
  type UserStatusActionInput,
} from '@edrion/schemas';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { Institution, InstitutionUser } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { InstitutionUsersRepository } from './institution-users.repository';

const MODULE = 'institution-users';
const ENTITY = 'institution_user';

/** An institution user the directory lists — identity plus role/campus summary. */
export interface InstitutionUserListItem {
  id: string;
  institutionId: string;
  email: string;
  fullName: string;
  status: string;
  mfaEnrolled: boolean;
  requireMfa: boolean;
  invitedAt: string | null;
  lastLoginAt: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  roleKeys: string[];
  campusCount: number;
}

export interface InstitutionUserDetail {
  id: string;
  institutionId: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  mfaEnrolled: boolean;
  requireMfa: boolean;
  invitedAt: string | null;
  lastLoginAt: string | null;
  passwordResetRequiredAt: string | null;
  sessionsRevokedAt: string | null;
  lockedAt: string | null;
  disabledAt: string | null;
  disabledReason: string | null;
  directGrants: string[];
  directDenies: string[];
  roleKeys: string[];
  campusAccess: { campusId: string; campusName: string | null; accessLevel: string }[];
  effectiveAccess: EffectiveAccess;
  /** Derived invite/login/security timeline (no separate history table). */
  history: { event: string; at: string }[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class InstitutionUsersService {
  constructor(
    private readonly repo: InstitutionUsersRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // --- Reads -------------------------------------------------------------------

  async list(q: ListInstitutionUsersQuery): Promise<{ items: InstitutionUserListItem[]; total: number }> {
    const { items, total, rolesByUser, campusCountByUser } = await this.repo.list(q);
    return {
      items: items.map((u) => ({
        id: u.id,
        institutionId: u.institutionId,
        email: u.email,
        fullName: u.fullName,
        status: u.status,
        mfaEnrolled: u.mfaEnrolled,
        requireMfa: u.requireMfa,
        invitedAt: iso(u.invitedAt),
        lastLoginAt: iso(u.lastLoginAt),
        version: u.version,
        createdAt: u.createdAt.toISOString(),
        updatedAt: u.updatedAt.toISOString(),
        roleKeys: rolesByUser.get(u.id) ?? [],
        campusCount: campusCountByUser.get(u.id) ?? 0,
      })),
      total,
    };
  }

  summary(institutionId?: string) {
    return this.repo.summaryByStatus(institutionId);
  }

  async get(id: string): Promise<InstitutionUserDetail> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Institution user not found' });
    return this.toDetail(user);
  }

  // --- Lifecycle ---------------------------------------------------------------

  async invite(input: InviteInstitutionUserInput, ctx: ActionContext): Promise<InstitutionUserDetail> {
    const institution = await this.requireInstitution(input.institutionId);
    if (institution.status === 'archived') {
      throw new BadRequestException({
        code: 'INSTITUTION_NOT_ACCESSIBLE',
        message: 'Cannot invite users into an archived institution',
      });
    }
    const existing = await this.repo.findByEmail(input.institutionId, input.email);
    if (existing) {
      throw new ConflictException({
        code: 'EMAIL_IN_USE',
        message: 'A user with this email already exists in this institution',
      });
    }
    await this.assertCampusesInInstitution(input.institutionId, input.campusAccess);

    const actorId = ctx.principalContext.principal.employeeId;
    const now = new Date();
    const user = await this.repo.insert({
      institutionId: input.institutionId,
      email: input.email,
      fullName: input.fullName,
      phone: input.phone ?? null,
      status: AccountStatus.Invited,
      invitedAt: now,
      createdBy: actorId,
    });
    await this.repo.insertRoles(user.id, input.roleKeys);
    if (input.campusAccess.length) {
      await this.repo.replaceCampusAccess(user.id, input.campusAccess, actorId);
    }

    await this.writeAudit(ctx, user, 'institution_user.invite', {
      newState: {
        email: user.email,
        roleKeys: input.roleKeys,
        campusCount: input.campusAccess.length,
        status: user.status,
      },
    });
    return this.toDetail(user);
  }

  async resendInvite(id: string, input: ResendInviteInput, ctx: ActionContext): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    if (user.status !== AccountStatus.Invited) {
      throw new BadRequestException({
        code: 'ALREADY_ACCEPTED',
        message: 'This user has already accepted their invitation',
      });
    }
    const updated = await this.repo.stamp(id, { invitedAt: new Date() });
    await this.writeAudit(ctx, updated ?? user, 'institution_user.resend_invite', {
      reason: input.message,
      newState: { invitedAt: updated?.invitedAt ?? null },
    });
    return this.toDetail(updated ?? user);
  }

  async update(id: string, input: UpdateInstitutionUserInput, ctx: ActionContext): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      fullName: input.fullName ?? user.fullName,
      phone: input.phone ?? user.phone,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'institution_user.update', {
      previousState: { fullName: user.fullName, phone: user.phone },
      newState: { fullName: updated.fullName, phone: updated.phone },
    });
    return this.toDetail(updated);
  }

  async changeRole(id: string, input: ChangeRoleInput, ctx: ActionContext): Promise<InstitutionUserDetail> {
    await this.requireUser(id);
    const before = await this.repo.rolesForUser(id);
    const claimed = await this.repo.updateWithVersion(id, input.version, {
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!claimed) throw this.versionConflict();
    await this.repo.replaceRoles(id, input.roleKeys);

    await this.writeAudit(ctx, claimed, 'institution_user.change_role', {
      reason: input.reason,
      previousState: { roleKeys: before, effective: this.effective(before, claimed).permissionKeys },
      newState: { roleKeys: input.roleKeys, effective: this.effective(input.roleKeys, claimed).permissionKeys },
    });
    return this.toDetail(claimed);
  }

  async changeCampusAccess(
    id: string,
    input: ChangeCampusAccessInput,
    ctx: ActionContext,
  ): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    await this.assertCampusesInInstitution(user.institutionId, input.campusAccess);
    const before = await this.repo.campusAccessForUser(id);
    const claimed = await this.repo.updateWithVersion(id, input.version, {
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!claimed) throw this.versionConflict();
    await this.repo.replaceCampusAccess(id, input.campusAccess, ctx.principalContext.principal.employeeId);

    await this.writeAudit(ctx, claimed, 'institution_user.change_campus_access', {
      reason: input.reason,
      previousState: { campusIds: before.map((c) => c.campusId) },
      newState: { campusIds: input.campusAccess.map((c) => c.campusId) },
    });
    return this.toDetail(claimed);
  }

  async addPermissionOverride(
    id: string,
    input: AddPermissionOverrideInput,
    ctx: ActionContext,
  ): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    const grants = new Set(user.directGrants);
    const denies = new Set(user.directDenies);
    if (input.effect === 'grant') {
      grants.add(input.key);
      denies.delete(input.key);
    } else {
      denies.add(input.key);
      grants.delete(input.key);
    }
    const updated = await this.repo.updateWithVersion(id, input.version, {
      directGrants: [...grants],
      directDenies: [...denies],
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'institution_user.add_permission_override', {
      reason: input.reason,
      previousState: { directGrants: user.directGrants, directDenies: user.directDenies },
      newState: { directGrants: updated.directGrants, directDenies: updated.directDenies },
    });
    return this.toDetail(updated);
  }

  async removePermissionOverride(
    id: string,
    input: RemovePermissionOverrideInput,
    ctx: ActionContext,
  ): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    const grants = user.directGrants.filter((k) => k !== input.key);
    const denies = user.directDenies.filter((k) => k !== input.key);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      directGrants: grants,
      directDenies: denies,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'institution_user.remove_permission_override', {
      reason: input.reason,
      previousState: { directGrants: user.directGrants, directDenies: user.directDenies },
      newState: { directGrants: updated.directGrants, directDenies: updated.directDenies },
    });
    return this.toDetail(updated);
  }

  /** Preview the effective access that would result from a proposed change — no writes. */
  async previewAccess(
    id: string,
    change: PreviewAccessChangeInput,
  ): Promise<{ before: EffectiveAccess; after: EffectiveAccess }> {
    const user = await this.requireUser(id);
    if (change.campusAccess) await this.assertCampusesInInstitution(user.institutionId, change.campusAccess);

    const roleKeys = await this.repo.rolesForUser(id);
    const campusAccess = (await this.repo.campusAccessForUser(id)).map(toGrant);
    const current = {
      roleKeys,
      directGrants: user.directGrants,
      directDenies: user.directDenies,
      campusAccess,
    };
    const before = computeEffectiveAccess(current);
    const after = computeEffectiveAccess(applyProposedChange(current, change));
    return { before, after };
  }

  async disable(id: string, input: UserStatusActionInput, ctx: ActionContext): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      status: AccountStatus.Disabled,
      disabledAt: new Date(),
      disabledReason: input.reason,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'institution_user.disable', {
      reason: input.reason,
      previousState: { status: user.status },
      newState: { status: updated.status },
    });
    return this.toDetail(updated);
  }

  async enable(id: string, input: UserStatusActionInput, ctx: ActionContext): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      status: AccountStatus.Active,
      disabledAt: null,
      disabledReason: null,
      lockedAt: null,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'institution_user.enable', {
      reason: input.reason,
      previousState: { status: user.status },
      newState: { status: updated.status },
    });
    return this.toDetail(updated);
  }

  async unlock(id: string, input: UserStatusActionInput, ctx: ActionContext): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    if (user.status !== AccountStatus.Locked && !user.lockedAt) {
      throw new BadRequestException({ code: 'NOT_LOCKED', message: 'This user is not locked' });
    }
    const updated = await this.repo.updateWithVersion(id, input.version, {
      status: AccountStatus.Active,
      lockedAt: null,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'institution_user.unlock', {
      reason: input.reason,
      previousState: { status: user.status },
      newState: { status: updated.status },
    });
    return this.toDetail(updated);
  }

  async requireMfa(id: string, input: RequireMfaInput, ctx: ActionContext): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      requireMfa: input.required,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();
    await this.writeAudit(ctx, updated, 'institution_user.require_mfa', {
      reason: input.reason,
      previousState: { requireMfa: user.requireMfa },
      newState: { requireMfa: updated.requireMfa },
    });
    return this.toDetail(updated);
  }

  async forcePasswordReset(
    id: string,
    input: SecurityActionInput,
    ctx: ActionContext,
  ): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    const updated = await this.repo.stamp(id, { passwordResetRequiredAt: new Date() });
    await this.writeAudit(ctx, updated ?? user, 'institution_user.force_password_reset', {
      reason: input.reason,
      newState: { passwordResetRequiredAt: updated?.passwordResetRequiredAt ?? null },
    });
    return this.toDetail(updated ?? user);
  }

  async revokeSessions(id: string, input: SecurityActionInput, ctx: ActionContext): Promise<InstitutionUserDetail> {
    const user = await this.requireUser(id);
    const updated = await this.repo.stamp(id, { sessionsRevokedAt: new Date() });
    await this.writeAudit(ctx, updated ?? user, 'institution_user.revoke_sessions', {
      reason: input.reason,
      newState: { sessionsRevokedAt: updated?.sessionsRevokedAt ?? null },
    });
    return this.toDetail(updated ?? user);
  }

  // --- Helpers -----------------------------------------------------------------

  private async requireUser(id: string): Promise<InstitutionUser> {
    const user = await this.repo.findById(id);
    if (!user) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Institution user not found' });
    return user;
  }

  private async requireInstitution(id: string): Promise<Institution> {
    const institution = await this.repo.findInstitution(id);
    if (!institution) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Institution not found' });
    return institution;
  }

  /**
   * The core invariant: an institution user only ever holds campus grants WITHIN their own
   * institution. Reject any grant that points at a campus belonging to a different institution.
   */
  private async assertCampusesInInstitution(institutionId: string, grants: CampusGrant[]): Promise<void> {
    if (!grants.length) return;
    const allowed = await this.repo.campusIdsForInstitution(institutionId);
    const offending = grants.filter((g) => !allowed.has(g.campusId)).map((g) => g.campusId);
    if (offending.length) {
      throw new BadRequestException({
        code: 'CROSS_INSTITUTION_CAMPUS',
        message: 'Campus access can only be granted within the user’s own institution',
        details: { campusAccess: offending },
      });
    }
  }

  private effective(roleKeys: string[], user: InstitutionUser): EffectiveAccess {
    return computeEffectiveAccess({
      roleKeys,
      directGrants: user.directGrants,
      directDenies: user.directDenies,
    });
  }

  private async toDetail(user: InstitutionUser): Promise<InstitutionUserDetail> {
    const roleKeys = await this.repo.rolesForUser(user.id);
    const campusRows = await this.repo.campusAccessForUser(user.id);
    const campusAccess = campusRows.map((c) => ({
      campusId: c.campusId,
      campusName: c.campusName,
      accessLevel: c.accessLevel,
    }));
    const effectiveAccess = computeEffectiveAccess({
      roleKeys,
      directGrants: user.directGrants,
      directDenies: user.directDenies,
      campusAccess: campusRows.map(toGrant),
    });

    return {
      id: user.id,
      institutionId: user.institutionId,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      status: user.status,
      mfaEnrolled: user.mfaEnrolled,
      requireMfa: user.requireMfa,
      invitedAt: iso(user.invitedAt),
      lastLoginAt: iso(user.lastLoginAt),
      passwordResetRequiredAt: iso(user.passwordResetRequiredAt),
      sessionsRevokedAt: iso(user.sessionsRevokedAt),
      lockedAt: iso(user.lockedAt),
      disabledAt: iso(user.disabledAt),
      disabledReason: user.disabledReason,
      directGrants: user.directGrants,
      directDenies: user.directDenies,
      roleKeys,
      campusAccess,
      effectiveAccess,
      history: buildHistory(user),
      version: user.version,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private async writeAudit(
    ctx: ActionContext,
    user: InstitutionUser,
    action: string,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: user.id,
      institutionId: user.institutionId,
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

function iso(d: Date | null): string | null {
  return d ? d.toISOString() : null;
}

function toGrant(c: { campusId: string; accessLevel: string }): CampusGrant {
  return { campusId: c.campusId, accessLevel: c.accessLevel === 'view' ? 'view' : 'manage' };
}

/** Build a simple lifecycle timeline from the user's stamp columns. */
function buildHistory(u: InstitutionUser): { event: string; at: string }[] {
  const entries: { event: string; at: string }[] = [{ event: 'created', at: u.createdAt.toISOString() }];
  if (u.invitedAt) entries.push({ event: 'invited', at: u.invitedAt.toISOString() });
  if (u.lastLoginAt) entries.push({ event: 'last_login', at: u.lastLoginAt.toISOString() });
  if (u.passwordResetRequiredAt) entries.push({ event: 'password_reset_required', at: u.passwordResetRequiredAt.toISOString() });
  if (u.sessionsRevokedAt) entries.push({ event: 'sessions_revoked', at: u.sessionsRevokedAt.toISOString() });
  if (u.lockedAt) entries.push({ event: 'locked', at: u.lockedAt.toISOString() });
  if (u.disabledAt) entries.push({ event: 'disabled', at: u.disabledAt.toISOString() });
  return entries.sort((a, b) => b.at.localeCompare(a.at));
}
