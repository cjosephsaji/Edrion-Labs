import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import {
  assignmentsQuerySchema,
  attendanceQuerySchema,
  createEarlyLeaveRequestSchema,
  createHostelOutingRequestSchema,
  createPaymentIntentSchema,
  createPickupAuthorizationSchema,
  putHealthProfileSchema,
  updatePickupAuthorizationSchema,
  type AssignmentsQuery,
  type CreateEarlyLeaveRequestInput,
  type CreateHostelOutingRequestInput,
  type CreatePaymentIntentInput,
  type CreatePickupAuthorizationInput,
  type DateRangeQuery,
  type PutHealthProfileInput,
  type UpdatePickupAuthorizationInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from '../portal/portal-auth.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
} from '../portal/portal.decorators';
import type { PortalActionContext } from '../portal/portal-action-context';
import { GuardianScopeGuard } from './guardian-scope.guard';
import { CurrentGuardian } from './parent.decorators';
import type { GuardianContext } from './guardian-context';
import { ParentMeService } from './parent-me.service';
import { ParentDashboardService } from './parent-dashboard.service';
import { ParentAcademicsService } from './parent-academics.service';
import { ParentFeesService } from './parent-fees.service';
import { ParentWellbeingService } from './parent-wellbeing.service';
import { ParentSafetyService } from './parent-safety.service';
import { ParentLogisticsService } from './parent-logistics.service';

/**
 * Parent Portal API (/v1/parent/*). @Public so the platform AuthGuard skips it; the real boundary is
 * InstitutionAuthGuard (authenticates the institution_user) → GuardianScopeGuard (loads the caller's
 * wards). Every ward-scoped endpoint validates its :studentId against the guardian context.
 */
@ApiTags('parent-portal')
@Controller('parent')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, GuardianScopeGuard)
export class ParentController {
  constructor(
    private readonly meService: ParentMeService,
    private readonly dashboardService: ParentDashboardService,
    private readonly academics: ParentAcademicsService,
    private readonly fees: ParentFeesService,
    private readonly wellbeing: ParentWellbeingService,
    private readonly safety: ParentSafetyService,
    private readonly logistics: ParentLogisticsService,
  ) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // ── Identity & home ──────────────────────────────────────────────────────────
  @Get('me')
  me(@CurrentGuardian() guardian: GuardianContext) {
    return this.meService.getMe(guardian);
  }

  @Get('dashboard')
  dashboard(@CurrentGuardian() guardian: GuardianContext, @Query('studentId') studentId: string) {
    return this.dashboardService.dashboard(guardian, studentId);
  }

  // ── Academics ────────────────────────────────────────────────────────────────
  @Get('students/:id/attendance')
  attendance(
    @CurrentGuardian() g: GuardianContext,
    @Param('id') id: string,
    @Query(zodBody(attendanceQuerySchema)) q: DateRangeQuery,
  ) {
    return this.academics.attendance(g, id, q);
  }

  @Get('students/:id/assignments')
  assignments(
    @CurrentGuardian() g: GuardianContext,
    @Param('id') id: string,
    @Query(zodBody(assignmentsQuerySchema)) q: AssignmentsQuery,
  ) {
    return this.academics.assignments(g, id, q);
  }

  @Get('students/:id/results')
  results(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.academics.results(g, id);
  }

  @Get('students/:id/exams')
  exams(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.academics.exams(g, id);
  }

  @Get('students/:id/timetable')
  timetable(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.academics.timetable(g, id);
  }

  // ── Money ────────────────────────────────────────────────────────────────────
  @Get('fees')
  fees_(@CurrentGuardian() g: GuardianContext, @Query('studentId') studentId?: string) {
    return this.fees.listFees(g, studentId);
  }

  @Get('fees/receipts')
  receipts(@CurrentGuardian() g: GuardianContext, @Query('studentId') studentId?: string) {
    return this.fees.receipts(g, studentId);
  }

  @Get('fees/invoices/:id')
  invoice(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.fees.getInvoice(g, id);
  }

  @Post('fees/invoices/:id/payment-intents')
  createPaymentIntent(
    @CurrentGuardian() g: GuardianContext,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Headers('idempotency-key') idem: string | undefined,
    @Body(zodBody(createPaymentIntentSchema)) body: CreatePaymentIntentInput,
  ) {
    return this.fees.createPaymentIntent(this.ctx(p, s, r), g, id, body, idem);
  }

