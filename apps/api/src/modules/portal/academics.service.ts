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
  AcademicsListQuery,
  AssignClassSubjectInput,
  CreateAcademicYearInput,
  CreateClassInput,
  CreateDepartmentInput,
  CreateGradeLevelInput,
  CreateSubjectInput,
  UpdateAcademicYearInput,
  UpdateClassInput,
  UpdateDepartmentInput,
  UpdateGradeLevelInput,
  UpdateSubjectInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import { AcademicsRepository, type Page } from './academics.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-academics';

export interface ListResult<T> extends Page<T> {
  page: number;
  pageSize: number;
  hasMore: boolean;
}

/**
 * Institution-portal Academics service (Phase 2). Owns the tenant invariants the repository does
 * not: every read/write is confined to the principal's institution + the request's campus scope;
 * new rows are stamped with the active campus (or institution-owned when viewing the whole
 * institution); updates/deletes are optimistic-concurrency guarded; and every mutation writes an
 * audit event attributed to the institution user.
 */
@Injectable()
export class AcademicsService {
  constructor(
    private readonly repo: AcademicsRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === academic years ========================================================

  async listAcademicYears(ctx: PortalActionContext, q: AcademicsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listAcademicYears(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createAcademicYear(ctx: PortalActionContext, input: CreateAcademicYearInput) {
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertAcademicYear({
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      isCurrent: input.isCurrent,
      createdBy: ctx.principal.institutionUserId,
    });
    if (input.isCurrent) await this.repo.clearCurrentAcademicYear(ctx.principal.institutionId, campusId, row.id);
    await this.write(ctx, 'academic_year.create', 'academic_year', row.id, campusId, { newState: { name: row.name } });
    return row;
  }

  async updateAcademicYear(ctx: PortalActionContext, id: string, input: UpdateAcademicYearInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findAcademicYear(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const updated = await this.repo.updateAcademicYear(id, input.version, {
      name: input.name ?? existing!.name,
      startDate: input.startDate ?? existing!.startDate,
      endDate: input.endDate ?? existing!.endDate,
      status: input.status ?? existing!.status,
      isCurrent: input.isCurrent ?? existing!.isCurrent,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    if (updated.isCurrent) {
      await this.repo.clearCurrentAcademicYear(ctx.principal.institutionId, updated.campusId, updated.id);
      await this.repo.updateAcademicYear(updated.id, updated.version, { isCurrent: true });
    }
    await this.write(ctx, 'academic_year.update', 'academic_year', id, updated.campusId, {
      previousState: { name: existing!.name, status: existing!.status },
      newState: { name: updated.name, status: updated.status },
    });
    return updated;
  }

  async deleteAcademicYear(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findAcademicYear(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.guardDelete(() => this.repo.deleteAcademicYear(id, version));
    await this.write(ctx, 'academic_year.delete', 'academic_year', id, existing!.campusId, {
      previousState: { name: existing!.name },
    });
    return ok;
  }

  // === departments ===========================================================

  async listDepartments(ctx: PortalActionContext, q: AcademicsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listDepartments(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createDepartment(ctx: PortalActionContext, input: CreateDepartmentInput) {
    await this.assertUser(ctx, input.headUserId);
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertDepartment({
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      code: input.code,
      headUserId: input.headUserId ?? null,
      description: input.description ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'department.create', 'department', row.id, campusId, { newState: { name: row.name } });
    return row;
  }

  async updateDepartment(ctx: PortalActionContext, id: string, input: UpdateDepartmentInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findDepartment(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertUser(ctx, input.headUserId);
    const updated = await this.repo.updateDepartment(id, input.version, {
      name: input.name ?? existing!.name,
      code: input.code ?? existing!.code,
      headUserId: input.headUserId === undefined ? existing!.headUserId : input.headUserId,
      description: input.description === undefined ? existing!.description : input.description,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'department.update', 'department', id, updated.campusId, {
      previousState: { name: existing!.name },
      newState: { name: updated.name },
    });
    return updated;
  }

  async deleteDepartment(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findDepartment(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.guardDelete(() => this.repo.deleteDepartment(id, version));
    await this.write(ctx, 'department.delete', 'department', id, existing!.campusId, { previousState: { name: existing!.name } });
    return ok;
  }

  // === grade levels ==========================================================

  async listGradeLevels(ctx: PortalActionContext, q: AcademicsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listGradeLevels(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createGradeLevel(ctx: PortalActionContext, input: CreateGradeLevelInput) {
    await this.assertDepartment(ctx, input.departmentId);
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertGradeLevel({
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      level: input.level,
      departmentId: input.departmentId ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'grade_level.create', 'grade_level', row.id, campusId, { newState: { name: row.name } });
    return row;
  }

  async updateGradeLevel(ctx: PortalActionContext, id: string, input: UpdateGradeLevelInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findGradeLevel(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertDepartment(ctx, input.departmentId);
    const updated = await this.repo.updateGradeLevel(id, input.version, {
      name: input.name ?? existing!.name,
      level: input.level ?? existing!.level,
      departmentId: input.departmentId === undefined ? existing!.departmentId : input.departmentId,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'grade_level.update', 'grade_level', id, updated.campusId, {
      previousState: { name: existing!.name },
      newState: { name: updated.name },
    });
    return updated;
  }

  async deleteGradeLevel(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findGradeLevel(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.guardDelete(() => this.repo.deleteGradeLevel(id, version));
    await this.write(ctx, 'grade_level.delete', 'grade_level', id, existing!.campusId, { previousState: { name: existing!.name } });
    return ok;
  }

  // === subjects ==============================================================

  async listSubjects(ctx: PortalActionContext, q: AcademicsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listSubjects(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createSubject(ctx: PortalActionContext, input: CreateSubjectInput) {
    await this.assertDepartment(ctx, input.departmentId);
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertSubject({
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      code: input.code,
      kind: input.kind,
      departmentId: input.departmentId ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'subject.create', 'subject', row.id, campusId, { newState: { name: row.name } });
    return row;
  }

  async updateSubject(ctx: PortalActionContext, id: string, input: UpdateSubjectInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findSubject(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertDepartment(ctx, input.departmentId);
    const updated = await this.repo.updateSubject(id, input.version, {
      name: input.name ?? existing!.name,
      code: input.code ?? existing!.code,
      kind: input.kind ?? existing!.kind,
      departmentId: input.departmentId === undefined ? existing!.departmentId : input.departmentId,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'subject.update', 'subject', id, updated.campusId, {
      previousState: { name: existing!.name },
      newState: { name: updated.name },
    });
    return updated;
  }

  async deleteSubject(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findSubject(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.guardDelete(() => this.repo.deleteSubject(id, version));
    await this.write(ctx, 'subject.delete', 'subject', id, existing!.campusId, { previousState: { name: existing!.name } });
    return ok;
  }

  // === classes / sections ====================================================

  async listClasses(ctx: PortalActionContext, q: AcademicsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listClasses(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createClass(ctx: PortalActionContext, input: CreateClassInput) {
    await this.assertRef(ctx, 'academicYears', input.academicYearId, 'academic year');
    await this.assertRef(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    await this.assertUser(ctx, input.classTeacherId);
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertClass({
      institutionId: ctx.principal.institutionId,
      campusId,
      academicYearId: input.academicYearId,
      gradeLevelId: input.gradeLevelId,
      name: input.name,
      section: input.section ?? null,
      classTeacherId: input.classTeacherId ?? null,
      room: input.room ?? null,
      capacity: input.capacity ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'class.create', 'class', row.id, campusId, { newState: { name: row.name } });
    return row;
  }

  async updateClass(ctx: PortalActionContext, id: string, input: UpdateClassInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findClass(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    if (input.academicYearId) await this.assertRef(ctx, 'academicYears', input.academicYearId, 'academic year');
    if (input.gradeLevelId) await this.assertRef(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    await this.assertUser(ctx, input.classTeacherId);
    const updated = await this.repo.updateClass(id, input.version, {
      academicYearId: input.academicYearId ?? existing!.academicYearId,
      gradeLevelId: input.gradeLevelId ?? existing!.gradeLevelId,
      name: input.name ?? existing!.name,
      section: input.section === undefined ? existing!.section : input.section,
      classTeacherId: input.classTeacherId === undefined ? existing!.classTeacherId : input.classTeacherId,
      room: input.room === undefined ? existing!.room : input.room,
      capacity: input.capacity === undefined ? existing!.capacity : input.capacity,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'class.update', 'class', id, updated.campusId, {
      previousState: { name: existing!.name },
      newState: { name: updated.name },
    });
    return updated;
  }

  async deleteClass(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findClass(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.guardDelete(() => this.repo.deleteClass(id, version));
    await this.write(ctx, 'class.delete', 'class', id, existing!.campusId, { previousState: { name: existing!.name } });
    return ok;
  }

  // --- class ↔ subject ↔ teacher --------------------------------------------

  async listClassSubjects(ctx: PortalActionContext, classId: string) {
    await this.requireClassInScope(ctx, classId);
    return this.repo.listClassSubjects(classId);
  }

  async assignClassSubject(ctx: PortalActionContext, classId: string, input: AssignClassSubjectInput) {
    const cls = await this.requireClassInScope(ctx, classId);
    await this.assertRef(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertUser(ctx, input.teacherId);
    const existing = await this.repo.findClassSubject(classId, input.subjectId);
    if (existing) {
      const updated = await this.repo.updateClassSubjectTeacher(existing.id, input.teacherId ?? null);
      await this.write(ctx, 'class_subject.update', 'class_subject', existing.id, cls.campusId, {
        newState: { subjectId: input.subjectId, teacherId: input.teacherId ?? null },
      });
      return updated;
    }
    const row = await this.repo.insertClassSubject({
      institutionId: ctx.principal.institutionId,
      classId,
      subjectId: input.subjectId,
      teacherId: input.teacherId ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'class_subject.assign', 'class_subject', row.id, cls.campusId, {
      newState: { subjectId: input.subjectId, teacherId: input.teacherId ?? null },
    });
    return row;
  }

  async removeClassSubject(ctx: PortalActionContext, classId: string, assignmentId: string) {
    const cls = await this.requireClassInScope(ctx, classId);
    const link = await this.repo.findClassSubjectById(assignmentId, classId);
    if (!link) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });
    const ok = await this.repo.deleteClassSubject(assignmentId);
    await this.write(ctx, 'class_subject.remove', 'class_subject', assignmentId, cls.campusId, {
      previousState: { subjectId: link.subjectId },
    });
    return { deleted: ok };
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  /** New rows belong to the active campus, or are institution-owned when viewing the whole institution. */
  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === 'campus' ? scope.campusId : null;
  }

  /** 404 when a row is missing or outside the active campus scope (don't leak existence). */
  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return; // institution-owned: visible in every scope
    if (filter.campusIds === null) return; // institution-wide principal: all campuses
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private async requireClassInScope(ctx: PortalActionContext, classId: string) {
    const f = this.filter(ctx);
    const cls = await this.repo.findClass(classId, ctx.principal.institutionId);
    this.assertInScope(cls?.campusId ?? null, cls, f);
    return cls;
  }

  /** Validate that a referenced row exists inside the institution (friendly 400 instead of FK 500). */
  private async assertRef(
    ctx: PortalActionContext,
    table: 'academicYears' | 'gradeLevels' | 'departments' | 'subjects',
    id: string,
    label: string,
  ): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private async assertDepartment(ctx: PortalActionContext, departmentId: string | null | undefined): Promise<void> {
    if (!departmentId) return;
    await this.assertRef(ctx, 'departments', departmentId, 'department');
  }

  /** Validate a teacher FK (class teacher / department head / subject teacher) lives in the institution. */
  private async assertUser(ctx: PortalActionContext, teacherId: string | null | undefined): Promise<void> {
    if (!teacherId) return;
    const ok = await this.repo.existsInInstitution('teachers', teacherId, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: 'Unknown teacher' });
  }

  private async guardDelete(fn: () => Promise<boolean>): Promise<{ deleted: true }> {
    const ok = await fn();
    if (!ok) throw this.versionConflict();
    return { deleted: true };
  }

  private paginate<T>(page: Page<T>, q: AcademicsListQuery): ListResult<T> {
    return {
      ...page,
      page: q.page,
      pageSize: q.pageSize,
      hasMore: q.page * q.pageSize < page.total,
    };
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
