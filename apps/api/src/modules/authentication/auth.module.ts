import { Global, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SupabaseVerifier } from './supabase-verifier';
import { AuthLoginService } from './auth-login.service';
import { AuthController } from './auth.controller';

/** Global so the global AuthGuard can inject AuthService + SessionService. */
@Global()
@Module({
  providers: [AuthService, SessionService, SupabaseVerifier, AuthLoginService],
  controllers: [AuthController],
  exports: [AuthService, SessionService],
})
export class AuthModule {}
