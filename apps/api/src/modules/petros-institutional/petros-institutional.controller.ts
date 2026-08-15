import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope, PrincipalContext } from '@edrion/auth';
import {
  petrosHomeworkCorrectionSchema,
  petrosInstitutionalDashboardQuerySchema,
  petrosParentDigestCommandSchema,
  petrosParentDigestPreferenceSchema,
  petrosPolicyDraftInputSchema,
  petrosPolicyDraftUpdateSchema,
  petrosPolicyFixtureSchema,
  petrosPolicyPublishInputSchema,
  petrosPolicyRollbackInputSchema,
  petrosTeacherHandoffCreateSchema,
  petrosTeacherHandoffUpdateSchema,
  type PetrosHomeworkCorrectionInput,
  type PetrosInstitutionalDashboardQuery,
  type PetrosParentDigestCommandInput,
  type PetrosParentDigestPreferenceInput,
  type PetrosPolicyDraftInput,
  type PetrosPolicyDraftUpdateInput,
  type PetrosPolicyFixture,
  type PetrosPolicyPublishInput,
  type PetrosPolicyRollbackInput,
  type PetrosTeacherHandoffCreateInput,
  type PetrosTeacherHandoffUpdateInput,
} from '@edrion/schemas';
import { z } from 'zod';
import { Public } from '../../common/guards/auth.guard';
import { PrincipalCtx, ReqContext, RequirePermissions, RequireRecentAuth, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal/portal.decorators';
import type { PortalActionContext } from '../portal/portal-action-context';
import { CurrentGuardian } from '../parent-portal/parent.decorators';
import type { GuardianContext } from '../parent-portal/guardian-context';
import { GuardianScopeGuard } from '../parent-portal/guardian-scope.guard';
import { StudentAuthGuard } from '../student/core/student-auth.guard';
import { StudentPermissionsGuard } from '../student/core/student-permissions.guard';
import { StudentPortalGuard } from '../student/core/student-portal.guard';
import { StudentRateLimitGuard } from '../student/core/student-rate-limit.guard';
import { CurrentStudent, RequireStudentPermissions, StudentRateLimit } from '../student/core/student.decorators';
import type { StudentPrincipal } from '../student/student.types';
import { requireInstitutional } from '../student/surfaces/surface-gate.service';
import { PetrosInstitutionalService } from './petros-institutional.service';

const syllabusDecisionSchema = z.object({
  topicKey: z.string().min(1).max(160),
  requestedTopic: z.string().min(1).max(240),
  requestedDepth: z.number().int().min(0).max(20),
  subjectId: z.string().uuid().nullable().optional(),
}).strict();

const signalRefreshSchema = z.object({ classId: z.string().uuid(), subjectId: z.string().uuid() }).strict();
const deleteSchema = z.object({ confirm: z.literal('DELETE PETROS INSTITUTIONAL DATA') }).strict();

@ApiTags('portal-petros-institutional')
@Controller('portal/petros/institutional')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalPetrosInstitutionalController {
  constructor(private readonly service: PetrosInstitutionalService) {}

  private ctx(principal: InstitutionPrincipal, scope: InstitutionScope, request: EdrionRequestContext): PortalActionContext {
    return { principal, scope, request };
  }

  @Get('policy')
  @RequireInstitutionPermissions('petros.policy.view')
  policy(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.service.policyDashboard(this.ctx(p, s, r));
  }

  @Post('policies')
  @RequireInstitutionPermissions('petros.policy.configure')
  draft(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(petrosPolicyDraftInputSchema)) body: PetrosPolicyDraftInput) {
    return this.service.createDraft(this.ctx(p, s, r), body);
  }

  @Post('policies/:id/preview')
  @RequireInstitutionPermissions('petros.policy.view')
  preview(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Param('id') id: string, @Body(zodBody(petrosPolicyFixtureSchema)) body: PetrosPolicyFixture) {
    return this.service.previewPolicy(this.ctx(p, s, r), id, body);
  }

  @Put('policies/:id')
  @RequireInstitutionPermissions('petros.policy.configure')
  updateDraft(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Param('id') id: string, @Body(zodBody(petrosPolicyDraftUpdateSchema)) body: PetrosPolicyDraftUpdateInput) {
    return this.service.updateDraft(this.ctx(p, s, r), id, body);
  }

  @Post('policies/:id/publish')
  @RequireInstitutionPermissions('petros.policy.configure')
  publish(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Param('id') id: string, @Body(zodBody(petrosPolicyPublishInputSchema)) body: PetrosPolicyPublishInput) {
    return this.service.publishPolicy(this.ctx(p, s, r), id, body);
  }

  @Post('policies/rollback')
  @RequireInstitutionPermissions('petros.policy.configure')
  rollback(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(petrosPolicyRollbackInputSchema)) body: PetrosPolicyRollbackInput) {
    return this.service.rollbackPolicy(this.ctx(p, s, r), body);
  }

  @Get('teacher/handoffs')
  @RequireInstitutionPermissions('petros.teacher_support.view')
  handoffs(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.service.teacherInbox(this.ctx(p, s, r));
  }

  @Post('teacher/handoffs/:id/read')
  @RequireInstitutionPermissions('petros.teacher_support.view')
  readHandoff(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Param('id') id: string) {
    return this.service.readHandoff(this.ctx(p, s, r), id);
  }

  @Get('teacher/signals')
  @RequireInstitutionPermissions('petros.teacher_support.view')
  signals(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext) {
    return this.service.teacherSignals(this.ctx(p, s, r));
  }

  @Post('teacher/signals/refresh')
  @RequireInstitutionPermissions('petros.teacher_support.view')
  refresh(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(signalRefreshSchema)) body: z.infer<typeof signalRefreshSchema>) {
    return this.service.refreshSignals(this.ctx(p, s, r), body.classId, body.subjectId);
  }
}

