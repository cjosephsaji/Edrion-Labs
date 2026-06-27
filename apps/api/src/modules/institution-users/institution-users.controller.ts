import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  addPermissionOverrideSchema,
  changeCampusAccessSchema,
  changeRoleSchema,
  inviteInstitutionUserSchema,
  listInstitutionUsersQuerySchema,
  previewAccessChangeSchema,
  removePermissionOverrideSchema,
  requireMfaSchema,
  resendInviteSchema,
  securityActionSchema,
  updateInstitutionUserSchema,
  userStatusActionSchema,
  type AddPermissionOverrideInput,
  type ChangeCampusAccessInput,
  type ChangeRoleInput,
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
import type { PrincipalContext } from '@edrion/auth';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { InstitutionUsersService } from './institution-users.service';

const summaryQuerySchema = z.object({ institutionId: z.string().uuid().optional() });

@ApiTags('institution-users')
@Controller('institution-users')
export class InstitutionUsersController {
  constructor(private readonly service: InstitutionUsersService) {}

  private ctx(pc: PrincipalContext, request: EdrionRequestContext): ActionContext {
    return { principalContext: pc, request };
  }

  @Get()
  @RequirePermissions('institution_users.view')
  async list(@Query(zodBody(listInstitutionUsersQuerySchema)) query: ListInstitutionUsersQuery) {
    const { items, total } = await this.service.list(query);
    return {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      hasMore: query.page * query.pageSize < total,
    };
  }

  @Get('summary')
  @RequirePermissions('institution_users.view')
  summary(@Query(zodBody(summaryQuerySchema)) query: { institutionId?: string }) {
    return this.service.summary(query.institutionId);
  }

  @Get(':id')
  @RequirePermissions('institution_users.view')
  get(@Param('id') id: string) {
    return this.service.get(id);
  }

  @Post()
  @RequirePermissions('institution_users.create')
  invite(
    @Body(zodBody(inviteInstitutionUserSchema)) body: InviteInstitutionUserInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.invite(body, this.ctx(pc, request));
  }

  @Post(':id/resend-invite')
  @RequirePermissions('institution_users.create')
  resendInvite(
    @Param('id') id: string,
    @Body(zodBody(resendInviteSchema)) body: ResendInviteInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.resendInvite(id, body, this.ctx(pc, request));
  }

  @Patch(':id')
  @RequirePermissions('institution_users.update')
  update(
    @Param('id') id: string,
    @Body(zodBody(updateInstitutionUserSchema)) body: UpdateInstitutionUserInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.update(id, body, this.ctx(pc, request));
  }

  /** Read-only effective-access preview, shown before a permission/campus change is committed. */
  @Post(':id/preview-access')
  @RequirePermissions('institution_users.view')
  previewAccess(
    @Param('id') id: string,
    @Body(zodBody(previewAccessChangeSchema)) body: PreviewAccessChangeInput,
  ) {
    return this.service.previewAccess(id, body);
  }

  @Post(':id/change-role')
  @RequirePermissions('institution_users.manage_permissions')
  changeRole(
    @Param('id') id: string,
    @Body(zodBody(changeRoleSchema)) body: ChangeRoleInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.changeRole(id, body, this.ctx(pc, request));
  }

  @Post(':id/change-campus-access')
  @RequirePermissions('institution_users.manage_permissions')
  changeCampusAccess(
    @Param('id') id: string,
    @Body(zodBody(changeCampusAccessSchema)) body: ChangeCampusAccessInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.changeCampusAccess(id, body, this.ctx(pc, request));
  }

  @Post(':id/permission-overrides')
  @RequirePermissions('institution_users.manage_permissions')
  addPermissionOverride(
    @Param('id') id: string,
    @Body(zodBody(addPermissionOverrideSchema)) body: AddPermissionOverrideInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.addPermissionOverride(id, body, this.ctx(pc, request));
  }

  @Post(':id/remove-permission-override')
  @RequirePermissions('institution_users.manage_permissions')
  removePermissionOverride(
    @Param('id') id: string,
    @Body(zodBody(removePermissionOverrideSchema)) body: RemovePermissionOverrideInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.removePermissionOverride(id, body, this.ctx(pc, request));
  }

  @Post(':id/disable')
  @RequirePermissions('institution_users.disable')
  disable(
    @Param('id') id: string,
    @Body(zodBody(userStatusActionSchema)) body: UserStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.disable(id, body, this.ctx(pc, request));
  }

  @Post(':id/enable')
  @RequirePermissions('institution_users.disable')
  enable(
    @Param('id') id: string,
    @Body(zodBody(userStatusActionSchema)) body: UserStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.enable(id, body, this.ctx(pc, request));
  }

  @Post(':id/unlock')
  @RequirePermissions('institution_users.reset_security')
  unlock(
    @Param('id') id: string,
    @Body(zodBody(userStatusActionSchema)) body: UserStatusActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.unlock(id, body, this.ctx(pc, request));
  }

  @Post(':id/require-mfa')
  @RequirePermissions('institution_users.reset_security')
  requireMfa(
    @Param('id') id: string,
    @Body(zodBody(requireMfaSchema)) body: RequireMfaInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.requireMfa(id, body, this.ctx(pc, request));
  }

  @Post(':id/force-password-reset')
  @RequirePermissions('institution_users.reset_security')
  forcePasswordReset(
    @Param('id') id: string,
    @Body(zodBody(securityActionSchema)) body: SecurityActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.forcePasswordReset(id, body, this.ctx(pc, request));
  }

  @Post(':id/revoke-sessions')
  @RequirePermissions('institution_users.reset_security')
  revokeSessions(
    @Param('id') id: string,
    @Body(zodBody(securityActionSchema)) body: SecurityActionInput,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.revokeSessions(id, body, this.ctx(pc, request));
  }
}