  // ── Wellbeing ──────────────────────────────────────────────────────────────
  @Get('students/:id/health/profile')
  healthProfile(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.wellbeing.getHealthProfile(g, id);
  }

  @Post('students/:id/health/profile')
  putHealthProfile(
    @CurrentGuardian() g: GuardianContext,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(putHealthProfileSchema)) body: PutHealthProfileInput,
  ) {
    return this.wellbeing.putHealthProfile(this.ctx(p, s, r), g, id, body);
  }

  @Get('students/:id/health/visits')
  healthVisits(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.wellbeing.visits(g, id);
  }

  @Get('students/:id/health/incidents')
  healthIncidents(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.wellbeing.incidents(g, id);
  }

  @Get('students/:id/health/medications')
  healthMedications(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.wellbeing.medications(g, id);
  }

  @Get('students/:id/behavior')
  behavior(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.wellbeing.behavior(g, id);
  }

  @Post('behavior/:incidentId/acknowledge')
  ackBehavior(
    @CurrentGuardian() g: GuardianContext,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('incidentId') incidentId: string,
  ) {
    return this.wellbeing.acknowledgeBehavior(this.ctx(p, s, r), g, incidentId);
  }

  @Get('students/:id/recognitions')
  recognitions(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.wellbeing.recognitions(g, id);
  }

  @Get('students/:id/counseling-disclosure')
  counselingDisclosure(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.wellbeing.counselingDisclosure(g, id);
  }

  // ── Safety / gate ────────────────────────────────────────────────────────────
  @Get('students/:id/pickup-authorizations')
  pickups(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.safety.listPickups(g, id);
  }

  @Post('students/:id/pickup-authorizations')
  createPickup(
    @CurrentGuardian() g: GuardianContext,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(createPickupAuthorizationSchema)) body: CreatePickupAuthorizationInput,
  ) {
    return this.safety.createPickup(this.ctx(p, s, r), g, id, body);
  }

  @Post('pickup-authorizations/:pickupId')
  updatePickup(
    @CurrentGuardian() g: GuardianContext,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('pickupId') pickupId: string,
    @Body(zodBody(updatePickupAuthorizationSchema)) body: UpdatePickupAuthorizationInput,
  ) {
    return this.safety.updatePickup(this.ctx(p, s, r), g, pickupId, body);
  }

  @Post('pickup-authorizations/:pickupId/revoke')
  revokePickup(
    @CurrentGuardian() g: GuardianContext,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('pickupId') pickupId: string,
  ) {
    return this.safety.revokePickup(this.ctx(p, s, r), g, pickupId);
  }

  @Post('students/:id/early-leave-requests')
  createEarlyLeave(
    @CurrentGuardian() g: GuardianContext,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(createEarlyLeaveRequestSchema)) body: CreateEarlyLeaveRequestInput,
  ) {
    return this.safety.createEarlyLeave(this.ctx(p, s, r), g, id, body);
  }

  @Get('students/:id/early-leave-requests')
  earlyLeaves(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.safety.listEarlyLeave(g, id);
  }

  @Get('students/:id/gate-events')
  gateEvents(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.safety.gateEvents(g, id);
  }

  // ── Logistics: transport / library / hostel ────────────────────────────────────
  @Get('students/:id/transport')
  transport(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.logistics.transport(g, id);
  }

  @Get('students/:id/library')
  library(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.logistics.library(g, id);
  }

  @Get('students/:id/hostel')
  hostel(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.logistics.hostel(g, id);
  }

  @Post('students/:id/hostel/outing-requests')
  createOuting(
    @CurrentGuardian() g: GuardianContext,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Param('id') id: string,
    @Body(zodBody(createHostelOutingRequestSchema)) body: CreateHostelOutingRequestInput,
  ) {
    return this.logistics.createOuting(this.ctx(p, s, r), g, id, body);
  }

  @Get('students/:id/hostel/outing-requests')
  outings(@CurrentGuardian() g: GuardianContext, @Param('id') id: string) {
    return this.logistics.listOutings(g, id);
  }
}
