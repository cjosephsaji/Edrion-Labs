import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, schema, type Database } from '@edrion/database';
import type { AttemptAnswerUpdateInput } from '@edrion/schemas';
import { DATABASE, LEARN_AI_PROVIDER } from '../../common/tokens';
import type { LearnAiProvider } from './learn-ai/provider';
import { EvaluatorService } from './learn-ai/evaluator.service';
import { StudentStorageService } from './storage/student-storage.service';
import type { InstitutionalStudentPrincipal } from './student.types';
import { gradeObjective, isAutoGradable } from '../portal/objective-grader';

type AttemptKind = 'exam' | 'assignment';

interface SanitizedQuestion {
  id: string;
  sequence: number;
  qtype: string;
  prompt: string;
  promptImageUrl: string | null;
  options: Array<{ key: string; label: string; imageUrl: string | null }> | undefined;
  marks: number;
  config: Record<string, unknown> | null;
}

@Injectable()
export class StudentQuizAttemptService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(LEARN_AI_PROVIDER) private readonly ai: LearnAiProvider,
    private readonly evaluator: EvaluatorService,
    private readonly storage: StudentStorageService,
  ) {}

  // --- exam paper attempts ---------------------------------------------------

  async getExamPaper(principal: InstitutionalStudentPrincipal, scheduleId: string) {
    const [sched] = await this.db
      .select({
        schedule: schema.examSchedules,
        exam: schema.exams,
        subjectName: schema.subjects.name,
      })
      .from(schema.examSchedules)
      .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
      .innerJoin(schema.subjects, eq(schema.subjects.id, schema.examSchedules.subjectId))
      .where(eq(schema.examSchedules.id, scheduleId))
      .limit(1);
    if (!sched) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Exam paper not found' });

    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);

    const targeted = await this.isExamTargeted(principal.studentId, sched.exam.id, student?.classId ?? null, sched.schedule.classId);
    if (!targeted) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Exam paper not found' });

    const questions = await this.db
      .select()
      .from(schema.examPaperQuestions)
      .where(eq(schema.examPaperQuestions.examScheduleId, scheduleId))
      .orderBy(asc(schema.examPaperQuestions.sequence));

    const attempts = await this.db
      .select()
      .from(schema.examAttempts)
      .where(and(eq(schema.examAttempts.examScheduleId, scheduleId), eq(schema.examAttempts.studentId, principal.studentId)))
      .orderBy(desc(schema.examAttempts.attemptNo))
      .limit(1);
    const attempt = attempts[0];

    return this.buildPaperDto({
      id: scheduleId,
      title: `${sched.exam.name} — ${sched.subjectName}`,
      durationMin: sched.exam.durationMin,
      questions: questions.map((q) => this.sanitizeQuestion(q)),
      attempt,
      results: attempt?.results,
    });
  }

  async startExamAttempt(principal: InstitutionalStudentPrincipal, scheduleId: string) {
    const paper = await this.getExamPaper(principal, scheduleId);
    if (paper.attempt && !paper.attempt.finishedAt) {
      return { attemptId: paper.attempt.id, endsAt: paper.attempt.endsAt };
    }
    if (paper.attempt?.finishedAt) {
      throw new ForbiddenException({ code: 'ALREADY_COMPLETED', message: 'You already completed this exam.' });
    }
    const durationMin = paper.durationMin ?? 60;
    const endsAt = new Date(Date.now() + durationMin * 60_000);
    const [attempt] = await this.db
      .insert(schema.examAttempts)
      .values({ examScheduleId: scheduleId, studentId: principal.studentId, endsAt })
      .returning();
    return { attemptId: attempt!.id, endsAt: endsAt.toISOString() };
  }

  async saveExamAnswer(
    principal: InstitutionalStudentPrincipal,
    scheduleId: string,
    questionId: string,
    body: AttemptAnswerUpdateInput,
  ) {
    const attempt = await this.requireActiveExamAttempt(principal, scheduleId);
    await this.db
      .insert(schema.examAnswers)
      .values({
        attemptId: attempt.id,
        questionId,
        choiceKey: body.choiceKey ?? null,
        answerText: body.answerText ?? null,
        answerObjectId: body.answerObjectId ?? null,
        answerJson: (body.answerJson as Record<string, unknown> | null | undefined) ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.examAnswers.attemptId, schema.examAnswers.questionId],
        set: {
          choiceKey: body.choiceKey ?? null,
          answerText: body.answerText ?? null,
          answerObjectId: body.answerObjectId ?? null,
          answerJson: (body.answerJson as Record<string, unknown> | null | undefined) ?? null,
          updatedAt: new Date(),
        },
      });
    return { ok: true };
  }

  async finishExamAttempt(principal: InstitutionalStudentPrincipal, scheduleId: string) {
    const attempt = await this.requireActiveExamAttempt(principal, scheduleId, true);
    const questions = await this.db
      .select()
      .from(schema.examPaperQuestions)
      .where(eq(schema.examPaperQuestions.examScheduleId, scheduleId));
    const answers = await this.db
      .select()
      .from(schema.examAnswers)
      .where(eq(schema.examAnswers.attemptId, attempt.id));
    const results = await this.gradeAttempt('exam', principal, questions, answers);
    await this.db
      .update(schema.examAttempts)
      .set({ finishedAt: new Date(), status: 'completed', ...results.totals })
      .where(eq(schema.examAttempts.id, attempt.id));
    return results.summary;
  }

  // --- assignment quiz attempts ----------------------------------------------

  async getAssignmentQuiz(principal: InstitutionalStudentPrincipal, assignmentId: string) {
    const [row] = await this.db
      .select({ assignment: schema.assignments })
      .from(schema.assignments)
      .where(and(eq(schema.assignments.id, assignmentId), eq(schema.assignments.deliveryMode, 'quiz')))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });

    const targeted = await this.isAssignmentTargeted(
      principal.studentId,
      assignmentId,
      row.assignment.classId,
      row.assignment.courseId,
    );
    if (!targeted) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });

    const questions = await this.db
      .select()
      .from(schema.assignmentQuestions)
      .where(eq(schema.assignmentQuestions.assignmentId, assignmentId))
      .orderBy(asc(schema.assignmentQuestions.sequence));

    const attempts = await this.db
      .select()
      .from(schema.assignmentAttempts)
      .where(and(eq(schema.assignmentAttempts.assignmentId, assignmentId), eq(schema.assignmentAttempts.studentId, principal.studentId)))
      .orderBy(desc(schema.assignmentAttempts.attemptNo))
      .limit(1);
    const attempt = attempts[0];

    return this.buildPaperDto({
      id: assignmentId,
      title: row.assignment.title,
      durationMin: row.assignment.durationMin,
      questions: questions.map((q) => this.sanitizeQuestion(q)),
      attempt,
      results: attempt?.results,
    });
  }

  async startAssignmentAttempt(principal: InstitutionalStudentPrincipal, assignmentId: string) {
    const paper = await this.getAssignmentQuiz(principal, assignmentId);
    if (paper.attempt && !paper.attempt.finishedAt) {
      return { attemptId: paper.attempt.id, endsAt: paper.attempt.endsAt };
    }
    if (paper.attempt?.finishedAt) {
      throw new ForbiddenException({ code: 'ALREADY_COMPLETED', message: 'You already completed this assignment.' });
    }
    const durationMin = paper.durationMin ?? 60;
    const endsAt = new Date(Date.now() + durationMin * 60_000);
    const [attempt] = await this.db
      .insert(schema.assignmentAttempts)
      .values({ assignmentId, studentId: principal.studentId, endsAt })
      .returning();
    return { attemptId: attempt!.id, endsAt: endsAt.toISOString() };
  }

  async saveAssignmentAnswer(
    principal: InstitutionalStudentPrincipal,
    assignmentId: string,
    questionId: string,
    body: AttemptAnswerUpdateInput,
  ) {
    const attempt = await this.requireActiveAssignmentAttempt(principal, assignmentId);
    await this.db
      .insert(schema.assignmentAnswers)
      .values({
        attemptId: attempt.id,
        questionId,
        choiceKey: body.choiceKey ?? null,
        answerText: body.answerText ?? null,
        answerObjectId: body.answerObjectId ?? null,
        answerJson: (body.answerJson as Record<string, unknown> | null | undefined) ?? null,
      })
      .onConflictDoUpdate({
        target: [schema.assignmentAnswers.attemptId, schema.assignmentAnswers.questionId],
        set: {
          choiceKey: body.choiceKey ?? null,
          answerText: body.answerText ?? null,
          answerObjectId: body.answerObjectId ?? null,
          answerJson: (body.answerJson as Record<string, unknown> | null | undefined) ?? null,
          updatedAt: new Date(),
        },
      });
    return { ok: true };
  }

  async finishAssignmentAttempt(principal: InstitutionalStudentPrincipal, assignmentId: string) {
    const attempt = await this.requireActiveAssignmentAttempt(principal, assignmentId, true);
    const questions = await this.db
      .select()
      .from(schema.assignmentQuestions)
      .where(eq(schema.assignmentQuestions.assignmentId, assignmentId));
    const answers = await this.db
      .select()
      .from(schema.assignmentAnswers)
      .where(eq(schema.assignmentAnswers.attemptId, attempt.id));
    const results = await this.gradeAttempt('assignment', principal, questions, answers);
    await this.db
      .update(schema.assignmentAttempts)
      .set({ finishedAt: new Date(), status: 'completed', ...results.totals })
      .where(eq(schema.assignmentAttempts.id, attempt.id));
    return results.summary;
  }

  // --- helpers ---------------------------------------------------------------

  private sanitizeQuestion(q: {
    id: string;
    sequence: number;
    qtype: string;
    prompt: string;
    promptImageObjectId: string | null;
    options: Array<{ key: string; label: string; imageObjectId?: string }> | null;
    marks: number;
    config?: Record<string, unknown> | null;
  }): SanitizedQuestion {
    return {
      id: q.id,
      sequence: q.sequence,
      qtype: q.qtype,
      prompt: q.prompt,
      promptImageUrl: q.promptImageObjectId ? `/v1/student/storage/${q.promptImageObjectId}` : null,
      options: q.options?.map((o) => ({
        key: o.key,
        label: o.label,
        imageUrl: o.imageObjectId ? `/v1/student/storage/${o.imageObjectId}` : null,
      })),
      marks: q.marks,
      config: q.config ?? null,
    };
  }

  private buildPaperDto(opts: {
    id: string;
    title: string;
    durationMin: number | null;
    questions: SanitizedQuestion[];
    attempt?: { id: string; startedAt: Date; endsAt: Date; finishedAt: Date | null } | undefined;
    results?: unknown;
  }) {
    return {
      id: opts.id,
      title: opts.title,
      durationMin: opts.durationMin,
      questions: opts.questions,
      attempt: opts.attempt
        ? {
            id: opts.attempt.id,
            startedAt: opts.attempt.startedAt.toISOString(),
            endsAt: opts.attempt.endsAt.toISOString(),
            finishedAt: opts.attempt.finishedAt?.toISOString() ?? null,
          }
        : undefined,
      results: opts.results ?? undefined,
      status: opts.attempt?.finishedAt ? 'completed' : opts.attempt ? 'in_progress' : 'ready',
    };
  }

  private async requireActiveExamAttempt(
    principal: InstitutionalStudentPrincipal,
    scheduleId: string,
    allowFinish = false,
  ) {
    const [attempt] = await this.db
      .select()
      .from(schema.examAttempts)
      .where(and(eq(schema.examAttempts.examScheduleId, scheduleId), eq(schema.examAttempts.studentId, principal.studentId)))
      .orderBy(desc(schema.examAttempts.attemptNo))
      .limit(1);
    if (!attempt || attempt.finishedAt) {
      throw new ForbiddenException({ code: 'NO_ACTIVE_ATTEMPT', message: 'No active attempt.' });
    }
    const grace = new Date(attempt.endsAt.getTime() + 30_000);
    if (!allowFinish && new Date() > grace) {
      throw new ForbiddenException({ code: 'TIME_EXPIRED', message: 'Time is up for this attempt.' });
    }
    return attempt;
  }

  private async requireActiveAssignmentAttempt(
    principal: InstitutionalStudentPrincipal,
    assignmentId: string,
    allowFinish = false,
  ) {
    const [attempt] = await this.db
      .select()
      .from(schema.assignmentAttempts)
      .where(and(eq(schema.assignmentAttempts.assignmentId, assignmentId), eq(schema.assignmentAttempts.studentId, principal.studentId)))
      .orderBy(desc(schema.assignmentAttempts.attemptNo))
      .limit(1);
    if (!attempt || attempt.finishedAt) {
      throw new ForbiddenException({ code: 'NO_ACTIVE_ATTEMPT', message: 'No active attempt.' });
    }
    const grace = new Date(attempt.endsAt.getTime() + 30_000);
    if (!allowFinish && new Date() > grace) {
      throw new ForbiddenException({ code: 'TIME_EXPIRED', message: 'Time is up for this attempt.' });
    }
    return attempt;
  }

  private async isExamTargeted(studentId: string, examId: string, studentClassId: string | null, paperClassId: string) {
    const [assignee] = await this.db
      .select({ id: schema.examAssignees.id })
      .from(schema.examAssignees)
      .where(and(eq(schema.examAssignees.examId, examId), eq(schema.examAssignees.studentId, studentId)))
      .limit(1);
    if (assignee) return true;
    return studentClassId === paperClassId;
  }

  private async isAssignmentTargeted(
    studentId: string,
    assignmentId: string,
    classId: string,
    courseId: string | null,
  ) {
    const [assignee] = await this.db
      .select({ id: schema.assignmentAssignees.id })
      .from(schema.assignmentAssignees)
      .where(and(eq(schema.assignmentAssignees.assignmentId, assignmentId), eq(schema.assignmentAssignees.studentId, studentId)))
      .limit(1);
    if (assignee) return true;
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, studentId))
      .limit(1);
    if (student?.classId === classId) return true;
    if (courseId) {
      const [enrolled] = await this.db
        .select({ id: schema.courseEnrollments.id })
        .from(schema.courseEnrollments)
        .where(and(eq(schema.courseEnrollments.courseId, courseId), eq(schema.courseEnrollments.studentId, studentId)))
        .limit(1);
      if (enrolled) return true;
    }
    return false;
  }

  private async gradeAttempt(
    kind: AttemptKind,
    principal: InstitutionalStudentPrincipal,
    questions: Array<{
      id: string;
      qtype: string;
      prompt: string;
      correctKey: string | null;
      markingNote: string | null;
      marks: number;
      config?: Record<string, unknown> | null;
    }>,
    answers: Array<{
      id: string;
      questionId: string;
      choiceKey: string | null;
      answerText: string | null;
      answerObjectId: string | null;
      answerJson?: Record<string, unknown> | null;
    }>,
  ) {
    const images = await this.loadAnswerImages(principal, answers);
    let autoScore = 0;
    let maxScore = 0;
    const freeTextForAi: Array<{
      questionId: string;
      answerId: string;
      qtype: string;
      prompt: string;
      correctKey: string | null;
      markingNote: string | null;
      choiceKey: string | null;
      answerText: string | null;
      photoObjectId: string | null;
    }> = [];

    for (const q of questions) {
      maxScore += q.marks;
      const ans = answers.find((a) => a.questionId === q.id);
      if (!ans) continue;

      if (isAutoGradable(q.qtype)) {
        const graded = gradeObjective(q, ans);
        autoScore += graded.awardedMarks;
        await this.updateAnswer(kind, ans.id, {
          autoCorrect: graded.autoCorrect,
          awardedMarks: graded.awardedMarks,
          needsReview: graded.needsReview,
        });
      } else {
        freeTextForAi.push({
          questionId: q.id,
          answerId: ans.id,
          qtype: q.qtype,
          prompt: q.prompt,
          correctKey: q.correctKey,
          markingNote: q.markingNote,
          choiceKey: ans.choiceKey,
          answerText: ans.answerText,
          photoObjectId: ans.answerObjectId,
        });
      }
    }

    if (freeTextForAi.length > 0 && this.ai) {
      try {
        const evalInput = freeTextForAi.map((f) => ({
          qtype: (f.qtype === 'long_answer' ? 'long' : 'short') as 'short' | 'long',
          prompt: f.prompt,
          correctKey: f.correctKey,
          markingNote: f.markingNote,
          choiceKey: f.choiceKey,
          answerText: f.answerText,
          photoObjectId: f.photoObjectId,
        }));
        const evals = await this.evaluator.evaluateMockBatch(principal, evalInput, images);
        for (let i = 0; i < freeTextForAi.length; i++) {
          const f = freeTextForAi[i]!;
          const ev = evals[i]!;
          const q = questions.find((x) => x.id === f.questionId)!;
          const suggested = ev.correct ? q.marks : 0;
          await this.updateAnswer(kind, f.answerId, {
            awardedMarks: suggested,
            aiNote: ev.note ?? null,
            needsReview: true,
          });
        }
      } catch {
        for (const f of freeTextForAi) {
          await this.updateAnswer(kind, f.answerId, { needsReview: true });
        }
      }
    } else {
      for (const f of freeTextForAi) {
        await this.updateAnswer(kind, f.answerId, { needsReview: true });
      }
    }

    const summary = { autoScore, maxScore, totalQuestions: questions.length };
    return {
      totals: { autoScore, maxScore, results: summary },
      summary,
    };
  }

  private async updateAnswer(
    kind: AttemptKind,
    answerId: string,
    patch: {
      autoCorrect?: boolean;
      awardedMarks?: number;
      aiNote?: string | null;
      needsReview?: boolean;
    },
  ) {
    const table = kind === 'exam' ? schema.examAnswers : schema.assignmentAnswers;
    await this.db.update(table).set({ ...patch, updatedAt: new Date() }).where(eq(table.id, answerId));
  }

  private async loadAnswerImages(
    principal: InstitutionalStudentPrincipal,
    answers: Array<{ answerObjectId: string | null }>,
  ) {
    const images = new Map<string, { base64: string; mimeType: string }>();
    for (const a of answers) {
      if (!a.answerObjectId || images.has(a.answerObjectId)) continue;
      try {
        const row = await this.storage.getOwned(principal, a.answerObjectId);
        const buf = await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          this.storage
            .stream(row.storageKey)
            .on('data', (c) => chunks.push(c as Buffer))
            .on('end', () => resolve(Buffer.concat(chunks)))
            .on('error', reject);
        });
        images.set(a.answerObjectId, { base64: buf.toString('base64'), mimeType: row.mimeType });
      } catch {
        // skip unreadable images
      }
    }
    return images;
  }
}
