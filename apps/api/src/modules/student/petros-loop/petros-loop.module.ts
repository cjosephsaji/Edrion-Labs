import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { PetrosAiRoutingModule } from '../../petros-ai-routing/petros-ai-routing.module';
import { PetrosTopicProfilesModule } from '../../petros-topic-profiles/petros-topic-profiles.module';
import { PetrosLearnerModelModule } from '../../petros-learner-model/petros-learner-model.module';
import { PetrosInstitutionalModule } from '../../petros-institutional/petros-institutional.module';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { SurfacesService } from '../surfaces/surfaces.service';
import {
  PetrosDecisionDiagnosticsController,
  StudentPetrosLoopController,
} from './petros-loop.controller';
import { PetrosLoopRepository } from './petros-loop.repository';
import { PetrosLoopService } from './petros-loop.service';

@Module({
  imports: [
    FeatureControlsModule,
    PetrosAiRoutingModule,
    PetrosTopicProfilesModule,
    PetrosLearnerModelModule,
    PetrosInstitutionalModule,
  ],
  controllers: [StudentPetrosLoopController, PetrosDecisionDiagnosticsController],
  providers: [
    PetrosLoopRepository,
    PetrosLoopService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfacesService,
  ],
  exports: [PetrosLoopService],
})
export class PetrosLoopModule {}
