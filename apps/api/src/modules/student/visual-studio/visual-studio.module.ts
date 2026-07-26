import { Module } from '@nestjs/common';
import { CopilotModule } from '../../copilot/copilot.module';
import { LearnAiModule } from '../learn-ai/learn-ai.module';
import { LearningEventsModule } from '../ledger/learning-events.module';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { IdempotencyService } from '../../../common/idempotency.service';
import { VisualStudioController } from './visual-studio.controller';
import { CanvasController } from './canvas.controller';
import { VisualStudioService } from './visual-studio.service';
import { VisualStudioRepository } from './visual-studio.repository';
import { VisualGroundingService } from './visual-grounding.service';
import { VisualStudioProcessor } from './visual-studio.processor';
import { VisualJobEventStore } from './visual-job-event-store';
import { VisualGenerationService } from './visual-generation.service';
import { VisualReferenceCacheService } from './visual-reference-cache.service';
import { VisualMemoryDiffService } from './visual-memory-diff.service';
import { VisualTopicalityService } from './visual-topicality.service';
import { VisualSchemaMigrationService } from './visual-schema-migration.service';
import { VisualSchemaBackfillProcessor } from './visual-schema-backfill.processor';
import { VisualRevisionService } from './visual-revision.service';
import { CanvasGraphService } from './canvas-graph.service';
import { StudentAuthModule } from '../auth/student-auth.module';

@Module({
  imports: [LearnAiModule, LearningEventsModule, CopilotModule, StudentAuthModule],
  controllers: [VisualStudioController, CanvasController],
  providers: [
    VisualStudioService,
    VisualStudioRepository,
    VisualRevisionService,
    CanvasGraphService,
    IdempotencyService,
    VisualGroundingService,
    VisualStudioProcessor,
    VisualJobEventStore,
    VisualGenerationService,
    VisualReferenceCacheService,
    VisualMemoryDiffService,
    VisualTopicalityService,
    VisualSchemaMigrationService,
    VisualSchemaBackfillProcessor,
    StudentRateLimitGuard,
  ],
  exports: [
    VisualGroundingService,
    VisualStudioRepository,
    VisualRevisionService,
    VisualSchemaMigrationService,
    CanvasGraphService,
  ],
})
export class VisualStudioModule {}
