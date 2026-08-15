import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  schema,
  type Database,
} from "@edrion/database";
import type { AttemptAnswerUpdateInput } from "@edrion/schemas";
import { DATABASE } from "../../../common/tokens";
import { gradeObjective, isAutoGradable } from "../../portal/objective-grader";
import type { InstitutionalStudentPrincipal } from "../student.types";
import { StudentStorageService } from "../storage/student-storage.service";
import { SurfaceGateService } from "../surfaces/surface-gate.service";
import { PetrosLearningSourceIngestionService } from "../../petros-learner-model/petros-learning-source-ingestion.service";

type ScheduleContext = {
  schedule: typeof schema.examSchedules.$inferSelect;
  exam: typeof schema.exams.$inferSelect;
  subjectName: string;
};

function scheduleDateTime(
  date: string | null,
  time: string | null,
  fallback: string,
) {
  if (!date) return null;
  const value = new Date(`${date}T${time ?? fallback}:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function hasAnswer(answer: {
  choiceKey: string | null;
  answerText: string | null;
  answerObjectId: string | null;
  answerJson: Record<string, unknown> | null;
}) {
  return Boolean(
    answer.choiceKey ||
    answer.answerText ||
    answer.answerObjectId ||
    (answer.answerJson &&
      Object.keys(answer.answerJson).some((key) => key !== "_flagged")),
  );
}

@Injectable()
export class StudentExamsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly surfaceGate: SurfaceGateService,
    private readonly storage: StudentStorageService,
    private readonly learnerEvidence: PetrosLearningSourceIngestionService,
  ) {}

  async list(principal: InstitutionalStudentPrincipal) {
    await this.surfaceGate.assertSurface(principal, "exams");
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    if (!student?.classId) return { items: [] };

    const today = new Date().toISOString().slice(0, 10);
    const rows = await this.db
      .select({
        id: schema.examSchedules.id,
        examName: schema.exams.name,
        examType: schema.exams.examType,
        examStatus: schema.exams.status,
        description: schema.exams.description,
        durationMin: schema.exams.durationMin,
        subject: schema.subjects.name,
        examDate: schema.examSchedules.examDate,
        startTime: schema.examSchedules.startTime,
        endTime: schema.examSchedules.endTime,
        maxMarks: schema.examSchedules.maxMarks,
        hall: schema.examSchedules.hall,
        room: schema.examSchedules.room,
        seatInfo: schema.examSchedules.seatInfo,
        syllabusNote: schema.examSchedules.syllabusNote,
      })
      .from(schema.examSchedules)
      .leftJoin(schema.exams, eq(schema.examSchedules.examId, schema.exams.id))
      .leftJoin(
        schema.subjects,
        eq(schema.examSchedules.subjectId, schema.subjects.id),
      )
      .where(
        and(
          eq(schema.examSchedules.classId, student.classId),
          eq(schema.examSchedules.published, true),
          gte(schema.examSchedules.examDate, today),
        ),
      )
      .orderBy(
        asc(schema.examSchedules.examDate),
        asc(schema.examSchedules.startTime),
      );

    const items = await Promise.all(
      rows.map(async (row) => {
        const [questions, attempt] = await Promise.all([
          this.db
            .select({ id: schema.examPaperQuestions.id })
            .from(schema.examPaperQuestions)
            .where(eq(schema.examPaperQuestions.examScheduleId, row.id)),
          this.latestAttempt(principal.studentId, row.id),
        ]);
        const availability = this.availability({
          examStatus: row.examStatus ?? "scheduled",
          examDate: row.examDate,
          startTime: row.startTime,
          endTime: row.endTime,
          questionCount: questions.length,
          attempt,
        });
        return {
          id: row.id,
          title: row.examName
            ? `${row.examName}${row.subject ? ` — ${row.subject}` : ""}`
            : (row.subject ?? "Exam"),
          subjectName: row.subject,
          examType: row.examType,
          description: row.description,
          startsAt: `${row.examDate}T${row.startTime ?? "00:00:00"}`,
          endsAt: row.endTime ? `${row.examDate}T${row.endTime}` : null,
          durationMin: row.durationMin,
          maxMarks: row.maxMarks,
          hall: row.hall,
          room: row.room,
          seatInfo: row.seatInfo,
          syllabusNote: row.syllabusNote,
          questionCount: questions.length,
          attemptStatus: attempt?.finishedAt
            ? "completed"
            : attempt
              ? "in_progress"
              : null,
          ...availability,
        };
      }),
    );
    return { items };
  }

  async getPaper(principal: InstitutionalStudentPrincipal, scheduleId: string) {
    await this.surfaceGate.assertSurface(principal, "exams");
    const context = await this.requireSchedule(principal, scheduleId);
    const [questions, attempt] = await Promise.all([
      this.db
        .select()
        .from(schema.examPaperQuestions)
        .where(eq(schema.examPaperQuestions.examScheduleId, scheduleId))
        .orderBy(asc(schema.examPaperQuestions.sequence)),
      this.latestAttempt(principal.studentId, scheduleId),
    ]);
    const answers = attempt
      ? await this.db
          .select()
          .from(schema.examAnswers)
          .where(eq(schema.examAnswers.attemptId, attempt.id))
      : [];
    const availability = this.availability({
      examStatus: context.exam.status,
      examDate: context.schedule.examDate,
      startTime: context.schedule.startTime,
      endTime: context.schedule.endTime,
      questionCount: questions.length,
      attempt,
    });

    return {
      id: scheduleId,
      title: `${context.exam.name} — ${context.subjectName}`,
      subjectName: context.subjectName,
      examType: context.exam.examType,
      description: context.exam.description,
      instructions: context.schedule.syllabusNote,
      durationMin: context.exam.durationMin ?? 60,
      maxMarks: context.schedule.maxMarks,
      startsAt: context.schedule.examDate
        ? `${context.schedule.examDate}T${context.schedule.startTime ?? "00:00:00"}`
        : null,
      endsAt:
        context.schedule.examDate && context.schedule.endTime
          ? `${context.schedule.examDate}T${context.schedule.endTime}`
          : null,
      room: context.schedule.hall ?? context.schedule.room,
      seatInfo: context.schedule.seatInfo,
      questions: questions.map((question) => this.sanitizeQuestion(question)),
      answers: answers.map((answer) => ({
        questionId: answer.questionId,
        choiceKey: answer.choiceKey,
        answerText: answer.answerText,
        answerObjectId: answer.answerObjectId,
        answerJson: answer.answerJson,
        updatedAt: answer.updatedAt.toISOString(),
      })),
      attempt: attempt
        ? {
            id: attempt.id,
            startedAt: attempt.startedAt.toISOString(),
            endsAt: attempt.endsAt.toISOString(),
            finishedAt: attempt.finishedAt?.toISOString() ?? null,
          }
        : null,
      results: attempt?.results ?? null,
      status: attempt?.finishedAt
        ? "completed"
        : attempt
          ? "in_progress"
          : "ready",
      ...availability,
    };
  }

  async startAttempt(
    principal: InstitutionalStudentPrincipal,
    scheduleId: string,
  ) {
    const paper = await this.getPaper(principal, scheduleId);
    if (paper.attempt && !paper.attempt.finishedAt) {
      return { attemptId: paper.attempt.id, endsAt: paper.attempt.endsAt };
    }
    if (paper.attempt?.finishedAt) {
      throw new ForbiddenException({
        code: "ALREADY_COMPLETED",
        message: "You already submitted this examination.",
      });
    }
    if (!paper.canStart) {
      throw new ForbiddenException({
        code: "EXAM_NOT_OPEN",
        message: paper.blockedReason ?? "This examination is not open.",
      });
    }

    const durationEnd = new Date(Date.now() + paper.durationMin * 60_000);
    const scheduleEnd = paper.availableUntil
      ? new Date(paper.availableUntil)
      : null;
    const endsAt =
      scheduleEnd && scheduleEnd < durationEnd ? scheduleEnd : durationEnd;
    const [attempt] = await this.db
      .insert(schema.examAttempts)
      .values({
        examScheduleId: scheduleId,
        studentId: principal.studentId,
        endsAt,
      })
      .returning();
    return { attemptId: attempt!.id, endsAt: endsAt.toISOString() };
  }

  async saveAnswer(
    principal: InstitutionalStudentPrincipal,
    scheduleId: string,
    questionId: string,
    body: AttemptAnswerUpdateInput,
  ) {
    const attempt = await this.requireActiveAttempt(principal, scheduleId);
    const [question] = await this.db
      .select()
      .from(schema.examPaperQuestions)
      .where(
        and(
          eq(schema.examPaperQuestions.id, questionId),
          eq(schema.examPaperQuestions.examScheduleId, scheduleId),
        ),
      )
      .limit(1);
    if (!question)
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Question not found.",
      });

    if (body.answerObjectId) {
      if (question.qtype !== "file_upload") {
        throw new BadRequestException({
          code: "INVALID_ANSWER_FILE",
          message: "This question does not accept a file response.",
        });
      }
      const object = await this.storage.getOwned(
        principal,
        body.answerObjectId,
      );
      if (object.kind !== "exam_answer") {
        throw new BadRequestException({
          code: "INVALID_ANSWER_FILE",
          message: "Choose a file uploaded for this examination.",
        });
      }
      const constraints = question.config?.fileUpload as
        | { acceptMime?: string[]; maxBytes?: number }
        | undefined;
      if (
        constraints?.acceptMime?.length &&
        !constraints.acceptMime.includes(object.mimeType)
      ) {
        throw new BadRequestException({
          code: "INVALID_ANSWER_FILE",
          message: "This file type is not accepted for the question.",
        });
      }
      if (constraints?.maxBytes && object.sizeBytes > constraints.maxBytes) {
        throw new BadRequestException({
          code: "INVALID_ANSWER_FILE",
          message: "The answer file exceeds the question limit.",
        });
      }
    }

    await this.db
      .insert(schema.examAnswers)
      .values({
        attemptId: attempt.id,
        questionId,
        choiceKey: body.choiceKey ?? null,
        answerText: body.answerText ?? null,
        answerObjectId: body.answerObjectId ?? null,
        answerJson:
          (body.answerJson as Record<string, unknown> | null | undefined) ??
          null,
      })
      .onConflictDoUpdate({
        target: [schema.examAnswers.attemptId, schema.examAnswers.questionId],
        set: {
          choiceKey: body.choiceKey ?? null,
          answerText: body.answerText ?? null,
          answerObjectId: body.answerObjectId ?? null,
          answerJson:
            (body.answerJson as Record<string, unknown> | null | undefined) ??
            null,
          updatedAt: new Date(),
        },
      });
    return { ok: true, savedAt: new Date().toISOString() };
  }

  async finishAttempt(
    principal: InstitutionalStudentPrincipal,
    scheduleId: string,
  ) {
    const attempt = await this.requireActiveAttempt(
      principal,
      scheduleId,
      true,
    );
    const [questions, answers] = await Promise.all([
      this.db
        .select()
        .from(schema.examPaperQuestions)
        .where(eq(schema.examPaperQuestions.examScheduleId, scheduleId)),
      this.db
        .select()
        .from(schema.examAnswers)
        .where(eq(schema.examAnswers.attemptId, attempt.id)),
    ]);
    const answerByQuestion = new Map(
      answers.map((answer) => [answer.questionId, answer]),
    );
    let autoScore = 0;
    let answeredQuestions = 0;
    let pendingReview = 0;

    for (const question of questions) {
      const answer = answerByQuestion.get(question.id);
      if (!answer || !hasAnswer(answer)) continue;
      answeredQuestions += 1;
      const gradeable = this.gradeableQuestion(question);
      const result = gradeObjective(gradeable, answer);
      const autoGradable = isAutoGradable(gradeable.qtype);
      if (autoGradable) autoScore += result.awardedMarks;
      else pendingReview += 1;
      await this.db
        .update(schema.examAnswers)
        .set({
          autoCorrect: autoGradable ? result.autoCorrect : null,
          awardedMarks: autoGradable ? result.awardedMarks : null,
          needsReview: !autoGradable,
          updatedAt: new Date(),
        })
        .where(eq(schema.examAnswers.id, answer.id));
    }

    const summary = {
      autoScore,
      maxScore: questions.reduce((sum, question) => sum + question.marks, 0),
      totalQuestions: questions.length,
      answeredQuestions,
      pendingReview,
      submittedAt: new Date().toISOString(),
    };
    await this.db
      .update(schema.examAttempts)
      .set({
        finishedAt: new Date(),
        status: "completed",
        autoScore: summary.autoScore,
        maxScore: summary.maxScore,
        results: summary,
      })
      .where(eq(schema.examAttempts.id, attempt.id));
    await this.learnerEvidence.ingestExamAttempt(
      {
        institutionId: principal.institutionId,
        studentId: principal.studentId,
      },
      attempt.id,
    );
    return summary;
  }

  private async requireSchedule(
    principal: InstitutionalStudentPrincipal,
    scheduleId: string,
  ): Promise<ScheduleContext> {
    const [row] = await this.db
      .select({
        schedule: schema.examSchedules,
        exam: schema.exams,
        subjectName: schema.subjects.name,
      })
      .from(schema.examSchedules)
      .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
      .innerJoin(
        schema.subjects,
        eq(schema.subjects.id, schema.examSchedules.subjectId),
      )
      .where(eq(schema.examSchedules.id, scheduleId))
      .limit(1);
    if (!row || !row.schedule.published) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Exam paper not found.",
      });
    }
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    if (!student || student.classId !== row.schedule.classId) {
      throw new NotFoundException({
        code: "NOT_FOUND",
        message: "Exam paper not found.",
      });
    }
    return row;
  }

  private latestAttempt(studentId: string, scheduleId: string) {
    return this.db
      .select()
      .from(schema.examAttempts)
      .where(
        and(
          eq(schema.examAttempts.examScheduleId, scheduleId),
          eq(schema.examAttempts.studentId, studentId),
        ),
      )
      .orderBy(desc(schema.examAttempts.attemptNo))
      .limit(1)
      .then((rows) => rows[0]);
  }

  private async requireActiveAttempt(
    principal: InstitutionalStudentPrincipal,
    scheduleId: string,
    allowExpired = false,
  ) {
    await this.requireSchedule(principal, scheduleId);
    const attempt = await this.latestAttempt(principal.studentId, scheduleId);
    if (!attempt || attempt.finishedAt) {
      throw new ForbiddenException({
        code: "NO_ACTIVE_ATTEMPT",
        message: "No active examination attempt.",
      });
    }
    if (!allowExpired && Date.now() > attempt.endsAt.getTime() + 30_000) {
      throw new ForbiddenException({
        code: "TIME_EXPIRED",
        message: "Time is up for this examination.",
      });
    }
    return attempt;
  }

  private availability(input: {
    examStatus: string;
    examDate: string | null;
    startTime: string | null;
    endTime: string | null;
    questionCount: number;
    attempt?: typeof schema.examAttempts.$inferSelect;
  }) {
    const availableFrom = scheduleDateTime(
      input.examDate,
      input.startTime,
      "00:00",
    );
    const availableUntil = scheduleDateTime(
      input.examDate,
      input.endTime,
      "23:59",
    );
    const now = new Date();
    let blockedReason: string | null = null;
    if (input.attempt?.finishedAt)
      blockedReason = "This examination has already been submitted.";
    else if (!input.questionCount)
      blockedReason = "The online paper has not been published yet.";
    else if (input.examStatus === "cancelled")
      blockedReason = "This examination was cancelled.";
    else if (input.examStatus === "completed")
      blockedReason = "This examination is closed.";
    else if (
      availableFrom &&
      now < availableFrom &&
      input.examStatus !== "ongoing"
    )
      blockedReason = "The examination has not opened yet.";
    else if (availableUntil && now > availableUntil && !input.attempt)
      blockedReason = "The examination window has closed.";

    return {
      canStart: !blockedReason,
      blockedReason,
      availability: input.attempt?.finishedAt
        ? "completed"
        : input.attempt
          ? "in_progress"
          : blockedReason
            ? "upcoming"
            : "available",
      availableFrom: availableFrom?.toISOString() ?? null,
      availableUntil: availableUntil?.toISOString() ?? null,
    };
  }

  private sanitizeQuestion(
    question: typeof schema.examPaperQuestions.$inferSelect,
  ) {
    return {
      id: question.id,
      sequence: question.sequence,
      qtype: question.qtype,
      prompt: question.prompt,
      promptImageUrl: question.promptImageObjectId
        ? `/v1/student/files/${question.promptImageObjectId}`
        : null,
      options:
        question.options?.map((option) => ({
          key: option.key,
          label: option.label,
        })) ?? null,
      marks: question.marks,
      config: this.sanitizeConfig(question.qtype, question.config),
    };
  }

  private sanitizeConfig(
    qtype: string,
    config: Record<string, unknown> | null,
  ) {
    if (!config) return null;
    if (qtype === "matching" || qtype === "match_following") {
      const matching = config.matching as
        | { left?: unknown[]; right?: unknown[] }
        | undefined;
      return {
        matching: { left: matching?.left ?? [], right: matching?.right ?? [] },
      };
    }
    if (qtype === "code") {
      const code = config.code as
        | { languages?: string[]; starterCode?: string; allowRun?: boolean }
        | undefined;
      return {
        code: {
          languages: code?.languages ?? ["python"],
          starterCode: code?.starterCode ?? "",
          allowRun: false,
        },
      };
    }
    if (qtype === "file_upload") {
      const file = config.fileUpload as
        | { acceptMime?: string[]; maxBytes?: number; maxFiles?: number }
        | undefined;
      return { fileUpload: file ?? {} };
    }
    if (qtype === "assertion_reason") {
      const assertion = config.assertionReason as
        | { assertion?: string; reason?: string }
        | undefined;
      return { assertionReason: assertion ?? {} };
    }
    if (qtype === "case_based") {
      const caseBased = config.caseBased as
        | { passage?: string; subQuestions?: Array<Record<string, unknown>> }
        | undefined;
      return {
        caseBased: {
          passage: caseBased?.passage ?? "",
          subQuestions: (caseBased?.subQuestions ?? []).map((question) => ({
            id: question.id,
            qtype: question.qtype,
            prompt: question.prompt,
            options: question.options,
            marks: question.marks,
          })),
        },
      };
    }
    if (qtype === "fill_blank") {
      const fillBlank = config.fillBlank as
        | { blanks?: Array<{ key?: string }> }
        | undefined;
      return {
        fillBlank: {
          blanks: (fillBlank?.blanks ?? []).map((blank) => ({
            key: blank.key,
          })),
        },
      };
    }
    if (qtype === "numeric" || qtype === "numerical") {
      const numeric = config.numeric as { unit?: string } | undefined;
      return { numeric: { unit: numeric?.unit ?? null } };
    }
    return null;
  }

  private gradeableQuestion(
    question: typeof schema.examPaperQuestions.$inferSelect,
  ) {
    const aliases: Record<string, string> = {
      assertion_reason: "mcq_single",
      numerical: "numeric",
      match_following: "matching",
    };
    return { ...question, qtype: aliases[question.qtype] ?? question.qtype };
  }
}
