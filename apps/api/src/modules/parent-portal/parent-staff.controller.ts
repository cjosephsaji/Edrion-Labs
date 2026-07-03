import { Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import {
  decideRequestSchema,
  emergencyBroadcastSchema,
  fulfilDocumentRequestSchema,
  publishNoticeSchema,
  recordMedicalIncidentSchema,
  reviewAbsenceNoteSchema,
  staffRecognitionSchema,
  staffReplySchema,
  type DecideRequestInput,
  type EmergencyBroadcastInput,
  type FulfilDocumentRequestInput,
  type PublishNoticeInput,
  type RecordMedicalIncidentInput,
  type ReviewAbsenceNoteInput,
  type StaffRecognitionInput,
  type StaffReplyInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import { InstitutionPermissionsGuard } from '../portal/portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from '../portal/portal.decorators';
import type { PortalActionContext } from '../portal/portal-action-context';
import { ParentStaffService } from './parent-staff.service';
import { ParentEmergencyService } from './parent-emergency.service';

/**
 * Institution-side (staff) counterparts to the parent portal, under /v1/parent-staff/*. Uses the
 * staff auth stack (InstitutionAuthGuard → InstitutionPermissionsGuard) with per-route permission
 * keys — NOT the guardian guard. Each loop-closing action fans out a guardian notification.
 */
@ApiTags('parent-portal-staff')
@Controller('parent-staff')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class ParentStaffController {
  constructor(
    private readonly staff: ParentStaffService,
    private readonly emergency: ParentEmergencyService,
  ) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Post('absence-notes/:id/review')
  @RequireInstitutionPermissions('attendance.absence_notes.review')
  reviewAbsence(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Param('id') id: string, @Body(zodBody(reviewAbsenceNoteSchema)) body: ReviewAbsenceNoteInput) {
    return this.staff.reviewAbsenceNote(this.ctx(p, s, r), id, body);
  }

  @Post('pickup-authorizations/:id/verify')
  @RequireInstitutionPermissions('frontdesk.pickup.verify')
  verifyPickup(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Param('id') id: string) {
    return this.staff.verifyPickup(this.ctx(p, s, r), id);
  }

  @Post('early-leave-requests/:id/decide')
  @RequireInstitutionPermissions('frontdesk.gate.manage')
  decideEarlyLeave(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Param('id') id: string, @Body(zodBody(decideRequestSchema)) body: DecideRequestInput) {
    return this.staff.decideEarlyLeave(this.ctx(p, s, r), id, body);
  }

  @Post('medical-incidents')
  @RequireInstitutionPermissions('medical_incidents.manage')
  recordMedicalIncident(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(recordMedicalIncidentSchema)) body: RecordMedicalIncidentInput) {
    return this.staff.recordMedicalIncident(this.ctx(p, s, r), body);
  }

  @Post('messages/threads/:id/reply')
  @RequireInstitutionPermissions('parent_comm.messages.respond')
  reply(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Param('id') id: string, @Body(zodBody(staffReplySchema)) body: StaffReplyInput) {
    return this.staff.staffReply(this.ctx(p, s, r), id, body);
  }

  @Post('document-requests/:id/fulfil')
  @RequireInstitutionPermissions('students.documents.manage')
  fulfilDocument(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Param('id') id: string, @Body(zodBody(fulfilDocumentRequestSchema)) body: FulfilDocumentRequestInput) {
    return this.staff.fulfilDocumentRequest(this.ctx(p, s, r), id, body);
  }

  @Post('recognitions')
  @RequireInstitutionPermissions('students.recognitions.manage')
  createRecognition(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(staffRecognitionSchema)) body: StaffRecognitionInput) {
    return this.staff.createRecognition(this.ctx(p, s, r), body);
  }

  @Post('notices')
  @RequireInstitutionPermissions('parent_comm.notices.manage')
  publishNotice(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(publishNoticeSchema)) body: PublishNoticeInput) {
    return this.staff.publishNotice(this.ctx(p, s, r), body);
  }

  @Post('profile-change-requests/:id/decide')
  @RequireInstitutionPermissions('students.profile_changes.review')
  decideProfileChange(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Param('id') id: string, @Body(zodBody(decideRequestSchema)) body: DecideRequestInput) {
    return this.staff.decideProfileChange(this.ctx(p, s, r), id, body);
  }

  /** Emergency broadcast — sensitive key (recent-auth enforced by the guard) + typed confirmation. */
  @Post('emergency-broadcasts')
  @RequireInstitutionPermissions('parent_comm.emergency.send')
  emergencyBroadcast(@CurrentInstitutionPrincipal() p: InstitutionPrincipal, @CurrentScope() s: InstitutionScope, @ReqContext() r: EdrionRequestContext, @Body(zodBody(emergencyBroadcastSchema)) body: EmergencyBroadcastInput) {
    return this.emergency.send(this.ctx(p, s, r), body);
  }
}
