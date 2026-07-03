import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import {
  assignmentsQuerySchema,
  attendanceQuerySchema,
  createPaymentIntentSchema,
  type AssignmentsQuery,
  type CreatePaymentIntentInput,
  type DateRangeQuery,
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
}
