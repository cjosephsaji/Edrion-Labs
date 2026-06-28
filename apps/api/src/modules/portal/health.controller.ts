import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createHealthRecordSchema,
  createMedicalIncidentSchema,
  createMedicationLogSchema,
  healthRecordsListQuerySchema,
  medicalIncidentsListQuerySchema,
  medicationLogsListQuerySchema,
  updateHealthRecordSchema,
  updateMedicalIncidentSchema,
  updateMedicationLogSchema,
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
import { HealthService } from './health.service';
import type { CrudListQuery } from './portal-crud.engine';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Health API (Phase 13 — School Nurse). Records read/create/update gated by the
 * health_records.* keys (update is sensitive); incidents + medication logs gated by their single
 * sensitive *.manage keys. Tenancy + scope + version + audit are enforced by the CRUD engine.
 */
@ApiTags('portal-health')
@Controller('portal/health')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class HealthController {
  constructor(private readonly svc: HealthService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- health records --------------------------------------------------------
  @Get('records')
  @RequireInstitutionPermissions('health_records.view')
  listRecords(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(healthRecordsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('records', this.ctx(p, s, r), q);
  }

  @Post('records')
  @RequireInstitutionPermissions('health_records.create')
  createRecord(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createHealthRecordSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('records', this.ctx(p, s, r), body);
  }

  @Patch('records/:id')
  @RequireInstitutionPermissions('health_records.update')
  updateRecord(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateHealthRecordSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('records', this.ctx(p, s, r), id, body);
  }

  @Delete('records/:id')
  @RequireInstitutionPermissions('health_records.update')
  removeRecord(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('records', this.ctx(p, s, r), id, body.version);
  }

  // --- medical incidents -----------------------------------------------------
  @Get('incidents')
  @RequireInstitutionPermissions('medical_incidents.manage')
  listIncidents(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(medicalIncidentsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('incidents', this.ctx(p, s, r), q);
  }

  @Post('incidents')
  @RequireInstitutionPermissions('medical_incidents.manage')
  createIncident(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createMedicalIncidentSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('incidents', this.ctx(p, s, r), body);
  }

  @Patch('incidents/:id')
  @RequireInstitutionPermissions('medical_incidents.manage')
  updateIncident(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateMedicalIncidentSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('incidents', this.ctx(p, s, r), id, body);
  }

  @Delete('incidents/:id')
  @RequireInstitutionPermissions('medical_incidents.manage')
  removeIncident(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('incidents', this.ctx(p, s, r), id, body.version);
  }

  // --- medication logs -------------------------------------------------------
  @Get('medications')
  @RequireInstitutionPermissions('medication_logs.manage')
  listMedications(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(medicationLogsListQuerySchema)) q: CrudListQuery,
  ) {
    return this.svc.list('medications', this.ctx(p, s, r), q);
  }

  @Post('medications')
  @RequireInstitutionPermissions('medication_logs.manage')
  createMedication(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createMedicationLogSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.create('medications', this.ctx(p, s, r), body);
  }

  @Patch('medications/:id')
  @RequireInstitutionPermissions('medication_logs.manage')
  updateMedication(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateMedicationLogSchema)) body: Record<string, unknown>,
  ) {
    return this.svc.update('medications', this.ctx(p, s, r), id, body);
  }

  @Delete('medications/:id')
  @RequireInstitutionPermissions('medication_logs.manage')
  removeMedication(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.remove('medications', this.ctx(p, s, r), id, body.version);
  }
}
