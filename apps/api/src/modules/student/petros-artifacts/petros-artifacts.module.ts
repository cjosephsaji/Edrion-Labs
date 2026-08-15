import { Module } from '@nestjs/common';
import { PetrosLearnerModelModule } from '../../petros-learner-model/petros-learner-model.module';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { SurfacesService } from '../surfaces/surfaces.service';
import { PetrosArtifactsDashboardController, StudentPetrosArtifactsController } from './petros-artifacts.controller';
import { PetrosArtifactsDashboardService } from './petros-artifacts-dashboard.service';
import { PetrosArtifactsRepository } from './petros-artifacts.repository';
import { PetrosArtifactsService } from './petros-artifacts.service';

@Module({
  imports: [FeatureControlsModule, PetrosLearnerModelModule],
  controllers: [StudentPetrosArtifactsController, PetrosArtifactsDashboardController],
  providers: [PetrosArtifactsRepository, PetrosArtifactsService, PetrosArtifactsDashboardService, StudentPortalGuard, StudentRateLimitGuard, SurfacesService],
  exports: [PetrosArtifactsService],
})
export class PetrosArtifactsModule {}
