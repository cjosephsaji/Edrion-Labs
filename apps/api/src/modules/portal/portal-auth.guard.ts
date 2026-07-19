import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  resolveScopeFilter,
  ScopeForbiddenError,
  type InstitutionPrincipal,
  type InstitutionScope,
} from '@edrion/auth';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';
import { PortalAuthService } from './portal-auth.service';
import { PortalSessionService } from './portal-session.service';
import { InstitutionRateLimiter } from './portal-rate-limit';

/**
 * Authenticates an Institution-Portal request and attaches `institutionContext`.
 *
 * Production path: validate the HTTP-only portal session cookie (an API-signed JWT) against the
 * live `portal_sessions` row, then load the user's DB-evaluated permission set. The SESSION's
 * `lastAuthAt` — not the request — drives the recent-auth gate for sensitive actions.
 *
 * Dev path (only when PORTAL_AUTH_DEV_HEADER=true): trust `x-institution-user-email`. The dev
 * escape hatch has no server session, so it is treated as always-recent (lastAuthAt = now) — the
 * sensitive-action recent-auth gate is exercised through the real cookie flow.
 *
 * Either way the active scope is parsed from `x-institution-scope` and validated against the
 * user's allowed campuses, and a per-principal rate limit is enforced (portal controllers are
 * `@SkipRateLimit()`, so the platform limiter never sees them).
 */
@Injectable()
export class InstitutionAuthGuard implements CanActivate {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly sessions: PortalSessionService,
    private readonly rateLimiter: InstitutionRateLimiter,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const { principal, authSessionId } = await this.resolvePrincipal(req);

    // Per-institution-principal rate limit (covers every portal controller in one place).
    await this.rateLimiter.enforce(principal.institutionUserId, res);

    const scope = this.resolveScope(req, principal);

    // Assert the requested scope is within the user's allowed campuses (throws → 403).
    try {
      resolveScopeFilter(principal, scope);
    } catch (err) {
      if (err instanceof ScopeForbiddenError) {
        throw new ForbiddenException({ code: 'SCOPE_FORBIDDEN', message: err.message });
      }
      throw err;
    }

    req.institutionContext = { principal, scope, authSessionId };
    return true;
  }

  private async resolvePrincipal(
    req: Request,
  ): Promise<{ principal: InstitutionPrincipal; authSessionId?: string }> {
    // A valid portal session cookie wins. The dev `x-institution-user-email` header is sent on every
    // request in development (NEXT_PUBLIC_DEV_INSTITUTION_USER), so it must not override a user who
    // has actually signed in — otherwise every login resolves to the dev default user.
    const token = readCookie(req.headers.cookie, this.sessions.cookieName);
    if (token) {
      try {
        const session = await this.sessions.verify(token);
        const principal = await this.auth.resolveById(session.institutionUserId, session.lastAuthAt);
        return { principal, authSessionId: session.id };
      } catch (err) {
        // Stale or revoked cookies are common in dev (secret rotation, DB reset, logout elsewhere).
        // Fall back to the dev header instead of hard-failing every request until the browser drops
        // the cookie. Production still requires a live session.
        if (!this.env.PORTAL_AUTH_DEV_HEADER) throw err;
      }
    }

    // Dev escape hatch (only when enabled): trust the explicit header identity. No server session →
    // treated as always-recent (lastAuthAt = now).
    if (this.env.PORTAL_AUTH_DEV_HEADER) {
      const email = req.header('x-institution-user-email');
      if (email) return { principal: await this.auth.resolveByEmail(email, new Date()) };
    }

    throw new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message:
        'No portal session. Sign in at /v1/portal/auth/login (or set PORTAL_AUTH_DEV_HEADER=true and send x-institution-user-email in development).',
    });
  }

  /** Parse `institution` | `campus:<id>` into an InstitutionScope. Defaults to institution. */
  private resolveScope(req: Request, principal: InstitutionPrincipal): InstitutionScope {
    const raw = req.header('x-institution-scope')?.trim();
    if (!raw || raw === 'institution') {
      // Confined users can't view the whole institution — default to their first campus.
      if (!principal.isInstitutionWide && principal.allowedCampusIds[0]) {
        return { mode: 'campus', campusId: principal.allowedCampusIds[0] };
      }
      return { mode: 'institution' };
    }
    if (raw.startsWith('campus:')) {
      const campusId = raw.slice('campus:'.length);
      if (campusId) return { mode: 'campus', campusId };
    }
    return { mode: 'institution' };
  }
}

/** Parse a single cookie value out of a raw Cookie header without a parser dependency. */
function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return undefined;
}
