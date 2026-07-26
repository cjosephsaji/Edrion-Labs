import {
  CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { canAll, evaluatePermissions, STUDENT_DEFAULT_ROLES } from '@edrion/permissions';
import { STUDENT_PERMISSIONS_KEY } from './student.decorators';

/**
 * Authoritative permission boundary for the student portal. Evaluates required keys against the
 * student role catalogue (no direct grants in v1).
 */
@Injectable()
export class StudentPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(STUDENT_PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const sc = req.studentContext;
    if (!sc) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Not authenticated' });

    const evaluated = evaluatePermissions({ roleKeys: ['student'] }, STUDENT_DEFAULT_ROLES);
    if (!canAll(evaluated, required)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing required permission(s): ${required.join(', ')}`,
      });
    }
    return true;
  }
}
