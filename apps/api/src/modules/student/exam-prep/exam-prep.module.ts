import { Module, forwardRef } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { StudentAuthModule } from '../auth/student-auth.module';
import { ExamPrepController } from './exam-prep.controller';
import { ExamPrepService } from './exam-prep.service';
import { ExamPrepTodayService } from './exam-prep-today.service';
import { ExamPrepDiagnosticService } from './exam-prep-diagnostic.service';
import { ExamPrepExamDayService, ExamPrepMockSeasonService } from './exam-prep-phase.service';
import { ExamPrepAdaptiveService } from './exam-prep-adaptive.service';

@Module({
  imports: [FeatureControlsModule, forwardRef(() => StudentAuthModule)],
  controllers: [ExamPrepController],
  providers: [
    ExamPrepService,
    ExamPrepTodayService,
    ExamPrepDiagnosticService,
    ExamPrepExamDayService,
    ExamPrepMockSeasonService,
    ExamPrepAdaptiveService,
  ],
  exports: [ExamPrepTodayService],
})
export class ExamPrepModule {}
