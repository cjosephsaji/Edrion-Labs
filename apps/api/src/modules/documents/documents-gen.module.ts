import { Module } from '@nestjs/common';
import { AttachmentStorageService } from '../portal/attachment-storage.service';
import { PetrosOpenAiService } from '../portal/petros/openai-client.service';
import { TodayNotificationModule } from '../today-notification.module';
import { DocumentsGenService } from './documents-gen.service';
import { DocumentRenderProcessor } from './document-render.processor';
import { DocumentBatchService } from './document-batch.service';
import { DocumentBatchJobsService } from './document-batch-jobs.service';
import { ReportCardIssuanceService } from './report-card-issuance.service';
import { DocumentCatalogService } from './document-catalog.service';

/**
 * Document generation + issuance: Handlebars templates, Playwright renders,
 * batches, and report-card orchestration. Controllers are declared by PortalModule.
 */
@Module({
  imports: [TodayNotificationModule],
  providers: [
    DocumentsGenService,
    DocumentRenderProcessor,
    DocumentBatchService,
    DocumentBatchJobsService,
    ReportCardIssuanceService,
    DocumentCatalogService,
    AttachmentStorageService,
    PetrosOpenAiService,
  ],
  exports: [
    DocumentsGenService,
    DocumentRenderProcessor,
    DocumentBatchService,
    ReportCardIssuanceService,
    DocumentCatalogService,
  ],
})
export class DocumentsGenModule {}
