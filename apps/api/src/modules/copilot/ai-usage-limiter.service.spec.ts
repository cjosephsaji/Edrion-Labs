import { describe, expect, it, vi } from 'vitest';
import { HttpException } from '@nestjs/common';
import type { ApiEnv } from '@edrion/config';
import { AiUsageLimiter } from './ai-usage-limiter.service';
import type { RedisService } from '../../common/redis/redis.service';
import type { AiGovernanceService } from '../ai-governance/ai-governance.service';

const ENV = {
  AI_RATE_LIMIT_ENABLED: true,
  AI_MAX_RUNS_PER_EMPLOYEE_PER_DAY: 100,
  AI_MAX_RUNS_PER_SCOPE_PER_DAY: 1000,
} as ApiEnv;

function policy(over: Record<string, unknown> = {}) {
  return {
    modeScope: 'global',
    modeScopeId: null,
    maxRunsPerEmployeePerDay: null,
    maxRunsPerDay: null,
    ...over,
  };
}

function build(opts: {
  counts?: number[];
  policy?: Record<string, unknown>;
  enabled?: boolean;
  redisEnabled?: boolean;
}) {
  const counts = [...(opts.counts ?? [])];
  const redis = {
    enabled: opts.redisEnabled ?? true,
    incrementWindow: vi.fn().mockImplementation(async () => (counts.length ? counts.shift() : 1)),
  };
  const aiGov = { effectivePolicy: vi.fn().mockResolvedValue(policy(opts.policy)) };
  const limiter = new AiUsageLimiter(
    { ...ENV, AI_RATE_LIMIT_ENABLED: opts.enabled ?? true } as ApiEnv,
    redis as unknown as RedisService,
    aiGov as unknown as AiGovernanceService,
  );
  return { limiter, redis, aiGov };
}

describe('AiUsageLimiter', () => {
  it('allows when under both ceilings', async () => {
    const { limiter } = build({ counts: [5, 5] });
    await expect(limiter.check('e1', {})).resolves.toBeUndefined();
  });

  it('throws AI_RATE_LIMITED when the per-employee ceiling is exceeded', async () => {
    const { limiter } = build({ counts: [101] });
    await expect(limiter.check('e1', {})).rejects.toMatchObject({ response: { code: 'AI_RATE_LIMITED' } });
  });

  it('throws when the per-scope ceiling is exceeded', async () => {
    const { limiter } = build({ counts: [1, 1001] });
    await expect(limiter.check('e1', {})).rejects.toBeInstanceOf(HttpException);
  });

  it('honours a policy-level per-employee override', async () => {
    const { limiter } = build({ counts: [3], policy: { maxRunsPerEmployeePerDay: 2 } });
    await expect(limiter.check('e1', {})).rejects.toMatchObject({ response: { code: 'AI_RATE_LIMITED' } });
  });

  it('is a no-op when disabled', async () => {
    const { limiter, redis } = build({ enabled: false });
    await expect(limiter.check('e1', {})).resolves.toBeUndefined();
    expect(redis.incrementWindow).not.toHaveBeenCalled();
  });

  it('fails open when Redis is unavailable', async () => {
    const { limiter } = build({ redisEnabled: false });
    await expect(limiter.check('e1', {})).resolves.toBeUndefined();
  });
});
