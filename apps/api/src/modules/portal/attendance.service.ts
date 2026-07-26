import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  AttendanceAgendaQuery,
  AttendanceListQuery,
  CreateAttendanceSessionInput,
  MarkAttendanceInput,
  OpenAttendanceSessionInput,
  UpdateAttendanceSessionInput,
} from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { Database } from '@edrion/database';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { resolveAcademicScope } from './academic-scope-stamp';
import { AttendanceRepository, type AttendanceRefTable } from './attendance.repository';
import { resolveCurrentStaffId } from './current-staff';
import { institutionNow, slotTiming, getCachedInstitutionTimezone } from './institution-clock';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';
import { JobsService } from '../../common/queue/jobs.service';
import {
  ATTENDANCE_RECOMPUTE_JOB,
  type AttendanceRecomputeJobData,
} from '../student/attendance/attendance.constants';
import { and, eq, schema } from '@edrion/database';

const MODULE = 'portal-attendance';

/**
 * Institution-portal Attendance service (Phase 5). A register (session) is campus-scoped and
 * version-guarded like every other portal resource; the per-student records inherit the session's
 * campus and are only reachable through a session the caller can see (requireSessionInScope). Bulk
 * marking upserts on (session, student). All mutations are audited.
 */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly repo: AttendanceRepository,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly jobs: JobsService,
  ) {}

  // === sessions ==============================================================

  async listSessions(ctx: PortalActionContext, q: AttendanceListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listSessions(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async agenda(ctx: PortalActionContext, q: AttendanceAgendaQuery) {
    const timezone = await getCachedInstitutionTimezone(ctx.principal.institutionId, () =>
      this.repo.getInstitutionTimezone(ctx.principal.institutionId),
    );
    const wall = institutionNow(timezone);
    const date = q.date ?? wall.date;
    // When browsing another date, recompute day-of-week from that date in the institution tz
    // by anchoring noon UTC on that calendar date (avoids DST edge for weekday).
    let dayOfWeek = wall.dayOfWeek;
    let nowTime = wall.time;
    if (q.date && q.date !== wall.date) {
      const [y, m, d] = q.date.split('-').map(Number);
      const anchor = new Date(Date.UTC(y!, m! - 1, d!, 12, 0, 0));
      dayOfWeek = institutionNow(timezone, anchor).dayOfWeek;
      nowTime = '23:59'; // historical dates: treat all slots as past for timing
    }

    const staffId = await resolveCurrentStaffId(this.db, ctx.principal);
    let scope: 'mine' | 'all' = q.scope ?? (staffId ? 'mine' : 'all');
    if (scope === 'mine' && !staffId) {
      return {
        date,
        now: wall.time,
        timezone,
        dayOfWeek,
        scope,
        slots: [] as const,
        reason: 'staff_not_linked' as const,
      };
    }

    const f = this.filter(ctx);
    const rows = await this.repo.listAgendaSlots({
      institutionId: ctx.principal.institutionId,
      campusIds: f.campusIds,
      date,
      dayOfWeek,
      teacherId: scope === 'mine' ? staffId : undefined,
      classId: q.classId,
    });

    const slots = rows.map((r) => {
      const timing = slotTiming(nowTime, r.startTime, r.endTime);
      let marking: 'unmarked' | 'partial' | 'complete' = 'unmarked';
      if (r.sessionId) {
        marking =
          r.rosterSize > 0 && r.recordCount >= r.rosterSize
            ? 'complete'
            : r.recordCount > 0
              ? 'partial'
              : 'unmarked';
      }
      return {
        slotId: r.slotId,
        periodLabel: r.periodLabel,
        startTime: r.startTime,
        endTime: r.endTime,
        classId: r.classId,
        className: r.className,
        subjectId: r.subjectId,
        subjectName: r.subjectName,
        teacherId: r.teacherId,
        teacherName: r.teacherName,
        room: r.room,
        timing,
        marking,
        rosterSize: r.rosterSize,
        session: r.sessionId
          ? {
              id: r.sessionId,
              recordCount: r.recordCount,
              presentCount: r.presentCount,
              version: r.sessionVersion ?? 0,
            }
          : null,
      };
    });

    return {
      date,
      now: wall.time,
      timezone,
      dayOfWeek,
      scope,
      slots,
      reason: null as null,
    };
  }

  async openSession(ctx: PortalActionContext, input: OpenAttendanceSessionInput) {
    const institutionId = ctx.principal.institutionId;
    let classId = input.classId;
    let slotId: string | null = null;
    let subjectId: string | null = null;
    let periodLabel = 'full_day';
    let campusId = this.createCampusId(ctx.scope);

    if (input.slotId) {
      const slot = await this.repo.findTimetableSlot(input.slotId, institutionId);
      if (!slot) {
        throw new BadRequestException({ code: 'INVALID_REFERENCE', message: 'Unknown timetable slot' });
      }
      classId = slot.classId;
      slotId = slot.id;
      subjectId = slot.subjectId;
      periodLabel = slot.periodLabel?.trim() || slot.startTime || 'period';
      if (slot.campusId) campusId = slot.campusId;
    }

    if (!classId) {
      throw new BadRequestException({ code: 'INVALID_REFERENCE', message: 'classId is required' });
    }
    await this.assertRef(ctx, 'classes', classId, 'class');

    // Find-or-create (idempotent — never 409 SESSION_EXISTS).
    let session =
      slotId != null
        ? await this.repo.findSessionBySlotId(institutionId, classId, input.date, slotId)
        : await this.repo.findSessionByKey(institutionId, classId, input.date, periodLabel);

    if (!session) {
      const f = this.filter(ctx);
      const scope = await resolveAcademicScope(this.db, {
        institutionId,
        campusIds: f.campusIds,
        classId,
      });
      const staffId = await resolveCurrentStaffId(this.db, ctx.principal);
      session = await this.repo.insertSession({
        institutionId,
        campusId,
        classId,
        academicYearId: scope.academicYearId,
        termId: scope.termId,
        subjectId,
        date: input.date,
        period: periodLabel,
        slotId,
        takenById: staffId,
        notes: null,
        createdBy: ctx.principal.institutionUserId,
      });
      await this.write(ctx, 'attendance.session.open', 'attendance_session', session.id, campusId, {
        newState: { classId, date: input.date, period: periodLabel, slotId },
      });
    }

    const [roster, records] = await Promise.all([
      this.repo.classRoster(classId, institutionId),
      this.repo.listRecords(session.id),
    ]);

    return { session, roster, records };
  }

  async createSession(ctx: PortalActionContext, input: CreateAttendanceSessionInput) {
    await this.assertRef(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'staff', input.takenById, 'teacher');
    const dupe = await this.repo.findSessionByKey(
      ctx.principal.institutionId,
      input.classId,
      input.date,
      input.period,
    );
    if (dupe) {
      throw new ConflictException({
        code: 'SESSION_EXISTS',
        message: 'A register already exists for this class, date and period.',
      });
    }
    const campusId = this.createCampusId(ctx.scope);
    const f = this.filter(ctx);
    const scope = await resolveAcademicScope(this.db, {
      institutionId: ctx.principal.institutionId,
      campusIds: f.campusIds,
      classId: input.classId,
    });
    const row = await this.repo.insertSession({
      institutionId: ctx.principal.institutionId,
      campusId,
      classId: input.classId,
      academicYearId: scope.academicYearId,
      termId: scope.termId,
      subjectId: input.subjectId ?? null,
      date: input.date,
      period: input.period,
      takenById: input.takenById ?? null,
      notes: input.notes ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'attendance.session.create', 'attendance_session', row.id, campusId, {
      newState: { classId: row.classId, date: row.date, period: row.period },
    });
    return row;
  }

  async updateSession(ctx: PortalActionContext, id: string, input: UpdateAttendanceSessionInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findSession(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'staff', input.takenById, 'teacher');
    const updated = await this.repo.updateSession(id, input.version, {
      classId: input.classId ?? existing!.classId,
      subjectId: input.subjectId === undefined ? existing!.subjectId : input.subjectId,
      date: input.date ?? existing!.date,
      period: input.period ?? existing!.period,
      takenById: input.takenById === undefined ? existing!.takenById : input.takenById,
      notes: input.notes === undefined ? existing!.notes : input.notes,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'attendance.session.update', 'attendance_session', id, updated.campusId, {
      newState: { date: updated.date, period: updated.period },
    });
    return updated;
  }

  async deleteSession(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findSession(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteSession(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'attendance.session.delete', 'attendance_session', id, existing!.campusId, {
      previousState: { date: existing!.date, period: existing!.period },
    });
    return { deleted: true };
  }

  // === records ===============================================================

  async listRecords(ctx: PortalActionContext, sessionId: string) {
    await this.requireSessionInScope(ctx, sessionId);
    return this.repo.listRecords(sessionId);
  }

  /** Bulk upsert the register — two queries (validate students + multi-row upsert). */
  async mark(ctx: PortalActionContext, sessionId: string, input: MarkAttendanceInput) {
    const session = await this.requireSessionInScope(ctx, sessionId);
    const uniqueIds = [...new Set(input.marks.map((m) => m.studentId))];
    const existing = await this.repo.existingStudentIds(uniqueIds, ctx.principal.institutionId);
    const missing = uniqueIds.filter((id) => !existing.has(id));
    if (missing.length > 0) {
      throw new BadRequestException({
        code: 'INVALID_REFERENCE',
        message: `Unknown student${missing.length > 1 ? 's' : ''}`,
      });
    }

    // Prefer students in the class when the session has a class.
    const rosterIds = await this.repo.classRosterStudentIds(session.classId, ctx.principal.institutionId);
    if (rosterIds.length > 0) {
      const rosterSet = new Set(rosterIds);
      const outside = uniqueIds.filter((id) => !rosterSet.has(id));
      if (outside.length > 0) {
        throw new BadRequestException({
          code: 'INVALID_REFERENCE',
          message: 'One or more students are not in this class',
        });
      }
    }

    // Last-write-wins per studentId if duplicates appear in the payload.
    const byStudent = new Map(input.marks.map((m) => [m.studentId, m]));
    await this.repo.upsertRecords(
      [...byStudent.values()].map((m) => ({
        institutionId: ctx.principal.institutionId,
        sessionId,
        studentId: m.studentId,
        status: m.status,
        remarks: m.remarks ?? null,
        createdBy: ctx.principal.institutionUserId,
      })),
    );

    await this.write(ctx, 'attendance.mark', 'attendance_session', sessionId, session.campusId, {
      newState: { marks: byStudent.size },
    });
    await this.afterMarksWritten(ctx.principal.institutionId, sessionId, [...byStudent.keys()]);
    return this.repo.listRecords(sessionId);
  }

  /** System/request-engine write path with provenance — bypasses portal scope but stays institution-scoped. */
  async markSystem(
    institutionId: string,
    sessionId: string,
    mark: {
      studentId: string;
      status: string;
      remarks?: string | null;
      provenance?: {
        kind: 'leave_approval' | 'od_approval' | 'correction_approval';
        request_id: string;
      } | null;
    },
  ) {
    const session = await this.repo.findSession(sessionId, institutionId);
    if (!session) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attendance session not found' });
    await this.repo.upsertRecords([
      {
        institutionId,
        sessionId,
        studentId: mark.studentId,
        status: mark.status,
        remarks: mark.remarks ?? null,
        provenance: mark.provenance ?? null,
        createdBy: null,
      },
    ]);
    await this.afterMarksWritten(institutionId, sessionId, [mark.studentId]);
    return this.repo.listRecords(sessionId);
  }

  private async afterMarksWritten(institutionId: string, sessionId: string, studentIds: string[]) {
    const [session] = await this.db
      .select()
      .from(schema.attendanceSessions)
      .where(eq(schema.attendanceSessions.id, sessionId))
      .limit(1);
    if (!session?.termId) return;
    for (const studentId of studentIds) {
      for (const subjectId of [session.subjectId, null] as Array<string | null>) {
        const data: AttendanceRecomputeJobData = {
          institutionId,
          studentId,
          subjectId,
          termId: session.termId,
        };
        await this.jobs.enqueue('notifications', ATTENDANCE_RECOMPUTE_JOB, data as unknown as Record<string, unknown>, {
          jobId: `attendance:${studentId}:${subjectId ?? 'overall'}:${session.termId}`,
          delay: 30_000,
        });
      }
    }
  }

  async removeRecord(ctx: PortalActionContext, sessionId: string, recordId: string) {
    const session = await this.requireSessionInScope(ctx, sessionId);
    const rec = await this.repo.findRecord(recordId, sessionId);
    if (!rec) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Attendance record not found' });
    const ok = await this.repo.deleteRecord(recordId);
    await this.write(ctx, 'attendance.record.remove', 'attendance_record', recordId, session.campusId, {
      previousState: { studentId: rec.studentId, status: rec.status },
    });
    return { deleted: ok };
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === 'campus' ? scope.campusId : null;
  }

  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private async requireSessionInScope(ctx: PortalActionContext, sessionId: string) {
    const f = this.filter(ctx);
    const session = await this.repo.findSession(sessionId, ctx.principal.institutionId);
    this.assertInScope(session?.campusId ?? null, session, f);
    return session;
  }

  private async assertRef(ctx: PortalActionContext, table: AttendanceRefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private async assertOptional(
    ctx: PortalActionContext,
    table: AttendanceRefTable,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) return;
    await this.assertRef(ctx, table, id, label);
  }

  private paginate<T>(page: Page<T>, q: AttendanceListQuery): ListResult<T> {
    return { ...page, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityType: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
      campusId: campusId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }
}
