import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  admissionsListQuerySchema,
  createAdmissionSchema,
  decideAdmissionSchema,
  enrolAdmissionSchema,
  updateAdmissionSchema,
  versionedDeleteSchema,
  type AdmissionsListQuery,
  type CreateAdmissionInput,
  type DecideAdmissionInput,
  type EnrolAdmissionInput,
  type UpdateAdmissionInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import {
  CurrentInstitutionPrincipal,
  CurrentScope,
  RequireInstitutionPermissions,
} from './portal.decorators';
import { AdmissionsService } from './admissions.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Admissions API (Phase 5) — applicant lifecycle + enrol-to-student bridge.
 * Same boundary as the rest of the portal: @Public (skips the platform AuthGuard) then
 * InstitutionAuthGuard (identity + scope) → InstitutionPermissionsGuard. Gated by
 * admissions.{view,manage}.
 */
@ApiTags('portal-admissions')
@Controller('portal/admissions')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class AdmissionsController {
  constructor(private readonly service: AdmissionsService) {}

  private ctx(
    principal: InstitutionPrincipal,
    scope: InstitutionScope,
    request: EdrionRequestContext,
  ): PortalActionContext {
    return { principal, scope, request };
  }

  @Get()
  @RequireInstitutionPermissions('admissions.view')
  list(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(admissionsListQuerySchema)) q: AdmissionsListQuery,
  ) {
    return this.service.list(this.ctx(p, s, r), q);
  }

  @Post()
  @RequireInstitutionPermissions('admissions.manage')
  create(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createAdmissionSchema)) body: CreateAdmissionInput,
  ) {
    return this.service.create(this.ctx(p, s, r), body);
  }

  @Patch(':id')
  @RequireInstitutionPermissions('admissions.manage')
  update(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateAdmissionSchema)) body: UpdateAdmissionInput,
  ) {
    return this.service.update(this.ctx(p, s, r), id, body);
  }

  @Post(':id/decision')
  @RequireInstitutionPermissions('admissions.manage')
  decide(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(decideAdmissionSchema)) body: DecideAdmissionInput,
  ) {
    return this.service.decide(this.ctx(p, s, r), id, body);
  }

  @Post(':id/enrol')
  @RequireInstitutionPermissions('admissions.manage')
  enrol(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(enrolAdmissionSchema)) body: EnrolAdmissionInput,
  ) {
    return this.service.enrol(this.ctx(p, s, r), id, body);
  }

  @Delete(':id')
  @RequireInstitutionPermissions('admissions.manage')
  delete(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.delete(this.ctx(p, s, r), id, body.version);
  }
}
