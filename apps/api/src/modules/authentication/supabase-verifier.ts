import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { parseSupabaseClaims, type SupabaseClaims } from '@edrion/auth';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';
import { verifyHs256 } from '../../common/jwt';

/**
 * Verifies a Supabase access token. Supabase signs access tokens with the project JWT secret
 * (HS256), so verification is: check the HS256 signature with SUPABASE_JWT_SECRET, then validate
 * the decoded claims. Returns the trusted claims (sub → employee, aal → MFA), or 401.
 */
@Injectable()
export class SupabaseVerifier {
  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  /** True when a Supabase JWT secret is configured (real token verification is possible). */
  get configured(): boolean {
    return Boolean(this.env.SUPABASE_JWT_SECRET);
  }

  verify(accessToken: string): SupabaseClaims {
    if (!this.env.SUPABASE_JWT_SECRET) {
      throw new UnauthorizedException({
        code: 'AUTH_NOT_CONFIGURED',
        message: 'Supabase auth is not configured on this server',
      });
    }
    try {
      const payload = verifyHs256(accessToken, this.env.SUPABASE_JWT_SECRET);
      return parseSupabaseClaims(payload);
    } catch {
      throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'Invalid access token' });
    }
  }
}
