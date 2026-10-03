import { PetrosContinuityModule } from '../petros-continuity/petros-continuity.module';
import { KnowledgeDocumentModule } from '../knowledge/knowledge-document.module';
import { PetrosMentorService } from './petros-mentor.service';
import { StudentMaterialsService } from '../materials/student-materials.service';
import { PetrosReflectionModule } from '../petros-reflection/petros-reflection.module';
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
  imports: [PetrosContinuityModule, KnowledgeDocumentModule,PetrosReflectionModule, FeatureControlsModule, PetrosAiRoutingModule, PetrosSessionIntentModule],
  controllers: [StudentPetrosCompanionController],
  providers: [
    PetrosCompanionRepository,
    PetrosCompanionService,
    PetrosStudentContextService,
    PetrosActionRegistryService,
    PetrosBriefingService,
    PetrosMentorService,
    StudentMaterialsService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfaceGateService,
    SurfacesService,
  ],
  exports: [PetrosCompanionService, PetrosBriefingService],
})
export class PetrosCompanionModule {}
