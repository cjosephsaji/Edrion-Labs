import { describe, expect, it, vi } from 'vitest';
import type { ExecutionContext, Type } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ApiEnv } from '@edrion/config';
import type { RedisService } from '../../../common/redis/redis.service';
import { STUDENT_RATE_LIMIT_KEY } from './student.decorators';
import { StudentRateLimitGuard } from './student-rate-limit.guard';

const ENV = { RATE_LIMIT_ENABLED: true } as ApiEnv;

function reflector(limit = { max: 30, windowSeconds: 60 }): Reflector {
  return {
    getAllAndOverride: (key: unknown) => key === STUDENT_RATE_LIMIT_KEY ? limit : undefined,
  } as unknown as Reflector;
}

function context(controller: Type<unknown>): ExecutionContext {
  const req = {
    studentContext: {
      principal: { kind: 'institutional', studentId: 'student-1' },
    },
  };
  const res = { setHeader: vi.fn() };
  return {
    getHandler: () => ({}),
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
  } as unknown as ExecutionContext;
}

describe('StudentRateLimitGuard', () => {
  it('keeps independently limited student features in separate buckets', async () => {
    class PetrosCompanionController {}
    class PetrosReflectionController {}
    const redis = {
      enabled: true,
      incrementWindow: vi.fn().mockResolvedValue(1),
      ttl: vi.fn().mockResolvedValue(30),
    };
    const guard = new StudentRateLimitGuard(
      reflector(),
      ENV,
      redis as unknown as RedisService,
    );

    await guard.canActivate(context(PetrosCompanionController));
    await guard.canActivate(context(PetrosReflectionController));

    const keys = redis.incrementWindow.mock.calls.map(([key]) => String(key));
    expect(keys[0]).toContain(':PetrosCompanionController:');
    expect(keys[1]).toContain(':PetrosReflectionController:');
    expect(keys[0]).not.toBe(keys[1]);
  });
});
