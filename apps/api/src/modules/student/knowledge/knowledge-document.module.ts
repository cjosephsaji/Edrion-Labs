import { Module } from '@nestjs/common';
import { StudentMaterialsService } from '../materials/student-materials.service';
import { KnowledgeDocumentService } from './knowledge-document.service';
import { PetrosContentUnitRepository } from './petros-content-unit.repository';
import { PetrosContentIntelligenceService } from './petros-content-intelligence.service';
import { KnowledgePreparationRepository } from './knowledge-preparation.repository';
import { KnowledgePdfProcess } from './knowledge-pdf-process';
import { PdfContentAdapter } from './adapters/pdf-content.adapter';
import { DocxContentAdapter } from './adapters/docx-content.adapter';
import { TxtContentAdapter } from './adapters/txt-content.adapter';
import { MarkdownContentAdapter } from './adapters/markdown-content.adapter';
import { PptxContentAdapter } from './adapters/pptx-content.adapter';
import { PetrosAiRoutingModule } from '../../petros-ai-routing/petros-ai-routing.module';
import { PetrosContentIntelligenceJobs } from './petros-content-intelligence.jobs';

@Module({
  imports: [PetrosAiRoutingModule],
  providers: [KnowledgeDocumentService, StudentMaterialsService, PetrosContentUnitRepository, KnowledgePreparationRepository,
    KnowledgePdfProcess, PdfContentAdapter, PptxContentAdapter, DocxContentAdapter, TxtContentAdapter, MarkdownContentAdapter, PetrosContentIntelligenceService, PetrosContentIntelligenceJobs],
  exports: [KnowledgeDocumentService, PetrosContentUnitRepository, PetrosContentIntelligenceService],
})
export class KnowledgeDocumentModule {}
