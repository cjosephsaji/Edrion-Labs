import { describe, expect, it, vi } from 'vitest';
import { HttpException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ApiEnv } from '@edrion/config';
import { RateLimitGuard } from './rate-limit.guard';
import { RATE_LIMIT_KEY, SKIP_RATE_LIMIT_KEY } from '../decorators';
import type { RedisService } from '../redis/redis.service';

const ENV = {
  RATE_LIMIT_ENABLED: true,
  RATE_LIMIT_WINDOW_SECONDS: 60,
  RATE_LIMIT_MAX: 100,
  RATE_LIMIT_MAX_UNAUTH: 5,
} as ApiEnv;

function reflector(meta: Record<string, unknown> = {}): Reflector {
  return { getAllAndOverride: (key: unknown) => meta[key as string] } as unknown as Reflector;
}

function ctx(principal?: { employeeId: string }) {
  const res = { setHeader: vi.fn() };
  const req = { ip: '1.2.3.4', principalContext: principal ? { principal } : undefined };
  return {
    setHeaderSpy: res.setHeader,
    ctx: {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    } as unknown as ExecutionContext,
  };
}

function build(count: number | null, meta = {}, redisEnabled = true) {
  const redis = {
    enabled: redisEnabled,
    incrementWindow: vi.fn().mockResolvedValue(count),
    ttl: vi.fn().mockResolvedValue(42),
  };
  const guard = new RateLimitGuard(reflector(meta), ENV, redis as unknown as RedisService);
  return { guard, redis };
}

describe('RateLimitGuard', () => {
  it('allows when under the limit', async () => {
    const { guard } = build(3, {}, true);
    const { ctx: c } = ctx({ employeeId: 'e1' });
    await expect(guard.canActivate(c)).resolves.toBe(true);
  });

  it('throws 429 when over the per-principal limit', async () => {
    const { guard } = build(101);
    const { ctx: c } = ctx({ employeeId: 'e1' });
    await expect(guard.canActivate(c)).rejects.toBeInstanceOf(HttpException);
  });

  it('applies the tighter unauth cap when there is no principal', async () => {
    const { guard } = build(6); // 6 > RATE_LIMIT_MAX_UNAUTH (5)
    const { ctx: c, setHeaderSpy } = ctx(undefined);
    await expect(guard.canActivate(c)).rejects.toMatchObject({ response: { code: 'RATE_LIMITED' } });
    expect(setHeaderSpy).toHaveBeenCalledWith('Retry-After', '42');
  });

  it('fails open when Redis returns null (unavailable)', async () => {
    const { guard } = build(null);
    const { ctx: c } = ctx({ employeeId: 'e1' });
    await expect(guard.canActivate(c)).resolves.toBe(true);
  });

  it('respects @SkipRateLimit', async () => {
    const { guard, redis } = build(999, { [SKIP_RATE_LIMIT_KEY]: true });
    const { ctx: c } = ctx({ employeeId: 'e1' });
    await expect(guard.canActivate(c)).resolves.toBe(true);
    expect(redis.incrementWindow).not.toHaveBeenCalled();
  });

  it('honours a per-handler @RateLimit override', async () => {
    const { guard } = build(3, { [RATE_LIMIT_KEY]: { max: 2, windowSeconds: 10 } });
    const { ctx: c } = ctx({ employeeId: 'e1' });
    await expect(guard.canActivate(c)).rejects.toBeInstanceOf(HttpException);
  });

  it('is disabled when RATE_LIMIT_ENABLED is false', async () => {
    const redis = { enabled: true, incrementWindow: vi.fn(), ttl: vi.fn() };
    const guard = new RateLimitGuard(
      reflector(),
      { ...ENV, RATE_LIMIT_ENABLED: false } as ApiEnv,
      redis as unknown as RedisService,
    );
    const { ctx: c } = ctx({ employeeId: 'e1' });
    await expect(guard.canActivate(c)).resolves.toBe(true);
    expect(redis.incrementWindow).not.toHaveBeenCalled();
  });
});
