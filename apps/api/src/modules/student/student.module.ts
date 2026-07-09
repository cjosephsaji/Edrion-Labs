import './student.types';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { FeatureControlsModule } from '../feature-controls/feature-controls.module';
import { PortalModule } from '../portal/portal.module';
import { StudentAuthController } from './auth/student-auth.controller';
import { StudentAuthService } from './auth/student-auth.service';
import { IndependentSignupService } from './auth/independent-signup.service';
import { StudentAuthGuard } from './core/student-auth.guard';
import { StudentSessionService } from './core/student-session.service';
import { StudentTenantInterceptor } from './core/student-tenant.interceptor';
import { StudentPermissionsGuard } from './core/student-permissions.guard';
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
import { LearnRepository } from './learn/learn.repository';
import { SessionsController } from './learn/sessions.controller';
import { SessionsService } from './learn/sessions.service';
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
import { NotesController } from './learn/notes.controller';
import { NotesService } from './learn/notes.service';
import { HistoryController } from './learn/history.controller';
import { HistoryService } from './learn/history.service';
import { LibraryController } from './library/library.controller';
import { LibraryStreamController } from './library/library-stream.controller';
import { LibraryRepository } from './library/library.repository';
import { LibraryService } from './library/library.service';
import { LibraryIngestWorker } from './library/library-ingest.worker';
import { LabVisualController } from './lab-visual/lab-visual.controller';
import { LabVisualService } from './lab-visual/lab-visual.service';
import { LabMockController } from './lab-mock/lab-mock.controller';
import { LabMockService } from './lab-mock/lab-mock.service';
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
import { StudentReportCardsController } from './report-cards/student-report-cards.controller';
import { StudentReportCardsService } from './report-cards/student-report-cards.service';
import { StudentHomeworkController } from './homework/homework.controller';
import { StudentHomeworkService } from './homework/homework.service';
import { HomeworkRepository } from './homework/homework.repository';
import { HomeworkPolicyService } from './homework/homework-policy.service';
import { StudentSurfacesController } from './surfaces/student-surfaces.controller';
import { StudentSurfacesReadService } from './surfaces/student-surfaces-read.service';
import { SurfaceGateService } from './surfaces/surface-gate.service';

@Module({
  imports: [FeatureControlsModule, PortalModule, LearnAiModule, LearningEventsModule],
  controllers: [
    StudentAuthController,
    StudentMeController,
    StudentHomeController,
    StudentStorageController,
    SessionsController,
    AskController,
    QuickController,
    PathController,
    RevisionController,
    StreaksController,
    NotesController,
    HistoryController,
    LibraryController,
    LibraryStreamController,
    LabVisualController,
    LabMockController,
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
  ],
  providers: [
    StudentSessionService,
    StudentAuthService,
    IndependentSignupService,
    StudentAuthGuard,
    StudentPermissionsGuard,
    StudentMeService,
    StudentHomeService,
    SurfacesService,
    FeesSummaryService,
    StudentStorageService,
    LearnRepository,
    SessionsService,
    AskService,
    QuickService,
    PathService,
    RevisionService,
    StreaksService,
    NotesService,
    HistoryService,
    LibraryRepository,
    LibraryService,
    LibraryIngestWorker,
    LabVisualService,
    LabMockService,
    LabDebateService,
    AchievementsService,
    AchievementsProcessor,
    StudentAnalyticsService,
    StudentAssignmentsService,
    StudentCalendarService,
    StudentClassesService,
    StudentCoursesService,
    StudentExamsService,
    StudentReportCardsService,
    StudentHomeworkService,
    HomeworkRepository,
    HomeworkPolicyService,
    SurfaceGateService,
    StudentSurfacesReadService,
    { provide: APP_INTERCEPTOR, useClass: StudentTenantInterceptor },
  ],
  exports: [StudentSessionService, StudentAuthGuard, StudentPermissionsGuard, LearningEventsModule],
})
export class StudentModule {}
