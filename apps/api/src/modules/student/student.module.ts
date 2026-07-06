import '../student.types';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { LEARNING_EVENTS_WRITER } from '../../common/tokens';
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
import { LearningEventsRepository } from './ledger/learning-events.repository';
import { LearningEventsWriter } from './ledger/learning-events.writer';
import { LearnAiModule } from './learn-ai/learn-ai.module';
import { LearnRepository } from './learn/learn.repository';
import { HistoryController } from './learn/history.controller';
import { HistoryService } from './learn/history.service';
import { LibraryController } from './library/library.controller';
import { LibraryRepository } from './library/library.repository';
import { LibraryService } from './library/library.service';
import { LabVisualController } from './lab-visual/lab-visual.controller';
import { LabVisualService } from './lab-visual/lab-visual.service';
import { LabMockController } from './lab-mock/lab-mock.controller';
import { LabMockService } from './lab-mock/lab-mock.service';
import { LabDebateController } from './lab-debate/lab-debate.controller';
import { LabDebateService } from './lab-debate/lab-debate.service';
import { AchievementsProcessor } from './jobs/achievements.processor';
import { AchievementsController } from './achievements/achievements.controller';
import { AchievementsService } from './achievements/achievements.service';

@Module({
  imports: [FeatureControlsModule, PortalModule, LearnAiModule],
  controllers: [
    StudentAuthController,
    StudentMeController,
    StudentHomeController,
    StudentStorageController,
    HistoryController,
    LibraryController,
    LabVisualController,
    LabMockController,
    LabDebateController,
    AchievementsController,
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
    LearningEventsRepository,
    LearningEventsWriter,
    LearnRepository,
    HistoryService,
    LibraryRepository,
    LibraryService,
    LabVisualService,
    LabMockService,
    LabDebateService,
    AchievementsService,
    AchievementsProcessor,
    { provide: LEARNING_EVENTS_WRITER, useExisting: LearningEventsWriter },
    { provide: APP_INTERCEPTOR, useClass: StudentTenantInterceptor },
  ],
  exports: [StudentSessionService, StudentAuthGuard, StudentPermissionsGuard, LEARNING_EVENTS_WRITER],
})
export class StudentModule {}
