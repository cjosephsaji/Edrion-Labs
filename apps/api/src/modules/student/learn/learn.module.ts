import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { LearnEngineModule } from './engine/learn-engine.module';
import { LearnAiModule } from '../learn-ai/learn-ai.module';
import { LearningEventsModule } from '../ledger/learning-events.module';
import { VisualStudioModule } from '../visual-studio/visual-studio.module';
import { StudentAuthModule } from '../auth/student-auth.module';
import { LearnRepository } from './learn.repository';
import { PathController } from './path.controller';
import { PathService } from './path.service';
import { RevisionController } from './revision.controller';
import { RevisionService } from './revision.service';
import { StreaksController } from './streaks.controller';
import { StreaksService } from './streaks.service';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';
import { LearnRebuildStubController } from './learn-rebuild-stub.controller';

@Module({
  imports: [
    FeatureControlsModule,
    LearnEngineModule,
    LearnAiModule,
    LearningEventsModule,
    VisualStudioModule,
    StudentAuthModule,
  ],
  controllers: [
    PathController,
    RevisionController,
    StreaksController,
    HistoryController,
    // Keep stubs for ask/quick/intent; sessions live on LearnSessionsV2Controller.
    LearnRebuildStubController,
  ],
  providers: [LearnRepository, PathService, RevisionService, StreaksService, HistoryService],
  exports: [LearnEngineModule, LearnRepository, PathService],
})
export class LearnModule {}
