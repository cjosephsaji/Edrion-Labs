import { Module } from '@nestjs/common';
import { PortalModule } from '../../portal/portal.module';
import { StudentAuthService } from './student-auth.service';
import { IndependentSignupService } from './independent-signup.service';
import { StudentAuthGuard } from '../core/student-auth.guard';
import { StudentSessionService } from '../core/student-session.service';
import { StudentPermissionsGuard } from '../core/student-permissions.guard';

@Module({
  imports: [PortalModule],
  providers: [
    StudentSessionService,
    StudentAuthService,
    IndependentSignupService,
    StudentAuthGuard,
    StudentPermissionsGuard,
  ],
  exports: [
    StudentSessionService,
    StudentAuthService,
    IndependentSignupService,
    StudentAuthGuard,
    StudentPermissionsGuard,
  ],
})
export class StudentAuthModule {}
