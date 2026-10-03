import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../feature-controls/feature-controls.module';
import { PetrosInstitutionalModule } from '../petros-institutional/petros-institutional.module';
import { StudentPortalGuard } from '../student/core/student-portal.guard';
import { StudentRateLimitGuard } from '../student/core/student-rate-limit.guard';
import { PetrosTeachingPackModule } from '../student/knowledge/petros-teaching-pack.module';
import { SurfacesService } from '../student/surfaces/surfaces.service';
import { StudentPetrosObjectiveEvidenceController } from './petros-objective-evidence.controller';
import { PetrosObjectiveEvidenceRepository } from './petros-objective-evidence.repository';
import { PetrosObjectiveEvidenceService } from './petros-objective-evidence.service';

@Module({
  imports: [FeatureControlsModule, PetrosTeachingPackModule, PetrosInstitutionalModule],
  controllers: [StudentPetrosObjectiveEvidenceController],
  providers: [
    PetrosObjectiveEvidenceRepository,
    PetrosObjectiveEvidenceService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfacesService,
  ],
  exports: [PetrosObjectiveEvidenceService],
})
export class PetrosObjectiveEvidenceModule {}
