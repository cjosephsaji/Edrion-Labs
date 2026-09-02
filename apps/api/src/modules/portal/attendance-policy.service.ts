import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, schema, type Database } from '@edrion/database';
import type { AttendancePolicyUpsertInput } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from './portal-action-context';
import { JobsService } from '../../common/queue/jobs.service';
import { ATTENDANCE_RECOMPUTE_JOB } from '../student/attendance/attendance.constants';

/**
 * Mirrors the column defaults in `attendance_policies`. Used only when a tenant has no saved
 * policy; `version: 0` marks it unsaved, and the upsert inserts rather than version-checks.
 */
const DEFAULT_ATTENDANCE_POLICY = {
  thresholdPct: '75',
  safeMarginPct: '5',
  odBasis: 'present',
  excusedBasis: 'excluded',
  lateCountsAs: 'present',
  leftEarlyCountsAs: 'present',
  computationBasis: 'conducted',
  leaveMark: 'excused',
  correctionWindowDays: 14,
  condonationEnabled: true,
  parentVisibility: 'off',
  workingDaysMask: 63,
  version: 0,
} as typeof schema.attendancePolicies.$inferSelect;

@Injectable()
export class AttendancePolicyService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly jobs: JobsService,
  ) {}

  async get(ctx: PortalActionContext) {
    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const row = await this.resolvePolicy(ctx.principal.institutionId, campusId);
    return this.toDto(row);
  }

  async put(ctx: PortalActionContext, input: AttendancePolicyUpsertInput) {
    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const existing = await this.resolvePolicyRow(ctx.principal.institutionId, campusId);
    if (!existing) {
      const [created] = await this.db
        .insert(schema.attendancePolicies)
        .values({
          institutionId: ctx.principal.institutionId,
          campusId,
          thresholdPct: String(input.thresholdPct),
          safeMarginPct: String(input.safeMarginPct),
          odBasis: input.odBasis,
          excusedBasis: input.excusedBasis,
          lateCountsAs: input.lateCountsAs,
          leftEarlyCountsAs: input.leftEarlyCountsAs,
          computationBasis: input.computationBasis,
          leaveMark: input.leaveMark,
          correctionWindowDays: input.correctionWindowDays,
          condonationEnabled: input.condonationEnabled,
          parentVisibility: input.parentVisibility,
          workingDaysMask: input.workingDaysMask,
        })
        .returning();
      await this.scheduleRebuild(ctx.principal.institutionId);
      return this.toDto(created!);
    }
    const [updated] = await this.db
      .update(schema.attendancePolicies)
      .set({
        thresholdPct: String(input.thresholdPct),
        safeMarginPct: String(input.safeMarginPct),
        odBasis: input.odBasis,
        excusedBasis: input.excusedBasis,
        lateCountsAs: input.lateCountsAs,
        leftEarlyCountsAs: input.leftEarlyCountsAs,
        computationBasis: input.computationBasis,
        leaveMark: input.leaveMark,
        correctionWindowDays: input.correctionWindowDays,
        condonationEnabled: input.condonationEnabled,
        parentVisibility: input.parentVisibility,
        workingDaysMask: input.workingDaysMask,
        version: existing.version + 1,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.attendancePolicies.id, existing.id), eq(schema.attendancePolicies.version, input.version)))
      .returning();
    if (!updated) {
      throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'Attendance policy was updated elsewhere.' });
    }
    await this.scheduleRebuild(ctx.principal.institutionId);
    return this.toDto(updated);
  }

  private async scheduleRebuild(institutionId: string) {
    await this.jobs.enqueue(
      'notifications',
      ATTENDANCE_RECOMPUTE_JOB,
      { institutionId, rebuild: true } as Record<string, unknown>,
      { jobId: `attendance:rebuild:${institutionId}`, delay: 30_000 },
    );
  }

  async resolvePolicyValues(institutionId: string, campusId: string | null) {
    const row = await this.resolvePolicy(institutionId, campusId);
    return this.toDto(row);
  }

  private async resolvePolicyRow(institutionId: string, campusId: string | null) {
    if (campusId) {
      const [campusRow] = await this.db
        .select()
        .from(schema.attendancePolicies)
        .where(and(eq(schema.attendancePolicies.institutionId, institutionId), eq(schema.attendancePolicies.campusId, campusId)))
        .limit(1);
      if (campusRow) return campusRow;
    }
    const [institutionRow] = await this.db
      .select()
      .from(schema.attendancePolicies)
      .where(and(eq(schema.attendancePolicies.institutionId, institutionId), isNull(schema.attendancePolicies.campusId)))
      .limit(1);
    return institutionRow;
  }

  /**
   * An institution that has never saved a policy still has one: the column defaults are the
   * product's stated defaults. Returning them unsaved (version 0) is what lets the settings
   * form render at all — a 404 here left the page with nothing to fill in, so a new tenant
   * could never create its first policy through the UI. The first save persists a real row.
   */
  private async resolvePolicy(institutionId: string, campusId: string | null) {
    const row = await this.resolvePolicyRow(institutionId, campusId);
    return row ?? DEFAULT_ATTENDANCE_POLICY;
  }

  private toDto(row: typeof schema.attendancePolicies.$inferSelect) {
    return {
      thresholdPct: Number(row.thresholdPct),
      safeMarginPct: Number(row.safeMarginPct),
      odBasis: row.odBasis as 'present' | 'excluded',
      excusedBasis: row.excusedBasis as 'present' | 'excluded',
      lateCountsAs: row.lateCountsAs as 'present' | 'absent',
      leftEarlyCountsAs: row.leftEarlyCountsAs as 'present' | 'absent',
      computationBasis: row.computationBasis as 'conducted' | 'scheduled',
      leaveMark: row.leaveMark as 'excused' | 'od',
      correctionWindowDays: row.correctionWindowDays,
      condonationEnabled: row.condonationEnabled,
      parentVisibility: row.parentVisibility as 'on' | 'off',
      workingDaysMask: row.workingDaysMask,
      version: row.version,
    };
  }
}
