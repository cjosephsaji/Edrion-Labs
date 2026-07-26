import { Inject, Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { and, eq, lt, schema, sql, type Database } from '@edrion/database';
import type { ApiEnv } from '@edrion/config';
import type { Logger } from '@edrion/observability';
import { API_ENV, DATABASE, LOGGER } from '../../common/tokens';
import { JobsService } from '../../common/queue/jobs.service';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { JobTracker } from '../../common/queue/job-tracker.service';
import { SupportAccessService } from '../support-access/support-access.service';
import { VisualStudioRepository } from '../student/visual-studio/visual-studio.repository';
import { LibraryFinesService } from '../student/campus-mirrors/library-fines.service';
import { PrincipalMetricsService } from '../observability/principal-metrics.service';

const SWEEP_INTERVAL_MS = 60_000;
const VISUAL_REVISION_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000;
const LIBRARY_FINES_INTERVAL_MS = 24 * 60 * 60 * 1000;
const PRINCIPAL_ROLLUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const QUEUE = 'maintenance';

/**
 * Phase 10e: the former in-process sweeps run as tracked, scheduled BullMQ jobs. On boot this
 * registers a handler per sweep (each wrapped in JobTracker so it records a `background_jobs`
 * row visible in System Health) and schedules a repeatable trigger. When queues are disabled the
 * services keep their own in-process timers (e.g. SupportAccessService), so behaviour is
 * preserved either way.
 */
@Injectable()
export class MaintenanceService implements OnApplicationBootstrap {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LOGGER) private readonly logger: Logger,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly support: SupportAccessService,
    private readonly visualRepo: VisualStudioRepository,
    private readonly libraryFines: LibraryFinesService,
    private readonly principalMetrics: PrincipalMetricsService,
  ) {}

  /** True when the maintenance sweeps run as queue jobs (vs. in-process timers). */
  get queueOwned(): boolean {
    return this.env.REDIS_ENABLED && this.env.QUEUE_WORKERS_ENABLED && process.env.NODE_ENV !== 'test';
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.queueOwned) return;

    this.workers.register('support-session.expiry', () =>
      this.tracker.run('support-session.expiry', QUEUE, async () => ({
        itemsProcessed: await this.support.sweepExpired(),
      })),
    );
    this.workers.register('ai-run.expiry', () =>
      this.tracker.run('ai-run.expiry', QUEUE, () => this.expireAiRuns()),
    );
    this.workers.register('billing.dunning-overdue', () =>
      this.tracker.run('billing.dunning-overdue', QUEUE, () => this.flagOverdueInvoices()),
    );
    this.workers.register('visual.revisions.prune', () =>
      this.tracker.run('visual.revisions.prune', QUEUE, async () => ({
        itemsProcessed: await this.visualRepo.pruneStaleRevisions(),
      })),
    );
    this.workers.register('library.overdue-fines', () =>
      this.tracker.run('library.overdue-fines', QUEUE, () => this.postLibraryOverdueFines()),
    );
    this.workers.register('principal.metrics.daily', () =>
      this.tracker.run('principal.metrics.daily', QUEUE, () => this.rollPrincipalMetrics()),
    );
    this.workers.register('compliance.evidence.snapshot', () =>
      this.tracker.run('compliance.evidence.snapshot', QUEUE, () => this.snapshotComplianceEvidence()),
    );

    await this.jobs.schedule(QUEUE, 'support-session.expiry', SWEEP_INTERVAL_MS);
    await this.jobs.schedule(QUEUE, 'ai-run.expiry', SWEEP_INTERVAL_MS);
    await this.jobs.schedule(QUEUE, 'billing.dunning-overdue', SWEEP_INTERVAL_MS);
    await this.jobs.schedule(QUEUE, 'visual.revisions.prune', VISUAL_REVISION_PRUNE_INTERVAL_MS);
    await this.jobs.schedule(QUEUE, 'library.overdue-fines', LIBRARY_FINES_INTERVAL_MS);
    await this.jobs.schedule(QUEUE, 'principal.metrics.daily', PRINCIPAL_ROLLUP_INTERVAL_MS);
    await this.jobs.schedule(QUEUE, 'compliance.evidence.snapshot', PRINCIPAL_ROLLUP_INTERVAL_MS);
    this.logger.info('maintenance.scheduled', { interval_ms: SWEEP_INTERVAL_MS });
  }

  /** Expire AI runs left awaiting confirmation past their TTL (mirrors the lazy RUN_EXPIRED check). */
  private async expireAiRuns(now: Date = new Date()) {
    const rows = await this.db
      .update(schema.aiRuns)
      .set({ status: 'expired' })
      .where(and(eq(schema.aiRuns.status, 'awaiting_confirmation'), lt(schema.aiRuns.expiresAt, now)))
      .returning({ id: schema.aiRuns.id });
    return { itemsProcessed: rows.length };
  }

  /** Flag open invoices past their due date into the dunning lifecycle. */
  private async flagOverdueInvoices(now: Date = new Date()) {
    const rows = await this.db
      .update(schema.invoices)
      .set({ dunningState: 'overdue' })
      .where(
        and(
          eq(schema.invoices.status, 'open'),
          lt(schema.invoices.dueAt, now),
          eq(schema.invoices.dunningState, 'none'),
        ),
      )
      .returning({ id: schema.invoices.id });
    return { itemsProcessed: rows.length };
  }

  private async postLibraryOverdueFines() {
    const today = new Date().toISOString().slice(0, 10);
    const overdue = await this.db
      .select({
        loan: schema.libraryLoans,
        campusId: schema.students.campusId,
      })
      .from(schema.libraryLoans)
      .innerJoin(schema.students, eq(schema.students.id, schema.libraryLoans.studentId))
      .where(
        and(
          eq(schema.libraryLoans.status, 'issued'),
          sql`${schema.libraryLoans.dueDate} < ${today}`,
        ),
      )
      .limit(500);
    let itemsProcessed = 0;
    for (const row of overdue) {
      const fineMinor = 5000;
      const link = await this.libraryFines.postOverdueFine(
        row.loan.institutionId,
        row.campusId ?? row.loan.institutionId,
        row.loan.studentId,
        row.loan.id,
        fineMinor,
      );
      if (link) itemsProcessed += 1;
    }
    return { itemsProcessed };
  }

  private async rollPrincipalMetrics() {
    const asOf = new Date().toISOString().slice(0, 10);
    const institutions = await this.db
      .select({ id: schema.institutions.id })
      .from(schema.institutions)
      .where(eq(schema.institutions.status, 'active'));
    let itemsProcessed = 0;
    for (const inst of institutions) {
      await this.principalMetrics.rollupInstitution(inst.id, asOf);
      itemsProcessed += 1;
    }
    return { itemsProcessed };
  }

  private async snapshotComplianceEvidence() {
    const institutions = await this.db
      .select({ id: schema.institutions.id })
      .from(schema.institutions)
      .where(eq(schema.institutions.status, 'active'));
    let itemsProcessed = 0;
    const asOf = new Date().toISOString().slice(0, 10);
    for (const inst of institutions) {
      await this.db.execute(sql`
        INSERT INTO compliance_evidence_artifacts (institution_id, kind, storage_key, metadata)
        VALUES (${inst.id}, 'platform_readiness_posture', ${`posture/${inst.id}/${asOf}.json`}, ${JSON.stringify({ tier3: 'snapshot' })}::jsonb)
      `);
      itemsProcessed += 1;
    }
    return { itemsProcessed };
  }
}
