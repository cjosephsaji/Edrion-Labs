import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import {
  petrosTeachingPackCompileCommandSchema,
  petrosTeachingPackReviewCommandSchema,
  petrosTeachingPackReviewRevocationSchema,
  type PetrosTeachingPackCompileCommand,
  type PetrosTeachingPackReviewCommand,
  type PetrosTeachingPackReviewRevocation,
} from '@edrion/schemas';
import { ReqContext, SkipRateLimit } from '../../../common/decorators';
import type { EdrionRequestContext } from '../../../common/request-context';
import { zodBody } from '../../../common/zod-validation.pipe';
import { Public } from '../../../common/guards/auth.guard';
import { InstitutionAuthGuard } from '../../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../../portal/portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from '../../portal/portal.decorators';
import type { PortalActionContext } from '../../portal/portal-action-context';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { CurrentStudent, RequireStudentPermissions, StudentRateLimit } from '../core/student.decorators';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import type { StudentPrincipal } from '../student.types';
import { PetrosTeachingPackService } from './petros-teaching-pack.service';

@ApiTags('portal-petros-teaching-packs')
@Controller('portal/petros/teaching-packs')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalPetrosTeachingPackController {
  constructor(private readonly service: PetrosTeachingPackService) {}

  private ctx(principal: InstitutionPrincipal, scope: InstitutionScope,
    request: EdrionRequestContext): PortalActionContext {
    return { principal, scope, request };
  }

  @Get('candidates')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('class_content.manage', 'syllabus.manage')
  candidates(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal, @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext, @Query('courseId', ParseUUIDPipe) courseId: string) {
    return this.service.listCandidates(this.ctx(principal, scope, request), courseId);
  }

  @Get('qualifications')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('syllabus.manage', 'academics.alignments.approve')
  qualifications(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal, @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext, @Query('courseId', ParseUUIDPipe) courseId: string) {
    return this.service.reviewerQualifications(this.ctx(principal, scope, request), courseId);
  }

  @Get('candidates/:candidateId/preview')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('class_content.manage', 'syllabus.manage')
  preview(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal, @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext, @Param('candidateId', ParseUUIDPipe) candidateId: string) {
    return this.service.previewCandidate(this.ctx(principal, scope, request), candidateId);
  }

  @Post('authoring/candidates/compile')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('class_content.manage', 'syllabus.manage')
  compileAuthored(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body(zodBody(petrosTeachingPackCompileCommandSchema)) body: PetrosTeachingPackCompileCommand,
  ) {
    return this.service.compileAuthoredCandidate(this.ctx(principal, scope, request), body);
  }

  @Post('authoring/candidates/:candidateId/reviews')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('syllabus.manage', 'academics.alignments.approve')
  reviewAuthored(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Body(zodBody(petrosTeachingPackReviewCommandSchema)) body: PetrosTeachingPackReviewCommand,
  ) {
    return this.service.reviewAuthoredCandidate(this.ctx(principal, scope, request), candidateId, body);
  }

  @Post('authoring/reviews/:reviewId/revoke')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('syllabus.manage', 'academics.alignments.approve')
  revokeAuthored(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body(zodBody(petrosTeachingPackReviewRevocationSchema)) body: PetrosTeachingPackReviewRevocation,
  ) {
    return this.service.revokeAuthoredReview(this.ctx(principal, scope, request), reviewId, body);
  }
  @Post('candidates/compile')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('class_content.manage', 'syllabus.manage')
  compile(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Body(zodBody(petrosTeachingPackCompileCommandSchema)) body: PetrosTeachingPackCompileCommand,
  ) {
    return this.service.compile(this.ctx(principal, scope, request), body);
  }

  @Post('candidates/:candidateId/reviews')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('syllabus.manage', 'academics.alignments.approve')
  review(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('candidateId', ParseUUIDPipe) candidateId: string,
    @Body(zodBody(petrosTeachingPackReviewCommandSchema)) body: PetrosTeachingPackReviewCommand,
  ) {
    return this.service.review(this.ctx(principal, scope, request), candidateId, body);
  }

  @Post('reviews/:reviewId/revoke')
  @Header('Cache-Control', 'private, no-store')
  @RequireInstitutionPermissions('syllabus.manage', 'academics.alignments.approve')
  revoke(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @CurrentScope() scope: InstitutionScope,
    @ReqContext() request: EdrionRequestContext,
    @Param('reviewId', ParseUUIDPipe) reviewId: string,
    @Body(zodBody(petrosTeachingPackReviewRevocationSchema)) body: PetrosTeachingPackReviewRevocation,
  ) {
    return this.service.revoke(this.ctx(principal, scope, request), reviewId, body);
  }
}

@ApiTags('student-petros-teaching-packs')
@Controller('student/petros/sessions')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(30, 60)
export class StudentPetrosTeachingPackController {
  constructor(private readonly service: PetrosTeachingPackService) {}

  @Get(':sessionId/teaching-packs')
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentStudent() principal: StudentPrincipal,
    @Param('sessionId', ParseUUIDPipe) sessionId: string) {
    requireInstitutional(principal);
    return this.service.listApprovedPackSummaries(principal, sessionId);
  }
}
