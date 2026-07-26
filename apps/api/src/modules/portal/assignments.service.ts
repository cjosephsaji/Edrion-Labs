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
  AssignmentAudiencePreviewInput,
  AssignmentQuestionInput,
  AssignmentsListQuery,
  CreateAssignmentInput,
  GradeAnswerInput,
  GradeSubmissionsInput,
  ReconcileAssignmentInput,
  UpdateAssignmentInput,
  UpdateAssignmentQuestionInput,
} from '@edrion/schemas';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { Database } from '@edrion/database';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { resolveAcademicScope } from './academic-scope-stamp';
import { AssignmentsRepository, type AssignmentRefTable } from './assignments.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';
import { PortalAudienceService } from './portal-audience.service';

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
    private readonly audience: PortalAudienceService,
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === assignments ===========================================================

  async list(ctx: PortalActionContext, q: AssignmentsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.list(ctx.principal.institutionId, f.campusIds, q), q);
  }

  /** Assignment + questions for the builder. */
  async getFull(ctx: PortalActionContext, id: string) {
    const assignment = await this.requireAssignmentInScope(ctx, id);
    const questions = await this.repo.listQuestions(id);
    return { ...assignment, questions };
  }

  async create(ctx: PortalActionContext, input: CreateAssignmentInput) {
    await this.assertRef(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'staff', input.teacherId, 'teacher');
    const campusId = this.createCampusId(ctx.scope);
    const audience = input.audience?.length ? input.audience : [{ kind: 'class' as const, refId: input.classId }];
    const actorId = ctx.principal.institutionUserId;
    const f = this.filter(ctx);
    const scope = await resolveAcademicScope(this.db, {
      institutionId: ctx.principal.institutionId,
      campusIds: f.campusIds,
      classId: input.classId,
    });
    const questions = input.questions ?? [];
    const assignmentValues = {
      institutionId: ctx.principal.institutionId,
      campusId,
      title: input.title,
      classId: input.classId,
      academicYearId: scope.academicYearId,
      termId: scope.termId,
      subjectId: input.subjectId ?? null,
      teacherId: input.teacherId ?? null,
      instructions: input.instructions ?? null,
      dueDate: input.dueDate ?? null,
      maxPoints: input.maxPoints,
      status: input.status,
      audience,
      durationMin: input.durationMin ?? null,
      deliveryMode: input.deliveryMode,
      createdBy: actorId,
    };
    const row =
      questions.length > 0
        ? await this.repo.insertFull(
            assignmentValues,
            questions.map((q) => ({
              sequence: q.sequence,
              qtype: q.qtype,
              prompt: q.prompt,
              promptImageObjectId: q.promptImageObjectId ?? null,
              options: q.options ?? null,
              correctKey: q.correctKey ?? null,
              markingNote: q.markingNote ?? null,
              marks: q.marks,
              config: (q.config as Record<string, unknown> | null | undefined) ?? null,
              createdBy: actorId,
            })),
          )
        : await this.repo.insert(assignmentValues);
    await this.audience.materializeAssignmentAssignees(ctx, row.id, audience);
    await this.write(ctx, 'assignment.create', 'assignment', row.id, campusId, {
      newState: { title: row.title, classId: row.classId, status: row.status, questionCount: questions.length },
    });
    return row;
  }

  async reconcile(ctx: PortalActionContext, id: string, input: ReconcileAssignmentInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'staff', input.teacherId, 'teacher');
    const actorId = ctx.principal.institutionUserId;
    let updated;
    try {
      updated = await this.repo.reconcileFull({
        assignmentId: id,
        version: input.version,
        patch: {
          title: input.title ?? existing!.title,
          classId: input.classId ?? existing!.classId,
          subjectId: input.subjectId === undefined ? existing!.subjectId : input.subjectId,
          teacherId: input.teacherId === undefined ? existing!.teacherId : input.teacherId,
          instructions: input.instructions === undefined ? existing!.instructions : input.instructions,
          dueDate: input.dueDate === undefined ? existing!.dueDate : input.dueDate,
          maxPoints: input.maxPoints ?? existing!.maxPoints,
          status: input.status ?? existing!.status,
          audience: input.audience === undefined ? existing!.audience : input.audience,
          durationMin: input.durationMin === undefined ? existing!.durationMin : input.durationMin,
          deliveryMode: input.deliveryMode ?? existing!.deliveryMode,
          updatedBy: actorId,
        },
        questions: (input.questions ?? []).map((q) => ({
          id: q.id,
          version: q.version,
          sequence: q.sequence,
          qtype: q.qtype,
          prompt: q.prompt,
          promptImageObjectId: q.promptImageObjectId ?? null,
          options: q.options ?? null,
          correctKey: q.correctKey ?? null,
          markingNote: q.markingNote ?? null,
          marks: q.marks,
          config: (q.config as Record<string, unknown> | null | undefined) ?? null,
          actorId,
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('VERSION_CONFLICT') || msg.includes('NOT_FOUND')) {
        throw this.versionConflict();
      }
      throw err;
    }
    if (!updated) throw this.versionConflict();
    if (input.audience !== undefined) {
      await this.audience.materializeAssignmentAssignees(ctx, id, input.audience);
    }
    await this.write(ctx, 'assignment.reconcile', 'assignment', id, updated.campusId, {
      newState: { title: updated.title, status: updated.status, questionCount: input.questions?.length ?? 0 },
    });
    return updated;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateAssignmentInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'classes', input.classId, 'class');
    await this.assertOptional(ctx, 'subjects', input.subjectId, 'subject');
    await this.assertOptional(ctx, 'staff', input.teacherId, 'teacher');
    const updated = await this.repo.update(id, input.version, {
      title: input.title ?? existing!.title,
      classId: input.classId ?? existing!.classId,
      subjectId: input.subjectId === undefined ? existing!.subjectId : input.subjectId,
      teacherId: input.teacherId === undefined ? existing!.teacherId : input.teacherId,
      instructions: input.instructions === undefined ? existing!.instructions : input.instructions,
      dueDate: input.dueDate === undefined ? existing!.dueDate : input.dueDate,
      maxPoints: input.maxPoints ?? existing!.maxPoints,
      status: input.status ?? existing!.status,
      audience: input.audience === undefined ? existing!.audience : input.audience,
      durationMin: input.durationMin === undefined ? existing!.durationMin : input.durationMin,
      deliveryMode: input.deliveryMode ?? existing!.deliveryMode,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    if (input.audience !== undefined) {
      await this.audience.materializeAssignmentAssignees(ctx, id, input.audience);
    }
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

  // === audience preview ======================================================

  previewAudience(ctx: PortalActionContext, input: AssignmentAudiencePreviewInput) {
    return this.audience.previewStudents(ctx, input.targets);
  }

  // === questions ==============================================================

  async listQuestions(ctx: PortalActionContext, assignmentId: string) {
    await this.requireAssignmentInScope(ctx, assignmentId);
    return this.repo.listQuestions(assignmentId);
  }

  async createQuestion(ctx: PortalActionContext, assignmentId: string, input: AssignmentQuestionInput) {
    const assignment = await this.requireAssignmentInScope(ctx, assignmentId);
    const row = await this.repo.insertQuestion({
      assignmentId,
      sequence: input.sequence,
      qtype: input.qtype,
      prompt: input.prompt,
      promptImageObjectId: input.promptImageObjectId ?? null,
      options: input.options ?? null,
      correctKey: input.correctKey ?? null,
      markingNote: input.markingNote ?? null,
      marks: input.marks,
      config: (input.config as Record<string, unknown> | null | undefined) ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'assignment.question.create', 'assignment_question', row.id, assignment.campusId, {
      newState: { assignmentId, sequence: row.sequence },
    });
    return row;
  }

  async updateQuestion(
    ctx: PortalActionContext,
    assignmentId: string,
    questionId: string,
    input: UpdateAssignmentQuestionInput,
  ) {
    const assignment = await this.requireAssignmentInScope(ctx, assignmentId);
    const existing = await this.repo.findQuestion(questionId, assignmentId);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not found' });
    const updated = await this.repo.updateQuestion(questionId, input.version, {
      sequence: input.sequence ?? existing.sequence,
      qtype: input.qtype ?? existing.qtype,
      prompt: input.prompt ?? existing.prompt,
      promptImageObjectId: input.promptImageObjectId === undefined ? existing.promptImageObjectId : input.promptImageObjectId,
      options: input.options === undefined ? existing.options : input.options,
      correctKey: input.correctKey === undefined ? existing.correctKey : input.correctKey,
      markingNote: input.markingNote === undefined ? existing.markingNote : input.markingNote,
      marks: input.marks ?? existing.marks,
      config:
        input.config === undefined
          ? existing.config
          : ((input.config as Record<string, unknown> | null | undefined) ?? null),
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'assignment.question.update', 'assignment_question', questionId, assignment.campusId, {
      newState: { sequence: updated.sequence },
    });
    return updated;
  }

  async deleteQuestion(ctx: PortalActionContext, assignmentId: string, questionId: string, version: number) {
    const assignment = await this.requireAssignmentInScope(ctx, assignmentId);
    const existing = await this.repo.findQuestion(questionId, assignmentId);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Question not found' });
    const ok = await this.repo.deleteQuestion(questionId, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'assignment.question.delete', 'assignment_question', questionId, assignment.campusId, {
      previousState: { sequence: existing.sequence },
    });
    return { deleted: true };
  }

  // === quiz attempts (grading) ==============================================

  async listAttempts(ctx: PortalActionContext, assignmentId: string) {
    await this.requireAssignmentInScope(ctx, assignmentId);
    return this.repo.listAttempts(assignmentId);
  }

  async getAttemptDetail(ctx: PortalActionContext, assignmentId: string, attemptId: string) {
    await this.requireAssignmentInScope(ctx, assignmentId);
    return this.repo.listAttemptAnswers(attemptId);
  }

  async gradeAnswer(
    ctx: PortalActionContext,
    assignmentId: string,
    _attemptId: string,
    answerId: string,
    input: GradeAnswerInput,
  ) {
    const assignment = await this.requireAssignmentInScope(ctx, assignmentId);
    const updated = await this.repo.updateAnswerGrade(answerId, {
      teacherMarks: input.teacherMarks ?? null,
      teacherFeedback: input.teacherFeedback ?? null,
    });
    if (!updated) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Answer not found' });
    await this.write(ctx, 'assignment.answer.grade', 'assignment_answer', answerId, assignment.campusId, {
      newState: { teacherMarks: updated.teacherMarks },
    });
    return updated;
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
