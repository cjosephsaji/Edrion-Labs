import './portal.types';
import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PortalController } from './portal.controller';
import { PortalAuthService } from './portal-auth.service';
import { PortalRepository } from './portal.repository';
import { PortalDashboardService } from './portal-dashboard.service';
import { PortalSearchService } from './portal-search.service';
import { PortalSearchRepository } from './portal-search.repository';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { PortalAuthController } from './portal-auth.controller';
import { PortalAuthLoginService } from './portal-auth-login.service';
import { PortalCredentialService } from './portal-credential.service';
import { PortalSessionService } from './portal-session.service';
import { PortalInviteService } from './portal-invite.service';
import { EmailService } from './email.service';
import { RegistrationEmailService } from '../registration/registration-email.service';
import { InstitutionRateLimiter } from './portal-rate-limit';
import { PortalTenantInterceptor } from './portal-tenant.interceptor';
import { SupabaseVerifier } from '../authentication/supabase-verifier';
import { AcademicsController } from './academics.controller';
import { AcademicsService } from './academics.service';
import { AcademicsRepository } from './academics.repository';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';
import { PeopleRepository } from './people.repository';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';
import { AdmissionsRepository } from './admissions.repository';
import { AttendanceController } from './attendance.controller';
import { AttendanceService } from './attendance.service';
import { AttendanceRepository } from './attendance.repository';
import { TimetableController } from './timetable.controller';
import { TimetableService } from './timetable.service';
import { TimetableRepository } from './timetable.repository';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';
import { ExamsRepository } from './exams.repository';
import { GradebookController } from './gradebook.controller';
import { GradebookService } from './gradebook.service';
import { GradebookRepository } from './gradebook.repository';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { AssignmentsRepository } from './assignments.repository';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';
import { FeesRepository } from './fees.repository';
import { ExpensesController } from './expenses.controller';
import { ExpensesService } from './expenses.service';
import { PayrollController } from './payroll.controller';
import { PayrollService } from './payroll.service';
import { PayrollRepository } from './payroll.repository';
import { LibraryController } from './library.controller';
import { LibraryService } from './library.service';
import { LibraryRepository } from './library.repository';
import { TransportController } from './transport.controller';
import { TransportService } from './transport.service';
import { TransportRepository } from './transport.repository';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryRepository } from './inventory.repository';
import { HostelController } from './hostel.controller';
import { HostelService } from './hostel.service';
import { HostelRepository } from './hostel.repository';
import { AnnouncementsController, NotificationsController } from './announcements.controller';
import { AnnouncementsService, NotificationsService } from './announcements.service';
import { AnnouncementsRepository } from './announcements.repository';
import { RecipientResolver } from './recipient-resolver.service';
import { RecipientsController, RecipientsService } from './recipients.controller';
import { ConversationsController, ConversationsService } from './conversations.controller';
import { AttachmentStorageService } from './attachment-storage.service';
import { AttentionController, AttentionService } from './attention.controller';
import { MessagesController } from './messaging.controller';
import { MessagingService } from './messaging.service';
import { MessagingRepository } from './messaging.repository';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportsRepository } from './reports.repository';
import { PortalCopilotController } from './portal-copilot.controller';
import { PortalCopilotService } from './portal-copilot.service';
import { PortalCopilotRepository } from './portal-copilot.repository';
import { PortalCopilotToolRegistry } from './portal-copilot.tools';
import { PortalCopilotPlanner } from './portal-copilot.planner';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SettingsRepository } from './settings.repository';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { RolesRepository } from './roles.repository';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UsersRepository } from './users.repository';
import { PortalAuditController } from './portal-audit.controller';
import { PortalAuditService } from './portal-audit.service';
import { PortalAuditRepository } from './portal-audit.repository';
// Phase 13: functional staff modules
import { PortalCrudEngine } from './portal-crud.engine';
import { PortalEntityResolver } from './portal-entity-resolver';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { CounselingController } from './counseling.controller';
import { CounselingService } from './counseling.service';
import { LabsController } from './labs.controller';
import { LabsService } from './labs.service';
import { FrontDeskController } from './front-desk.controller';
import { FrontDeskService } from './front-desk.service';
import { FacilitiesController } from './facilities.controller';
import { FacilitiesService } from './facilities.service';
import { SecurityController } from './security.controller';
import { SecurityService } from './security.service';
import { ItController } from './it.controller';
import { ItService } from './it.service';
import { DirectoryController, DirectoryService } from './directory.controller';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingRepository } from './onboarding.repository';
import { PortalCampusesController } from './portal-campuses.controller';
import { PortalCampusesService } from './portal-campuses.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { ConductController } from './conduct.controller';
import { ConductService } from './conduct.service';
import { StudentProfileController } from './student-profile.controller';
import { StudentProfileService } from './student-profile.service';
import { StudentPortalController, StudentPortalStudentsController } from './student-portal.controller';
import { StudentPortalInviteService } from './student-portal.service';
import { AdmissionInfoController, AdmissionInfoService } from './admission-info.controller';
import { PetrosController } from './petros/petros.controller';
import { PetrosConversationsService } from './petros/petros-conversations.service';
import { PetrosAgentService } from './petros/petros-agent.service';
import { PetrosRepository } from './petros/petros.repository';
import { PetrosOpenAiService } from './petros/openai-client.service';
import { PetrosToolRegistry } from './petros/tools/registry';
import { PetrosAttachmentService } from './petros/petros-attachment.service';
import { DocumentsGenModule } from '../documents/documents-gen.module';
import { FeatureControlsModule } from '../feature-controls/feature-controls.module';
import { LearningEventsModule } from '../student/ledger/learning-events.module';
import { PortalReportQueriesService } from './portal-report-queries.service';
import { PetrosTopicalityService } from './petros/petros-topicality.service';
import { DocumentsGenController } from '../documents/documents-gen.controller';
import { PortalHomeworkController } from './homework/portal-homework.controller';
import { PortalHomeworkService } from './homework/portal-homework.service';
import { PortalCourseContentController } from './course-content/portal-course-content.controller';
import { PortalCourseContentService } from './course-content/portal-course-content.service';
import { PortalCoursesController } from './courses/portal-courses.controller';
import { PortalCoursesService } from './courses/portal-courses.service';
import { PortalReportCardsController } from './report-cards/portal-report-cards.controller';
import { PortalLearningSummaryService, PortalReportCardsService } from './report-cards/portal-report-cards.service';
import { PortalCalendarEventsController } from './calendar-events/portal-calendar-events.controller';
import { PortalCalendarEventsService } from './calendar-events/portal-calendar-events.service';

