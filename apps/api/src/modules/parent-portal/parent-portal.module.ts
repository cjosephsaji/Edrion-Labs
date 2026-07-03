import './parent-portal.types';
import { Module } from '@nestjs/common';
import { PortalModule } from '../portal/portal.module';
import { GuardianScopeGuard } from './guardian-scope.guard';
import { ParentController } from './parent.controller';
import { ParentWebhookController } from './parent-webhook.controller';
import { ParentStaffController } from './parent-staff.controller';
import { ParentStaffService } from './parent-staff.service';
import { ParentNotifyService } from './parent-notify.service';
import { ParentFanoutService } from './parent-fanout.service';
import { ParentEmergencyService } from './parent-emergency.service';
import { ParentDigestService } from './parent-digest.service';
import { EmailChannel, SmsChannel, WebPushChannel, WhatsAppChannel } from './notification-channels';
import { ParentMeService } from './parent-me.service';
import { ParentDashboardService } from './parent-dashboard.service';
import { ParentAcademicsService } from './parent-academics.service';
import { ParentFeesService } from './parent-fees.service';
import { ParentWellbeingService } from './parent-wellbeing.service';
import { ParentSafetyService } from './parent-safety.service';
import { ParentLogisticsService } from './parent-logistics.service';
import { ParentCommService } from './parent-comm.service';
import { ParentInboxService } from './parent-inbox.service';
import { MockPaymentProvider } from './mock-payment.provider';

/**
 * Parent Portal module. Reuses the institution-portal auth stack (InstitutionAuthGuard + session /
 * rate-limit / principal services, exported by PortalModule) and layers GuardianScopeGuard + the
 * parent-facing services on top. Routes live under /v1/parent/*.
 */
@Module({
  imports: [PortalModule],
  controllers: [ParentController, ParentWebhookController, ParentStaffController],
  providers: [
    GuardianScopeGuard,
    ParentStaffService,
    ParentNotifyService,
    ParentFanoutService,
    ParentEmergencyService,
    ParentDigestService,
    EmailChannel,
    WebPushChannel,
    SmsChannel,
    WhatsAppChannel,
    ParentMeService,
    ParentDashboardService,
    ParentAcademicsService,
    ParentFeesService,
    ParentWellbeingService,
    ParentSafetyService,
    ParentLogisticsService,
    ParentCommService,
    ParentInboxService,
    MockPaymentProvider,
  ],
})
export class ParentPortalModule {}
