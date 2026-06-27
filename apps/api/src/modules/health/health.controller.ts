import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { count, eq, schema, sql, type Database } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { Public } from '../../common/guards/auth.guard';
import { RequirePermissions } from '../../common/decorators';
import { RedisService } from '../../common/redis/redis.service';
import { JobsService } from '../../common/queue/jobs.service';
import { JobTracker } from '../../common/queue/job-tracker.service';

@ApiTags('system')
@Controller()
export class HealthController {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly redis: RedisService,
    private readonly jobs: JobsService,
    private readonly jobTracker: JobTracker,
  ) {}

  @Public()
  @Get('health')
  async health() {
    let database = 'unknown';
    try {
      await this.db.execute(sql`select 1`);
      database = 'ok';
    } catch {
      database = 'down';
    }
    return { status: database === 'ok' ? 'ok' : 'degraded', database, time: new Date().toISOString() };
  }

  /** Operational system status — DB latency/version, record counts, process uptime. */
  @Get('system/health')
  @RequirePermissions('platform_settings.view')
  async systemHealth() {
    const start = Date.now();
    let database = 'ok';
    let dbVersion = 'unknown';
    try {
      const res = await this.db.execute<{ version: string }>(sql`select version() as version`);
      const rows = res as unknown as { version: string }[];
      dbVersion = rows[0]?.version?.split(' ').slice(0, 2).join(' ') ?? 'unknown';
    } catch {
      database = 'down';
    }
    const latencyMs = Date.now() - start;

    const [institutions, subscriptions, auditEvents, activeSessions] = await Promise.all([
      this.db.select({ v: count() }).from(schema.institutions).then((r) => Number(r[0]?.v ?? 0)),
      this.db.select({ v: count() }).from(schema.subscriptions).then((r) => Number(r[0]?.v ?? 0)),
      this.db.select({ v: count() }).from(schema.auditEvents).then((r) => Number(r[0]?.v ?? 0)),
      this.db
        .select({ v: count() })
        .from(schema.supportAccessSessions)
        .where(eq(schema.supportAccessSessions.status, 'active'))
        .then((r) => Number(r[0]?.v ?? 0)),
    ]);

    // Redis liveness + background-job + queue observability (Phase 10b/10e).
    const redisOk = await this.redis.ping();
    const [recentJobs, jobStatus, queues] = await Promise.all([
      this.jobTracker.recent(10),
      this.jobTracker.latestPerJob(),
      this.jobs.enabled ? this.jobs.counts() : Promise.resolve([]),
    ]);

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      time: new Date().toISOString(),
      api: {
        status: 'ok',
        uptimeSeconds: Math.round(process.uptime()),
        version: process.env.npm_package_version ?? '0.1.0',
        node: process.version,
      },
      database: { status: database, latencyMs, version: dbVersion },
      redis: { status: this.redis.enabled ? (redisOk ? 'ok' : 'down') : 'disabled' },
      records: { institutions, subscriptions, auditEvents, activeSupportSessions: activeSessions },
      jobs: {
        latest: jobStatus.map((j) => ({
          name: j.name,
          status: j.status,
          startedAt: j.started_at,
          durationMs: j.duration_ms,
          itemsProcessed: j.items_processed,
        })),
        recent: recentJobs.map((j) => ({
          id: j.id,
          name: j.name,
          status: j.status,
          startedAt: j.startedAt,
          finishedAt: j.finishedAt,
          durationMs: j.durationMs,
          itemsProcessed: j.itemsProcessed,
          error: j.error,
        })),
      },
      queues,
    };
  }
}
