import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { CoreModule } from './common/core.module';
import { RedisModule } from './common/redis/redis.module';
import { QueueModule } from './common/queue/queue.module';
import { RequestContextMiddleware } from './common/request-context';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { AuthGuard } from './common/guards/auth.guard';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuthModule } from './modules/authentication/auth.module';
import { HealthModule } from './modules/health/health.module';
import { InstitutionsModule } from './modules/institutions/institutions.module';
import { CampusesModule } from './modules/campuses/campuses.module';
import { InstitutionUsersModule } from './modules/institution-users/institution-users.module';
import { IndependentUsersModule } from './modules/independent-users/independent-users.module';
import { EmployeesModule } from './modules/employees/employees.module';
import { PlatformRolesModule } from './modules/platform-roles/platform-roles.module';
import { PlansModule } from './modules/plans/plans.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { BillingModule } from './modules/billing/billing.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { FeatureControlsModule } from './modules/feature-controls/feature-controls.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AuditModule } from './modules/audit/audit.module';
import { SupportAccessModule } from './modules/support-access/support-access.module';
import { SupportCasesModule } from './modules/support-cases/support-cases.module';
import { AiGovernanceModule } from './modules/ai-governance/ai-governance.module';
import { CopilotModule } from './modules/copilot/copilot.module';
import { ObservabilityModule } from './modules/observability/observability.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { MaintenanceModule } from './modules/maintenance/maintenance.module';
import { PortalModule } from './modules/portal/portal.module';
import { ParentPortalModule } from './modules/parent-portal/parent-portal.module';
import { StudentModule } from './modules/student/student.module';
import { StudentAuthModule } from './modules/student/auth/student-auth.module';
import { RegistrationModule } from './modules/registration/registration.module';
import { AdmissionsPublicModule } from './modules/admissions-public/admissions-public.module';
import { RequestEngineModule } from './modules/requests/request-engine.module';

/**
 * Root module. Global guards run in order: AuthGuard (authenticate + attach principal) →
 * RateLimitGuard (per-principal/IP throttle) → PermissionsGuard (authorise + recent-auth). The
 * exception filter normalises all errors.
 */
@Module({
  imports: [
    CoreModule,
    RedisModule,
    QueueModule,
    AuthModule,
    HealthModule,
    InstitutionsModule,
    CampusesModule,
    InstitutionUsersModule,
    IndependentUsersModule,
    EmployeesModule,
    PlatformRolesModule,
    PlansModule,
    SubscriptionsModule,
    BillingModule,
    EntitlementsModule,
    FeatureControlsModule,
    AnalyticsModule,
    AuditModule,
    SupportAccessModule,
    SupportCasesModule,
    AiGovernanceModule,
    CopilotModule,
    ObservabilityModule,
    IntegrationsModule,
    MaintenanceModule,
    StudentAuthModule,
    PortalModule,
    ParentPortalModule,
    StudentModule,
    RegistrationModule,
    AdmissionsPublicModule,
    RequestEngineModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestContextMiddleware).forRoutes('*');
  }
}
