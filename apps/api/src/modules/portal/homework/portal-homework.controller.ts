import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createHomeworkSchema,
  homeworkListQuerySchema,
  returnHomeworkSubmissionSchema,
  updateHomeworkSchema,
  type CreateHomeworkInput,
  type HomeworkListQuery,
  type ReturnHomeworkSubmissionInput,
  type UpdateHomeworkInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal.decorators';
import type { PortalActionContext } from '../portal-action-context';
import { PortalHomeworkService } from './portal-homework.service';

@ApiTags('portal-homework')
@Controller('portal/homework')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalHomeworkController {
  constructor(private readonly service: PortalHomeworkService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  @RequireInstitutionPermissions('homework.manage', 'homework.grade')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(homeworkListQuerySchema)) q: HomeworkListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('homework.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createHomeworkSchema)) body: CreateHomeworkInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('homework.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateHomeworkSchema)) body: UpdateHomeworkInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Post(':id/assign')
  @RequireInstitutionPermissions('homework.manage')
  assign(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.assign(this.ctx(p, s, r), id);
  }

  @Post(':id/close')
  @RequireInstitutionPermissions('homework.manage')
  close(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.close(this.ctx(p, s, r), id);
  }

  @Get(':id')
  @RequireInstitutionPermissions('homework.manage', 'homework.grade')
  get(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.get(this.ctx(p, s, r), id);
  }

  @Get(':id/submissions')
  @RequireInstitutionPermissions('homework.manage', 'homework.grade')
  submissions(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.submissions(this.ctx(p, s, r), id);
  }

  @Get(':id/submissions/:sid')
  @RequireInstitutionPermissions('homework.manage', 'homework.grade')
  submissionDetail(
    @Param('id') id: string,
    @Param('sid') sid: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.submissionDetail(this.ctx(p, s, r), id, sid);
  }

  @Post(':id/submissions/:sid/return')
  @RequireInstitutionPermissions('homework.grade')
  returnSubmission(
    @Param('id') id: string,
    @Param('sid') sid: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(returnHomeworkSubmissionSchema)) body: ReturnHomeworkSubmissionInput,
  ) {
    return this.service.returnSubmission(this.ctx(p, s, r), id, sid, body);
  }
}
