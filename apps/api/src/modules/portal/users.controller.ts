import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  invitePortalUserSchema,
  portalUsersListQuerySchema,
  setPortalUserAccessSchema,
  updatePortalUserSchema,
  versionedDeleteSchema,
  type InvitePortalUserInput,
  type PortalUsersListQuery,
  type SetPortalUserAccessInput,
  type UpdatePortalUserInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { UsersService } from './users.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal User Management API (Phase 11) — the directory over institution_users. Reads
 * need `users.view`; inviting needs `users.invite`; editing/disabling needs the sensitive
 * `users.manage`; assigning roles/campus access needs the sensitive `users.assign_scoped_roles`
 * (institution-wide principals assign anything + overrides; Campus Admins only the operational
 * staff allowlist, no overrides — Phase 13). IT security resets/session revocation need
 * `users.reset_security` / `users.revoke_sessions`.
 */
@ApiTags('portal-users')
@Controller('portal/users')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class UsersController {
  constructor(private readonly service: UsersService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('users.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(portalUsersListQuerySchema)) q: PortalUsersListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('users.invite')
  invite(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(invitePortalUserSchema)) body: InvitePortalUserInput,
  ) {
    return this.service.invite(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('users.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updatePortalUserSchema)) body: UpdatePortalUserInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Put(':id/access')
  @RequireInstitutionPermissions('users.assign_scoped_roles')
  setAccess(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(setPortalUserAccessSchema)) body: SetPortalUserAccessInput,
  ) {
    return this.service.setAccess(this.ctx(p, s, r), id, body);
  }

  /** IT Staff: reset a user's security posture (clear lockout, force password reset, revoke sessions). */
  @Post(':id/reset-security')
  @RequireInstitutionPermissions('users.reset_security')
  resetSecurity(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.resetSecurity(this.ctx(p, s, r), id);
  }

  /** IT Staff: revoke every live session for a user (forced sign-out everywhere). */
  @Post(':id/revoke-sessions')
  @RequireInstitutionPermissions('users.revoke_sessions')
  revokeSessions(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.revokeSessions(this.ctx(p, s, r), id);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('users.manage')
  remove(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.remove(this.ctx(p, s, r), id, body.version);
  }
}
