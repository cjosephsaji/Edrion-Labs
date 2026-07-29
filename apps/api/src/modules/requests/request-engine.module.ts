import { Module } from '@nestjs/common';
import { IdempotencyService } from '../../common/idempotency.service';
import { DocumentsGenModule } from '../documents/documents-gen.module';
import { WebPushChannel } from '../parent-portal/notification-channels';
import { PortalModule } from '../portal/portal.module';
import { StudentModule } from '../student/student.module';
import { TodayNotificationModule } from '../today-notification.module';
import { DocumentVerificationController } from './document-verification.controller';
import { DocumentRequestPolicyService } from './document-request-policy.service';
import { PortalRequestsController } from './portal-requests.controller';
import { RequestConfigController } from './request-config.controller';
import { RequestConfigService } from './request-config.service';
import { RequestDocumentService } from './request-document.service';
import { RequestEngineService } from './request-engine.service';
import { RequestJobsService } from './request-jobs.service';
import { RequestNotifyService } from './request-notify.service';
import { RequestRegistryService } from './request-registry.service';
import { StudentRequestsController } from './student-requests.controller';
import { PortalSensitiveReportsController } from './portal-sensitive-reports.controller';
import { SensitiveReportService } from './sensitive-report.service';

@Module({
  imports: [PortalModule, StudentModule, DocumentsGenModule, TodayNotificationModule],
  controllers: [
    StudentRequestsController,
    PortalRequestsController,
    PortalSensitiveReportsController,
    RequestConfigController,
    DocumentVerificationController,
  ],
  providers: [
    IdempotencyService,
    WebPushChannel,
    RequestRegistryService,
    RequestNotifyService,
    RequestDocumentService,
    DocumentRequestPolicyService,
    RequestEngineService,
    RequestJobsService,
    RequestConfigService,
    SensitiveReportService,
  ],
})
export class RequestEngineModule {}
