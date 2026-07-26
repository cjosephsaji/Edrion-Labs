import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { EmployeePrincipal, PrincipalContext } from '@edrion/auth';

export const PERMISSIONS_KEY = 'edrion:permissions';
export const RECENT_AUTH_KEY = 'edrion:recent_auth';
export const RATE_LIMIT_KEY = 'edrion:rate_limit';
export const SKIP_RATE_LIMIT_KEY = 'edrion:skip_rate_limit';

/** Per-handler rate-limit override (requests allowed per window seconds). */
export const RateLimit = (max: number, windowSeconds?: number) =>
  SetMetadata(RATE_LIMIT_KEY, { max, windowSeconds });

/** Exempt a handler from rate limiting (health checks, internal probes). */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

/** Skip platform AuthGuard (portal routes use InstitutionAuthGuard). */
export { Public } from './guards/auth.guard';

/** Require ALL listed permission keys for the handler. Enforced by PermissionsGuard. */
export const RequirePermissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);

/** Mark a handler as requiring recent authentication (re-auth within the window). */
export const RequireRecentAuth = () => SetMetadata(RECENT_AUTH_KEY, true);

/** Inject the authenticated employee principal. */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): EmployeePrincipal => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const pc = req.principalContext;
    if (!pc) throw new Error('Principal not resolved — AuthGuard must run first');
    return pc.principal;
  },
);

/** Inject the full principal context (principal + optional support-access session). */
export const PrincipalCtx = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PrincipalContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.principalContext) throw new Error('Principal not resolved');
    return req.principalContext;
  },
);

/** Inject the request context (ids, ip, ua) for audit. */
export const ReqContext = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<Request>().context;
});
