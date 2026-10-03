import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { PetrosInstitutionalModule } from '../../petros-institutional/petros-institutional.module';
import { StudentAuthModule } from '../auth/student-auth.module';
import { KnowledgeDocumentModule } from '../knowledge/knowledge-document.module';
import { PetrosTeachingPackModule } from '../knowledge/petros-teaching-pack.module';
import { SurfacesService } from '../surfaces/surfaces.service';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { PetrosContinuityRepository } from './petros-continuity.repository';
import { PetrosContinuityService } from './petros-continuity.service';
import { StudentPetrosContinuityController } from './petros-continuity.controller';
import { PetrosPilotService } from './petros-pilot.service';
@Module({imports:[FeatureControlsModule,StudentAuthModule,KnowledgeDocumentModule,PetrosTeachingPackModule,PetrosInstitutionalModule],
 controllers:[StudentPetrosContinuityController],providers:[PetrosContinuityRepository,PetrosContinuityService,PetrosPilotService,SurfacesService,StudentPortalGuard,StudentRateLimitGuard],
 exports:[PetrosContinuityService]})
export class PetrosContinuityModule{}
