import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SupabaseVerifier } from './supabase-verifier';
import { AuthLoginService } from './auth-login.service';
import { CredentialService } from './credential.service';
import { AuthController } from './auth.controller';
import { EmailService } from '../portal/email.service';
import { RegistrationEmailService } from '../registration/registration-email.service';

/** Global so the global AuthGuard can inject AuthService + SessionService. */
@Global()
@Module({
  providers: [
    AuthService,
    SessionService,
    SupabaseVerifier,
    AuthLoginService,
    CredentialService,
    EmailService,
    RegistrationEmailService,
  ],
  controllers: [AuthController],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
