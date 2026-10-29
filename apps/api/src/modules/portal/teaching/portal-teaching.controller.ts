import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards, Req, Res, Query, PayloadTooLargeException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { createPetrosTeacherGuidanceSchema, versionedDeleteSchema, PETROS_GUIDANCE_MAX_FILE_BYTES,
  m3PrepareCommandSchema, m3EditCommandSchema, m3ReviewCommandSchema, m3ReleaseCommandSchema,
  type CreatePetrosTeacherGuidance, type VersionedDeleteInput } from '@edrion/schemas';
import { zodBody } from '../../../common/zod-validation.pipe';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { InstitutionAuthGuard } from '../portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal.decorators';
import type { PortalActionContext } from '../portal-action-context';
import { PortalTeachingService } from './portal-teaching.service';
import { PetrosLearningProposalService } from './petros-learning-proposal.service';
import { m3PrivateDraftCommandSchema } from '../../student/knowledge/petros-assessment-contract.server';
import { PetrosTeacherGuidanceService } from './petros-teacher-guidance.service';
import { PetrosTeacherGuidanceFilesService } from './petros-teacher-guidance-files.service';

@ApiTags('portal-teaching')
@Controller('portal/teaching')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalTeachingController {
  constructor(private readonly svc: PortalTeachingService, private readonly guidance: PetrosTeacherGuidanceService,
    private readonly files: PetrosTeacherGuidanceFilesService, private readonly proposals: PetrosLearningProposalService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get(':classId/:subjectId/proposals/sources')
  @RequireInstitutionPermissions('class_content.manage')
  proposalSources(@Param('classId', ParseUUIDPipe) classId: string, @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.proposals.sources(this.ctx(p,s,r),classId,subjectId);
  }

  @Post(':classId/:subjectId/proposals')
  @RequireInstitutionPermissions('class_content.manage')
  prepareProposal(@Param('classId', ParseUUIDPipe) classId: string, @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(m3PrepareCommandSchema)) body: unknown) {
    return this.proposals.prepare(this.ctx(p,s,r),classId,subjectId,body);
  }

  @Get(':classId/:subjectId/proposals/:id')
  @RequireInstitutionPermissions('class_content.manage')
  readProposal(@Param('classId', ParseUUIDPipe) classId: string, @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.proposals.view(this.ctx(p,s,r),classId,subjectId,id);
  }

  @Get(':classId/:subjectId/proposals/:id/readiness')
  @RequireInstitutionPermissions('class_content.manage')
  proposalReadiness(@Param('classId', ParseUUIDPipe) classId: string, @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.proposals.readiness(this.ctx(p,s,r),classId,subjectId,id);
  }

  @Post(':classId/:subjectId/proposals/:id/edits')
  @RequireInstitutionPermissions('class_content.manage')
  editProposal(@Param('classId', ParseUUIDPipe) classId: string, @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(m3EditCommandSchema)) body: unknown) {
    return this.proposals.edit(this.ctx(p,s,r),classId,subjectId,id,body);
  }

  @Post(':classId/:subjectId/proposals/:id/reviews')
  @RequireInstitutionPermissions('class_content.manage')
  reviewProposal(@Param('classId', ParseUUIDPipe) classId: string, @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(m3ReviewCommandSchema)) body: unknown) {
    return this.proposals.review(this.ctx(p,s,r),classId,subjectId,id,body);
  }

  @Post(':classId/:subjectId/proposals/:id/release')
  @RequireInstitutionPermissions('class_content.manage')
  releaseProposal(@Param('classId', ParseUUIDPipe) classId: string, @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(m3ReleaseCommandSchema)) body: unknown) {
    return this.proposals.release(this.ctx(p,s,r),classId,subjectId,id,body);
  }

  @Get(':classId/:subjectId/proposals/:id/evidence/:unitId')
  @RequireInstitutionPermissions('class_content.manage')
  proposalEvidence(@Param('classId', ParseUUIDPipe) classId:string, @Param('subjectId', ParseUUIDPipe) subjectId:string,
    @Param('id', ParseUUIDPipe) id:string, @Param('unitId', ParseUUIDPipe) unitId:string,
    @CurrentInstitutionPrincipal() p:InstitutionPrincipal, @CurrentScope() s:InstitutionScope, @ReqContext() r:EdrionRequestContext) {
    return this.proposals.evidence(this.ctx(p,s,r),classId,subjectId,id,unitId);
  }

  @Get(':classId/:subjectId/proposals/:id/revisions/:version')
  @RequireInstitutionPermissions('class_content.manage')
  proposalRevision(@Param('classId', ParseUUIDPipe) classId:string, @Param('subjectId', ParseUUIDPipe) subjectId:string,
    @Param('id', ParseUUIDPipe) id:string, @Param('version') version:string,
    @CurrentInstitutionPrincipal() p:InstitutionPrincipal, @CurrentScope() s:InstitutionScope, @ReqContext() r:EdrionRequestContext) {
    const parsed=m3ReleaseCommandSchema.shape.expectedVersion.parse(Number(version));
    return this.proposals.view(this.ctx(p,s,r),classId,subjectId,id,parsed);
  }

  @Post(':classId/:subjectId/proposals/:id/verification/:taskId')
  @RequireInstitutionPermissions('class_content.manage', 'academics.alignments.approve')
  proposalVerificationDraft(@Param('classId', ParseUUIDPipe) classId:string, @Param('subjectId', ParseUUIDPipe) subjectId:string,
    @Param('id', ParseUUIDPipe) id:string, @Param('taskId', ParseUUIDPipe) taskId:string,
    @CurrentInstitutionPrincipal() p:InstitutionPrincipal, @CurrentScope() s:InstitutionScope, @ReqContext() r:EdrionRequestContext,
    @Body(zodBody(m3PrivateDraftCommandSchema)) body:unknown, @Res({passthrough:true}) response:Response) {
    response.setHeader('Cache-Control','private, no-store');
    return this.proposals.prepareVerification(this.ctx(p,s,r),classId,subjectId,id,taskId,body);
  }

  @Get(':classId/:subjectId/proposals/:id/verification/:taskId')
  @RequireInstitutionPermissions('class_content.manage', 'academics.alignments.approve')
  proposalVerificationPreview(@Param('classId', ParseUUIDPipe) classId:string, @Param('subjectId', ParseUUIDPipe) subjectId:string,
    @Param('id', ParseUUIDPipe) id:string, @Param('taskId', ParseUUIDPipe) taskId:string,
    @CurrentInstitutionPrincipal() p:InstitutionPrincipal, @CurrentScope() s:InstitutionScope, @ReqContext() r:EdrionRequestContext,
    @Res({passthrough:true}) response:Response) {
    response.setHeader('Cache-Control','private, no-store');
    return this.proposals.verificationPreview(this.ctx(p,s,r),classId,subjectId,id,taskId);
  }

  @Get('mine')
  @RequireInstitutionPermissions('class_content.manage')
  mine(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.mine(this.ctx(p, s, r));
  }

  @Get(':classId/:subjectId')
  @RequireInstitutionPermissions('class_content.manage')
  assignment(
    @Param('classId') classId: string,
    @Param('subjectId') subjectId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.svc.assignment(this.ctx(p, s, r), classId, subjectId);
  }

  @Get(':classId/:subjectId/guidance')
  @RequireInstitutionPermissions('class_content.manage')
  guidanceWorkspace(@Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext) {
    return this.guidance.workspace(this.ctx(p, s, r), classId, subjectId);
  }

  @Post(':classId/:subjectId/guidance')
  @RequireInstitutionPermissions('class_content.manage')
  assignGuidance(@Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createPetrosTeacherGuidanceSchema)) body: CreatePetrosTeacherGuidance) {
    return this.guidance.create(this.ctx(p, s, r), classId, subjectId, body);
  }

  @Post(':classId/:subjectId/guidance/:id/close')
  @RequireInstitutionPermissions('class_content.manage')
  closeGuidance(@Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string, @Param('id', ParseUUIDPipe) id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext, @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput) {
    return this.guidance.close(this.ctx(p, s, r), classId, subjectId, id, body.version);
  }

  @Post(':classId/:subjectId/guidance/files')
  @RequireInstitutionPermissions('class_content.manage')
  async uploadGuidanceFile(@Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext, @Req() req: Request, @Query('filename') filename: string) {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > PETROS_GUIDANCE_MAX_FILE_BYTES) throw new PayloadTooLargeException('Choose a file up to 20 MiB.');
      chunks.push(Buffer.from(chunk));
    }
    const mime = String(req.headers['x-file-type'] ?? req.headers['content-type'] ?? 'application/octet-stream');
    return this.guidance.uploadFile(this.ctx(p, s, r), classId, subjectId, filename || 'file', mime, Buffer.concat(chunks));
  }

  @Get(':classId/:subjectId/guidance/files/:objectId')
  @RequireInstitutionPermissions('class_content.manage')
  async guidanceFile(@Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string, @Param('objectId', ParseUUIDPipe) id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext, @Res() res: Response) {
    const file = await this.guidance.file(this.ctx(p, s, r), classId, subjectId, id);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.attachment(file.filename ?? 'Teacher file');
    const stream = this.files.stream(file.storageKey);
    stream.on('error', () => { if (!res.headersSent) res.status(404).end(); else res.destroy(); });
    stream.pipe(res);
  }
}
