import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionContext } from '@nestjs/common';
import { defer, lastValueFrom, of } from 'rxjs';
import {
  PetrosTimingInterceptor,
  startPetrosRequest,
  timePetrosStage,
  tracePetrosWorker,
} from './petros-performance';
afterEach(() => vi.unstubAllEnvs());
describe('optional public-safe critical-path instrumentation', () => {
  it('is off by default and does not alter the operation result', async () => {
    vi.stubEnv('PETROS_M6_TIMING', '');
    expect(await timePetrosStage('kernel_evaluation', async () => 'unchanged')).toBe('unchanged');
    expect(await tracePetrosWorker(async () => 12)).toBe(12);
  });
  it('measures real stages and exposes only fixed names and numeric durations', async () => {
    vi.stubEnv('PETROS_M6_TIMING', '1');
    const request = {},
      setHeader = vi.fn();
    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader, headersSent: false }),
      }),
    } as unknown as ExecutionContext;
    startPetrosRequest(request);
    const next = {
      handle: () =>
        defer(() =>
          timePetrosStage('transaction', () =>
            timePetrosStage('source_authority', async () => ({ privateAnswer: 'never-log-this' })),
          ),
        ),
    };
    expect(await lastValueFrom(new PetrosTimingInterceptor().intercept(context, next))).toEqual({
      privateAnswer: 'never-log-this',
    });
    expect(setHeader).toHaveBeenCalledWith(
      'Server-Timing',
      expect.stringMatching(
        /^guards;dur=[\d.]+, source_authority;dur=[\d.]+, transaction;dur=[\d.]+, total;dur=[\d.]+$/,
      ),
    );
    expect(JSON.stringify(setHeader.mock.calls)).not.toContain('never-log-this');
  });
  it('passes through the original observable without instrumentation when disabled', async () => {
    vi.stubEnv('PETROS_M6_TIMING', '');
    const stream = of('original');
    expect(
      new PetrosTimingInterceptor().intercept({} as ExecutionContext, { handle: () => stream }),
    ).toBe(stream);
  });
});
