import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  campusAccessLogsListQuerySchema,
  createCampusAccessLogSchema,
  createEmergencyAlertSchema,
  createGatePassSchema,
  createSecurityIncidentSchema,
  emergencyAlertsListQuerySchema,
  gatePassesListQuerySchema,
  securityIncidentsListQuerySchema,
  updateCampusAccessLogSchema,
  updateEmergencyAlertSchema,
  updateGatePassSchema,
  updateSecurityIncidentSchema,
  versionedDeleteSchema,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { SecurityService } from './security.service';
import { IdentityTokenService } from '../student/campus-mirrors/identity-token.service';
import type { CrudListQuery } from './portal-crud.engine';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Security API (Phase 13 — Security Staff). Gate passes gated by
 * gate_passes.manage; incidents by the sensitive security_incidents.manage; emergency alerts by
 * emergency_alerts.view; campus access logs by campus_access_logs.view.
 */
@ApiTags('portal-security')
@Controller('portal/security')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class SecurityController {
  constructor(
    private readonly svc: SecurityService,
    private readonly identity: IdentityTokenService,
  ) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- gate passes -----------------------------------------------------------
  @Get('gate-passes')
  @RequireInstitutionPermissions('gate_passes.manage')
  listGatePasses(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(gatePassesListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('gate-passes', this.ctx(p, s, r), q);
  }

  @Post('gate-passes')
  @RequireInstitutionPermissions('gate_passes.manage')
  createGatePass(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createGatePassSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('gate-passes', this.ctx(p, s, r), body);
  }

  @Patch('gate-passes/:id')
  @RequireInstitutionPermissions('gate_passes.manage')
  updateGatePass(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateGatePassSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('gate-passes', this.ctx(p, s, r), id, body);
  }

  @Delete('gate-passes/:id')
  @RequireInstitutionPermissions('gate_passes.manage')
  removeGatePass(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('gate-passes', this.ctx(p, s, r), id, body.version);
  }

  // --- security incidents ----------------------------------------------------
  @Get('incidents')
  @RequireInstitutionPermissions('security_incidents.manage')
  listIncidents(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(securityIncidentsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('incidents', this.ctx(p, s, r), q);
  }

  @Post('incidents')
  @RequireInstitutionPermissions('security_incidents.manage')
  createIncident(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createSecurityIncidentSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('incidents', this.ctx(p, s, r), body);
  }

  @Patch('incidents/:id')
  @RequireInstitutionPermissions('security_incidents.manage')
  updateIncident(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateSecurityIncidentSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('incidents', this.ctx(p, s, r), id, body);
  }

  @Delete('incidents/:id')
  @RequireInstitutionPermissions('security_incidents.manage')
  removeIncident(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('incidents', this.ctx(p, s, r), id, body.version);
  }

  // --- emergency alerts ------------------------------------------------------
  @Get('alerts')
  @RequireInstitutionPermissions('emergency_alerts.view')
  listAlerts(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(emergencyAlertsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('alerts', this.ctx(p, s, r), q);
  }

  @Post('alerts')
  @RequireInstitutionPermissions('emergency_alerts.view')
  createAlert(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createEmergencyAlertSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('alerts', this.ctx(p, s, r), body);
  }

  @Patch('alerts/:id')
  @RequireInstitutionPermissions('emergency_alerts.view')
  updateAlert(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateEmergencyAlertSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('alerts', this.ctx(p, s, r), id, body);
  }

  @Delete('alerts/:id')
  @RequireInstitutionPermissions('emergency_alerts.view')
  removeAlert(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('alerts', this.ctx(p, s, r), id, body.version);
  }

  // --- campus access logs ----------------------------------------------------
  @Get('access-logs')
  @RequireInstitutionPermissions('campus_access_logs.view')
  listAccessLogs(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(campusAccessLogsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('access-logs', this.ctx(p, s, r), q);
  }

  @Post('access-logs')
  @RequireInstitutionPermissions('campus_access_logs.view')
  createAccessLog(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createCampusAccessLogSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('access-logs', this.ctx(p, s, r), body);
  }

  @Patch('access-logs/:id')
  @RequireInstitutionPermissions('campus_access_logs.view')
  updateAccessLog(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateCampusAccessLogSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('access-logs', this.ctx(p, s, r), id, body);
  }

  @Delete('access-logs/:id')
  @RequireInstitutionPermissions('campus_access_logs.view')
  removeAccessLog(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('access-logs', this.ctx(p, s, r), id, body.version);
  }

  @Post('identity/verify')
  @RequireInstitutionPermissions('campus_access_logs.view')
  verifyIdentity(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @Body()
    body: { token: string; nonce: string; deviceId?: string; contextKind: string },
  ) {
    return this.identity.verifyScan({
      institutionId: p.institutionId,
      token: body.token,
      nonce: body.nonce,
      deviceId: body.deviceId,
      contextKind: body.contextKind,
    });
  }
}