/**
 * Institution Portal module — the tenant-facing API. Separate from the platform control-plane
 * modules; shares the same database, audit writer and infrastructure. Its guards run at the
 * controller level (the global platform AuthGuard is skipped via @Public on the controller).
 */
@Module({
  imports: [DocumentsGenModule, FeatureControlsModule, LearningEventsModule],
  controllers: [
    PortalController,
    PortalAuthController,
    AcademicsController,
    PeopleController,
    AdmissionsController,
    AttendanceController,
    TimetableController,
    ExamsController,
    GradebookController,
    AssignmentsController,
    FeesController,
    ExpensesController,
    PayrollController,
    LibraryController,
    TransportController,
    InventoryController,
    HostelController,
    AnnouncementsController,
    NotificationsController,
    MessagesController,
    ReportsController,
    PortalCopilotController,
    PetrosController,
    DocumentsGenController,
    SettingsController,
    RolesController,
    UsersController,
    PortalAuditController,
    // Phase 13: functional staff modules
    HealthController,
    CounselingController,
    LabsController,
    FrontDeskController,
    FacilitiesController,
    SecurityController,
    ItController,
    DirectoryController,
    RecipientsController,
    ConversationsController,
    AttentionController,
    OnboardingController,
    PortalCampusesController,
    DocumentsController,
    BillingController,
    ConductController,
    StudentProfileController,
    StudentPortalController,
    StudentPortalStudentsController,
    AdmissionInfoController,
    PortalHomeworkController,
    PortalCourseContentController,
    PortalCoursesController,
    PortalReportCardsController,
    PortalCalendarEventsController,
  ],
  providers: [
    PortalAuthService,
    PortalSessionService,
    PortalAuthLoginService,
    PortalCredentialService,
    PortalInviteService,
    EmailService,
    RegistrationEmailService,
    InstitutionRateLimiter,
    SupabaseVerifier,
    PortalRepository,
    PortalDashboardService,
    PortalSearchService,
    PortalSearchRepository,
    { provide: APP_INTERCEPTOR, useClass: PortalTenantInterceptor },
    AcademicsService,
    AcademicsRepository,
    PeopleService,
    PeopleRepository,
    AdmissionsService,
    AdmissionsRepository,
    AttendanceService,
    AttendanceRepository,
    TimetableService,
    TimetableRepository,
    ExamsService,
    ExamsRepository,
    GradebookService,
    GradebookRepository,
    AssignmentsService,
    AssignmentsRepository,
    FeesService,
    ExpensesService,
    FeesRepository,
    PayrollService,
    PayrollRepository,
    LibraryService,
    LibraryRepository,
    TransportService,
    TransportRepository,
    InventoryService,
    InventoryRepository,
    HostelService,
    HostelRepository,
    AnnouncementsService,
    NotificationsService,
    AnnouncementsRepository,
    RecipientResolver,
    RecipientsService,
    ConversationsService,
    AttachmentStorageService,
    AttentionService,
    MessagingService,
    MessagingRepository,
    ReportsService,
    ReportsRepository,
    PortalCopilotService,
    PortalCopilotRepository,
    PortalCopilotToolRegistry,
    PortalCopilotPlanner,
    PetrosConversationsService,
    PetrosAgentService,
    PetrosRepository,
    PetrosOpenAiService,
    PetrosToolRegistry,
    PetrosAttachmentService,
    PortalReportQueriesService,
    PetrosTopicalityService,
    SettingsService,
    SettingsRepository,
    RolesService,
    RolesRepository,
    UsersService,
    UsersRepository,
    PortalAuditService,
    PortalAuditRepository,
    InstitutionAuthGuard,
    InstitutionPermissionsGuard,
    // Phase 13: functional staff modules
    PortalEntityResolver,
    PortalCrudEngine,
    HealthService,
    CounselingService,
    LabsService,
    FrontDeskService,
    FacilitiesService,
    SecurityService,
    ItService,
    DirectoryService,
    OnboardingService,
    OnboardingRepository,
    PortalCampusesService,
    DocumentsService,
    BillingService,
    ConductService,
    StudentProfileService,
    StudentPortalInviteService,
    AdmissionInfoService,
    PortalHomeworkService,
    PortalCourseContentService,
    PortalCoursesService,
    PortalReportCardsService,
    PortalLearningSummaryService,
    PortalCalendarEventsService,
  ],
  // InstitutionAuthGuard (+ its session/rate-limit deps) is reused by the Parent Portal module,
  // which layers GuardianScopeGuard on top. Export the guard's transitive deps so it resolves there.
  exports: [PortalAuthService, InstitutionAuthGuard, InstitutionPermissionsGuard, PortalSessionService, InstitutionRateLimiter, EmailService],
})
export class PortalModule {}
