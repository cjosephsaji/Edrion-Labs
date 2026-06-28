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
  CreateTimetableSlotInput,
  TimetableListQuery,
  UpdateTimetableSlotInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { TimetableRepository, type TimetableRefTable } from './timetable.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-timetable';

/**
 * Institution-portal Timetable service (Phase 5). Recurring weekly slots, campus-scoped and
 * version-guarded like every other portal resource; FKs (class/subject/teacher/year) are pre-checked
 * for friendly 400s and all mutations are audited.
 */
@Injectable()
export class TimetableService {
  constructor(
    private readonly repo: TimetableRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: TimetableListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.list(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async create(ctx: PortalActionContext, input: CreateTimetableSlotInput) {
    await this.assertRef(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'teachers', input.teacherId, 'teacher');
    await this.assertOptional(ctx, 'academicYears', input.academicYearId, 'academic year');
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insert({
      institutionId: ctx.principal.institutionId,
      campusId,
      classId: input.classId,
      subjectId: input.subjectId ?? null,
      teacherId: input.teacherId ?? null,
      academicYearId: input.academicYearId ?? null,
      dayOfWeek: input.dayOfWeek,
      startTime: input.startTime,
      endTime: input.endTime,
      room: input.room ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'timetable.create', 'timetable_slot', row.id, campusId, {
      newState: { classId: row.classId, dayOfWeek: row.dayOfWeek, startTime: row.startTime },
    });
    return row;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateTimetableSlotInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'teachers', input.teacherId, 'teacher');
    await this.assertOptional(ctx, 'academicYears', input.academicYearId, 'academic year');
    const updated = await this.repo.update(id, input.version, {
      classId: input.classId ?? existing!.classId,
      subjectId: input.subjectId === undefined ? existing!.subjectId : input.subjectId,
      teacherId: input.teacherId === undefined ? existing!.teacherId : input.teacherId,
      academicYearId: input.academicYearId === undefined ? existing!.academicYearId : input.academicYearId,
      dayOfWeek: input.dayOfWeek ?? existing!.dayOfWeek,
      startTime: input.startTime ?? existing!.startTime,
      endTime: input.endTime ?? existing!.endTime,
      room: input.room === undefined ? existing!.room : input.room,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'timetable.update', 'timetable_slot', id, updated.campusId, {
      newState: { dayOfWeek: updated.dayOfWeek, startTime: updated.startTime },
    });
    return updated;
  }

  async delete(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.delete(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'timetable.delete', 'timetable_slot', id, existing!.campusId, {
      previousState: { dayOfWeek: existing!.dayOfWeek, startTime: existing!.startTime },
    });
    return { deleted: true };
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

  private async assertRef(ctx: PortalActionContext, table: TimetableRefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private async assertOptional(
    ctx: PortalActionContext,
    table: TimetableRefTable,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) return;
    await this.assertRef(ctx, table, id, label);
  }

  private paginate<T>(page: Page<T>, q: TimetableListQuery): ListResult<T> {
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
