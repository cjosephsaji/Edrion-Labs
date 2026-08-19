import "./student.types";
import { Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { FeatureControlsModule } from "../feature-controls/feature-controls.module";
import { PortalModule } from "../portal/portal.module";
import { TodayNotificationModule } from "../today-notification.module";
import { StudentAuthController } from "./auth/student-auth.controller";
import { StudentAuthModule } from "./auth/student-auth.module";
import { StudentTenantInterceptor } from "./core/student-tenant.interceptor";
import { StudentPortalGuard } from "./core/student-portal.guard";
import { StudentStorageController } from "./storage/student-storage.controller";
import { StudentStorageService } from "./storage/student-storage.service";
import { LearningEventsModule } from "./ledger/learning-events.module";
import { CampusMirrorsModule } from "./campus-mirrors/campus-mirrors.module";
import { SurfacesService } from "./surfaces/surfaces.service";
import { SurfaceGateService } from "./surfaces/surface-gate.service";
import { AttendanceRollupService } from "./attendance/attendance-rollup.service";
import { AttendanceJobsService } from "./attendance/attendance-jobs.service";
import { StudentMeController } from "./me/student-me.controller";
import { StudentMeService } from "./me/student-me.service";
import { StudentHomeController } from "./home/student-home.controller";
import { StudentHomeService } from "./home/student-home.service";
import { StudentAttendanceController } from "./attendance/student-attendance.controller";
import { StudentAttendanceService } from "./attendance/student-attendance.service";
import { StudentTimetableController } from "./timetable/student-timetable.controller";
import { TimetableResolverService } from "./timetable/timetable-resolver.service";
import { IcsController } from "./timetable/ics.controller";
import { IcsService } from "./timetable/ics.service";
import { StudentClassesController } from "./classes/student-classes.controller";
import { StudentClassesService } from "./classes/student-classes.service";
import { StudentCoursesController } from "./courses/student-courses.controller";
import { StudentCoursesService } from "./courses/student-courses.service";
import { StudentAssignmentsController } from "./assignments/student-assignments.controller";
import { StudentAssignmentsService } from "./assignments/student-assignments.service";
import { StudentHomeworkController } from "./homework/homework.controller";
import { StudentHomeworkService } from "./homework/homework.service";
import { HomeworkRepository } from "./homework/homework.repository";
import { HomeworkPolicyService } from "./homework/homework-policy.service";
import { StudentExamsController } from "./exams/student-exams.controller";
import { StudentExamsService } from "./exams/student-exams.service";
import { StudentResultsController } from "./results/student-results.controller";
import { StudentResultsService } from "./results/student-results.service";
import { StudentReportCardsController } from "./report-cards/student-report-cards.controller";
import { StudentReportCardsService } from "./report-cards/student-report-cards.service";
import { StudentFeesController } from "./fees/student-fees.controller";
import {
  StudentAnnouncementsController,
  StudentNotificationsController,
} from "./comms/student-comms.controller";
import { StudentCommsService } from "./comms/student-comms.service";
import { StudentCalendarController } from "./calendar/student-calendar.controller";
import { StudentCalendarService } from "./calendar/student-calendar.service";
import { StudentMaterialsController } from "./materials/student-materials.controller";
import { StudentMaterialsService } from "./materials/student-materials.service";
import { StudentDocumentsController } from "./documents/student-documents.controller";
import { StudentDocumentsService } from "./documents/student-documents.service";
import { StudentSurfacesController } from "./surfaces/student-surfaces.controller";
import { StudentSurfacesReadService } from "./surfaces/student-surfaces-read.service";
import { FeesSummaryService } from "./surfaces/fees-summary.service";
import { StudentPortalRuntimeConfigController } from "./surfaces/student-portal-config.controller";
import { PetrosLoopModule } from "./petros-loop/petros-loop.module";
import { PetrosArtifactsModule } from "./petros-artifacts/petros-artifacts.module";
import { PetrosSessionIntentModule } from "./petros-session-intent/petros-session-intent.module";
import { PetrosCompanionModule } from "./petros-companion/petros-companion.module";
import { PetrosInputModesModule } from "./petros-input-modes/petros-input-modes.module";
import { PetrosTeachBackModule } from "./petros-teach-back/petros-teach-back.module";
import { PetrosReflectionModule } from "./petros-reflection/petros-reflection.module";
import { PetrosLearnerModelModule } from "../petros-learner-model/petros-learner-model.module";

/**
 * Student platform infrastructure + institutional read portal.
 *
 * Shared infra (auth, tenant, storage, ledger, attendance jobs, surface gate) is
 * exported for the request engine and institutional portal. Controllers resolve
 * ownership from StudentPrincipal — never from client-supplied student ids.
 */
@Module({
  imports: [
    FeatureControlsModule,
    PortalModule,
    StudentAuthModule,
    TodayNotificationModule,
    LearningEventsModule,
    CampusMirrorsModule,
    PetrosLearnerModelModule,
    PetrosLoopModule,
    PetrosArtifactsModule,
    PetrosSessionIntentModule,
    PetrosCompanionModule,
    PetrosInputModesModule,
    PetrosTeachBackModule,
    PetrosReflectionModule,
  ],
  controllers: [
    StudentAuthController,
    StudentStorageController,
    StudentMeController,
    StudentHomeController,
    StudentAttendanceController,
    StudentTimetableController,
    IcsController,
    StudentClassesController,
    StudentCoursesController,
    StudentAssignmentsController,
    StudentHomeworkController,
    StudentExamsController,
    StudentResultsController,
    StudentReportCardsController,
    StudentFeesController,
    StudentAnnouncementsController,
    StudentNotificationsController,
    StudentCalendarController,
    StudentMaterialsController,
    StudentDocumentsController,
    StudentSurfacesController,
    StudentPortalRuntimeConfigController,
  ],
  providers: [
    SurfacesService,
    SurfaceGateService,
    StudentStorageService,
    AttendanceRollupService,
    AttendanceJobsService,
    StudentPortalGuard,
    StudentMeService,
    StudentHomeService,
    StudentAttendanceService,
    TimetableResolverService,
    IcsService,
    StudentClassesService,
    StudentCoursesService,
    StudentAssignmentsService,
    StudentHomeworkService,
    HomeworkRepository,
    HomeworkPolicyService,
    StudentExamsService,
    StudentResultsService,
    StudentReportCardsService,
    StudentCommsService,
    StudentCalendarService,
    StudentMaterialsService,
    StudentDocumentsService,
    StudentSurfacesReadService,
    FeesSummaryService,
    { provide: APP_INTERCEPTOR, useClass: StudentTenantInterceptor },
  ],
  exports: [
    StudentAuthModule,
    LearningEventsModule,
    StudentStorageService,
    SurfaceGateService,
    AttendanceRollupService,
    AttendanceJobsService,
  ],
})
export class StudentModule {}
