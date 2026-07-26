import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { InstitutionPrincipal } from '@edrion/auth';
import { Public, SkipRateLimit } from '../../common/decorators';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, RequireInstitutionPermissions } from './portal.decorators';
import { PortalPlacementsService } from './portal-placements.service';

const createSeasonSchema = z.object({
  name: z.string().min(1).max(200),
  campusId: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'open', 'closed', 'archived']).optional(),
});

const createCompanySchema = z.object({
  name: z.string().min(1).max(200),
  sector: z.string().max(120).optional(),
});

const createDriveSchema = z.object({
  seasonId: z.string().uuid(),
  companyId: z.string().uuid(),
  title: z.string().min(1).max(300),
  packageBand: z.string().max(120).optional(),
  eligibility: z.record(z.unknown()).optional(),
});

const patchApplicationSchema = z.object({
  status: z.enum(['submitted', 'shortlisted', 'offered', 'rejected', 'withdrawn']),
});

@ApiTags('portal-placements')
@Controller('portal/placements')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class PortalPlacementsController {
  constructor(private readonly placements: PortalPlacementsService) {}

  @Get('seasons')
  @RequireInstitutionPermissions('students.view')
  seasons(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.placements.listSeasons(principal);
  }

  @Post('seasons')
  @RequireInstitutionPermissions('students.update')
  createSeason(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(createSeasonSchema)) body: z.infer<typeof createSeasonSchema>,
  ) {
    return this.placements.createSeason(principal, body);
  }

  @Get('drives')
  @RequireInstitutionPermissions('students.view')
  drives(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Query('season_id') seasonId?: string,
  ) {
    return this.placements.listDrives(principal, seasonId);
  }

  @Get('companies')
  @RequireInstitutionPermissions('students.view')
  companies(@CurrentInstitutionPrincipal() principal: InstitutionPrincipal) {
    return this.placements.listCompanies(principal);
  }

  @Post('companies')
  @RequireInstitutionPermissions('students.update')
  createCompany(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(createCompanySchema)) body: z.infer<typeof createCompanySchema>,
  ) {
    return this.placements.createCompany(principal, body);
  }

  @Post('drives')
  @RequireInstitutionPermissions('students.update')
  createDrive(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Body(zodBody(createDriveSchema)) body: z.infer<typeof createDriveSchema>,
  ) {
    return this.placements.createDrive(principal, body);
  }

  @Get('applications')
  @RequireInstitutionPermissions('students.view')
  applications(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Query('drive_id') driveId?: string,
  ) {
    return this.placements.listApplications(principal, driveId);
  }

  @Patch('applications/:id')
  @RequireInstitutionPermissions('students.update')
  patchApplication(
    @CurrentInstitutionPrincipal() principal: InstitutionPrincipal,
    @Param('id') id: string,
    @Body(zodBody(patchApplicationSchema)) body: z.infer<typeof patchApplicationSchema>,
  ) {
    return this.placements.updateApplicationStatus(principal, id, body.status);
  }
}
