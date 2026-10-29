import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { PetrosSessionIntentModule } from '../petros-session-intent/petros-session-intent.module';
import { KnowledgeDocumentModule } from '../knowledge/knowledge-document.module';
import { PetrosLearnerModelModule } from '../../petros-learner-model/petros-learner-model.module';
import { StudentAuthModule } from '../auth/student-auth.module';
import { SurfacesService } from '../surfaces/surfaces.service';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { PetrosV2Controller } from './petros-v2.controller';
import { PetrosV2SessionService } from './petros-v2-session.service';
import { PetrosV2SessionRepository } from './petros-v2-session.repository';
import { PetrosV2AssessmentService } from './petros-v2-assessment.service';
import { PetrosV2CommandWorker } from './petros-v2-command.worker';
import { PetrosV2OriginGuard } from './petros-v2-origin.guard';
@Module({
  imports: [
    KnowledgeDocumentModule,
    PetrosSessionIntentModule,
    FeatureControlsModule,
    StudentAuthModule,
    PetrosLearnerModelModule,
  ],
  controllers: [PetrosV2Controller],
  providers: [
    PetrosV2OriginGuard,
    PetrosV2SessionService,
    PetrosV2SessionRepository,
    PetrosV2AssessmentService,
    PetrosV2CommandWorker,
    SurfacesService,
    StudentPortalGuard,
    StudentRateLimitGuard,
  ],
  exports: [PetrosV2SessionService],
})
export class PetrosV2Module {}
