import { Body, Controller, Get, Header, Param, Post, Query } from '@nestjs/common';
import type { PrincipalContext } from '@edrion/auth';
import {
  petrosQualityImportSchema, petrosQualityJudgeSchema, petrosQualityLiveSessionSchema, petrosQualityPromotionSchema, petrosQualityRerunSchema, petrosQualityRunQuerySchema,
  type PetrosQualityImportInput, type PetrosQualityJudgeInput, type PetrosQualityLiveSessionInput, type PetrosQualityPromotionInput, type PetrosQualityRerunInput, type PetrosQualityRunQuery,
} from '@edrion/schemas';
import { PrincipalCtx, ReqContext, RequirePermissions } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import type { ActionContext } from '../../common/action-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { PetrosQualityService } from './petros-quality.service';

@Controller('petros-quality')
export class PetrosQualityController {
  constructor(private readonly service: PetrosQualityService) {}
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
}
