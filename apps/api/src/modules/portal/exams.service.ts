import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  resolveScopeFilter,
  type InstitutionScope,
  type ScopeFilter,
} from "@edrion/auth";
import type { AuditWriter, AuditEventInput } from "@edrion/audit";
import type {
  CreateExamInput,
  CreateExamScheduleInput,
  ExamAudiencePreviewInput,
  ExamQuestionInput,
  ExamsListQuery,
  GradeAnswerInput,
  ReconcileExamInput,
  UpdateExamInput,
  UpdateExamQuestionInput,
  UpdateExamScheduleInput,
} from "@edrion/schemas";
import { AUDIT_WRITER } from "../../common/tokens";
import type { Page } from "./academics.repository";
import type { ListResult } from "./academics.service";
import { ExamsRepository, type ExamRefTable } from "./exams.repository";
import {
  basePortalAudit,
  type PortalActionContext,
} from "./portal-action-context";
import { PortalAudienceService } from "./portal-audience.service";
import { PetrosLearningSourceIngestionService } from "../petros-learner-model/petros-learning-source-ingestion.service";

const MODULE = "portal-exams";

/**
 * Institution-portal Exams service (Phase 6). An exam is campus-scoped and version-guarded like
 * every other portal resource; the scheduled papers inherit the exam's campus and are only reachable
 * through an exam the caller can see (requireExamInScope). FKs are pre-checked for friendly 400s and
 * every mutation is audited. One paper per (exam, class, subject) — a duplicate is a friendly 409.
 */
