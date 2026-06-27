import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { canAll, isSensitive } from '@edrion/permissions';
import { isRecentAuth } from '@edrion/auth';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../tokens';
import { PERMISSIONS_KEY, RECENT_AUTH_KEY } from '../decorators';

/**
 * The authoritative permission boundary. Runs after AuthGuard. Enforces the handler's
 * required permission keys against the principal's DB-evaluated set, and additionally
 * requires recent auth when the handler (or any required key) is sensitive.
 *
 * This is the real control — the frontend hiding a button is never sufficient.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const pc = req.principalContext;
    if (!pc) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not authenticated' });

    if (!canAll(pc.principal.permissions, required)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing required permission(s): ${required.join(', ')}`,
      });
    }

    const explicitRecent = this.reflector.getAllAndOverride<boolean>(RECENT_AUTH_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const needsRecent = explicitRecent || required.some((k) => isSensitive(k));
    if (needsRecent && !isRecentAuth(pc.principal.lastAuthAt, this.env.RECENT_AUTH_WINDOW_SECONDS)) {
      throw new ForbiddenException({
        code: 'RECENT_AUTH_REQUIRED',
        message: 'This action requires recent authentication. Please re-authenticate.',
      });
    }

    return true;
  }
}
