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
  AttendanceListQuery,
  CreateAttendanceSessionInput,
  MarkAttendanceInput,
  UpdateAttendanceSessionInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { AttendanceRepository, type AttendanceRefTable } from './attendance.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

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
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === sessions ==============================================================

  async listSessions(ctx: PortalActionContext, q: AttendanceListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listSessions(ctx.principal.institutionId, f.campusIds, q), q);
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
    const row = await this.repo.insertSession({
      institutionId: ctx.principal.institutionId,
      campusId,
      classId: input.classId,
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

  /** Bulk upsert the register. Each mark's student is pre-checked for a friendly 400. */
  async mark(ctx: PortalActionContext, sessionId: string, input: MarkAttendanceInput) {
    const session = await this.requireSessionInScope(ctx, sessionId);
    const seen = new Set<string>();
    for (const m of input.marks) {
      if (!seen.has(m.studentId)) {
        await this.assertRef(ctx, 'students', m.studentId, 'student');
        seen.add(m.studentId);
      }
      await this.repo.upsertRecord({
        institutionId: ctx.principal.institutionId,
        sessionId,
        studentId: m.studentId,
        status: m.status,
        remarks: m.remarks ?? null,
        createdBy: ctx.principal.institutionUserId,
      });
    }
    await this.write(ctx, 'attendance.mark', 'attendance_session', sessionId, session.campusId, {
      newState: { marks: input.marks.length },
    });
    return this.repo.listRecords(sessionId);
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
