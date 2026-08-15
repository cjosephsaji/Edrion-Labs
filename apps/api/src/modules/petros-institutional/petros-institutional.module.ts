import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../feature-controls/feature-controls.module';
import { ParentPortalModule } from '../parent-portal/parent-portal.module';
import { GuardianScopeGuard } from '../parent-portal/guardian-scope.guard';
import { PetrosAiRoutingModule } from '../petros-ai-routing/petros-ai-routing.module';
import { PortalModule } from '../portal/portal.module';
import { StudentAuthModule } from '../student/auth/student-auth.module';
import { StudentPortalGuard } from '../student/core/student-portal.guard';
import { StudentRateLimitGuard } from '../student/core/student-rate-limit.guard';
import { SurfacesService } from '../student/surfaces/surfaces.service';
import {
  ParentPetrosInstitutionalController,
  PetrosInstitutionalOperationsController,
  PortalPetrosInstitutionalController,
  StudentPetrosInstitutionalController,
} from './petros-institutional.controller';
import { PetrosInstitutionalRepository } from './petros-institutional.repository';
import { PetrosInstitutionalService } from './petros-institutional.service';
import { PetrosInstitutionalJobs } from './petros-institutional.jobs';

@Module({
  imports: [FeatureControlsModule, PortalModule, ParentPortalModule, StudentAuthModule, PetrosAiRoutingModule],
  controllers: [PortalPetrosInstitutionalController, StudentPetrosInstitutionalController, ParentPetrosInstitutionalController, PetrosInstitutionalOperationsController],
  providers: [PetrosInstitutionalRepository, PetrosInstitutionalService, PetrosInstitutionalJobs, GuardianScopeGuard, StudentPortalGuard, StudentRateLimitGuard, SurfacesService],
  exports: [PetrosInstitutionalService],
})
export class PetrosInstitutionalModule {}
