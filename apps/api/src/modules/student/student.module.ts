import './student.types';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { FeatureControlsModule } from '../feature-controls/feature-controls.module';
import { PortalModule } from '../portal/portal.module';
import { StudentAuthController } from './auth/student-auth.controller';
import { StudentAuthModule } from './auth/student-auth.module';
import { StudentTenantInterceptor } from './core/student-tenant.interceptor';
import { StudentMeController } from './me/student-me.controller';
import { StudentMeService } from './me/student-me.service';
import { StudentHomeController } from './home/student-home.controller';
import { StudentHomeService } from './home/student-home.service';
import { SurfacesService } from './surfaces/surfaces.service';
import { FeesSummaryService } from './surfaces/fees-summary.service';
import { StudentStorageController } from './storage/student-storage.controller';
import { StudentStorageService } from './storage/student-storage.service';
import { LearningEventsModule } from './ledger/learning-events.module';
import { LearnAiModule } from './learn-ai/learn-ai.module';
import { EdrionLearnModule } from './edrion-learn/edrion-learn.module';
import { LearnRepository } from './learn/learn.repository';
import { AskController } from './learn/ask.controller';
import { AskService } from './learn/ask.service';
import { QuickController } from './learn/quick.controller';
import { QuickService } from './learn/quick.service';
import { PathController } from './learn/path.controller';
import { PathService } from './learn/path.service';
import { RevisionController } from './learn/revision.controller';
import { RevisionService } from './learn/revision.service';
import { StreaksController } from './learn/streaks.controller';
import { StreaksService } from './learn/streaks.service';
import { HistoryController } from './learn/history.controller';
import { HistoryService } from './learn/history.service';
import { LibraryController } from './library/library.controller';
import { LibraryStreamController } from './library/library-stream.controller';
import { LibraryRepository } from './library/library.repository';
import { LibraryService } from './library/library.service';
import { LibraryIngestWorker } from './library/library-ingest.worker';
import { ExamEngineModule } from './exam-engine/exam-engine.module';
import { LabDebateController } from './lab-debate/lab-debate.controller';
import { LabDebateService } from './lab-debate/lab-debate.service';
import { AchievementsProcessor } from './jobs/achievements.processor';
import { AchievementsController } from './achievements/achievements.controller';
import { AchievementsService } from './achievements/achievements.service';
import { StudentAnalyticsController } from './analytics/student-analytics.controller';
import { StudentAnalyticsService } from './analytics/student-analytics.service';
import { StudentAssignmentsController } from './assignments/student-assignments.controller';
import { StudentAssignmentsService } from './assignments/student-assignments.service';
import { StudentCalendarController } from './calendar/student-calendar.controller';
import { StudentCalendarService } from './calendar/student-calendar.service';
import { StudentClassesController } from './classes/student-classes.controller';
import { StudentClassesService } from './classes/student-classes.service';
import { StudentCoursesController } from './courses/student-courses.controller';
import { StudentCoursesService } from './courses/student-courses.service';
import { StudentExamsController } from './exams/student-exams.controller';
import { StudentExamsService } from './exams/student-exams.service';
import { StudentQuizAttemptService } from './quiz-attempt.service';
import { StudentReportCardsController } from './report-cards/student-report-cards.controller';
import { StudentReportCardsService } from './report-cards/student-report-cards.service';
import { StudentHomeworkController } from './homework/homework.controller';
import { StudentHomeworkService } from './homework/homework.service';
import { HomeworkRepository } from './homework/homework.repository';
import { HomeworkPolicyService } from './homework/homework-policy.service';
import { VisualStudioModule } from './visual-studio/visual-studio.module';
import { StudentSurfacesController } from './surfaces/student-surfaces.controller';
import { StudentSurfacesReadService } from './surfaces/student-surfaces-read.service';
import { SurfaceGateService } from './surfaces/surface-gate.service';
import { StudentPortalRuntimeConfigController } from './surfaces/student-portal-config.controller';
import { StudentFeesController } from './fees/student-fees.controller';
import { TodayController } from './today/today.controller';
import { TodayService } from './today/today.service';
import { TodayJobsService } from './today/today-jobs.service';
import { TodayNotificationModule } from '../today-notification.module';

@Module({
  imports: [FeatureControlsModule, PortalModule, LearnAiModule, LearningEventsModule, VisualStudioModule, ExamEngineModule, StudentAuthModule, TodayNotificationModule, EdrionLearnModule],
  controllers: [
    StudentAuthController,
    StudentMeController,
    StudentHomeController,
    StudentStorageController,
    AskController,
    QuickController,
    PathController,
    RevisionController,
    StreaksController,
    HistoryController,
    LibraryController,
    LibraryStreamController,
    LabDebateController,
    AchievementsController,
    StudentAnalyticsController,
    StudentAssignmentsController,
    StudentCalendarController,
    StudentClassesController,
    StudentCoursesController,
    StudentExamsController,
    StudentReportCardsController,
    StudentHomeworkController,
    StudentSurfacesController,
    StudentPortalRuntimeConfigController,
    StudentFeesController,
    TodayController,
  ],
  providers: [
    StudentMeService,
    StudentHomeService,
    SurfacesService,
    FeesSummaryService,
    StudentStorageService,
    LearnRepository,
    AskService,
    QuickService,
    PathService,
    RevisionService,
    StreaksService,
    HistoryService,
    LibraryRepository,
    LibraryService,
    LibraryIngestWorker,
    LabDebateService,
    AchievementsService,
    AchievementsProcessor,
    StudentAnalyticsService,
    StudentAssignmentsService,
    StudentCalendarService,
    StudentClassesService,
    StudentCoursesService,
    StudentExamsService,
    StudentQuizAttemptService,
    StudentReportCardsService,
    StudentHomeworkService,
    HomeworkRepository,
    HomeworkPolicyService,
    SurfaceGateService,
    StudentSurfacesReadService,
    TodayService,
    TodayJobsService,
    { provide: APP_INTERCEPTOR, useClass: StudentTenantInterceptor },
  ],
  exports: [
    StudentAuthModule,
    LearningEventsModule,
    StudentStorageService,
    SurfaceGateService,
  ],
})
export class StudentModule {}
