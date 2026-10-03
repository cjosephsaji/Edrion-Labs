import { Body, Controller, Get, Header, Param, Post, UseGuards } from '@nestjs/common';
import type { InstitutionPrincipal } from '@edrion/auth';
import {
  petrosQualitativeReviewCommandSchema,
  petrosQualitativeSubmissionCommandSchema,
  petrosQualitativeDraftRequestSchema,
  petrosQualitativeDraftFeedbackCommandSchema,
  petrosQualitativeRevokeCommandSchema,
  type PetrosQualitativeReviewCommand,
  type PetrosQualitativeSubmissionCommand,
} from '@edrion/schemas';
import { Public } from '../../../common/guards/auth.guard';
import { SkipRateLimit } from '../../../common/decorators';
import { zodBody } from '../../../common/zod-validation.pipe';
import {
  CurrentInstitutionPrincipal,
  RequireInstitutionPermissions,
} from '../../portal/portal.decorators';
import { InstitutionAuthGuard } from '../../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../../portal/portal-permissions.guard';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import {
  CurrentStudent,
  RequireStudentPermissions,
  StudentRateLimit,
} from '../core/student.decorators';
import { StudentOwnsTransactions } from '../core/student-owned-transactions';
import { requireInstitutional } from '../surfaces/surface-gate.service';
import type { StudentPrincipal } from '../student.types';
import { PetrosQualitativeReviewService } from './petros-qualitative-review.service';

@Controller('student/petros/qualitative-submissions')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(20, 60)
export class StudentPetrosQualitativeReviewController {
  constructor(private readonly service: PetrosQualitativeReviewService) {}

  @Post('draft-feedback-requests')
  @Header('Cache-Control','private, no-store')
  @StudentOwnsTransactions()
  requestFeedback(@CurrentStudent() principal:StudentPrincipal,
    @Body(zodBody(petrosQualitativeDraftRequestSchema)) body:unknown) {
    requireInstitutional(principal);return this.service.requestDraftFeedback(principal,body);
  }

  @Get(':submissionId')
  @Header('Cache-Control','private, no-store')
  @StudentOwnsTransactions()
  current(@CurrentStudent() principal:StudentPrincipal,@Param('submissionId') id:string) {
    requireInstitutional(principal);return this.service.current(principal,id);
  }

  @Get('draft-feedback-requests/:requestId')
  @Header('Cache-Control','private, no-store')
  @StudentOwnsTransactions()
  draftStatus(@CurrentStudent() principal:StudentPrincipal,@Param('requestId') id:string) {
    requireInstitutional(principal);return this.service.draftStatus(principal,id);
  }

  @Post()
  @Header('Cache-Control', 'private, no-store')
  @StudentOwnsTransactions()
  submit(
    @CurrentStudent() rawPrincipal: StudentPrincipal,
    @Body(zodBody(petrosQualitativeSubmissionCommandSchema)) body: PetrosQualitativeSubmissionCommand,
  ) {
    requireInstitutional(rawPrincipal);
    return this.service.submit(rawPrincipal, body);
  }
}

@Controller('portal/petros/qualitative-reviews')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalPetrosQualitativeReviewController {
  constructor(private readonly service: PetrosQualitativeReviewService) {}

  @Get('draft-feedback-requests/:requestId')
  @RequireInstitutionPermissions('homework.grade')
  @Header('Cache-Control','private, no-store')
  inspectDraft(@CurrentInstitutionPrincipal() principal:InstitutionPrincipal,@Param('requestId') id:string) {
    return this.service.inspectDraft(principal,id);
  }

  @Get('submissions/:submissionId/inspection')
  @RequireInstitutionPermissions('homework.grade')
  @Header('Cache-Control','private, no-store')
  inspect(@CurrentInstitutionPrincipal() principal:InstitutionPrincipal,@Param('submissionId') id:string) {
    return this.service.inspect(principal,id);
  }

  @Post('draft-feedback')
  @RequireInstitutionPermissions('homework.grade')
  @Header('Cache-Control','private, no-store')
  feedback(@CurrentInstitutionPrincipal() principal:InstitutionPrincipal,
    @Body(zodBody(petrosQualitativeDraftFeedbackCommandSchema)) body:unknown) {
    return this.service.draftFeedback(principal,body);
  }

  @Post('revoke')
  @RequireInstitutionPermissions('homework.grade')
  @Header('Cache-Control','private, no-store')
  revoke(@CurrentInstitutionPrincipal() principal:InstitutionPrincipal,
    @Body(zodBody(petrosQualitativeRevokeCommandSchema)) body:unknown) {
    return this.service.revoke(principal,body);
  }

  @Post()
  @RequireInstitutionPermissions('homework.grade')
  @Header('Cache-Control', 'private, no-store')
  review(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(petrosQualitativeReviewCommandSchema)) body: PetrosQualitativeReviewCommand,
  ) {
    return this.service.review(principal, body);
  }
}
