import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { LearnAiModule } from '../learn-ai/learn-ai.module';
import { VisualStudioModule } from '../visual-studio/visual-studio.module';
import { LearningEventsModule } from '../ledger/learning-events.module';
import { LibraryRepository } from '../library/library.repository';
import { EdrionLearnController } from './edrion-learn.controller';
import { EdrionLearnRepository } from './edrion-learn.repository';
import { PedagogyOrchestratorService } from './pedagogy-orchestrator.service';
import { StudentTutorPolicyService } from './student-tutor-policy.service';
import { LearnConfigService } from './learn-config.service';
import { TopicProfileService } from './profile.service';
import { MasteryService } from './mastery.service';
import { EvidenceService } from './evidence.service';
import { MovePlannerService } from './move-planner.service';
import { BlockRendererService } from './block-renderer.service';
import { CanvasGraphService } from './canvas-graph.service';
import { LearnArtifactService } from './learn-artifact.service';
import { InstitutionalContextService } from './institutional-context.service';
import { GradingService } from './grading.service';
import { SessionCompletionService } from './session-completion.service';
import { ArtifactCommitService } from './artifact-commit.service';
import { StudentAuthModule } from '../auth/student-auth.module';
import { LearnProfileJobsService } from './learn-profile.jobs';
import { MasterySeedService } from './mastery-seed.service';
import { TopicResolutionService } from './topic-resolution.service';
import { LearnerModelService } from './learner-model.service';

@Module({
  imports: [FeatureControlsModule, LearnAiModule, VisualStudioModule, LearningEventsModule, StudentAuthModule],
  controllers: [EdrionLearnController],
  providers: [
    EdrionLearnRepository,
    LibraryRepository,
    StudentTutorPolicyService,
    LearnConfigService,
    TopicProfileService,
    MasteryService,
    MasterySeedService,
    EvidenceService,
    MovePlannerService,
    BlockRendererService,
    CanvasGraphService,
    InstitutionalContextService,
    TopicResolutionService,
    LearnerModelService,
    LearnArtifactService,
    GradingService,
    SessionCompletionService,
    ArtifactCommitService,
    LearnProfileJobsService,
    PedagogyOrchestratorService,
  ],
  exports: [
    PedagogyOrchestratorService,
    StudentTutorPolicyService,
    LearnConfigService,
    EdrionLearnRepository,
    LearnArtifactService,
    LearnProfileJobsService,
    TopicProfileService,
    MasterySeedService,
  ],
})
export class EdrionLearnModule {}