@ApiTags('student-petros-institutional')
@Controller('student/petros/institutional')
@Public()
@SkipRateLimit()
@UseGuards(StudentAuthGuard, StudentPermissionsGuard, StudentPortalGuard, StudentRateLimitGuard)
@RequireStudentPermissions('student.learn.use')
@StudentRateLimit(30, 60)
export class StudentPetrosInstitutionalController {
  constructor(private readonly service: PetrosInstitutionalService) {}
  private principal(raw: StudentPrincipal) { requireInstitutional(raw); return raw; }

  @Get('sessions/:sessionId/disclosure')
  disclosure(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string) { return this.service.resolveForStudentSession(this.principal(raw), sessionId); }

  @Post('sessions/:sessionId/disclosure/acknowledge')
  acknowledge(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string) { return this.service.acknowledgeDisclosure(this.principal(raw), sessionId); }

  @Post('sessions/:sessionId/syllabus-decision')
  syllabus(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string, @Body(zodBody(syllabusDecisionSchema)) body: z.infer<typeof syllabusDecisionSchema>) { return this.service.syllabusDecision(this.principal(raw), sessionId, body); }

  @Post('sessions/:sessionId/homework-correction')
  homeworkCorrection(@CurrentStudent() raw: StudentPrincipal, @Param('sessionId') sessionId: string, @Body(zodBody(petrosHomeworkCorrectionSchema)) body: PetrosHomeworkCorrectionInput) { return this.service.correctHomeworkMatch(this.principal(raw), sessionId, body); }

  @Get('handoffs')
  handoffs(@CurrentStudent() raw: StudentPrincipal) { return this.service.listStudentHandoffs(this.principal(raw)); }

  @Post('handoffs')
  handoff(@CurrentStudent() raw: StudentPrincipal, @Body(zodBody(petrosTeacherHandoffCreateSchema)) body: PetrosTeacherHandoffCreateInput) { return this.service.createHandoff(this.principal(raw), body); }

  @Post('handoffs/:id')
  handoffAction(@CurrentStudent() raw: StudentPrincipal, @Param('id') id: string, @Body(zodBody(petrosTeacherHandoffUpdateSchema)) body: PetrosTeacherHandoffUpdateInput) { return this.service.updateHandoff(this.principal(raw), id, body); }

  @Get('export')
  export(@CurrentStudent() raw: StudentPrincipal) { return this.service.exportStudent(this.principal(raw)); }

  @Delete('data')
  delete(@CurrentStudent() raw: StudentPrincipal, @Body(zodBody(deleteSchema)) _body: z.infer<typeof deleteSchema>) { return this.service.deleteStudentDerived(this.principal(raw)); }
}

@ApiTags('parent-petros-institutional')
@Controller('parent/petros')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, GuardianScopeGuard)
export class ParentPetrosInstitutionalController {
  constructor(private readonly service: PetrosInstitutionalService) {}

  @Get('students/:studentId/digests')
  history(@CurrentGuardian() guardian: GuardianContext, @Param('studentId') studentId: string) { return this.service.parentDigestHistory(guardian, studentId); }

  @Get('students/:studentId/digest-preferences')
  preference(@CurrentGuardian() guardian: GuardianContext, @Param('studentId') studentId: string) { return this.service.parentPreference(guardian, studentId); }

  @Put('digest-preferences')
  preferences(@CurrentGuardian() guardian: GuardianContext, @Body(zodBody(petrosParentDigestPreferenceSchema)) body: PetrosParentDigestPreferenceInput) { return this.service.parentPreferences(guardian, body); }

  @Post('digests')
  digest(@CurrentGuardian() guardian: GuardianContext, @Body(zodBody(petrosParentDigestCommandSchema)) body: PetrosParentDigestCommandInput) { return this.service.parentDigestCommand(guardian, body); }
}

@ApiTags('petros-institutional-operations')
@Controller('petros-institutional')
export class PetrosInstitutionalOperationsController {
  constructor(private readonly service: PetrosInstitutionalService) {}

  @Get('dashboard')
  @RequirePermissions('ai.view')
  dashboard(@Query(zodBody(petrosInstitutionalDashboardQuerySchema)) query: PetrosInstitutionalDashboardQuery, @PrincipalCtx() p: PrincipalContext, @ReqContext() r: EdrionRequestContext) {
    return this.service.dashboard(query, { principalContext: p, request: r });
  }

  @Post('process-jobs')
  @RequirePermissions('ai.configure')
  @RequireRecentAuth()
  jobs() { return this.service.processJobs(); }
}
