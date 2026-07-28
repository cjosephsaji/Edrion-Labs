import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../../feature-controls/feature-controls.module';
import { LearnAiModule } from '../../learn-ai/learn-ai.module';
import { VisualStudioModule } from '../../visual-studio/visual-studio.module';
import { LearningEventsModule } from '../../ledger/learning-events.module';
import { StudentAuthModule } from '../../auth/student-auth.module';
import { LearnSessionsRepository } from './learn-sessions.repository';
import { LearnConfigService } from './learn-config.service';
import { MasteryService } from './mastery.service';
import { EvidenceService } from './evidence.service';
import { CanvasGraphService } from './canvas-graph.service';
import { InstitutionalContextService } from './institutional-context.service';
import { LearnProfileJobsService } from './learn-profile.jobs';
import { MasterySeedService } from './mastery-seed.service';
import { TopicResolutionService } from './topic-resolution.service';
import { SessionLifecycleService } from './loop/session-lifecycle.service';
import { LearnSessionsV2Controller } from './learn-sessions-v2.controller';
import { TutorGenerationService } from './generate/tutor-generation.service';

@Module({
  imports: [FeatureControlsModule, LearnAiModule, VisualStudioModule, LearningEventsModule, StudentAuthModule],
  controllers: [LearnSessionsV2Controller],
  providers: [
    LearnSessionsRepository,
    LearnConfigService,
    MasteryService,
    MasterySeedService,
    EvidenceService,
    CanvasGraphService,
    InstitutionalContextService,
    TopicResolutionService,
    LearnProfileJobsService,
    TutorGenerationService,
    SessionLifecycleService,
  ],
  exports: [
    LearnConfigService,
    LearnSessionsRepository,
    LearnProfileJobsService,
    MasterySeedService,
    MasteryService,
    EvidenceService,
    CanvasGraphService,
    TopicResolutionService,
    InstitutionalContextService,
    SessionLifecycleService,
    TutorGenerationService,
  ],
})
export class LearnEngineModule {}
