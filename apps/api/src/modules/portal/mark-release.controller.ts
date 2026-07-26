import { Body, Controller, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  markReleaseActionSchema,
  markReleaseListQuerySchema,
  markReleaseRetractSchema,
  markReleaseSendBackSchema,
  markReleaseUpsertSchema,
  type MarkReleaseUpsertInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { z } from 'zod';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from './portal.decorators';
import { MarkReleaseService } from './mark-release.service';
import type { PortalActionContext } from './portal-action-context';

@ApiTags('portal-gradebook')
@Controller('portal/gradebook/releases')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class MarkReleaseController {
  constructor(private readonly service: MarkReleaseService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get()
  @RequireInstitutionPermissions('gradebook.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(markReleaseListQuerySchema)) q: { term_id?: string; subject_id?: string },
  ) {
    return this.service.list(this.ctx(p, s, r), { termId: q.term_id, subjectId: q.subject_id });
  }

  @Put()
  @RequireInstitutionPermissions('gradebook.manage')
  upsert(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(markReleaseUpsertSchema)) body: MarkReleaseUpsertInput,
  ) {
    return this.service.upsert(this.ctx(p, s, r), body);
  }

  @Post(':batchId/release')
  @RequireInstitutionPermissions('gradebook.manage')
  release(
    @Param('batchId') batchId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(markReleaseActionSchema)) body: z.infer<typeof markReleaseActionSchema>,
  ) {
    return this.service.release(this.ctx(p, s, r), batchId, {
      version: body.version,
      confirmMissing: body.confirm_missing,
    });
  }

  @Post(':batchId/approve')
  @RequireInstitutionPermissions('gradebook.approve_release')
  approve(
    @Param('batchId') batchId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(markReleaseActionSchema)) body: z.infer<typeof markReleaseActionSchema>,
  ) {
    return this.service.approveRelease(this.ctx(p, s, r), batchId, {
      version: body.version,
      confirmMissing: body.confirm_missing,
    });
  }

  @Post(':batchId/send-back')
  @RequireInstitutionPermissions('gradebook.approve_release')
  sendBack(
    @Param('batchId') batchId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(markReleaseSendBackSchema)) body: z.infer<typeof markReleaseSendBackSchema>,
  ) {
    return this.service.sendBack(this.ctx(p, s, r), batchId, { version: body.version, note: body.note });
  }

  @Post(':batchId/retract')
  @RequireInstitutionPermissions('gradebook.manage')
  retract(
    @Param('batchId') batchId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(markReleaseRetractSchema)) body: z.infer<typeof markReleaseRetractSchema>,
  ) {
    return this.service.retract(this.ctx(p, s, r), batchId, { version: body.version, note: body.note });
  }
}
