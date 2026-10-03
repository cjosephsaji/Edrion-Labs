import { Module } from '@nestjs/common';
import { StudentMaterialsService } from '../materials/student-materials.service';
import { KnowledgeDocumentService } from './knowledge-document.service';

@Module({
  providers: [KnowledgeDocumentService, StudentMaterialsService],
  exports: [KnowledgeDocumentService],
})
export class KnowledgeDocumentModule {}
