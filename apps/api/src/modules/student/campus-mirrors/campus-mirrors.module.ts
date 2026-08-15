import { Module } from '@nestjs/common';
import { FeatureControlsModule } from '../../feature-controls/feature-controls.module';
import { IdentityTokenService } from './identity-token.service';
import { LibraryFinesService } from './library-fines.service';

/**
 * Services shared with the institutional portal: rotating ID-card verification
 * tokens (portal security) and library fine computation (maintenance sweeps).
 * The student-facing campus controllers were removed with the old portal.
 */
@Module({
  imports: [FeatureControlsModule],
  providers: [IdentityTokenService, LibraryFinesService],
  exports: [IdentityTokenService, LibraryFinesService],
})
export class CampusMirrorsModule {}
