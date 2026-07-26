import {
  CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { ApiEnv } from '@edrion/config';
import type { PrincipalContext } from '@edrion/auth';
import { API_ENV } from '../tokens';
import { AuthService } from '../../modules/authentication/auth.service';
import { SessionService } from '../../modules/authentication/session.service';

export const PUBLIC_KEY = 'edrion:public';
/** Mark a route as not requiring authentication (login, health, docs). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);

/**
 * Authenticates the request and attaches the principal context.
 *
 * Default (production) path: validate the HTTP-only session cookie (an API-signed JWT) against
 * the live `auth_sessions` row, then load the employee's DB-evaluated permission set. The
 * session's `lastAuthAt` — not the request — drives the recent-auth gate.
 *
 * Dev path (only when AUTH_DEV_HEADER is enabled): trust `x-employee-email`. Kept so existing
 * tooling/smoke keeps working while the cookie flow is verified alongside it. It is the only
 * remaining identity shortcut and it is off by default.
 *
 * Either way the support-access session is hydrated from `x-support-session-id` when present.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const principalContext = await this.resolvePrincipal(req);

    const supportSessionId = req.header('x-support-session-id');
    if (supportSessionId) {
      const support = await this.auth.resolveSupportSession(
        supportSessionId,
        principalContext.principal.employeeId,
      );
      if (support) principalContext.support = support;
    }

    req.principalContext = principalContext;
    return true;
  }

  private async resolvePrincipal(req: Request): Promise<PrincipalContext> {
    // A live session cookie ALWAYS wins. The dev `x-employee-email` header (and the
    // DEV_DEFAULT_EMPLOYEE fallback) is sent on every request in development, so it must not
    // override an employee who has actually signed in — otherwise login + logout are no-ops.
    const token = readCookie(req.headers.cookie, this.env.SESSION_COOKIE_NAME);
    if (token) {
      const session = await this.sessions.verify(token);
      const pc = await this.auth.resolveById(session.employeeId, session.lastAuthAt);
      pc.authSessionId = session.id;
      return pc;
    }

    // Dev escape hatch (only when enabled, and only when there is no session cookie): trust the
    // explicit header identity (or DEV_DEFAULT_EMPLOYEE). No server session → resolveByEmail.
    if (this.env.AUTH_DEV_HEADER) {
      const email = req.header('x-employee-email') ?? process.env.DEV_DEFAULT_EMPLOYEE;
      if (email) return this.auth.resolveByEmail(email);
    }

    throw new UnauthorizedException({ code: 'UNAUTHENTICATED', message: 'No session' });
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
