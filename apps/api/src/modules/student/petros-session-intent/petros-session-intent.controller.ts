import { Body, Controller, Get, Header, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags } from '@nestjs/swagger';
import {
  PETROS_DOCUMENT_SOURCE_VERSION,
  petrosDocumentLocatorSchema,
  type PetrosDocumentLocator,
  petrosDocumentSearchSchema,
  type PetrosDocumentSearch,
  petrosSourceComparisonSchema,
  type PetrosSourceComparison,
  petrosSessionIntentV1,
  petrosAssistantQuestionSchema,
  petrosDoorsDashboardQuerySchema,
  petrosIntentMetricInputSchema,
  preparePetrosDocumentSchema,
  resolvePetrosSessionIntentSchema,
  startPetrosSessionIntentSchema,
  type PetrosAssistantQuestionInput,
  type PetrosDoorsDashboardQuery,
  type PetrosIntentMetricInput,
  type PreparePetrosDocumentInput,
  type ResolvePetrosSessionIntentInput,
  type StartPetrosSessionIntentInput,
} from '@edrion/schemas';
import type { PrincipalContext } from '@edrion/auth';
import { Public } from '../../../common/guards/auth.guard';
import {
  PrincipalCtx,
  ReqContext,
  RequirePermissions,
  SkipRateLimit,
} from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import {
  CurrentStudent,
  RequireStudentPermissions,
  StudentRateLimit,
} from '../core/student.decorators';
import type { StudentPrincipal } from '../student.types';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import { PetrosSessionIntentService } from './petros-session-intent.service';

@ApiTags('student-petros-contextual-doors')
@Controller('student/petros')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(40, 60)
export class StudentPetrosSessionIntentController {
  constructor(private readonly service: PetrosSessionIntentService) {}

  private principal(raw: StudentPrincipal) {
    requireInstitutional(raw);
    return raw;
  }

  @Get('documents/:sourceId/scope')
  @Header('Cache-Control', 'private, no-store')
  documentScope(@CurrentStudent() raw: StudentPrincipal, @Param('sourceId', new ParseUUIDPipe()) sourceId: string) {
    return this.service.selectedDocumentScope(this.principal(raw), sourceId);
  }

  @Post('documents/compare')
  @Header('Cache-Control', 'private, no-store')
  async compareDocuments(@CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(petrosSourceComparisonSchema)) input: PetrosSourceComparison, @Req() request: Request) {
    const abort = new AbortController();
    const cancel = () => abort.abort();
    request.res?.once('close', cancel);
    if (request.aborted || request.res?.destroyed) cancel();
    try { return await this.service.compareDocuments(this.principal(raw), input, abort.signal); }
    finally { request.res?.off('close', cancel); }
  }

  @Post('documents/:sourceId/search')
  @Header('Cache-Control', 'private, no-store')
  async searchDocument(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sourceId', new ParseUUIDPipe()) sourceId: string,
    @Body(zodBody(petrosDocumentSearchSchema)) input: PetrosDocumentSearch,
    @Req() request: Request,
  ) {
    const abort = new AbortController();
    const cancel = () => abort.abort();
    request.res?.once('close', cancel);
    if (request.aborted || request.res?.destroyed) cancel();
    try { return await this.service.searchDocument(this.principal(raw), sourceId, input, abort.signal); }
    finally { request.res?.off('close', cancel); }
  }

  @Post('documents/:sourceId/resolve-locator')
  @Header('Cache-Control', 'private, no-store')
  documentLocator(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sourceId', new ParseUUIDPipe()) sourceId: string,
    @Body(zodBody(petrosDocumentLocatorSchema)) locator: PetrosDocumentLocator,
  ) {
    return this.service.documentLocator(this.principal(raw), sourceId, locator);
  }

  @Post('intents/resolve')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'x-petros-document-source')
  async resolve(
    @Headers('x-petros-document-source') sourceContract: string | undefined,
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(resolvePetrosSessionIntentSchema)) body: ResolvePetrosSessionIntentInput,
  ) {
    const intent = await this.service.resolve(this.principal(raw), body);
    return sourceContract === PETROS_DOCUMENT_SOURCE_VERSION ? intent : petrosSessionIntentV1(intent);
  }

  @Get('intents/:intentId')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'x-petros-document-source')
  async read(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('intentId') intentId: string,
    @Headers('x-petros-document-source') sourceContract?: string,
  ) {
    const intent = await this.service.read(this.principal(raw), intentId);
    return sourceContract === PETROS_DOCUMENT_SOURCE_VERSION ? intent : petrosSessionIntentV1(intent);
  }

  @Get('document-preparations/:preparationId')
  @Header('Cache-Control', 'private, no-store')
  preparation(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('preparationId') preparationId: string,
  ) {
    return this.service.preparation(this.principal(raw), preparationId);
  }

  @Post('documents/:sourceId/prepare')
  @Header('Cache-Control', 'private, no-store')
  prepareDocument(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sourceId') sourceId: string,
    @Body(zodBody(preparePetrosDocumentSchema)) body: PreparePetrosDocumentInput,
  ) {
    return this.service.prepareDocument(this.principal(raw), sourceId, body);
  }

  @Get('documents/:sourceId/path')
  @Header('Cache-Control', 'private, no-store')
  documentPath(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('sourceId') sourceId: string,
  ) {
    return this.service.documentPath(this.principal(raw), sourceId);
  }

  @Post('intents/:intentId/start')
  @Header('Cache-Control', 'private, no-store')
  @Header('Vary', 'x-petros-document-source')
  async start(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('intentId') intentId: string,
    @Body(zodBody(startPetrosSessionIntentSchema)) body: StartPetrosSessionIntentInput,
    @Headers('x-petros-document-source') sourceContract?: string,
  ) {
    const result = await this.service.start(this.principal(raw), intentId, body);
    return {
      ...result,
      intent: sourceContract === PETROS_DOCUMENT_SOURCE_VERSION
        ? result.intent : petrosSessionIntentV1(result.intent),
    };
  }

  @Post('intents/:intentId/events')
  metric(
    @CurrentStudent() raw: StudentPrincipal,
    @Param('intentId') intentId: string,
    @Body(zodBody(petrosIntentMetricInputSchema)) body: PetrosIntentMetricInput,
  ) {
    return this.service.metric(this.principal(raw), intentId, body);
  }

  @Post('assistant')
  assistant(
    @CurrentStudent() raw: StudentPrincipal,
    @Body(zodBody(petrosAssistantQuestionSchema)) body: PetrosAssistantQuestionInput,
  ) {
    return this.service.assistant(this.principal(raw), body);
  }

  @Get('sources')
  sources(@CurrentStudent() raw: StudentPrincipal) {
    return this.service.sources(this.principal(raw));
  }

  @Get('path')
  path(@CurrentStudent() raw: StudentPrincipal) {
    return this.service.path(this.principal(raw));
  }
}

@ApiTags('petros-doors-dashboard')
@Controller('petros-doors')
export class PetrosDoorsDashboardController {
  constructor(private readonly service: PetrosSessionIntentService) {}

  @Get('dashboard')
  @RequirePermissions('ai.view')
  read(
    @Query(zodBody(petrosDoorsDashboardQuerySchema)) query: PetrosDoorsDashboardQuery,
    @PrincipalCtx() pc: PrincipalContext,
    @ReqContext() request: EdrionRequestContext,
  ) {
    return this.service.dashboard(query, { principalContext: pc, request });
  }
}
