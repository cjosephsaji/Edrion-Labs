import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  counselingCasesListQuerySchema,
  counselingRecordsListQuerySchema,
  createCounselingCaseSchema,
  createCounselingRecordSchema,
  updateCounselingCaseSchema,
  updateCounselingRecordSchema,
  versionedDeleteSchema,
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
import { CounselingService } from './counseling.service';
import type { CrudListQuery } from './portal-crud.engine';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Counseling API (Phase 13 — Counselor). Notes gated by counseling.* (update +
 * delete sensitive); a single-note GET writes a `counseling.note.view` audit row (read-access
 * auditing). Cases gated by the sensitive counseling_cases.manage.
 */
@ApiTags('portal-counseling')
@Controller('portal/counseling')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class CounselingController {
  constructor(private readonly svc: CounselingService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- counseling records (notes) --------------------------------------------
  @Get('records')
  @RequireInstitutionPermissions('counseling.view')
  listRecords(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(counselingRecordsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('records', this.ctx(p, s, r), q);
  }

  /** Single-note read — writes a counseling.note.view audit row (read-access auditing). */
  @Get('records/:id')
  @RequireInstitutionPermissions('counseling.view')
  getRecord(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.get('records', this.ctx(p, s, r), id);
  }

  @Post('records')
  @RequireInstitutionPermissions('counseling.create')
  createRecord(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createCounselingRecordSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('records', this.ctx(p, s, r), body);
  }

  @Patch('records/:id')
  @RequireInstitutionPermissions('counseling.update')
  updateRecord(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateCounselingRecordSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('records', this.ctx(p, s, r), id, body);
  }

  @Delete('records/:id')
  @RequireInstitutionPermissions('counseling.update')
  removeRecord(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('records', this.ctx(p, s, r), id, body.version);
  }

  // --- counseling cases ------------------------------------------------------
  @Get('cases')
  @RequireInstitutionPermissions('counseling_cases.manage')
  listCases(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(counselingCasesListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('cases', this.ctx(p, s, r), q);
  }

  @Post('cases')
  @RequireInstitutionPermissions('counseling_cases.manage')
  createCase(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createCounselingCaseSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('cases', this.ctx(p, s, r), body);
  }

  @Patch('cases/:id')
  @RequireInstitutionPermissions('counseling_cases.manage')
  updateCase(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateCounselingCaseSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('cases', this.ctx(p, s, r), id, body);
  }

  @Delete('cases/:id')
  @RequireInstitutionPermissions('counseling_cases.manage')
  removeCase(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('cases', this.ctx(p, s, r), id, body.version);
  }
}
