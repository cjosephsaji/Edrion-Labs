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
  CreateGradeEntryInput,
  GradebookListQuery,
  UpdateGradeEntryInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { GradebookRepository, type GradeRefTable } from './gradebook.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-gradebook';

/**
 * Institution-portal Gradebook service (Phase 6). A flat marks table: campus-scoped, version-guarded,
 * FK-pre-checked and audited like the rest of the portal. A grade is unique per (student, subject,
 * exam) when an exam is set — a duplicate is a friendly 409 (ad-hoc assessments with no exam are
 * never blocked). `gradebook.manage` is sensitive.
 */
@Injectable()
export class GradebookService {
  constructor(
    private readonly repo: GradebookRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: GradebookListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.list(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async create(ctx: PortalActionContext, input: CreateGradeEntryInput) {
    await this.assertRef(ctx, 'students', input.studentId, 'student');
    await this.assertRef(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'exams', input.examId, 'exam');
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    this.assertMarks(input.marksObtained, input.maxMarks);
    if (input.examId) {
      const dupe = await this.repo.findByKey(ctx.principal.institutionId, input.studentId, input.subjectId, input.examId);
      if (dupe) {
        throw new ConflictException({
          code: 'GRADE_EXISTS',
          message: 'A grade already exists for this student, subject and exam.',
        });
      }
    }
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insert({
      institutionId: ctx.principal.institutionId,
      campusId,
      studentId: input.studentId,
      subjectId: input.subjectId,
      examId: input.examId ?? null,
      classId: input.classId ?? null,
      assessmentName: input.assessmentName,
      marksObtained: input.marksObtained,
      maxMarks: input.maxMarks,
      letterGrade: input.letterGrade ?? null,
      remarks: input.remarks ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'grade.create', 'grade_entry', row.id, campusId, {
      newState: { studentId: row.studentId, subjectId: row.subjectId, marks: `${row.marksObtained}/${row.maxMarks}` },
    });
    return row;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateGradeEntryInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'students', input.studentId, 'student');
    await this.assertOptional(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'exams', input.examId, 'exam');
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    const marksObtained = input.marksObtained ?? existing!.marksObtained;
    const maxMarks = input.maxMarks ?? existing!.maxMarks;
    this.assertMarks(marksObtained, maxMarks);
    const updated = await this.repo.update(id, input.version, {
      studentId: input.studentId ?? existing!.studentId,
      subjectId: input.subjectId ?? existing!.subjectId,
      examId: input.examId === undefined ? existing!.examId : input.examId,
      classId: input.classId === undefined ? existing!.classId : input.classId,
      assessmentName: input.assessmentName ?? existing!.assessmentName,
      marksObtained,
      maxMarks,
      letterGrade: input.letterGrade === undefined ? existing!.letterGrade : input.letterGrade,
      remarks: input.remarks === undefined ? existing!.remarks : input.remarks,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'grade.update', 'grade_entry', id, updated.campusId, {
      newState: { marks: `${updated.marksObtained}/${updated.maxMarks}`, letterGrade: updated.letterGrade },
    });
    return updated;
  }

  async delete(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.delete(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'grade.delete', 'grade_entry', id, existing!.campusId, {
      previousState: { studentId: existing!.studentId, assessmentName: existing!.assessmentName },
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

  /** Marks awarded can never exceed the maximum — a friendly 400, never a silent bad row. */
  private assertMarks(obtained: number, max: number): void {
    if (obtained > max) {
      throw new BadRequestException({
        code: 'INVALID_MARKS',
        message: 'Marks obtained cannot exceed the maximum marks.',
      });
    }
  }

  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private async assertRef(ctx: PortalActionContext, table: GradeRefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private async assertOptional(
    ctx: PortalActionContext,
    table: GradeRefTable,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) return;
    await this.assertRef(ctx, table, id, label);
  }

  private paginate<T>(page: Page<T>, q: GradebookListQuery): ListResult<T> {
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
