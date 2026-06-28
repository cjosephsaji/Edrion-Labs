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
  AssignmentsListQuery,
  CreateAssignmentInput,
  GradeSubmissionsInput,
  UpdateAssignmentInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { AssignmentsRepository, type AssignmentRefTable } from './assignments.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-assignments';

/**
 * Institution-portal Assignments service (Phase 6). An assignment is campus-scoped and version-guarded
 * like every other portal resource; the per-student submissions inherit the assignment's campus and
 * are only reachable through an assignment the caller can see (requireAssignmentInScope). Bulk grading
 * upserts on (assignment, student). All mutations are audited.
 */
@Injectable()
export class AssignmentsService {
  constructor(
    private readonly repo: AssignmentsRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === assignments ===========================================================

  async list(ctx: PortalActionContext, q: AssignmentsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.list(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async create(ctx: PortalActionContext, input: CreateAssignmentInput) {
    await this.assertRef(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'teachers', input.teacherId, 'teacher');
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insert({
      institutionId: ctx.principal.institutionId,
      campusId,
      title: input.title,
      classId: input.classId,
      subjectId: input.subjectId ?? null,
      teacherId: input.teacherId ?? null,
      instructions: input.instructions ?? null,
      dueDate: input.dueDate ?? null,
      maxPoints: input.maxPoints,
      status: input.status,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'assignment.create', 'assignment', row.id, campusId, {
      newState: { title: row.title, classId: row.classId, status: row.status },
    });
    return row;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateAssignmentInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'teachers', input.teacherId, 'teacher');
    const updated = await this.repo.update(id, input.version, {
      title: input.title ?? existing!.title,
      classId: input.classId ?? existing!.classId,
      subjectId: input.subjectId === undefined ? existing!.subjectId : input.subjectId,
      teacherId: input.teacherId === undefined ? existing!.teacherId : input.teacherId,
      instructions: input.instructions === undefined ? existing!.instructions : input.instructions,
      dueDate: input.dueDate === undefined ? existing!.dueDate : input.dueDate,
      maxPoints: input.maxPoints ?? existing!.maxPoints,
      status: input.status ?? existing!.status,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'assignment.update', 'assignment', id, updated.campusId, {
      newState: { title: updated.title, status: updated.status },
    });
    return updated;
  }

  async delete(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.delete(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'assignment.delete', 'assignment', id, existing!.campusId, {
      previousState: { title: existing!.title, classId: existing!.classId },
    });
    return { deleted: true };
  }

  // === submissions ===========================================================

  async listSubmissions(ctx: PortalActionContext, assignmentId: string) {
    await this.requireAssignmentInScope(ctx, assignmentId);
    return this.repo.listSubmissions(assignmentId);
  }

  /** Bulk upsert submissions. Each entry's student is pre-checked for a friendly 400; points are capped. */
  async grade(ctx: PortalActionContext, assignmentId: string, input: GradeSubmissionsInput) {
    const assignment = await this.requireAssignmentInScope(ctx, assignmentId);
    const seen = new Set<string>();
    for (const sub of input.submissions) {
      if (!seen.has(sub.studentId)) {
        await this.assertRef(ctx, 'students', sub.studentId, 'student');
        seen.add(sub.studentId);
      }
      if (sub.pointsAwarded != null && sub.pointsAwarded > assignment.maxPoints) {
        throw new BadRequestException({
          code: 'INVALID_POINTS',
          message: `Points awarded cannot exceed the maximum (${assignment.maxPoints}).`,
        });
      }
      await this.repo.upsertSubmission({
        institutionId: ctx.principal.institutionId,
        assignmentId,
        studentId: sub.studentId,
        status: sub.status,
        submittedDate: sub.submittedDate ?? null,
        pointsAwarded: sub.pointsAwarded ?? null,
        feedback: sub.feedback ?? null,
        createdBy: ctx.principal.institutionUserId,
      });
    }
    await this.write(ctx, 'assignment.grade', 'assignment', assignmentId, assignment.campusId, {
      newState: { submissions: input.submissions.length },
    });
    return this.repo.listSubmissions(assignmentId);
  }

  async removeSubmission(ctx: PortalActionContext, assignmentId: string, submissionId: string) {
    const assignment = await this.requireAssignmentInScope(ctx, assignmentId);
    const sub = await this.repo.findSubmission(submissionId, assignmentId);
    if (!sub) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Submission not found' });
    const ok = await this.repo.deleteSubmission(submissionId);
    await this.write(ctx, 'assignment.submission.remove', 'assignment_submission', submissionId, assignment.campusId, {
      previousState: { studentId: sub.studentId, status: sub.status },
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

  private async requireAssignmentInScope(ctx: PortalActionContext, assignmentId: string) {
    const f = this.filter(ctx);
    const assignment = await this.repo.find(assignmentId, ctx.principal.institutionId);
    this.assertInScope(assignment?.campusId ?? null, assignment, f);
    return assignment;
  }

  private async assertRef(ctx: PortalActionContext, table: AssignmentRefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private async assertOptional(
    ctx: PortalActionContext,
    table: AssignmentRefTable,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) return;
    await this.assertRef(ctx, table, id, label);
  }

  private paginate<T>(page: Page<T>, q: AssignmentsListQuery): ListResult<T> {
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
