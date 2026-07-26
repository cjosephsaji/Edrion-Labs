import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { canAll } from '@edrion/permissions';
import { isInstitutionSensitive } from '@edrion/permissions/institution';
import { isMfaSatisfied, isRecentAuth } from '@edrion/auth';
import { institutionPermissionRequiresMfaStepUp } from '@edrion/schemas';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';
import { PORTAL_PERMISSIONS_KEY } from './portal.decorators';

/**
 * The authoritative permission boundary for the Institution Portal. Runs after
 * InstitutionAuthGuard. Enforces the handler's required institution permission keys against the
 * principal's DB-evaluated set, and additionally requires recent auth when any required key is
 * sensitive (deletes, fees/payroll/grades, role/settings/announcement/audit-export). The session's
 * `lastAuthAt` drives the window; the dev header is treated as always-recent. The frontend hiding
 * a button is never sufficient.
 */
@Injectable()
export class InstitutionPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PORTAL_PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const ic = req.institutionContext;
    if (!ic) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not authenticated' });

    if (!canAll(ic.principal.permissions, required)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing required permission(s): ${required.join(', ')}`,
      });
    }

    const needsRecent =
      this.env.RECENT_AUTH_ENABLED && required.some((k) => isInstitutionSensitive(k));
    if (needsRecent && !isRecentAuth(ic.principal.lastAuthAt, this.env.RECENT_AUTH_WINDOW_SECONDS)) {
      throw new ForbiddenException({
        code: 'RECENT_AUTH_REQUIRED',
        message: 'This action requires recent authentication. Please re-authenticate.',
      });
    }

    const needsMfaStepUp =
      ic.principal.mfaEnrolled && required.some((k) => institutionPermissionRequiresMfaStepUp(k));
    if (
      needsMfaStepUp &&
      !isMfaSatisfied({ aal: ic.principal.sessionAal ?? 'aal1' }, ic.principal.mfaEnrolled)
    ) {
      throw new ForbiddenException({
        code: 'STEP_UP_REQUIRED',
        message: 'This action requires multi-factor authentication. Complete MFA and try again.',
      });
    }
    return true;
  }
}
