import { describe, expect, it, vi } from 'vitest';
import { schema } from '@edrion/database';
import type { Database } from '@edrion/database';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { PetrosOperationsService, type PetrosOperationsIdentity } from './petros-operations.service';
import type { JobsService } from '../../common/queue/jobs.service';

function databaseStub() {
  const selectedTables: unknown[] = [];
  const projections: Array<Record<string, unknown>> = [];
  const aggregate = {
    questionWork: { queued: 1, running: 2, expiredLeases: 3, pendingDispatch: 4 },
    preparationWork: { queued: 5, running: 6, expiredLeases: 7, pendingDispatch: 8 },
    commandCancellations: 9,
    reservations: { createdLast24Hours: 4, outstandingAllTime: 2, settledLast24Hours: 3, ambiguousLast24Hours: 1, reservedMicros: 1100 },
    admissions: { safety_resource_limit: 0, product_plan_allowance: 0, abuse_control: 2, pedagogical_attempt_policy: 0, other: 99 },
  };
  const db = {
    execute: vi.fn().mockResolvedValue([{ snapshot: aggregate }]),
    select: vi.fn((projection: Record<string, unknown>) => {
      projections.push(projection);
      return ({
      from(table: unknown) {
          selectedTables.push(table);
          let grouped = false;
          const builder = {
          where() { return builder; },
          groupBy() { grouped = true; return builder; },
          then(resolve: (value: unknown[]) => unknown, reject?: (error: unknown) => unknown) {
            let rows: unknown[] = [{ value: 0 }];
            if (table === schema.petrosAiUsageEvents && !grouped) rows = [{ attempts: 6, retries: 1, failures: 2, estimatedCostMicros: 1800, actualCostMicros: 900, accountedCostMicros: 1400, p50: 30, p95: 80, latencySampleSize: 3 }];
            if (table === schema.petrosAiUsageEvents && grouped) rows = [
              { category: 'timeout', count: 1 }, { category: 'private-provider-error-message', count: 99 },
            ];
            return Promise.resolve(rows).then(resolve, reject);
          },
        };
        return builder;
      },
      });
    }),
  };
  return { db, selectedTables, projections };
}

describe('PetrosOperationsService', () => {
  it('returns bounded aggregates and omits raw identifiers, messages, payloads and unknown categories', async () => {
    const { db, selectedTables, projections } = databaseStub();
    const jobs = { enabled: true, counts: vi.fn().mockResolvedValue([
      { name: 'ai', waiting: 2, active: 1, completed: 4, failed: 1, delayed: 0 },
      { name: 'unexpected-private-queue', waiting: 10, active: 10, completed: 10, failed: 10, delayed: 10 },
    ]) };
    const service = new PetrosOperationsService(db as unknown as Database, jobs as unknown as JobsService);
    const identity: PetrosOperationsIdentity = {
      sourceStatus: 'configured', releaseStatus: 'stale', sourceVersion: 'source-v2', releaseVersion: 'release-v4',
      releaseDigest: 'a'.repeat(64),
    };
    const result = await service.snapshot(identity);
    const serialized = JSON.stringify(result);

    expect(result).toMatchObject({
      queue: { status: 'available', counts: [{ name: 'ai', waiting: 2, active: 1, completed: 4, failed: 1, delayed: 0 }] },
      last24Hours: {
        attempts: 6, retries: 1, failures: 2, commandCancellations: 9,
        costs: { estimatedMicros: 1800, actualMicros: 900, accountedMicros: 1400, currentlyReservedAllTimeMicros: 1100 },
        reservations: { createdLast24Hours: 4, outstandingAllTime: 2, settledLast24Hours: 3, ambiguousLast24Hours: 1 },
        latencyMs: { p50: 30, p95: 80, sampleSize: 3 },
        failuresByCategory: { timeout: 1, other: 99 },
        deniedAdmissionsByCategory: { abuse_control: 2, other: 99 },
      },
      durableWork: {
        questionExecution: { queued: 1, running: 2, expiredLeases: 3, pendingDispatch: 4 },
        sourcePreparation: { queued: 5, running: 6, expiredLeases: 7, pendingDispatch: 8 },
      },
      configuredIdentity: { sourceStatus: 'configured', releaseStatus: 'stale', sourceVersion: 'source-v2', releaseVersion: 'release-v4' },
      privacy: { scope: 'aggregate_only', contentExposed: false },
    });
    expect(serialized).not.toContain('private-provider-error-message');
    expect(serialized).not.toContain('untrusted-private-message');
    expect(serialized).not.toMatch(/studentId|institutionId|commandId|message|payload|documentId|learnerId/i);
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(selectedTables).toEqual([schema.petrosAiUsageEvents, schema.petrosAiUsageEvents]);

    const dialect = new PgDialect();
    const sqlText = (expression: unknown) => dialect.sqlToQuery(expression as SQL).sql.replaceAll('"', '');
    const usageProjection = projections.find((projection) => 'accountedCostMicros' in projection)!;
    expect(sqlText(usageProjection.attempts)).toMatch(/status in \('success','failure'\).*cache_status.*<> 'hit'/);
    expect(sqlText(usageProjection.retries)).toContain('retry_count > 0');
    expect(sqlText(usageProjection.accountedCostMicros)).toMatch(/sum\(coalesce\(.*actual_cost_micros, .*estimated_cost_micros\)\)/);
    expect(sqlText(usageProjection.p50)).toContain("error_code is distinct from 'PROVIDER_OUTCOME_UNKNOWN'");
  });

  it('bounds Redis outage waits and reuses the one pending queue-count request', async () => {
    vi.useFakeTimers();
    try {
      const { db } = databaseStub();
      const jobs = { enabled: true, counts: vi.fn(() => new Promise(() => undefined)) };
      const service = new PetrosOperationsService(db as unknown as Database, jobs as unknown as JobsService);
      const queueSnapshot = (service as unknown as { queueSnapshot(): Promise<{ status: string; reason?: string; recoveryActions: string[]; counts: unknown[] }> }).queueSnapshot.bind(service);
      const call = queueSnapshot();
      const repeatedCall = queueSnapshot();
      await vi.advanceTimersByTimeAsync(1_500);
      const timeout = {
        status: 'unavailable', reason: 'timeout', counts: [],
        recoveryActions: ['check_redis_health', 'inspect_durable_dispatch_outbox', 'refresh_after_recovery'],
      };
      await expect(call).resolves.toMatchObject(timeout);
      await expect(repeatedCall).resolves.toMatchObject(timeout);
      expect(jobs.counts).toHaveBeenCalledTimes(1);
    } finally { vi.useRealTimers(); }
  });

  it('reports queue service disabled without attempting Redis calls', async () => {
    const { db } = databaseStub();
    const jobs = { enabled: false, counts: vi.fn() };
    const service = new PetrosOperationsService(db as unknown as Database, jobs as unknown as JobsService);
    const queue = await (service as unknown as { queueSnapshot(): Promise<unknown> }).queueSnapshot();
    expect(queue).toMatchObject({ status: 'disabled', counts: [], recoveryActions: ['enable_queue_service'] });
    expect(jobs.counts).not.toHaveBeenCalled();
  });
});
