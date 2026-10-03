import { petrosRuntimeMetrics } from '../../common/petros-runtime-metrics';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, sql, type Database, schema } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { JobsService, type QueueCounts } from '../../common/queue/jobs.service';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const QUEUE_TIMEOUT_MS = 1_500;

const ADMISSION_CATEGORIES = [
  'safety_resource_limit',
  'product_plan_allowance',
  'abuse_control',
  'pedagogical_attempt_policy',
] as const;
type AdmissionCategory = (typeof ADMISSION_CATEGORIES)[number] | 'other';
type FailureCategory = 'provider' | 'timeout' | 'validation' | 'authority' | 'budget' | 'other';

export type PetrosOperationsIdentity = {
  sourceStatus: 'configured' | 'missing' | 'stale' | 'disabled' | 'unknown';
  releaseStatus: 'configured' | 'missing' | 'stale' | 'disabled' | 'unknown';
  sourceVersion?: string;
  releaseVersion?: string;
  releaseDigest?: string;
};

/** Content-free operational view. Values are aggregates; identifiers and payloads never leave this service. */
@Injectable()
export class PetrosOperationsService {
  private queueCountsInFlight: Promise<QueueCounts[]> | null = null;

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(JobsService) private readonly jobs: JobsService,
  ) {}

  async snapshot(identity?: PetrosOperationsIdentity) {
    const now = new Date();
    const since = new Date(now.getTime() - WINDOW_MS);
    const [aggregate, usage, failureRows, queue] = await Promise.all([
      this.durableAggregate(),
      this.usageSummary(since),
      this.failureCategories(since),
      this.queueSnapshot(),
    ]);

    const {questionWork,preparationWork,reservations:reservationRows,admissions:admissionRows}=aggregate;
    return {
      sampledAt: now.toISOString(),
      window: { startedAt: since.toISOString(), endedAt: now.toISOString(), hours: 24 },
      queue,
      ownerLatency:petrosRuntimeMetrics(),
      durableWork: { questionExecution: questionWork, sourcePreparation: preparationWork },
      last24Hours: {
        attempts: usage.attempts,
        retries: usage.retries,
        failures: usage.failures,
        commandCancellations: aggregate.commandCancellations,
        costs: {
          estimatedMicros: usage.estimatedCostMicros,
          actualMicros: usage.actualCostMicros,
          accountedMicros: usage.accountedCostMicros,
          currentlyReservedAllTimeMicros: reservationRows.reservedMicros,
        },
        reservations: {
          createdLast24Hours: reservationRows.createdLast24Hours,
          outstandingAllTime: reservationRows.outstandingAllTime,
          settledLast24Hours: reservationRows.settledLast24Hours,
          ambiguousLast24Hours: reservationRows.ambiguousLast24Hours,
        },
        latencyMs: {
          p50: usage.p50LatencyMs,
          p95: usage.p95LatencyMs,
          sampleSize: usage.latencySampleSize,
          limitation: 'Completed provider-attempt rows only; this is not end-to-end learner latency or a production SLO.',
        },
        failuresByCategory: failureRows,
        deniedAdmissionsByCategory: admissionRows,
      },
      ...(identity ? { configuredIdentity: sanitizeIdentity(identity) } : {}),
      privacy: { scope: 'aggregate_only' as const, contentExposed: false as const },
    };
  }

  private async durableAggregate() {
    type Work={queued:number;running:number;expiredLeases:number;pendingDispatch:number};
    type Aggregate={questionWork:Work;preparationWork:Work;commandCancellations:number;
      reservations:{createdLast24Hours:number;outstandingAllTime:number;settledLast24Hours:number;ambiguousLast24Hours:number;reservedMicros:number};
      admissions:Record<AdmissionCategory,number>};
    const [row]=await this.db.execute<{snapshot:Aggregate}>(sql`select edrion_petros_operations() as snapshot`);
    if(!row?.snapshot) throw new Error('Operational aggregate unavailable');
    return row.snapshot;
  }

  private async usageSummary(since: Date) {
    const usage = schema.petrosAiUsageEvents;
    const providerAttempt = sql`${usage.status} in ('success','failure') and ${usage.cacheStatus} <> 'hit'`;
    const latencySample = sql`(${providerAttempt}) and ${usage.errorCode} is distinct from 'PROVIDER_OUTCOME_UNKNOWN'`;
    const [row] = await this.db.select({
      attempts: sql<number>`count(*) filter (where ${providerAttempt})::int`,
      retries: sql<number>`count(*) filter (where (${providerAttempt}) and ${usage.retryCount} > 0)::int`,
      failures: sql<number>`count(*) filter (where ${usage.status} = 'failure')::int`,
      estimatedCostMicros: sql<number>`coalesce(sum(${usage.estimatedCostMicros}) filter (where ${providerAttempt}), 0)::bigint`,
      actualCostMicros: sql<number>`coalesce(sum(${usage.actualCostMicros}) filter (where ${providerAttempt}), 0)::bigint`,
      accountedCostMicros: sql<number>`coalesce(sum(coalesce(${usage.actualCostMicros}, ${usage.estimatedCostMicros})) filter (where ${providerAttempt}), 0)::bigint`,
      p50: sql<number | null>`percentile_cont(0.50) within group (order by ${usage.responseTimeMs}) filter (where ${latencySample})`,
      p95: sql<number | null>`percentile_cont(0.95) within group (order by ${usage.responseTimeMs}) filter (where ${latencySample})`,
      latencySampleSize: sql<number>`count(*) filter (where ${latencySample})::int`,
    }).from(usage).where(gte(usage.createdAt, since));
    return {
      attempts: number(row?.attempts), retries: number(row?.retries), failures: number(row?.failures),
      estimatedCostMicros: number(row?.estimatedCostMicros), actualCostMicros: number(row?.actualCostMicros),
      accountedCostMicros: number(row?.accountedCostMicros),
      p50LatencyMs: nullableNumber(row?.p50), p95LatencyMs: nullableNumber(row?.p95), latencySampleSize: number(row?.latencySampleSize),
    };
  }

  private async failureCategories(since: Date): Promise<Record<FailureCategory, number>> {
    const usage = schema.petrosAiUsageEvents;
    const category = sql<string>`case
      when ${usage.errorCode} ilike '%TIMEOUT%' then 'timeout'
      when ${usage.errorCode} ilike '%PROVIDER%' then 'provider'
      when ${usage.errorCode} ilike '%SCHEMA%' or ${usage.errorCode} ilike '%VALIDATION%' then 'validation'
      when ${usage.errorCode} ilike '%AUTHORITY%' or ${usage.errorCode} ilike '%SOURCE%' or ${usage.errorCode} ilike '%POLICY%' then 'authority'
      when ${usage.errorCode} ilike '%BUDGET%' or ${usage.errorCode} ilike '%RESERVATION%' then 'budget'
      else 'other' end`;
    const rows = await this.db.select({ category, count: sql<number>`count(*)::int` }).from(usage)
      .where(and(gte(usage.createdAt, since), eq(usage.status, 'failure'))).groupBy(category);
    const result: Record<FailureCategory, number> = { provider: 0, timeout: 0, validation: 0, authority: 0, budget: 0, other: 0 };
    for (const row of rows) if (isFailureCategory(row.category)) result[row.category] += number(row.count); else result.other += number(row.count);
    return result;
  }

  private async queueSnapshot() {
    if (!this.jobs.enabled) return { status: 'disabled' as const, counts: [], recoveryActions: ['enable_queue_service'] as const };
    try {
      const counts = await bounded(this.getQueueCounts(), QUEUE_TIMEOUT_MS);
      return { status: 'available' as const, counts: sanitizeQueueCounts(counts), recoveryActions: [] as const };
    } catch (error) {
      return {
        status: 'unavailable' as const,
        reason: error instanceof QueueTimeoutError ? 'timeout' as const : 'connection' as const,
        counts: [] as const,
        recoveryActions: ['check_redis_health', 'inspect_durable_dispatch_outbox', 'refresh_after_recovery'] as const,
      };
    }
  }

  private getQueueCounts(): Promise<QueueCounts[]> {
    if (!this.queueCountsInFlight) {
      const request = this.jobs.counts();
      this.queueCountsInFlight = request;
      const clear = () => { if (this.queueCountsInFlight === request) this.queueCountsInFlight = null; };
      void request.then(clear, clear);
    }
    return this.queueCountsInFlight;
  }


}

