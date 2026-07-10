import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';
import type { StudentContext, StudentPrincipal } from '../student.types';

export const STUDENT_PERMISSIONS_KEY = 'edrion:student:permissions';
export const STUDENT_RATE_LIMIT_KEY = 'edrion:student:rate_limit';

/** Require ALL listed student permission keys for the handler. */
export const RequireStudentPermissions = (...keys: string[]) =>
  SetMetadata(STUDENT_PERMISSIONS_KEY, keys);

/** Per-handler student rate-limit override (requests allowed per window seconds). */
export const StudentRateLimit = (max: number, windowSeconds = 60) =>
  SetMetadata(STUDENT_RATE_LIMIT_KEY, { max, windowSeconds });

/** Inject the authenticated student principal. */
export const CurrentStudent = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StudentPrincipal => {
    const req = ctx.switchToHttp().getRequest<Request>();
    const sc = req.studentContext;
    if (!sc) throw new Error('Student principal not resolved — StudentAuthGuard must run first');
    return sc.principal;
  },
);

/** Inject the full student context (principal + server session id). */
export const CurrentStudentContext = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): StudentContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.studentContext) throw new Error('Student context not resolved');
    return req.studentContext;
  },
);
