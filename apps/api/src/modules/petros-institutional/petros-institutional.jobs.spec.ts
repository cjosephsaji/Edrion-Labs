import type { ApiEnv } from '@edrion/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PetrosInstitutionalJobs } from './petros-institutional.jobs';

const outcome = {
  handoffsDelivered: 1,
  digestsDelivered: 1,
  digestsFailed: 1,
  digestsExhausted: 0,
  idempotent: true as const,
};

function harness(envPatch: Partial<ApiEnv> = {}) {
  const env = {
    NODE_ENV: 'development',
    REDIS_ENABLED: true,
    QUEUE_WORKERS_ENABLED: true,
    ...envPatch,
  } as ApiEnv;
  const jobs = { schedule: vi.fn(async () => undefined) };
  const workers = { register: vi.fn() };
  const tracker = { run: vi.fn(async (_name: string, _queue: string, task: () => Promise<unknown>) => { await task(); }) };
  const institutional = { processJobs: vi.fn(async () => outcome) };
  const logger = { info: vi.fn(), error: vi.fn() };
  const service = new PetrosInstitutionalJobs(
    env,
    logger as never,
    jobs as never,
    workers as never,
    tracker as never,
    institutional as never,
  );
  return { service, jobs, workers, tracker, institutional, logger };
}

afterEach(() => vi.useRealTimers());

describe('Petros institutional delivery job', () => {
  it('registers and tracks an idempotent repeatable queue sweep', async () => {
    const test = harness();
    await test.service.onApplicationBootstrap();
    expect(test.jobs.schedule).toHaveBeenCalledWith(
      'maintenance',
      'petros.institutional.delivery',
      60_000,
    );
    const handler = test.workers.register.mock.calls[0]?.[1] as (() => Promise<void>) | undefined;
    expect(handler).toBeTypeOf('function');
    await handler?.();
    expect(test.institutional.processJobs).toHaveBeenCalledOnce();
    expect(test.tracker.run).toHaveBeenCalledWith(
      'petros.institutional.delivery',
      'maintenance',
      expect.any(Function),
    );
  });

  it('uses and tears down an in-process sweep when queues are disabled', async () => {
    vi.useFakeTimers();
    const test = harness({ REDIS_ENABLED: false, QUEUE_WORKERS_ENABLED: false });
    await test.service.onApplicationBootstrap();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(test.institutional.processJobs).toHaveBeenCalledOnce();
    test.service.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(test.institutional.processJobs).toHaveBeenCalledOnce();
  });
});
