import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { PetrosLoopModule } from '../petros-loop/petros-loop.module';
import { SurfacesService } from '../surfaces/surfaces.service';
import {
  PetrosDoorsDashboardController,
  StudentPetrosSessionIntentController,
} from './petros-session-intent.controller';
import { PetrosSessionIntentRepository } from './petros-session-intent.repository';
import { PetrosSessionIntentService } from './petros-session-intent.service';

@Module({
  imports: [FeatureControlsModule, PetrosLoopModule],
  controllers: [StudentPetrosSessionIntentController, PetrosDoorsDashboardController],
  providers: [
    PetrosSessionIntentRepository,
    PetrosSessionIntentService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfacesService,
  ],
  exports: [PetrosSessionIntentService],
})
export class PetrosSessionIntentModule {}
