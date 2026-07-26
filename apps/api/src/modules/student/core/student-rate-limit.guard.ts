import {
  CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../../common/tokens';
import { RedisService } from '../../../common/redis/redis.service';
import { STUDENT_RATE_LIMIT_KEY } from './student.decorators';
import type { StudentPrincipal } from '../student.types';

interface StudentRateLimitOverride {
  max: number;
  windowSeconds: number;
}

const DEFAULT_MAX = 120;
const DEFAULT_WINDOW_SECONDS = 60;

/**
 * Per-student-principal fixed-window rate limiter, backed by Redis. Runs after StudentAuthGuard
 * so the global employee/IP limiter (skipped on student routes) is replaced with a fair
 * student-scoped budget. Fail-open when Redis is unavailable.
 */
@Injectable()
export class StudentRateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly redis: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.env.RATE_LIMIT_ENABLED || !this.redis.enabled) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const principal = req.studentContext?.principal;
    if (!principal) return true;

    const override = this.reflector.getAllAndOverride<StudentRateLimitOverride>(
      STUDENT_RATE_LIMIT_KEY,
      [ctx.getHandler(), ctx.getClass()],
    );

    const windowSeconds = override?.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
    const max = override?.max ?? DEFAULT_MAX;
    const subject = studentRateSubject(principal);
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rl:student:${subject}:${bucket}`;

    const count = await this.redis.incrementWindow(key, windowSeconds);
    if (count === null) return true;

    if (count > max) {
      const res = ctx.switchToHttp().getResponse<Response>();
      const retryAfter = (await this.redis.ttl(key)) || windowSeconds;
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many requests. Slow down and retry.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }
}

function studentRateSubject(principal: StudentPrincipal): string {
  if (principal.kind === 'institutional') return `student:${principal.studentId}`;
  return `independent:${principal.independentUserId}`;
}
