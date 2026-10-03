import { KnowledgeDocumentModule } from '../knowledge/knowledge-document.module';
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
import { PetrosTeachingPackModule } from '../knowledge/petros-teaching-pack.module';
import { PetrosInstitutionalModule } from '../../petros-institutional/petros-institutional.module';
import { PetrosQualitativeReviewModule } from './petros-qualitative-review.module';
import { PetrosLearningArtifactsService } from './petros-learning-artifacts.service';
import { StudentPetrosLearningArtifactsController } from './petros-learning-artifacts.controller';

@Module({
  imports: [KnowledgeDocumentModule,FeatureControlsModule, PetrosLearnerModelModule,
    PetrosTeachingPackModule, PetrosInstitutionalModule, PetrosQualitativeReviewModule],
  controllers: [StudentPetrosArtifactsController, PetrosArtifactsDashboardController, StudentPetrosLearningArtifactsController],
  providers: [PetrosArtifactsRepository, PetrosArtifactsService, PetrosLearningArtifactsService, PetrosArtifactsDashboardService, StudentPortalGuard, StudentRateLimitGuard, SurfacesService],
  exports: [PetrosArtifactsService],
})
export class PetrosArtifactsModule {}
