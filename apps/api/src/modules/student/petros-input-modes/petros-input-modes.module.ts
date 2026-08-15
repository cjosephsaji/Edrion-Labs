import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { PetrosAiRoutingModule } from '../../petros-ai-routing/petros-ai-routing.module';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { PetrosLoopModule } from '../petros-loop/petros-loop.module';
import { StudentStorageService } from '../storage/student-storage.service';
import { SurfacesService } from '../surfaces/surfaces.service';
import {
  PetrosInputModesOperationsController,
  StudentPetrosInputModesController,
} from './petros-input-modes.controller';
import { PetrosInputModesRepository } from './petros-input-modes.repository';
import { PetrosInputModesService } from './petros-input-modes.service';

@Module({
  imports: [FeatureControlsModule, PetrosAiRoutingModule, PetrosLoopModule],
  controllers: [StudentPetrosInputModesController, PetrosInputModesOperationsController],
  providers: [
    PetrosInputModesRepository,
    PetrosInputModesService,
    StudentStorageService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfacesService,
  ],
  exports: [PetrosInputModesService],
})
export class PetrosInputModesModule {}
