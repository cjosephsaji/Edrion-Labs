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
import { API_ENV } from '../tokens';
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY } from '../decorators';
import { RedisService } from '../redis/redis.service';

interface RateLimitOverride {
  max: number;
  windowSeconds?: number;
}

/**
 * Fixed-window rate limiter backed by Redis. Runs after AuthGuard so an authenticated request is
 * keyed by employee id (a fair per-user budget) and an unauthenticated one falls back to client
 * IP with a tighter cap (protects /auth/login). Fail-open: if Redis is down the request proceeds
 * — availability of the control plane beats strict limiting. Breaches return 429 + Retry-After.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly redis: RedisService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (!this.env.RATE_LIMIT_ENABLED || !this.redis.enabled) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (skip) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const principal = req.principalContext?.principal;

    const override = this.reflector.getAllAndOverride<RateLimitOverride>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    const windowSeconds = override?.windowSeconds ?? this.env.RATE_LIMIT_WINDOW_SECONDS;
    const max =
      override?.max ?? (principal ? this.env.RATE_LIMIT_MAX : this.env.RATE_LIMIT_MAX_UNAUTH);

    const subject = principal ? `emp:${principal.employeeId}` : `ip:${req.ip ?? 'unknown'}`;
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rl:${subject}:${bucket}`;

    const count = await this.redis.incrementWindow(key, windowSeconds);
    if (count === null) return true; // Redis unavailable → fail-open.

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
