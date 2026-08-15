import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { runInInstitutionTenant, schema, eq, and, isNull, lte, type Database } from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import { JobsService } from '../../../common/queue/jobs.service';
import { QueueWorkers } from '../../../common/queue/queue.worker';
import { JobTracker } from '../../../common/queue/job-tracker.service';
import { AttendanceRollupService } from './attendance-rollup.service';
import { AttendanceService } from '../../portal/attendance.service';
import { institutionNow } from '../../portal/institution-clock';

import { ATTENDANCE_MARKS_SWEEP_JOB, ATTENDANCE_RECOMPUTE_JOB, type AttendanceRecomputeJobData } from './attendance.constants';

@Injectable()
export class AttendanceJobsService implements OnModuleInit {
  private institutionRebuildAt = new Map<string, number>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly rollups: AttendanceRollupService,
    private readonly attendance: AttendanceService,
  ) {}

  onModuleInit() {
    this.workers.register(ATTENDANCE_RECOMPUTE_JOB, (job: Job) =>
      this.tracker.run(ATTENDANCE_RECOMPUTE_JOB, 'notifications', async () => {
        const data = job.data as AttendanceRecomputeJobData;
        if (data.rebuild) {
          const count = await runInInstitutionTenant(this.db, data.institutionId, () =>
            this.rollups.rebuildInstitution(data.institutionId),
          );
          return { itemsProcessed: count };
        }
        if (!data.studentId || !data.termId) return { itemsProcessed: 0 };
        await runInInstitutionTenant(this.db, data.institutionId, () =>
          this.rollups.recomputeStudent(
            data.institutionId,
            data.studentId!,
            data.subjectId ?? null,
            data.termId!,
          ),
        );
        return { itemsProcessed: 1 };
      }),
    );
    this.workers.register(ATTENDANCE_MARKS_SWEEP_JOB, () =>
      this.tracker.run(ATTENDANCE_MARKS_SWEEP_JOB, 'maintenance', async () => {
        const applied = await this.runMarksSweep();
        return { itemsProcessed: applied };
      }),
    );
    void this.jobs.schedule('maintenance', ATTENDANCE_MARKS_SWEEP_JOB, 24 * 60 * 60 * 1000);
  }

  async enqueueRecompute(data: AttendanceRecomputeJobData) {
    const jobId = `attendance:${data.studentId}:${data.subjectId ?? 'overall'}:${data.termId}`;
    await this.jobs.enqueue('notifications', ATTENDANCE_RECOMPUTE_JOB, data as unknown as Record<string, unknown>, {
      jobId,
      delay: 30_000,
    });
  }

  async enqueueInstitutionRebuild(institutionId: string) {
    const now = Date.now();
    const last = this.institutionRebuildAt.get(institutionId) ?? 0;
    if (now - last < 60 * 60 * 1000) return;
    this.institutionRebuildAt.set(institutionId, now);
    await this.jobs.enqueue(
      'notifications',
      ATTENDANCE_RECOMPUTE_JOB,
        { institutionId, rebuild: true } as unknown as Record<string, unknown>,
      { jobId: `attendance:rebuild:${institutionId}`, delay: 30_000 },
    );
  }

  async enqueueForSessionMarked(institutionId: string, sessionId: string, studentIds: string[]) {
    const [session] = await this.db
      .select()
      .from(schema.attendanceSessions)
      .where(eq(schema.attendanceSessions.id, sessionId))
      .limit(1);
    if (!session?.termId) return;
    for (const studentId of studentIds) {
      await this.enqueueRecompute({
        institutionId,
        studentId,
        subjectId: session.subjectId,
        termId: session.termId,
      });
      await this.enqueueRecompute({
        institutionId,
        studentId,
        subjectId: null,
        termId: session.termId,
      });
    }
  }

  private async runMarksSweep() {
    const institutions = await this.db.select({ id: schema.institutions.id }).from(schema.institutions);
    let applied = 0;
    for (const institution of institutions) {
      applied += await runInInstitutionTenant(this.db, institution.id, () =>
        this.sweepInstitution(institution.id),
      );
    }
    return applied;
  }

  private async sweepInstitution(institutionId: string) {
    const [institution] = await this.db
      .select({ timezone: schema.institutions.timezone })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    const today = institutionNow(institution?.timezone ?? 'UTC').date;
    const pending = await this.db
      .select()
      .from(schema.requestMarksPending)
      .where(
        and(
          eq(schema.requestMarksPending.institutionId, institutionId),
          isNull(schema.requestMarksPending.appliedAt),
          lte(schema.requestMarksPending.occurrenceDate, today),
        ),
      );
    let count = 0;
    for (const row of pending) {
      const session = await this.findOrCreateSession(row, today);
      if (!session) continue;
      await this.attendance.markSystem(institutionId, session.id, {
        studentId: row.studentId,
        status: row.targetMark,
        remarks: `Approved leave/OD (${row.requestId})`,
        provenance: { kind: 'leave_approval', request_id: row.requestId },
      });
      await this.db
        .update(schema.requestMarksPending)
        .set({ appliedAt: new Date() })
        .where(eq(schema.requestMarksPending.id, row.id));
      if (session.termId) {
        await this.enqueueRecompute({
          institutionId,
          studentId: row.studentId,
          subjectId: row.subjectId,
          termId: session.termId,
        });
      }
      count += 1;
    }
    return count;
  }

  private async findOrCreateSession(
    row: typeof schema.requestMarksPending.$inferSelect,
    _today: string,
  ) {
    if (row.slotId) {
      const [existing] = await this.db
        .select()
        .from(schema.attendanceSessions)
        .where(
          and(
            eq(schema.attendanceSessions.institutionId, row.institutionId),
            eq(schema.attendanceSessions.classId, row.classId),
            eq(schema.attendanceSessions.date, row.occurrenceDate),
            eq(schema.attendanceSessions.slotId, row.slotId),
          ),
        )
        .limit(1);
      if (existing) return existing;
    }
    const [created] = await this.db
      .insert(schema.attendanceSessions)
      .values({
        institutionId: row.institutionId,
        classId: row.classId,
        subjectId: row.subjectId,
        date: row.occurrenceDate,
        period: row.slotId ? 'slot' : 'full_day',
        slotId: row.slotId,
      })
      .onConflictDoNothing()
      .returning();
    if (created) return created;
    const [fallback] = await this.db
      .select()
      .from(schema.attendanceSessions)
      .where(
        and(
          eq(schema.attendanceSessions.institutionId, row.institutionId),
          eq(schema.attendanceSessions.classId, row.classId),
          eq(schema.attendanceSessions.date, row.occurrenceDate),
        ),
      )
      .limit(1);
    return fallback;
  }
}
