import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { PetrosAiRoutingModule } from '../../petros-ai-routing/petros-ai-routing.module';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { PetrosSessionIntentModule } from '../petros-session-intent/petros-session-intent.module';
import { SurfacesService } from '../surfaces/surfaces.service';
import {
  PetrosReflectionOperationsController,
  StudentPetrosReflectionController,
} from './petros-reflection.controller';
import { PetrosReflectionRepository } from './petros-reflection.repository';
import { PetrosReflectionService } from './petros-reflection.service';

@Module({
  imports: [FeatureControlsModule, PetrosAiRoutingModule, PetrosSessionIntentModule],
  controllers: [StudentPetrosReflectionController, PetrosReflectionOperationsController],
  providers: [
    PetrosReflectionRepository,
    PetrosReflectionService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfacesService,
  ],
  exports: [PetrosReflectionService],
})
export class PetrosReflectionModule {}
