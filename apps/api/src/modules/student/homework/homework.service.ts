import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { HomeworkListFilter, UpsertHomeworkAnswerInput } from '@edrion/schemas';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { HomeworkRepository } from './homework.repository';

const VISIBLE_HOMEWORK_STATUSES = ['assigned', 'closed'] as const;

function isVisibleHomeworkStatus(status: string): boolean {
  return (VISIBLE_HOMEWORK_STATUSES as readonly string[]).includes(status);
}

@Injectable()
export class StudentHomeworkService {
  constructor(
    private readonly repo: HomeworkRepository,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async list(principal: InstitutionalStudentPrincipal, filter: HomeworkListFilter) {
    const rows = await this.repo.listForStudent(principal.studentId, principal.institutionId, filter);
    return {
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        subjectName: r.subjectName,
        dueAt: r.dueAt.toISOString(),
        status: r.status,
        late: r.dueAt < new Date() && !['submitted', 'returned', 'graded'].includes(r.status),
      })),
    };
  }

  async detail(principal: InstitutionalStudentPrincipal, homeworkId: string) {
    const rows = await this.repo.getDetail(homeworkId, principal.studentId);
    const row = rows[0];
    if (!row || !isVisibleHomeworkStatus(row.homework.status)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });
    }

    const questions = await this.repo.listQuestions(homeworkId);
    const answers = await this.repo.listAnswers(row.submission.id);

    return {
      id: row.homework.id,
      title: row.homework.title,
      instructions: row.homework.instructions,
      dueAt: row.homework.dueAt.toISOString(),
      status: row.submission.status,
      aiPolicy: row.homework.aiPolicy,
      subjectName: row.subjectName,
      questions: questions.map((q) => ({
        id: q.id,
        sequence: q.sequence,
        promptText: q.promptText,
        maxMarks: q.maxMarks,
      })),
      answers: answers.map((a) => ({
        questionId: a.questionId,
        mode: a.mode,
        answerText: a.answerText,
        answerObjectId: a.answerObjectId,
        teacherMarks: a.teacherMarks,
        teacherFeedback: a.teacherFeedback,
      })),
      totalMarks: row.submission.totalMarks,
      totalMax: row.submission.totalMax,
      teacherNote: row.submission.teacherNote,
      submittedAt: row.submission.submittedAt?.toISOString() ?? null,
    };
  }

  async upsertAnswer(
    principal: InstitutionalStudentPrincipal,
    homeworkId: string,
    questionId: string,
    input: UpsertHomeworkAnswerInput,
  ) {
    const rows = await this.repo.getDetail(homeworkId, principal.studentId);
    const row = rows[0];
    if (!row || !isVisibleHomeworkStatus(row.homework.status)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });
    }
    if (['submitted', 'returned', 'graded'].includes(row.submission.status)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });
    }
    await this.repo.upsertAnswer(row.submission.id, questionId, {
      mode: input.mode,
      answerText: input.answerText ?? undefined,
      answerObjectId: input.answerObjectId ?? undefined,
    });
    if (row.submission.status === 'assigned') {
      await this.repo.setSubmissionStatus(row.submission.id, 'in_progress');
    }
    return { saved: true };
  }

  async submit(principal: InstitutionalStudentPrincipal, homeworkId: string) {
    const rows = await this.repo.getDetail(homeworkId, principal.studentId);
    const row = rows[0];
    if (!row || !isVisibleHomeworkStatus(row.homework.status)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });
    }
    await this.repo.setSubmissionStatus(row.submission.id, 'submitted', { submittedAt: new Date() });
    await this.ledger.log({
      eventType: 'homework.submitted',
      payload: { homeworkId },
      contextType: 'homework',
      contextId: homeworkId,
      principal,
    });
    return { submitted: true, submittedAt: new Date().toISOString() };
  }
}
