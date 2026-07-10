import { Module } from '@nestjs/common';
import { LearnAiModule } from '../learn-ai/learn-ai.module';
import { LearningEventsModule } from '../ledger/learning-events.module';
import { ExamEngineController } from './exam-engine.controller';
import { ExamEngineService } from './exam-engine.service';
import { ExamGenerationService } from './exam-generation.service';
import { ExamSubjectiveGradingService } from './exam-subjective-grading.service';
import { ExamEngineProcessor } from './exam-engine.processor';
import { QuestionBankService } from './question-bank.service';
import { ExamTopicalityService } from './exam-topicality.service';
import { StudentAuthModule } from '../auth/student-auth.module';

@Module({
  imports: [LearnAiModule, LearningEventsModule, StudentAuthModule],
  controllers: [ExamEngineController],
  providers: [
    ExamEngineService,
    ExamGenerationService,
    ExamSubjectiveGradingService,
    ExamEngineProcessor,
    QuestionBankService,
    ExamTopicalityService,
  ],
  exports: [ExamEngineService],
})
export class ExamEngineModule {}