@Injectable()
export class ExamsService {
  constructor(
    private readonly repo: ExamsRepository,
    private readonly audience: PortalAudienceService,
    private readonly learnerEvidence: PetrosLearningSourceIngestionService,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === exams =================================================================

  async list(ctx: PortalActionContext, q: ExamsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(
      await this.repo.list(ctx.principal.institutionId, f.campusIds, q),
      q,
    );
  }

  /** Exam + schedules + questions for the builder. */
  async getFull(ctx: PortalActionContext, id: string) {
    const exam = await this.requireExamInScope(ctx, id);
    const schedules = await this.repo.listSchedules(id);
    const withQuestions = await Promise.all(
      schedules.map(async (s) => ({
        ...s,
        questions: await this.repo.listQuestions(s.id),
      })),
    );
    return { ...exam, schedules: withQuestions };
  }

  async create(ctx: PortalActionContext, input: CreateExamInput) {
    await this.assertOptional(
      ctx,
      "academicYears",
      input.academicYearId,
      "academic year",
    );
    await this.assertOptional(ctx, "academicTerms", input.termId, "term");
    const campusId = this.createCampusId(ctx.scope);
    const actorId = ctx.principal.institutionUserId;
    const schedules = input.schedules ?? [];

    for (const s of schedules) {
      await this.assertRef(ctx, "classes", s.classId, "class");
      await this.assertRef(ctx, "subjects", s.subjectId, "subject");
    }
    const keys = new Set<string>();
    for (const s of schedules) {
      const key = `${s.classId}:${s.subjectId}`;
      if (keys.has(key)) {
        throw new ConflictException({
          code: "SCHEDULE_EXISTS",
          message:
            "A paper already exists for this class and subject in this exam.",
        });
      }
      keys.add(key);
    }

    const publishPapers = input.status === "published";
    const examValues = {
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      examType: input.examType,
      academicYearId: input.academicYearId ?? null,
      termId: input.termId ?? null,
      termLabel: input.termLabel ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: input.status,
      description: input.description ?? null,
      audience: input.audience ?? [],
      durationMin: input.durationMin ?? null,
      createdBy: actorId,
    };

    const row =
      schedules.length > 0
        ? await this.repo.insertFull(
            examValues,
            schedules.map((s) => ({
              schedule: {
                institutionId: ctx.principal.institutionId,
                classId: s.classId,
                subjectId: s.subjectId,
                examDate: s.examDate ?? null,
                startTime: s.startTime ?? null,
                endTime: s.endTime ?? null,
                maxMarks: s.maxMarks,
                passMarks: s.passMarks ?? null,
                room: s.room ?? null,
                published: publishPapers,
                createdBy: actorId,
              },
              questions: (s.questions ?? []).map((q) => ({
                sequence: q.sequence,
                qtype: q.qtype,
                prompt: q.prompt,
                promptImageObjectId: q.promptImageObjectId ?? null,
                options: q.options ?? null,
                correctKey: q.correctKey ?? null,
                markingNote: q.markingNote ?? null,
                marks: q.marks,
                config:
                  (q.config as Record<string, unknown> | null | undefined) ??
                  null,
                createdBy: actorId,
              })),
            })),
          )
        : await this.repo.insert(examValues);

    if (input.audience?.length) {
      await this.audience.materializeExamAssignees(ctx, row.id, input.audience);
    }
    await this.write(ctx, "exam.create", "exam", row.id, campusId, {
      newState: {
        name: row.name,
        examType: row.examType,
        status: row.status,
        scheduleCount: schedules.length,
      },
    });
    return row;
  }

  /** Atomic update of exam + schedules + questions from the builder. */
  async reconcile(
    ctx: PortalActionContext,
    id: string,
    input: ReconcileExamInput,
  ) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(
      ctx,
      "academicYears",
      input.academicYearId,
      "academic year",
    );
    await this.assertOptional(ctx, "academicTerms", input.termId, "term");

    const keys = new Set<string>();
    for (const s of input.schedules) {
      await this.assertRef(ctx, "classes", s.classId, "class");
      await this.assertRef(ctx, "subjects", s.subjectId, "subject");
      const key = `${s.classId}:${s.subjectId}`;
      if (keys.has(key)) {
        throw new ConflictException({
          code: "SCHEDULE_EXISTS",
          message:
            "A paper already exists for this class and subject in this exam.",
        });
      }
      keys.add(key);
    }

    const actorId = ctx.principal.institutionUserId;
    const nextStatus = input.status ?? existing!.status;
    const publishPapers = nextStatus === "published";
    let updated;
    try {
      updated = await this.repo.reconcileFull({
        examId: id,
        examVersion: input.version,
        examPatch: {
          name: input.name ?? existing!.name,
          examType: input.examType ?? existing!.examType,
          academicYearId:
            input.academicYearId === undefined
              ? existing!.academicYearId
              : input.academicYearId,
          termId: input.termId === undefined ? existing!.termId : input.termId,
          termLabel:
            input.termLabel === undefined
              ? existing!.termLabel
              : input.termLabel,
          startDate:
            input.startDate === undefined
              ? existing!.startDate
              : input.startDate,
          endDate:
            input.endDate === undefined ? existing!.endDate : input.endDate,
          status: nextStatus,
          description:
            input.description === undefined
              ? existing!.description
              : input.description,
          audience:
            input.audience === undefined ? existing!.audience : input.audience,
          durationMin:
            input.durationMin === undefined
              ? existing!.durationMin
              : input.durationMin,
          updatedBy: actorId,
        },
        schedules: input.schedules.map((s) => ({
          id: s.id,
          version: s.version,
          classId: s.classId,
          subjectId: s.subjectId,
          examDate: s.examDate ?? null,
          startTime: s.startTime ?? null,
          endTime: s.endTime ?? null,
          maxMarks: s.maxMarks,
          passMarks: s.passMarks ?? null,
          room: s.room ?? null,
          published: publishPapers ? true : undefined,
          actorId,
          institutionId: ctx.principal.institutionId,
          questions: (s.questions ?? []).map((q) => ({
            id: q.id,
            version: undefined,
            sequence: q.sequence,
            qtype: q.qtype,
            prompt: q.prompt,
            promptImageObjectId: q.promptImageObjectId ?? null,
            options: q.options ?? null,
            correctKey: q.correctKey ?? null,
            markingNote: q.markingNote ?? null,
            marks: q.marks,
            config:
              (q.config as Record<string, unknown> | null | undefined) ?? null,
            actorId,
          })),
        })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("VERSION_CONFLICT") || msg.includes("NOT_FOUND")) {
        throw this.versionConflict();
      }
      throw err;
    }
    if (!updated) throw this.versionConflict();
    if (input.audience !== undefined) {
      await this.audience.materializeExamAssignees(ctx, id, input.audience);
    }
    await this.write(ctx, "exam.reconcile", "exam", id, updated.campusId, {
      newState: {
        name: updated.name,
        status: updated.status,
        scheduleCount: input.schedules.length,
      },
    });
    return updated;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdateExamInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(
      ctx,
      "academicYears",
      input.academicYearId,
      "academic year",
    );
    await this.assertOptional(ctx, "academicTerms", input.termId, "term");
    const updated = await this.repo.update(id, input.version, {
      name: input.name ?? existing!.name,
      examType: input.examType ?? existing!.examType,
      academicYearId:
        input.academicYearId === undefined
          ? existing!.academicYearId
          : input.academicYearId,
      termId: input.termId === undefined ? existing!.termId : input.termId,
      termLabel:
        input.termLabel === undefined ? existing!.termLabel : input.termLabel,
      startDate:
        input.startDate === undefined ? existing!.startDate : input.startDate,
      endDate: input.endDate === undefined ? existing!.endDate : input.endDate,
      status: input.status ?? existing!.status,
      description:
        input.description === undefined
          ? existing!.description
          : input.description,
      audience:
        input.audience === undefined ? existing!.audience : input.audience,
      durationMin:
        input.durationMin === undefined
          ? existing!.durationMin
          : input.durationMin,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    if (input.audience !== undefined) {
      await this.audience.materializeExamAssignees(ctx, id, input.audience);
    }
    await this.write(ctx, "exam.update", "exam", id, updated.campusId, {
      newState: { name: updated.name, status: updated.status },
    });
    return updated;
  }

  async delete(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.find(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.delete(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, "exam.delete", "exam", id, existing!.campusId, {
      previousState: { name: existing!.name, examType: existing!.examType },
    });
    return { deleted: true };
  }

  // === schedules (papers) ====================================================

  async listSchedules(ctx: PortalActionContext, examId: string) {
    await this.requireExamInScope(ctx, examId);
    return this.repo.listSchedules(examId);
  }

  async createSchedule(
    ctx: PortalActionContext,
    examId: string,
    input: CreateExamScheduleInput,
  ) {
    const exam = await this.requireExamInScope(ctx, examId);
    await this.assertRef(ctx, "classes", input.classId, "class");
    await this.assertRef(ctx, "subjects", input.subjectId, "subject");
    const dupe = await this.repo.findScheduleByKey(
      examId,
      input.classId,
      input.subjectId,
    );
    if (dupe) {
      throw new ConflictException({
        code: "SCHEDULE_EXISTS",
        message:
          "A paper already exists for this class and subject in this exam.",
      });
    }
    const row = await this.repo.insertSchedule({
      institutionId: ctx.principal.institutionId,
      examId,
      classId: input.classId,
      subjectId: input.subjectId,
      examDate: input.examDate ?? null,
      startTime: input.startTime ?? null,
      endTime: input.endTime ?? null,
      maxMarks: input.maxMarks,
      passMarks: input.passMarks ?? null,
      room: input.room ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(
      ctx,
      "exam.schedule.create",
      "exam_schedule",
      row.id,
      exam.campusId,
      {
        newState: { examId, classId: row.classId, subjectId: row.subjectId },
      },
    );
    return row;
  }

  async updateSchedule(
    ctx: PortalActionContext,
    examId: string,
    scheduleId: string,
    input: UpdateExamScheduleInput,
  ) {
    const exam = await this.requireExamInScope(ctx, examId);
    const existing = await this.repo.findSchedule(scheduleId, examId);
    if (!existing)
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Exam paper not found",
      });
    await this.assertOptional(ctx, "classes", input.classId, "class");
    await this.assertOptional(ctx, "subjects", input.subjectId, "subject");
    const nextClass = input.classId ?? existing.classId;
    const nextSubject = input.subjectId ?? existing.subjectId;
    if (nextClass !== existing.classId || nextSubject !== existing.subjectId) {
      const dupe = await this.repo.findScheduleByKey(
        examId,
        nextClass,
        nextSubject,
      );
      if (dupe && dupe.id !== scheduleId) {
        throw new ConflictException({
          code: "SCHEDULE_EXISTS",
          message:
            "A paper already exists for this class and subject in this exam.",
        });
      }
    }
    const updated = await this.repo.updateSchedule(scheduleId, input.version, {
      classId: nextClass,
      subjectId: nextSubject,
      examDate:
        input.examDate === undefined ? existing.examDate : input.examDate,
      startTime:
        input.startTime === undefined ? existing.startTime : input.startTime,
      endTime: input.endTime === undefined ? existing.endTime : input.endTime,
      maxMarks: input.maxMarks ?? existing.maxMarks,
      passMarks:
        input.passMarks === undefined ? existing.passMarks : input.passMarks,
      room: input.room === undefined ? existing.room : input.room,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(
      ctx,
      "exam.schedule.update",
      "exam_schedule",
      scheduleId,
      exam.campusId,
      {
        newState: { classId: updated.classId, subjectId: updated.subjectId },
      },
    );
    return updated;
  }

  async deleteSchedule(
    ctx: PortalActionContext,
    examId: string,
    scheduleId: string,
    version: number,
  ) {
    const exam = await this.requireExamInScope(ctx, examId);
    const existing = await this.repo.findSchedule(scheduleId, examId);
    if (!existing)
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Exam paper not found",
      });
    const ok = await this.repo.deleteSchedule(scheduleId, version);
    if (!ok) throw this.versionConflict();
    await this.write(
      ctx,
      "exam.schedule.delete",
      "exam_schedule",
      scheduleId,
      exam.campusId,
      {
        previousState: {
          classId: existing.classId,
          subjectId: existing.subjectId,
        },
      },
    );
    return { deleted: true };
  }

  // === audience preview ======================================================

  previewAudience(ctx: PortalActionContext, input: ExamAudiencePreviewInput) {
    return this.audience.previewStudents(ctx, input.targets);
  }

  // === paper questions ========================================================

  async listQuestions(
    ctx: PortalActionContext,
    examId: string,
    scheduleId: string,
  ) {
    await this.requireScheduleInScope(ctx, examId, scheduleId);
    return this.repo.listQuestions(scheduleId);
  }

  async createQuestion(
    ctx: PortalActionContext,
    examId: string,
    scheduleId: string,
    input: ExamQuestionInput,
  ) {
    const exam = await this.requireScheduleInScope(ctx, examId, scheduleId);
    const row = await this.repo.insertQuestion({
      examScheduleId: scheduleId,
      sequence: input.sequence,
      qtype: input.qtype,
      prompt: input.prompt,
      promptImageObjectId: input.promptImageObjectId ?? null,
      options: input.options ?? null,
      correctKey: input.correctKey ?? null,
      markingNote: input.markingNote ?? null,
      marks: input.marks,
      config:
        (input.config as Record<string, unknown> | null | undefined) ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(
      ctx,
      "exam.question.create",
      "exam_paper_question",
      row.id,
      exam.campusId,
      {
        newState: { scheduleId, sequence: row.sequence, qtype: row.qtype },
      },
    );
    return row;
  }

  async updateQuestion(
    ctx: PortalActionContext,
    examId: string,
    scheduleId: string,
    questionId: string,
    input: UpdateExamQuestionInput,
  ) {
    const exam = await this.requireScheduleInScope(ctx, examId, scheduleId);
    const existing = await this.repo.findQuestion(questionId, scheduleId);
    if (!existing)
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Question not found",
      });
    const updated = await this.repo.updateQuestion(questionId, input.version, {
      sequence: input.sequence ?? existing.sequence,
      qtype: input.qtype ?? existing.qtype,
      prompt: input.prompt ?? existing.prompt,
      promptImageObjectId:
        input.promptImageObjectId === undefined
          ? existing.promptImageObjectId
          : input.promptImageObjectId,
      options: input.options === undefined ? existing.options : input.options,
      correctKey:
        input.correctKey === undefined ? existing.correctKey : input.correctKey,
      markingNote:
        input.markingNote === undefined
          ? existing.markingNote
          : input.markingNote,
      marks: input.marks ?? existing.marks,
      config:
        input.config === undefined
          ? existing.config
          : ((input.config as Record<string, unknown> | null | undefined) ??
            null),
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(
      ctx,
      "exam.question.update",
      "exam_paper_question",
      questionId,
      exam.campusId,
      {
        newState: { sequence: updated.sequence },
      },
    );
    return updated;
  }

  async deleteQuestion(
    ctx: PortalActionContext,
    examId: string,
    scheduleId: string,
    questionId: string,
    version: number,
  ) {
    const exam = await this.requireScheduleInScope(ctx, examId, scheduleId);
    const existing = await this.repo.findQuestion(questionId, scheduleId);
    if (!existing)
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Question not found",
      });
    const ok = await this.repo.deleteQuestion(questionId, version);
    if (!ok) throw this.versionConflict();
    await this.write(
      ctx,
      "exam.question.delete",
      "exam_paper_question",
      questionId,
      exam.campusId,
      {
        previousState: { sequence: existing.sequence },
      },
    );
    return { deleted: true };
  }

  // === attempts (grading) ===================================================

  async listAttempts(
    ctx: PortalActionContext,
    examId: string,
    scheduleId: string,
  ) {
    await this.requireScheduleInScope(ctx, examId, scheduleId);
    return this.repo.listAttempts(scheduleId);
  }

  async getAttemptDetail(
    ctx: PortalActionContext,
    examId: string,
    scheduleId: string,
    attemptId: string,
  ) {
    await this.requireScheduleInScope(ctx, examId, scheduleId);
    return this.repo.listAttemptAnswers(attemptId);
  }

  async gradeAnswer(
    ctx: PortalActionContext,
    examId: string,
    scheduleId: string,
    _attemptId: string,
    answerId: string,
    input: GradeAnswerInput,
  ) {
    const exam = await this.requireScheduleInScope(ctx, examId, scheduleId);
    const updated = await this.repo.updateAnswerGrade(answerId, {
      teacherMarks: input.teacherMarks ?? null,
      teacherFeedback: input.teacherFeedback ?? null,
    });
    if (!updated)
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Answer not found",
      });
    await this.write(
      ctx,
      "exam.answer.grade",
      "exam_answer",
      answerId,
      exam.campusId,
      {
        newState: { teacherMarks: updated.teacherMarks },
      },
    );
    const attempt = (await this.repo.listAttempts(scheduleId)).find(
      (item) => item.id === _attemptId,
    );
    if (attempt) {
      await this.learnerEvidence.ingestExamAnswer(
        {
          institutionId: ctx.principal.institutionId,
          studentId: attempt.studentId,
        },
        answerId,
      );
    }
    return updated;
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === "campus" ? scope.campusId : null;
  }

  private assertInScope<T>(
    campusId: string | null,
    row: T | undefined,
    filter: ScopeFilter,
  ): asserts row is T {
    if (!row)
      throw new NotFoundException({ code: "NOT_FOUND", message: "Not found" });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Not found in the current scope",
      });
    }
  }

