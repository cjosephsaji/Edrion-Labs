import { Module, forwardRef } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { StudentAuthModule } from '../auth/student-auth.module';
import { ExamPrepModule } from '../exam-prep/exam-prep.module';
import { CampusMirrorsController, IdentityVerifyController } from './campus-mirrors.controller';
import { CampusDiaryController } from './campus-diary.controller';
import { CampusMirrorsService } from './campus-mirrors.service';
import { CampusPlacementsService } from './campus-placements.service';
import { CampusLifeService } from './campus-life.service';
import { LibraryFinesService } from './library-fines.service';
import { PlacementEligibilityService } from './placement-eligibility.service';
import { IdentityTokenService } from './identity-token.service';

@Module({
  imports: [FeatureControlsModule, forwardRef(() => StudentAuthModule), forwardRef(() => ExamPrepModule)],
  controllers: [CampusMirrorsController, IdentityVerifyController, CampusDiaryController],
  providers: [
    CampusMirrorsService,
    CampusPlacementsService,
    CampusLifeService,
    LibraryFinesService,
    PlacementEligibilityService,
    IdentityTokenService,
  ],
  exports: [IdentityTokenService, LibraryFinesService],
})
export class CampusMirrorsModule {}
