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
  ApplyCurriculumInput,
  AssignClassSubjectInput,
  CreateAcademicYearInput,
  CreateAcademicTermInput,
  CreateClassInput,
  CreateDepartmentInput,
  CreateDepartmentGradeLevelInput,
  CreateGradeLevelInput,
  CreateProgrammeSubjectInput,
  CreateSubjectInput,
  RosterCandidateQuery,
  UpdateAcademicYearInput,
  UpdateAcademicTermInput,
  UpdateClassInput,
  UpdateClassRosterInput,
  UpdateDepartmentInput,
  UpdateDepartmentGradeLevelInput,
  UpdateGradeLevelInput,
  UpdateProgrammeSubjectInput,
  UpdateSubjectInput,
} from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { Database } from '@edrion/database';
import { AcademicsRepository, type Page, type ProgrammeStructureDepartment } from './academics.repository';
import { LabScheduleSyncService } from './lab-schedule-sync.service';
import { insertStaffAssignment } from './academic-scope-stamp';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-academics';

/** Derive a short code from a display name when the user leaves code blank. */
function defaultResourceCode(name: string): string {
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const initials = words.map((w) => w[0]?.toUpperCase() ?? '').join('');
    if (initials.length >= 2) return initials.slice(0, 32);
  }
  const slug = trimmed
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return (slug || 'ITEM').slice(0, 32);
}

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
    private readonly labScheduleSync: LabScheduleSyncService,
    @Inject(DATABASE) private readonly db: Database,
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

  // === academic terms ========================================================

  async listAcademicTerms(ctx: PortalActionContext, q: AcademicsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listAcademicTerms(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createAcademicTerm(ctx: PortalActionContext, input: CreateAcademicTermInput) {
    await this.assertRef(ctx, 'academicYears', input.academicYearId, 'academic year');
    const linkage = await this.resolveProgrammeLinkage(ctx, input);
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertAcademicTerm({
      institutionId: ctx.principal.institutionId,
      campusId,
      academicYearId: input.academicYearId,
      programmeLevelId: linkage.programmeLevelId,
      departmentId: linkage.departmentId,
      gradeLevelId: linkage.gradeLevelId,
      name: input.name,
      kind: input.kind,
      sequence: input.sequence,
      startDate: input.startDate,
      endDate: input.endDate,
      status: input.status,
      isCurrent: input.isCurrent,
      createdBy: ctx.principal.institutionUserId,
    });
    if (input.isCurrent) await this.repo.clearCurrentAcademicTerm(ctx.principal.institutionId, campusId, row.id);
    await this.write(ctx, 'academic_term.create', 'academic_term', row.id, campusId, { newState: { name: row.name } });
    return row;
  }

  async updateAcademicTerm(ctx: PortalActionContext, id: string, input: UpdateAcademicTermInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findAcademicTerm(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    if (input.academicYearId) await this.assertRef(ctx, 'academicYears', input.academicYearId, 'academic year');
    const linking =
      input.programmeLevelId !== undefined ||
      input.departmentId !== undefined ||
      input.gradeLevelId !== undefined
        ? await this.resolveProgrammeLinkage(ctx, {
            programmeLevelId: input.programmeLevelId,
            departmentId: input.departmentId,
            gradeLevelId: input.gradeLevelId,
          })
        : null;
    const updated = await this.repo.updateAcademicTerm(id, input.version, {
      academicYearId: input.academicYearId ?? existing!.academicYearId,
      programmeLevelId: linking ? linking.programmeLevelId : existing!.programmeLevelId,
      departmentId: linking ? linking.departmentId : existing!.departmentId,
      gradeLevelId: linking ? linking.gradeLevelId : existing!.gradeLevelId,
      name: input.name ?? existing!.name,
      kind: input.kind ?? existing!.kind,
      sequence: input.sequence ?? existing!.sequence,
      startDate: input.startDate ?? existing!.startDate,
      endDate: input.endDate ?? existing!.endDate,
      status: input.status ?? existing!.status,
      isCurrent: input.isCurrent ?? existing!.isCurrent,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    if (updated.isCurrent) {
      await this.repo.clearCurrentAcademicTerm(ctx.principal.institutionId, updated.campusId, updated.id);
      await this.repo.updateAcademicTerm(updated.id, updated.version, { isCurrent: true });
    }
    await this.write(ctx, 'academic_term.update', 'academic_term', id, updated.campusId, {
      previousState: { name: existing!.name, status: existing!.status },
      newState: { name: updated.name, status: updated.status },
    });
    return updated;
  }

  async deleteAcademicTerm(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findAcademicTerm(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.guardDelete(() => this.repo.deleteAcademicTerm(id, version));
    await this.write(ctx, 'academic_term.delete', 'academic_term', id, existing!.campusId, {
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
      code: input.code?.trim() || defaultResourceCode(input.name),
      headUserId: input.headUserId ?? null,
      description: input.description ?? null,
      termSystem: input.termSystem ?? 'term',
      durationMonths: input.durationMonths ?? null,
      termsPerYear: input.termsPerYear ?? 3,
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

  // === department grade levels (programme ↔ year) =============================

  async listDepartmentGradeLevels(ctx: PortalActionContext, q: AcademicsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(
      await this.repo.listDepartmentGradeLevels(ctx.principal.institutionId, f.campusIds, q),
      q,
    );
  }

  async createDepartmentGradeLevel(ctx: PortalActionContext, input: CreateDepartmentGradeLevelInput) {
    await this.assertRef(ctx, 'departments', input.departmentId, 'department');
    await this.assertRef(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    const dup = await this.repo.findDepartmentGradeLevelByPair(
      ctx.principal.institutionId,
      input.departmentId,
      input.gradeLevelId,
    );
    if (dup) {
      throw new BadRequestException({
        code: 'DUPLICATE_PROGRAMME_LEVEL',
        message: 'This year is already linked to the programme.',
      });
    }
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertDepartmentGradeLevel({
      institutionId: ctx.principal.institutionId,
      campusId,
      departmentId: input.departmentId,
      gradeLevelId: input.gradeLevelId,
      sequence: input.sequence,
      durationLabel: input.durationLabel ?? null,
      status: input.status,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'programme_level.create', 'department_grade_level', row.id, campusId, {
      newState: { departmentId: row.departmentId, gradeLevelId: row.gradeLevelId },
    });
    return row;
  }

  async updateDepartmentGradeLevel(
    ctx: PortalActionContext,
    id: string,
    input: UpdateDepartmentGradeLevelInput,
  ) {
    const f = this.filter(ctx);
    const existing = await this.repo.findDepartmentGradeLevel(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const departmentId = input.departmentId ?? existing!.departmentId;
    const gradeLevelId = input.gradeLevelId ?? existing!.gradeLevelId;
    if (input.departmentId) await this.assertRef(ctx, 'departments', input.departmentId, 'department');
    if (input.gradeLevelId) await this.assertRef(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    if (input.departmentId || input.gradeLevelId) {
      const dup = await this.repo.findDepartmentGradeLevelByPair(
        ctx.principal.institutionId,
        departmentId,
        gradeLevelId,
      );
      if (dup && dup.id !== id) {
        throw new BadRequestException({
          code: 'DUPLICATE_PROGRAMME_LEVEL',
          message: 'This year is already linked to the programme.',
        });
      }
    }
    const updated = await this.repo.updateDepartmentGradeLevel(id, input.version, {
      departmentId: input.departmentId ?? existing!.departmentId,
      gradeLevelId: input.gradeLevelId ?? existing!.gradeLevelId,
      sequence: input.sequence ?? existing!.sequence,
      durationLabel: input.durationLabel === undefined ? existing!.durationLabel : input.durationLabel,
      status: input.status ?? existing!.status,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'programme_level.update', 'department_grade_level', id, updated.campusId, {
      previousState: { departmentId: existing!.departmentId, gradeLevelId: existing!.gradeLevelId },
      newState: { departmentId: updated.departmentId, gradeLevelId: updated.gradeLevelId },
    });
    return updated;
  }

  async deleteDepartmentGradeLevel(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findDepartmentGradeLevel(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.guardDelete(() => this.repo.deleteDepartmentGradeLevel(id, version));
    await this.write(ctx, 'programme_level.delete', 'department_grade_level', id, existing!.campusId, {
      previousState: { departmentId: existing!.departmentId, gradeLevelId: existing!.gradeLevelId },
    });
    return ok;
  }

  async getProgrammeStructure(
    ctx: PortalActionContext,
    departmentId?: string,
  ): Promise<ProgrammeStructureDepartment[]> {
    const f = this.filter(ctx);
    return this.repo.getProgrammeStructure(ctx.principal.institutionId, f.campusIds, departmentId);
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
      code: input.code?.trim() || defaultResourceCode(input.name),
      kind: input.kind,
      isLabSubject: input.isLabSubject ?? false,
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
      isLabSubject: input.isLabSubject ?? existing!.isLabSubject,
      departmentId: input.departmentId === undefined ? existing!.departmentId : input.departmentId,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    if (input.isLabSubject !== undefined && input.isLabSubject !== existing!.isLabSubject) {
      if (updated.isLabSubject) {
        await this.labScheduleSync.syncAllForSubject(ctx, ctx.principal.institutionId, id);
      } else {
        await this.labScheduleSync.removeAllForSubject(id);
      }
    }
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

  // === programme subjects (curriculum) =======================================

  async listProgrammeSubjects(ctx: PortalActionContext, q: AcademicsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(
      await this.repo.listProgrammeSubjects(ctx.principal.institutionId, f.campusIds, q),
      q,
    );
  }

  async createProgrammeSubject(ctx: PortalActionContext, input: CreateProgrammeSubjectInput) {
    await this.assertRef(ctx, 'subjects', input.subjectId, 'subject');

    let slotId = input.slotId ?? null;
    let programmeLevelId: string | null = input.programmeLevelId ?? null;
    let departmentId: string | null = input.departmentId ?? null;
    let semesterSequence = input.semesterSequence;

    if (slotId) {
      const slot = await this.repo.findProgrammeTermSlot(slotId, ctx.principal.institutionId);
      if (!slot) {
        throw new BadRequestException({
          code: 'INVALID_SLOT',
          message: 'Selected term slot was not found.',
        });
      }
      const pl = await this.requireProgrammeLevel(ctx, slot.programmeLevelId);
      programmeLevelId = slot.programmeLevelId;
      departmentId = pl.departmentId;
      semesterSequence = slot.sequenceInYear;
    } else {
      const link = await this.resolveProgrammeLinkage(ctx, input);
      programmeLevelId = link.programmeLevelId;
      departmentId = link.departmentId;
      if (!programmeLevelId || !departmentId) {
        throw new BadRequestException({
          code: 'INVALID_PROGRAMME_LEVEL',
          message: 'Select a programme and a year.',
        });
      }
      const slot = await this.repo.findProgrammeTermSlotBySequence(programmeLevelId, input.semesterSequence);
      slotId = slot?.id ?? null;
    }

    if (!programmeLevelId || !departmentId) {
      throw new BadRequestException({
        code: 'INVALID_PROGRAMME_LEVEL',
        message: 'Select a programme and a year.',
      });
    }

    const clash = await this.repo.findProgrammeSubjectSlot(
      ctx.principal.institutionId,
      programmeLevelId,
      semesterSequence,
      input.subjectId,
    );
    if (clash) {
      throw new ConflictException({
        code: 'DUPLICATE_CURRICULUM_ENTRY',
        message: 'That subject is already in this semester of the programme year.',
      });
    }

    const campusId = null;
    const row = await this.repo.insertProgrammeSubject({
      institutionId: ctx.principal.institutionId,
      campusId,
      departmentId,
      programmeLevelId,
      semesterSequence,
      slotId,
      subjectId: input.subjectId,
      credits: input.credits ?? null,
      isElective: input.isElective,
      sequence: input.sequence,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'programme_subject.create', 'programme_subject', row.id, campusId, {
      newState: {
        subjectId: row.subjectId,
        programmeLevelId: row.programmeLevelId,
        semesterSequence: row.semesterSequence,
      },
    });
    return row;
  }

  async updateProgrammeSubject(
    ctx: PortalActionContext,
    id: string,
    input: UpdateProgrammeSubjectInput,
  ) {
    const existing = await this.repo.findProgrammeSubject(id, ctx.principal.institutionId);
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    }
    if (input.subjectId) await this.assertRef(ctx, 'subjects', input.subjectId, 'subject');

    // Only re-resolve the programme link when the caller actually sent one; otherwise keep it.
    const sendsLink = !!(input.programmeLevelId || input.departmentId || input.gradeLevelId);
    const link = sendsLink
      ? await this.resolveProgrammeLinkage(ctx, input)
      : { programmeLevelId: existing!.programmeLevelId, departmentId: existing!.departmentId };

    const programmeLevelId = link.programmeLevelId ?? existing!.programmeLevelId;
    const departmentId = link.departmentId ?? existing!.departmentId;
    const semesterSequence = input.semesterSequence ?? existing!.semesterSequence;
    const subjectId = input.subjectId ?? existing!.subjectId;

    const slotMoved =
      programmeLevelId !== existing!.programmeLevelId ||
      semesterSequence !== existing!.semesterSequence ||
      subjectId !== existing!.subjectId;
    if (slotMoved) {
      const clash = await this.repo.findProgrammeSubjectSlot(
        ctx.principal.institutionId,
        programmeLevelId,
        semesterSequence,
        subjectId,
      );
      if (clash && clash.id !== id) {
        throw new ConflictException({
          code: 'DUPLICATE_CURRICULUM_ENTRY',
          message: 'That subject is already in this semester of the programme year.',
        });
      }
    }

    const updated = await this.repo.updateProgrammeSubject(id, input.version, {
      departmentId,
      programmeLevelId,
      semesterSequence,
      subjectId,
      credits: input.credits === undefined ? existing!.credits : input.credits,
      isElective: input.isElective ?? existing!.isElective,
      sequence: input.sequence ?? existing!.sequence,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'programme_subject.update', 'programme_subject', id, updated.campusId, {
      previousState: {
        semesterSequence: existing!.semesterSequence,
        subjectId: existing!.subjectId,
      },
      newState: { semesterSequence: updated.semesterSequence, subjectId: updated.subjectId },
    });
    return updated;
  }

  async deleteProgrammeSubject(ctx: PortalActionContext, id: string, version: number) {
    const existing = await this.repo.findProgrammeSubject(id, ctx.principal.institutionId);
    if (!existing) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    }
    const ok = await this.guardDelete(() => this.repo.deleteProgrammeSubject(id, version));
    await this.write(ctx, 'programme_subject.delete', 'programme_subject', id, existing!.campusId, {
      previousState: {
        subjectId: existing!.subjectId,
        semesterSequence: existing!.semesterSequence,
      },
    });
    return ok;
  }

  // === classes / sections ====================================================

  async listClasses(ctx: PortalActionContext, q: AcademicsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listClasses(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async listClassRoster(ctx: PortalActionContext, classId: string) {
    await this.requireClassInScope(ctx, classId);
    return this.repo.listClassRoster(classId, ctx.principal.institutionId);
  }

  async getCurrentAcademicYear(ctx: PortalActionContext) {
    const f = this.filter(ctx);
    return (await this.repo.findCurrentAcademicYear(ctx.principal.institutionId, f.campusIds)) ?? null;
  }

  async getCurrentTerm(ctx: PortalActionContext) {
    const f = this.filter(ctx);
    return (await this.repo.findCurrentAcademicTerm(ctx.principal.institutionId, f.campusIds)) ?? null;
  }

  async createClass(ctx: PortalActionContext, input: CreateClassInput) {
    await this.assertRef(ctx, 'academicYears', input.academicYearId, 'academic year');
    await this.assertRef(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    let programmeLevelId = input.programmeLevelId ?? null;
    let termId = input.termId ?? null;
    if (programmeLevelId) {
      const pl = await this.requireProgrammeLevel(ctx, programmeLevelId);
      if (input.gradeLevelId !== pl.gradeLevelId) {
        throw new BadRequestException({
          code: 'INVALID_PROGRAMME_LEVEL',
          message: 'The selected year does not match the programme level.',
        });
      }
    }
    if (termId) {
      await this.assertRef(ctx, 'academicTerms', termId, 'term');
      if (programmeLevelId) {
        const term = await this.repo.findAcademicTerm(termId, ctx.principal.institutionId);
        if (term?.programmeLevelId && term.programmeLevelId !== programmeLevelId) {
          throw new BadRequestException({
            code: 'INVALID_PROGRAMME_LEVEL',
            message: 'The selected semester does not belong to this programme year.',
          });
        }
      }
    }
    await this.assertUser(ctx, input.classTeacherId);
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertClass({
      institutionId: ctx.principal.institutionId,
      campusId,
      academicYearId: input.academicYearId,
      gradeLevelId: input.gradeLevelId,
      programmeLevelId,
      termId,
      name: input.name,
      section: input.section ?? null,
      classTeacherId: input.classTeacherId ?? null,
      room: input.room ?? null,
      capacity: input.capacity ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    if (row.classTeacherId) {
      await this.ensureStaffYearAssignment(ctx, row.classTeacherId, row.academicYearId, row.termId, row.campusId);
    }
    await this.write(ctx, 'class.create', 'class', row.id, campusId, { newState: { name: row.name } });
    return row;
  }

  async updateClass(ctx: PortalActionContext, id: string, input: UpdateClassInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findClass(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    if (input.academicYearId) await this.assertRef(ctx, 'academicYears', input.academicYearId, 'academic year');
    if (input.gradeLevelId) await this.assertRef(ctx, 'gradeLevels', input.gradeLevelId, 'grade level');
    const programmeLevelId =
      input.programmeLevelId !== undefined ? input.programmeLevelId : existing!.programmeLevelId;
    const termId = input.termId !== undefined ? input.termId : existing!.termId;
    if (programmeLevelId) {
      const pl = await this.requireProgrammeLevel(ctx, programmeLevelId);
      const gradeId = input.gradeLevelId ?? existing!.gradeLevelId;
      if (gradeId !== pl.gradeLevelId) {
        throw new BadRequestException({
          code: 'INVALID_PROGRAMME_LEVEL',
          message: 'The selected year does not match the programme level.',
        });
      }
    }
    if (termId) {
      await this.assertRef(ctx, 'academicTerms', termId, 'term');
      if (programmeLevelId) {
        const term = await this.repo.findAcademicTerm(termId, ctx.principal.institutionId);
        if (term?.programmeLevelId && term.programmeLevelId !== programmeLevelId) {
          throw new BadRequestException({
            code: 'INVALID_PROGRAMME_LEVEL',
            message: 'The selected semester does not belong to this programme year.',
          });
        }
      }
    }
    await this.assertUser(ctx, input.classTeacherId);
    const updated = await this.repo.updateClass(id, input.version, {
      academicYearId: input.academicYearId ?? existing!.academicYearId,
      gradeLevelId: input.gradeLevelId ?? existing!.gradeLevelId,
      programmeLevelId,
      termId,
      name: input.name ?? existing!.name,
      section: input.section === undefined ? existing!.section : input.section,
      classTeacherId: input.classTeacherId === undefined ? existing!.classTeacherId : input.classTeacherId,
      room: input.room === undefined ? existing!.room : input.room,
      capacity: input.capacity === undefined ? existing!.capacity : input.capacity,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    if (updated.classTeacherId && updated.classTeacherId !== existing!.classTeacherId) {
      await this.ensureStaffYearAssignment(
        ctx,
        updated.classTeacherId,
        updated.academicYearId,
        updated.termId,
        updated.campusId,
      );
    }
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
      if (input.teacherId) {
        await this.ensureStaffYearAssignment(ctx, input.teacherId, cls.academicYearId, cls.termId, cls.campusId);
      }
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
    if (input.teacherId) {
      await this.ensureStaffYearAssignment(ctx, input.teacherId, cls.academicYearId, cls.termId, cls.campusId);
    }
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

  /** The curriculum this class inherits from its programme year + semester, with an assigned flag. */
  async listClassCurriculum(ctx: PortalActionContext, classId: string) {
    const cls = await this.requireClassInScope(ctx, classId);
    return this.repo.listClassCurriculum(cls);
  }

  /**
   * Seed the class's subjects from its curriculum. Existing assignments keep their teacher — only
   * missing subjects are added — so this is safe to press twice.
   */
  async applyCurriculum(ctx: PortalActionContext, classId: string, input: ApplyCurriculumInput) {
    const cls = await this.requireClassInScope(ctx, classId);
    if (!cls.programmeLevelId) {
      throw new BadRequestException({
        code: 'CLASS_NOT_PLACED',
        message: 'Assign this class to a programme year before applying a curriculum.',
      });
    }

    const curriculum = await this.repo.listClassCurriculum(cls);
    const wanted = input.programmeSubjectIds?.length
      ? curriculum.filter((c) => input.programmeSubjectIds!.includes(c.id))
      : curriculum;
    const missing = wanted.filter((c) => !c.assigned);

    if (missing.length === 0) return { added: 0, subjects: [] as string[] };

    const inserted = await this.repo.insertClassSubjects(
      missing.map((c) => ({
        institutionId: ctx.principal.institutionId,
        classId,
        subjectId: c.subjectId,
        teacherId: null,
        createdBy: ctx.principal.institutionUserId,
      })),
    );

    await this.write(ctx, 'class_subject.apply_curriculum', 'class', classId, cls.campusId, {
      newState: { added: inserted.length, subjectIds: missing.map((c) => c.subjectId) },
    });
    return { added: inserted.length, subjects: missing.map((c) => c.subjectId) };
  }

  // --- class roster ----------------------------------------------------------

  async listRosterCandidates(ctx: PortalActionContext, classId: string, q: RosterCandidateQuery) {
    await this.requireClassInScope(ctx, classId);
    const f = this.filter(ctx);
    return this.repo.listRosterCandidates(ctx.principal.institutionId, f.campusIds, classId, q);
  }

  /** Bulk add/remove students on a class in one write. */
  async updateClassRoster(ctx: PortalActionContext, classId: string, input: UpdateClassRosterInput) {
    const cls = await this.requireClassInScope(ctx, classId);

    // Reject the whole batch if any id is foreign — a partial roster move is worse than none.
    const ids = [...new Set([...input.add, ...input.remove])];
    const found = await this.repo.countStudentsInInstitution(ctx.principal.institutionId, ids);
    if (found !== ids.length) {
      throw new BadRequestException({
        code: 'INVALID_REFERENCE',
        message: 'One or more students do not belong to this institution.',
      });
    }

    if (cls.capacity != null && input.add.length > 0) {
      const roster = await this.repo.listClassRoster(classId, ctx.principal.institutionId);
      const staying = roster.filter((s) => !input.remove.includes(s.id)).length;
      const joining = input.add.filter((id) => !roster.some((s) => s.id === id)).length;
      if (staying + joining > cls.capacity) {
        throw new BadRequestException({
          code: 'CLASS_OVER_CAPACITY',
          message: `This class holds ${cls.capacity}; that would make ${staying + joining}.`,
        });
      }
    }

    const result = await this.repo.updateClassRoster(
      ctx.principal.institutionId,
      classId,
      input.add,
      input.remove,
      ctx.principal.institutionUserId,
    );
    await this.write(ctx, 'class.roster_update', 'class', classId, cls.campusId, {
      newState: { added: result.added, removed: result.removed },
    });
    return result;
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  /** Upsert a staff_assignments row for the class's year/term (ON CONFLICT DO NOTHING). */
  private async ensureStaffYearAssignment(
    ctx: PortalActionContext,
    staffId: string,
    academicYearId: string,
    termId: string | null,
    campusId: string | null,
  ): Promise<void> {
    await insertStaffAssignment(this.db, {
      institutionId: ctx.principal.institutionId,
      campusId,
      staffId,
      academicYearId,
      termId,
      status: 'active',
      createdBy: ctx.principal.institutionUserId,
    });
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
    table: 'academicYears' | 'academicTerms' | 'gradeLevels' | 'departments' | 'subjects',
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

  private async requireProgrammeLevel(ctx: PortalActionContext, programmeLevelId: string) {
    const row = await this.repo.findDepartmentGradeLevel(programmeLevelId, ctx.principal.institutionId);
    if (!row) {
      throw new BadRequestException({
        code: 'INVALID_PROGRAMME_LEVEL',
        message: 'Unknown programme year link.',
      });
    }
    const f = this.filter(ctx);
    this.assertInScope(row.campusId, row, f);
    return row;
  }

  private async resolveProgrammeLinkage(
    ctx: PortalActionContext,
    input: {
      programmeLevelId?: string | null;
      departmentId?: string | null;
      gradeLevelId?: string | null;
    },
  ): Promise<{
    programmeLevelId: string | null;
    departmentId: string | null;
    gradeLevelId: string | null;
  }> {
    let programmeLevelId = input.programmeLevelId ?? null;
    let departmentId = input.departmentId ?? null;
    let gradeLevelId = input.gradeLevelId ?? null;

    if (programmeLevelId) {
      const pl = await this.requireProgrammeLevel(ctx, programmeLevelId);
      departmentId = pl.departmentId;
      gradeLevelId = pl.gradeLevelId;
      return { programmeLevelId, departmentId, gradeLevelId };
    }

    if (departmentId && gradeLevelId) {
      await this.assertRef(ctx, 'departments', departmentId, 'department');
      await this.assertRef(ctx, 'gradeLevels', gradeLevelId, 'grade level');
      const pl = await this.repo.findDepartmentGradeLevelByPair(
        ctx.principal.institutionId,
        departmentId,
        gradeLevelId,
      );
      if (!pl) {
        throw new BadRequestException({
          code: 'INVALID_PROGRAMME_LEVEL',
          message: 'That year is not linked to the programme.',
        });
      }
      return { programmeLevelId: pl.id, departmentId, gradeLevelId };
    }

    if (departmentId || gradeLevelId) {
      throw new BadRequestException({
        code: 'INVALID_PROGRAMME_LEVEL',
        message: 'Provide both programme and year, or a programme level id.',
      });
    }

    return { programmeLevelId: null, departmentId: null, gradeLevelId: null };
  }

  /** Validate a staff FK (class teacher / department head / subject teacher) lives in the institution. */
  private async assertUser(ctx: PortalActionContext, teacherId: string | null | undefined): Promise<void> {
    if (!teacherId) return;
    const ok = await this.repo.existsInInstitution('staff', teacherId, ctx.principal.institutionId);
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