  private async requireExamInScope(ctx: PortalActionContext, examId: string) {
    const f = this.filter(ctx);
    const exam = await this.repo.find(examId, ctx.principal.institutionId);
    this.assertInScope(exam?.campusId ?? null, exam, f);
    return exam;
  }

  private async requireScheduleInScope(
    ctx: PortalActionContext,
    examId: string,
    scheduleId: string,
  ) {
    const exam = await this.requireExamInScope(ctx, examId);
    const sched = await this.repo.findSchedule(scheduleId, examId);
    if (!sched)
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Exam paper not found",
      });
    return exam;
  }

  private async assertRef(
    ctx: PortalActionContext,
    table: ExamRefTable,
    id: string,
    label: string,
  ): Promise<void> {
    const ok = await this.repo.existsInInstitution(
      table,
      id,
      ctx.principal.institutionId,
    );
    if (!ok)
      throw new BadRequestException({
        code: "INVALID_REFERENCE",
        message: `Unknown ${label}`,
      });
  }

  private async assertOptional(
    ctx: PortalActionContext,
    table: ExamRefTable,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) return;
    await this.assertRef(ctx, table, id, label);
  }

  private paginate<T>(page: Page<T>, q: ExamsListQuery): ListResult<T> {
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
      code: "VERSION_CONFLICT",
      message: "This record changed since you loaded it. Reload and try again.",
    });
  }
}
