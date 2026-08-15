import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import {
  requestReplySchema,
  requestVersionSchema,
  leaveRequestPreviewQuerySchema,
  studentRequestsListQuerySchema,
  submitStudentRequestSchema,
  type RequestReplyInput,
  type LeaveRequestPreviewQuery,
  type RequestVersionInput,
  type StudentRequestsListQuery,
  type SubmitStudentRequestInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { IdempotencyService } from '../../common/idempotency.service';
import { zodBody } from '../../common/zod-validation.pipe';
import { StudentAuthGuard } from '../student/core/student-auth.guard';
import { StudentPermissionsGuard } from '../student/core/student-permissions.guard';
import { CurrentStudent, RequireStudentPermissions } from '../student/core/student.decorators';
import type { StudentPrincipal } from '../student/student.types';
import { requireInstitutional, SurfaceGateService } from '../student/surfaces/surface-gate.service';
import { RequestDocumentService } from './request-document.service';
import { RequestEngineService } from './request-engine.service';
import { RequestRegistryService } from './request-registry.service';
import { StudentRequestOptionsService } from './student-request-options.service';

@ApiTags('student-requests')
@Controller('student/requests')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard)
@RequireStudentPermissions('student.surface.requests.view')
export class StudentRequestsController {
  constructor(
    private readonly engine: RequestEngineService,
    private readonly idempotency: IdempotencyService,
    private readonly gate: SurfaceGateService,
    private readonly registry: RequestRegistryService,
    private readonly documents: RequestDocumentService,
    private readonly options: StudentRequestOptionsService,
  ) {}

  @Get('types')
  async types(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    const [registeredTypes, documentCatalog] = await Promise.all([
      this.registry.list(principal.institutionId),
      this.documents.listRequestableTemplates(principal.institutionId),
    ]);
    const visibility = await Promise.all(
      registeredTypes.map((type) =>
        type.entrySurface
          ? this.gate.isSurfaceEnabled(principal, type.entrySurface)
          : Promise.resolve(true),
      ),
    );
    const types = registeredTypes.filter((_, index) => visibility[index]);
    return { types, documentCatalog };
  }

  @Get('form-options')
  async formOptions(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    return this.options.formOptions(principal);
  }

  @Get('documents')
  async vault(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    return this.documents.listStudentVault(principal);
  }

  @Get('documents/digilocker-manifest')
  async digilockerManifest(@CurrentStudent() principal: StudentPrincipal) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    return this.documents.digilockerManifest(principal);
  }

  @Get('documents/:vaultId/file')
  async vaultFile(
    @CurrentStudent() principal: StudentPrincipal,
    @Param('vaultId') vaultId: string,
    @Res() response: Response,
  ) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    const row = await this.documents.studentFile(principal, vaultId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `inline; filename="${safeFilename(row.vault.title)}.pdf"`);
    this.documents.stream(row.storagePath).pipe(response);
  }

  @Get('leave-preview')
  async leavePreview(
    @CurrentStudent() principal: StudentPrincipal,
    @Query(zodBody(leaveRequestPreviewQuerySchema)) query: LeaveRequestPreviewQuery,
  ) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    return this.engine.leavePreview(principal, query.start, query.end);
  }

  @Post()
  async submit(
    @CurrentStudent() principal: StudentPrincipal,
    @ReqContext() request: EdrionRequestContext,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body(zodBody(submitStudentRequestSchema)) body: SubmitStudentRequestInput,
    @Res({ passthrough: true }) response: Response,
  ) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    if (!idempotencyKey || !UUID_RE.test(idempotencyKey)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    }
    const type = await this.registry.requireEnabled(principal.institutionId, body.type);
    if (type.config.entrySurface) await this.gate.assertSurface(principal, type.config.entrySurface);
    const result = await this.idempotency.run(idempotencyKey, 'student_request_submit', () =>
      this.engine.submit({ principal, request }, body) as Promise<Record<string, unknown>>,
    );
    response.status(result.replayed ? 200 : 201);
    return result.result;
  }

  @Get()
  async list(
    @CurrentStudent() principal: StudentPrincipal,
    @Query(zodBody(studentRequestsListQuerySchema)) query: StudentRequestsListQuery,
  ) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    return this.engine.listStudent(principal, query);
  }

  @Get(':id')
  async get(@CurrentStudent() principal: StudentPrincipal, @Param('id') id: string) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    return this.engine.getStudent(principal, id);
  }

  @Post(':id/cancel')
  async cancel(
    @CurrentStudent() principal: StudentPrincipal,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestVersionSchema)) body: RequestVersionInput,
  ) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    return this.engine.cancel({ principal, request }, id, body);
  }

  @Post(':id/reply')
  async reply(
    @CurrentStudent() principal: StudentPrincipal,
    @ReqContext() request: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(requestReplySchema)) body: RequestReplyInput,
  ) {
    requireInstitutional(principal);
    await this.gate.assertSurface(principal, 'requests');
    return this.engine.reply({ principal, request }, id, body);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeFilename(value: string): string {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'document';
}
