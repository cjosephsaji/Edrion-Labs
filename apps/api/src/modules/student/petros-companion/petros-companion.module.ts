import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { PetrosAiRoutingModule } from '../../petros-ai-routing/petros-ai-routing.module';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { PetrosSessionIntentModule } from '../petros-session-intent/petros-session-intent.module';
import { SurfaceGateService } from '../surfaces/surface-gate.service';
import { SurfacesService } from '../surfaces/surfaces.service';
import { PetrosActionRegistryService } from './petros-action-registry.service';
import { PetrosBriefingService } from './petros-briefing.service';
import { StudentPetrosCompanionController } from './petros-companion.controller';
import { PetrosCompanionRepository } from './petros-companion.repository';
import { PetrosCompanionService } from './petros-companion.service';
import { PetrosStudentContextService } from './petros-student-context.service';

@Module({
  imports: [FeatureControlsModule, PetrosAiRoutingModule, PetrosSessionIntentModule],
  controllers: [StudentPetrosCompanionController],
  providers: [
    PetrosCompanionRepository,
    PetrosCompanionService,
    PetrosStudentContextService,
    PetrosActionRegistryService,
    PetrosBriefingService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfaceGateService,
    SurfacesService,
  ],
  exports: [PetrosCompanionService, PetrosBriefingService],
})
export class PetrosCompanionModule {}
