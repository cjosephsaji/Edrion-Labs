import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { InstitutionContext, InstitutionPrincipal, InstitutionScope } from '@edrion/auth';

export const PORTAL_PERMISSIONS_KEY = 'edrion:portal:permissions';

/** Require ALL listed institution permission keys for the handler. Enforced by the portal guard. */
export const RequireInstitutionPermissions = (...keys: string[]) =>
  SetMetadata(PORTAL_PERMISSIONS_KEY, keys);

/** Inject the authenticated institution-portal principal. */
export const CurrentInstitutionPrincipal = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): InstitutionPrincipal => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const ic = req.institutionContext;
    if (!ic) throw new Error('Institution principal not resolved — InstitutionAuthGuard must run first');
    return ic.principal;
  },
);

/** Inject the active viewing scope (institution vs a specific campus). */
export const CurrentScope = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): InstitutionScope => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.institutionContext) throw new Error('Institution context not resolved');
    return req.institutionContext.scope;
  },
);

/** Inject the full institution context (principal + scope + server session id). */
export const CurrentInstitutionContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): InstitutionContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.institutionContext) throw new Error('Institution context not resolved');
    return req.institutionContext;
  },
);
