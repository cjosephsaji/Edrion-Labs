import './parent-portal.types';
import { Module } from '@nestjs/common';
import { PortalModule } from '../portal/portal.module';
import { GuardianScopeGuard } from './guardian-scope.guard';
import { ParentController } from './parent.controller';
import { ParentWebhookController } from './parent-webhook.controller';
import { ParentMeService } from './parent-me.service';
import { ParentDashboardService } from './parent-dashboard.service';
import { ParentAcademicsService } from './parent-academics.service';
import { ParentFeesService } from './parent-fees.service';
import { ParentWellbeingService } from './parent-wellbeing.service';
import { ParentSafetyService } from './parent-safety.service';
import { ParentLogisticsService } from './parent-logistics.service';
import { MockPaymentProvider } from './mock-payment.provider';

/**
 * Parent Portal module. Reuses the institution-portal auth stack (InstitutionAuthGuard + session /
 * rate-limit / principal services, exported by PortalModule) and layers GuardianScopeGuard + the
 * parent-facing services on top. Routes live under /v1/parent/*.
 */
@Module({
  imports: [PortalModule],
  controllers: [ParentController, ParentWebhookController],
  providers: [
    GuardianScopeGuard,
    ParentMeService,
    ParentDashboardService,
    ParentAcademicsService,
    ParentFeesService,
    ParentWellbeingService,
    ParentSafetyService,
    ParentLogisticsService,
    MockPaymentProvider,
  ],
})
export class ParentPortalModule {}
