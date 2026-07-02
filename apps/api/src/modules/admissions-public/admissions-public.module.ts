import { Module } from '@nestjs/common';
import { EmailService } from '../portal/email.service';
import { AttachmentStorageService } from '../portal/attachment-storage.service';
import { OtpService } from '../registration/otp.service';
import { AdmissionsPublicController } from './admissions-public.controller';
import { AdmissionsPublicService } from './admissions-public.service';
import { AdmissionsPublicRepository } from './admissions-public.repository';

/**
 * Public parent admission-apply funnel. Unauthenticated (rate-limited, OTP-verified, signed resume
 * token). Reuses the shared {@link OtpService} lifecycle (bound to its own `admission_application_otps`
 * table) and the {@link EmailService} seam. On submit it creates a tenant-owned
 * `admission_applications` row for the parent-chosen institution.
 */
@Module({
  controllers: [AdmissionsPublicController],
  providers: [AdmissionsPublicService, AdmissionsPublicRepository, OtpService, EmailService, AttachmentStorageService],
})
export class AdmissionsPublicModule {}
