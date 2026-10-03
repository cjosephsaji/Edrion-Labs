import { forwardRef, Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { PetrosInstitutionalModule } from '../../petros-institutional/petros-institutional.module';
import { PortalModule } from '../../portal/portal.module';
import { StudentPortalGuard } from '../core/student-portal.guard';
import { StudentRateLimitGuard } from '../core/student-rate-limit.guard';
import { PetrosTeachingPackModule } from '../knowledge/petros-teaching-pack.module';
import { SurfacesService } from '../surfaces/surfaces.service';
import {
  PortalPetrosQualitativeReviewController,
  StudentPetrosQualitativeReviewController,
} from './petros-qualitative-review.controller';
import { PetrosQualitativeReviewRepository } from './petros-qualitative-review.repository';
import { PetrosQualitativeReviewService } from './petros-qualitative-review.service';

@Module({
  imports: [
    FeatureControlsModule,
    PetrosTeachingPackModule,
    PetrosInstitutionalModule,
    forwardRef(() => PortalModule),
  ],
  controllers: [StudentPetrosQualitativeReviewController, PortalPetrosQualitativeReviewController],
  providers: [
    PetrosQualitativeReviewRepository,
    PetrosQualitativeReviewService,
    StudentPortalGuard,
    StudentRateLimitGuard,
    SurfacesService,
  ],
  exports: [PetrosQualitativeReviewService],
})
export class PetrosQualitativeReviewModule {}
