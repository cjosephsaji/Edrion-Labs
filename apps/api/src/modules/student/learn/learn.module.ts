import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { LearnEngineModule } from './engine/learn-engine.module';
import { LearnAiModule } from '../learn-ai/learn-ai.module';
import { LearningEventsModule } from '../ledger/learning-events.module';
import { VisualStudioModule } from '../visual-studio/visual-studio.module';
import { StudentAuthModule } from '../auth/student-auth.module';
import { LearnRepository } from './learn.repository';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';
import { QuickController } from './quick.controller';
import { QuickService } from './quick.service';
import { PathController } from './path.controller';
import { PathService } from './path.service';
import { RevisionController } from './revision.controller';
import { RevisionService } from './revision.service';
import { StreaksController } from './streaks.controller';
import { StreaksService } from './streaks.service';
import { HistoryController } from './history.controller';
import { HistoryService } from './history.service';

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
    AskController,
    QuickController,
    PathController,
    RevisionController,
    StreaksController,
    HistoryController,
  ],
  providers: [
    LearnRepository,
    AskService,
    QuickService,
    PathService,
    RevisionService,
    StreaksService,
    HistoryService,
  ],
  exports: [LearnEngineModule, LearnRepository, PathService],
})
export class LearnModule {}
