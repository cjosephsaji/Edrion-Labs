import { Module } from '@nestjs/common';
import { AttachmentStorageService } from '../portal/attachment-storage.service';
import { PetrosOpenAiService } from '../portal/petros/openai-client.service';
import { DocumentsGenService } from './documents-gen.service';
import { DocumentRenderProcessor } from './document-render.processor';

/**
 * Document generation engine (Petros Phase 4): Handlebars-in-DB templates, BullMQ-rendered PDFs
 * (Playwright over the system Chrome), template admin API + vision format capture.
 * The controller is declared by PortalModule (it needs the portal guard's providers).
 */
@Module({
  providers: [DocumentsGenService, DocumentRenderProcessor, AttachmentStorageService, PetrosOpenAiService],
  exports: [DocumentsGenService, DocumentRenderProcessor],
})
export class DocumentsGenModule {}
