import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';
import type { ApiEnv } from '@edrion/config';
import { API_ENV } from '../../common/tokens';
import { RedisService } from '../../common/redis/redis.service';

/**
 * Per-institution-principal fixed-window rate limiter for the portal request path, backed by
 * Redis. Invoked from {@link InstitutionAuthGuard} once the principal is resolved, so every portal
 * controller is covered in one place (they are `@SkipRateLimit()`, so the platform limiter — keyed
 * by employee/IP — never sees them). Keyed by the institution USER id so one tenant user can't
 * starve another. Fail-open: if Redis is down the request proceeds. Breaches → 429 + Retry-After.
 */
@Injectable()
export class InstitutionRateLimiter {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly redis: RedisService,
  ) {}

  /** Enforce the limit for one principal. Throws 429 on breach; no-op when disabled/unavailable. */
  async enforce(institutionUserId: string, res: Response): Promise<void> {
    if (!this.env.RATE_LIMIT_ENABLED || !this.redis.enabled) return;

    const windowSeconds = this.env.RATE_LIMIT_WINDOW_SECONDS;
    const bucket = Math.floor(Date.now() / 1000 / windowSeconds);
    const key = `rl:pinst:${institutionUserId}:${bucket}`;

    const count = await this.redis.incrementWindow(key, windowSeconds);
    if (count === null) return; // Redis unavailable → fail-open.

    if (count > this.env.RATE_LIMIT_MAX) {
      const retryAfter = (await this.redis.ttl(key)) || windowSeconds;
      res.setHeader('Retry-After', String(retryAfter));
      throw new HttpException(
        { code: 'RATE_LIMITED', message: 'Too many requests. Slow down and retry.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }
}
