import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { StudentAuthModule } from '../auth/student-auth.module';
import { QueueModule } from '../../../common/queue/queue.module';
import { LearnAiModule } from '../learn-ai/learn-ai.module';
import { DebateController } from './debate.controller';
import { DebateCatalogController } from './debate-catalog.controller';
import { DebateMeController } from './debate-me.controller';
import { DebatePublicController } from './debate-public.controller';
import { DebateRoundService } from './debate-round.service';
import { DebateConsentService } from './debate-consent.service';
import { DebateCaptureService } from './debate-capture.service';
import { DebateSttService } from './debate-stt.service';
import { DebateTranscriptService } from './debate-transcript.service';
import { DebateAdjudicationService } from './debate-adjudication.service';
import { DebateAdjudicationPipelineService } from './debate-adjudication-pipeline.service';
import { DebateProcessor } from './debate.processor';
import { DebateOrchestrationService } from './debate-orchestration.service';
import { DebateOpponentService } from './debate-opponent.service';
import { DebatePrepService } from './debate-prep.service';
import { DebateLifecycleService } from './debate-lifecycle.service';
import { DebateShareService } from './debate-share.service';
import { DebateCatalogService } from './debate-catalog.service';
import { DebateSparService } from './debate-spar.service';
import { DebateSkillsService } from './debate-skills.service';
import { DebateMotionSuggestService } from './debate-motion-suggest.service';
import { DebateRetentionService } from './debate-retention.service';
import { DebateTtsService } from './debate-tts.service';
import { StudentStorageService } from '../storage/student-storage.service';
import { VisualStudioModule } from '../visual-studio/visual-studio.module';
import { STT_PROVIDER } from './stt/stt-provider';
import { DeepgramSttProvider } from './stt/deepgram-stt.provider';
import { MockSttProvider } from './stt/mock-stt.provider';
import { TTS_PROVIDER } from './tts/tts-provider';
import { MockTtsProvider } from './tts/mock-tts.provider';
import { ConfigTtsProvider } from './tts/config-tts.provider';
import { OpenAiTtsProvider } from './tts/openai-tts.provider';

@Module({
  imports: [FeatureControlsModule, QueueModule, VisualStudioModule, LearnAiModule, StudentAuthModule],
  controllers: [DebateController, DebateCatalogController, DebateMeController, DebatePublicController],
  providers: [
    DebateRoundService,
    DebateConsentService,
    DebateCaptureService,
    DebateSttService,
    DebateTranscriptService,
    DebateAdjudicationPipelineService,
    DebateAdjudicationService,
    DebateOrchestrationService,
    DebateOpponentService,
    DebatePrepService,
    DebateLifecycleService,
    DebateShareService,
    DebateCatalogService,
    DebateSparService,
    DebateSkillsService,
    DebateMotionSuggestService,
    DebateRetentionService,
    DebateTtsService,
    DebateProcessor,
    StudentStorageService,
    MockSttProvider,
    DeepgramSttProvider,
    MockTtsProvider,
    OpenAiTtsProvider,
    ConfigTtsProvider,
    { provide: STT_PROVIDER, useExisting: DeepgramSttProvider },
    { provide: TTS_PROVIDER, useExisting: ConfigTtsProvider },
  ],
  exports: [DebateRoundService],
})
export class DebateModule {}
