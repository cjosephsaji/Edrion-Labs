import { Module } from '@nestjs/common';
import { EmailService } from '../portal/email.service';
import { PublicRegistrationController } from './public-registration.controller';
import { RegistrationRequestsController } from './registration-requests.controller';
import { RegistrationService } from './registration.service';
import { RegistrationApprovalService } from './registration-approval.service';
import { RegistrationEmailService } from './registration-email.service';
import { OtpService } from './otp.service';
import { RegistrationRepository } from './registration.repository';

/**
 * Institution Registration & Approval. Public funnel (unauthenticated, rate-limited) + reviewer
 * workspace (permission-gated). Shares the global database, audit writer and email seam. Approval
 * provisions an institution into the existing Institutions/Campuses/InstitutionUsers tables.
 */
@Module({
  controllers: [PublicRegistrationController, RegistrationRequestsController],
  providers: [
    RegistrationService,
    RegistrationApprovalService,
    RegistrationEmailService,
    OtpService,
    RegistrationRepository,
    EmailService,
  ],
})
export class RegistrationModule {}
