import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { PetrosAiRoutingModule } from '../../petros-ai-routing/petros-ai-routing.module';
import { PetrosLearnerModelModule } from '../../petros-learner-model/petros-learner-model.module';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { PetrosArtifactsModule } from '../petros-artifacts/petros-artifacts.module';
import { PetrosLoopModule } from '../petros-loop/petros-loop.module';
import { SurfacesService } from '../surfaces/surfaces.service';
import {
  PetrosTeachBackOperationsController,
  StudentPetrosTeachBackController,
} from './petros-teach-back.controller';
import { PetrosTeachBackRepository } from './petros-teach-back.repository';
import { PetrosTeachBackService } from './petros-teach-back.service';

@Module({
  imports: [
    FeatureControlsModule,
    PetrosAiRoutingModule,
    PetrosLearnerModelModule,
    PetrosLoopModule,
    PetrosArtifactsModule,
  ],
  controllers: [StudentPetrosTeachBackController, PetrosTeachBackOperationsController],
  providers: [
    PetrosTeachBackRepository,
    PetrosTeachBackService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfacesService,
  ],
  exports: [PetrosTeachBackService],
})
export class PetrosTeachBackModule {}
