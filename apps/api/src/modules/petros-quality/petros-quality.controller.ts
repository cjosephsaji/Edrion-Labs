import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import type { PrincipalContext } from '@edrion/auth';
import {
  petrosQualityImportSchema, petrosQualityJudgeSchema, petrosQualityLiveSessionSchema, petrosQualityPromotionSchema, petrosQualityRerunSchema, petrosQualityRunQuerySchema,
  petrosReleaseReportImportSchema, petrosReleaseRegisterSchema, petrosReleaseDisableSchema,
  type PetrosQualityImportInput, type PetrosQualityJudgeInput, type PetrosQualityLiveSessionInput, type PetrosQualityPromotionInput, type PetrosQualityRerunInput, type PetrosQualityRunQuery,
} from '@edrion/schemas';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { PetrosQualityService } from './petros-quality.service';
import { PetrosReleaseService } from './petros-release.service';
import { PetrosOperationsService } from './petros-operations.service';

@Controller('petros-quality')
export class PetrosQualityController {
  constructor(private readonly service: PetrosQualityService, private readonly release: PetrosReleaseService,private readonly operationsService:PetrosOperationsService) {}
  private ctx(principalContext: PrincipalContext, request: EdrionRequestContext): ActionContext { return { principalContext, request }; }

  @Get('runs') @RequirePermissions('ai.view') list(@Query(zodBody(petrosQualityRunQuerySchema)) query: PetrosQualityRunQuery) { return this.service.list(query); }
  @Get('runs/:id') @RequirePermissions('ai.view') detail(@Param('id') id: string) { return this.service.detail(id); }
  @Get('runs/:id/export.json') @Header('content-type', 'application/json') @RequirePermissions('ai.view') exportJson(@Param('id') id: string) { return this.service.exportJson(id); }
  @Get('runs/:id/export.csv') @Header('content-type', 'text/csv; charset=utf-8') @RequirePermissions('ai.view') exportCsv(@Param('id') id: string) { return this.service.exportCsv(id); }
  @Post('runs/import') @RequirePermissions('ai.configure') import(@Body(zodBody(petrosQualityImportSchema)) body: PetrosQualityImportInput, @PrincipalCtx() pc: PrincipalContext, @ReqContext() req: EdrionRequestContext) { return this.service.import(body, this.ctx(pc, req)); }
  @Post('runs/:id/promote') @RequirePermissions('ai.configure') promote(@Param('id') id: string, @Body(zodBody(petrosQualityPromotionSchema)) body: PetrosQualityPromotionInput, @PrincipalCtx() pc: PrincipalContext, @ReqContext() req: EdrionRequestContext) { return this.service.promote(id, body, this.ctx(pc, req)); }
  @Post('runs/:id/rerun') @RequirePermissions('ai.configure') rerun(@Param('id') id: string, @Body(zodBody(petrosQualityRerunSchema)) body: PetrosQualityRerunInput, @PrincipalCtx() pc: PrincipalContext, @ReqContext() req: EdrionRequestContext) { return this.service.requestRerun(id, body, this.ctx(pc, req)); }
  @Post('judge') @RequirePermissions('ai.configure') judge(@Body(zodBody(petrosQualityJudgeSchema)) body: PetrosQualityJudgeInput) { return this.service.judge(body); }
  @Post('live-session') @RequirePermissions('ai.configure') liveSession(@Body(zodBody(petrosQualityLiveSessionSchema)) body: PetrosQualityLiveSessionInput) { return this.service.liveSession(body); }
  @Get('releases') @Header('Cache-Control','private, no-store') @RequirePermissions('ai.view') releases() { return this.release.status(); }
  @Post('release-evaluations') @RequirePermissions('ai.configure') importReleaseReport(@Body(zodBody(petrosReleaseReportImportSchema)) body: {report:unknown;reason:string}, @PrincipalCtx() pc: PrincipalContext, @ReqContext() req: EdrionRequestContext) { return this.release.importReport(body.report,body.reason,this.ctx(pc,req)); }
  @Post('releases') @RequirePermissions('ai.configure') registerRelease(@Body(zodBody(petrosReleaseRegisterSchema)) body: {bundle:unknown;reason:string}, @PrincipalCtx() pc: PrincipalContext, @ReqContext() req: EdrionRequestContext) { return this.release.register(body.bundle,body.reason,this.ctx(pc,req)); }
  @Post('releases/:id/disable') @RequirePermissions('ai.configure') disableRelease(@Param('id') id:string,@Body(zodBody(petrosReleaseDisableSchema)) body: {commandId:string;reason:string}, @PrincipalCtx() pc: PrincipalContext, @ReqContext() req: EdrionRequestContext) { return this.release.disable(id,body.commandId,body.reason,this.ctx(pc,req)); }
  @Get('operations') @Header('Cache-Control','private, no-store') @RequirePermissions('ai.view') async operations() {
    const release=await this.release.status();
    const row=release.releases[0];
    const snapshot=await this.operationsService.snapshot({sourceStatus:release.configured?'configured':'missing',
      releaseStatus:!row?'missing':row.gate==='pass'?'configured':row.gate==='PETROS_RELEASE_DISABLED'?'disabled':'stale',
      releaseDigest:row?.digest,sourceVersion:release.currentIdentities?.sourcePack});
    return {...snapshot,release};
  }
}
