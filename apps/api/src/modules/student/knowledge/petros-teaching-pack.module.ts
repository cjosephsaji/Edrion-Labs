import { Module, forwardRef } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { PortalModule } from '../../portal/portal.module';
import { StudentAuthModule } from '../auth/student-auth.module';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { SurfacesService } from '../surfaces/surfaces.service';
import { KnowledgeDocumentModule } from './knowledge-document.module';
import {
  PortalPetrosTeachingPackController,
  StudentPetrosTeachingPackController,
} from './petros-teaching-pack.controller';
import { PetrosTeachingPackRepository } from './petros-teaching-pack.repository';
import { PetrosTeachingPackService } from './petros-teaching-pack.service';
import { PetrosV2PublicationService } from './petros-v2-publication.service';

@Module({
  imports: [FeatureControlsModule, KnowledgeDocumentModule, StudentAuthModule, forwardRef(() => PortalModule)],
  controllers: [PortalPetrosTeachingPackController, StudentPetrosTeachingPackController],
  providers: [PetrosV2PublicationService, PetrosTeachingPackRepository, PetrosTeachingPackService, StudentPortalGuard,
    StudentRateLimitGuard, SurfacesService],
  exports: [PetrosTeachingPackService, PetrosV2PublicationService],
})
export class PetrosTeachingPackModule {}
