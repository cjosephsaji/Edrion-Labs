import { PetrosContinuityModule } from '../petros-continuity/petros-continuity.module';
import { StudentPetrosReconciliationController } from './petros-reconciliation.controller';
import { KnowledgeDocumentModule } from '../knowledge/knowledge-document.module';
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
import { PetrosQuestionExecutionRepository } from './petros-question-execution.repository';
import { PetrosQuestionExecutionService } from './petros-question-execution.service';
import { StudentPetrosQuestionExecutionController } from './petros-question-execution.controller';
import { PetrosTeachingPackModule } from '../knowledge/petros-teaching-pack.module';
import { PetrosObjectiveEvidenceModule } from '../../petros-learner-model/petros-objective-evidence.module';
import { PetrosProjectileRepository } from './petros-projectile.repository';
import { PetrosProjectileService } from './petros-projectile.service';
import { StudentPetrosProjectileController } from './petros-projectile.controller';
import { PetrosAdaptiveService } from './petros-adaptive.service';
import { StudentPetrosAdaptiveController } from './petros-adaptive.controller';
import { PetrosWorkspaceRepository } from './petros-workspace.repository';
import { PetrosWorkspaceService } from './petros-workspace.service';
import { StudentPetrosWorkspaceController } from './petros-workspace.controller';

@Module({
  imports: [PetrosContinuityModule, KnowledgeDocumentModule,
    PetrosTeachingPackModule,
    PetrosObjectiveEvidenceModule,
    FeatureControlsModule,
    PetrosAiRoutingModule,
    PetrosTopicProfilesModule,
    PetrosLearnerModelModule,
    PetrosInstitutionalModule,
  ],
  controllers: [StudentPetrosLoopController, PetrosDecisionDiagnosticsController, StudentPetrosQuestionExecutionController,
    StudentPetrosProjectileController, StudentPetrosAdaptiveController, StudentPetrosWorkspaceController, StudentPetrosReconciliationController],
  providers: [
    PetrosLoopRepository,
    PetrosLoopService,
    PetrosQuestionExecutionRepository,
    PetrosQuestionExecutionService,
    PetrosProjectileRepository,
    PetrosProjectileService,
    PetrosAdaptiveService,
    PetrosWorkspaceRepository,
    PetrosWorkspaceService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfacesService,
  ],
  exports: [PetrosLoopService],
})
export class PetrosLoopModule {}