class QueueTimeoutError extends Error {}

function bounded<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new QueueTimeoutError('queue operation timed out')), timeoutMs);
    timer.unref?.();
    promise.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

function sanitizeIdentity(identity: PetrosOperationsIdentity) {
  const safeVersion = (value?: string) => value && /^[A-Za-z0-9._+-]{1,80}$/.test(value) ? value : undefined;
  const digest = identity.releaseDigest && /^[a-f0-9]{64}$/i.test(identity.releaseDigest) ? identity.releaseDigest.toLowerCase() : undefined;
  return {
    sourceStatus: identityStatus(identity.sourceStatus), releaseStatus: identityStatus(identity.releaseStatus),
    ...(safeVersion(identity.sourceVersion) ? { sourceVersion: safeVersion(identity.sourceVersion) } : {}),
    ...(safeVersion(identity.releaseVersion) ? { releaseVersion: safeVersion(identity.releaseVersion) } : {}),
    ...(digest ? { releaseDigest: digest } : {}),
  };
}
function identityStatus(value: string) { return ['configured', 'missing', 'stale', 'disabled'].includes(value) ? value : 'unknown'; }
function sanitizeQueueCounts(rows: QueueCounts[]) {
  const names = new Set(['imports', 'exports', 'reports', 'notifications', 'billing-sync', 'ai', 'maintenance']);
  return rows.filter((row) => names.has(row.name)).map((row) => ({
    name: row.name, waiting: nonnegative(row.waiting), active: nonnegative(row.active), completed: nonnegative(row.completed), failed: nonnegative(row.failed), delayed: nonnegative(row.delayed),
  }));
}
function isFailureCategory(value: string): value is FailureCategory { return ['provider', 'timeout', 'validation', 'authority', 'budget', 'other'].includes(value); }
function number(value: unknown): number { const n = Number(value); return Number.isFinite(n) ? n : 0; }
function nullableNumber(value: unknown): number | null { return value == null ? null : number(value); }
function nonnegative(value: number): number { return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0; }
