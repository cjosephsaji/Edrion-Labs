import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { GuardianContext } from './guardian-context';

/** Inject the resolved guardian context (guardianUserId + wards + per-ward visibility). */
export const CurrentGuardian = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): GuardianContext => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.guardianContext) {
      throw new Error('Guardian context not resolved — GuardianScopeGuard must run first');
    }
    return req.guardianContext;
  },
);
