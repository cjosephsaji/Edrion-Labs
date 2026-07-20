import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import {
  requestTypeConfigCreateSchema,
  requestTypeConfigListQuerySchema,
  requestTypeConfigUpdateSchema,
  requestVersionSchema,
  type RequestTypeConfigCreateInput,
  type RequestTypeConfigListQuery,
  type RequestTypeConfigUpdateInput,
  type RequestVersionInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal/portal.decorators';
import type { PortalActionContext } from '../portal/portal-action-context';
import { RequestConfigService } from './request-config.service';

@ApiTags('portal-request-type-config')
@Controller('portal/request-type-config')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
@RequireInstitutionPermissions('student_portal.manage')
export class RequestConfigController {
  constructor(private readonly service: RequestConfigService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get()
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(requestTypeConfigListQuerySchema)) query: RequestTypeConfigListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), query);
  }

  @Post()
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(requestTypeConfigCreateSchema)) body: RequestTypeConfigCreateInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  update(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestTypeConfigUpdateSchema)) body: RequestTypeConfigUpdateInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  remove(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestVersionSchema)) body: RequestVersionInput,
  ) {
    return this.service.remove(this.ctx(p, s, r), id, body.version);
  }
}
