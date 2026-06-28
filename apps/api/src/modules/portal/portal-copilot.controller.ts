import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  portalConfirmRunSchema,
  portalCreateRunSchema,
  portalRejectRunSchema,
  portalRunsListQuerySchema,
  type PortalConfirmRunInput,
  type PortalCreateRunInput,
  type PortalRejectRunInput,
  type PortalRunsListQuery,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { PortalCopilotService } from './portal-copilot.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Copilot API (Phase 10). A guardrailed AI assistant: a run prepares action(s) and
 * shows their exact impact + guardrail decision; state-changing actions execute only after an explicit
 * human confirmation. Every endpoint is gated by the single `ai.use` permission (plus institution auth +
 * scope); the per-tool underlying permissions are re-asserted in the service, so the AI never reaches
 * past what the user could do by hand. Reads + creates execute nothing that changes state.
 */
@ApiTags('portal-copilot')
@Controller('portal/copilot')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalCopilotController {
  constructor(private readonly service: PortalCopilotService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  /** The run log for this institution (most recent first). */
  @Get('runs')
  @RequireInstitutionPermissions('ai.use')
  listRuns(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(portalRunsListQuerySchema)) q: PortalRunsListQuery,
  ) {
    return this.service.listRuns(this.ctx(p, s, r), q);
  }

  @Get('runs/:id')
  @RequireInstitutionPermissions('ai.use')
  getRun(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.getRunDetail(this.ctx(p, s, r), id);
  }

  /** Start a run: prepare action(s) + show exact impact. Executes NOTHING that changes state. */
  @Post('runs')
  @RequireInstitutionPermissions('ai.use')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(portalCreateRunSchema)) body: PortalCreateRunInput,
  ) {
    return this.service.createRun(this.ctx(p, s, r), body);
  }

  /** Confirm a prepared run → re-evaluate guardrails → dispatch via the real audited portal service. */
  @Post('runs/:id/confirm')
  @RequireInstitutionPermissions('ai.use')
  confirm(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(portalConfirmRunSchema)) body: PortalConfirmRunInput,
  ) {
    return this.service.confirm(this.ctx(p, s, r), id, body);
  }

  @Post('runs/:id/reject')
  @RequireInstitutionPermissions('ai.use')
  reject(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(portalRejectRunSchema)) body: PortalRejectRunInput,
  ) {
    return this.service.reject(this.ctx(p, s, r), id, body);
  }
}
