import { KnowledgeDocumentModule } from '../knowledge/knowledge-document.module';
import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { PetrosAiRoutingModule } from '../../petros-ai-routing/petros-ai-routing.module';
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
import { PetrosDocumentPreparationService } from './petros-document-preparation.service';

@Module({
  imports: [KnowledgeDocumentModule,FeatureControlsModule, PetrosAiRoutingModule, PetrosLoopModule],
  controllers: [StudentPetrosSessionIntentController, PetrosDoorsDashboardController],
  providers: [
    PetrosSessionIntentRepository,
    PetrosSessionIntentService,
    PetrosDocumentPreparationService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfacesService,
  ],
  exports: [PetrosSessionIntentService,PetrosSessionIntentRepository],
})
export class PetrosSessionIntentModule {}
