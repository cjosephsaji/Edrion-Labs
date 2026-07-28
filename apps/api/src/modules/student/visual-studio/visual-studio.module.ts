import { Module } from '@nestjs/common';
import { CopilotModule } from '../../copilot/copilot.module';
import { LearnAiModule } from '../learn-ai/learn-ai.module';
import { LearningEventsModule } from '../ledger/learning-events.module';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { VisualStudioController } from './visual-studio.controller';
import { VisualStudioService } from './visual-studio.service';
import { VisualStudioRepository } from './visual-studio.repository';
import { VisualGroundingService } from './visual-grounding.service';
import { VisualStudioProcessor } from './visual-studio.processor';
import { VisualJobEventStore } from './visual-job-event-store';
import { VisualGenerationService } from './visual-generation.service';
import { VisualReferenceCacheService } from './visual-reference-cache.service';
import { VisualMemoryDiffService } from './visual-memory-diff.service';
import { VisualTopicalityService } from './visual-topicality.service';
import { StudentAuthModule } from '../auth/student-auth.module';

@Module({
  imports: [LearnAiModule, LearningEventsModule, CopilotModule, StudentAuthModule],
  controllers: [VisualStudioController],
  providers: [
    VisualStudioService,
    VisualStudioRepository,
    VisualGroundingService,
    VisualStudioProcessor,
    VisualJobEventStore,
    VisualGenerationService,
    VisualReferenceCacheService,
    VisualMemoryDiffService,
    VisualTopicalityService,
    StudentRateLimitGuard,
  ],
  exports: [VisualGroundingService, VisualStudioRepository, VisualGenerationService],
})
export class VisualStudioModule {}
