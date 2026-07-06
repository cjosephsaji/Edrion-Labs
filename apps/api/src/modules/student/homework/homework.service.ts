import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { HomeworkListFilter, UpsertHomeworkAnswerInput } from '@edrion/schemas';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { HomeworkPolicyService } from './homework-policy.service';
import { HomeworkRepository } from './homework.repository';

@Injectable()
export class StudentHomeworkService {
  constructor(
    private readonly repo: HomeworkRepository,
    private readonly policy: HomeworkPolicyService,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async list(principal: InstitutionalStudentPrincipal, filter: HomeworkListFilter) {
    const rows = await this.repo.listForStudent(principal.studentId, principal.institutionId, filter);
    const items = await Promise.all(
      rows.map(async (r) => {
        const qCount = await this.repo.questionCount(r.id);
        const aCount = await this.repo.answeredCount(r.submissionId);
        const late = r.dueAt < new Date() && !['submitted', 'returned', 'graded'].includes(r.status);
        const badge = this.badgeFor(r.status, r.totalMarks, r.totalMax);
        return {
          id: r.id,
          title: r.title,
          subjectLabel: r.subjectName,
          teacherName: r.teacherName,
          dueLabel: this.dueLabel(r.dueAt, late),
          badge,
          questionCount: qCount,
          answeredCount: aCount,
          status: r.status as 'assigned' | 'in_progress' | 'submitted' | 'graded' | 'returned',
          late,
        };
      }),
    );
    return { items };
  }

  async detail(principal: InstitutionalStudentPrincipal, homeworkId: string) {
    const rows = await this.repo.getDetail(homeworkId, principal.studentId);
    const row = rows[0];
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });

    const questions = await this.repo.listQuestions(homeworkId);
    const answers = await this.repo.listAnswers(row.submission.id);

    return {
      id: row.homework.id,
      title: row.homework.title,
      instructions: row.homework.instructions,
      dueAt: row.homework.dueAt.toISOString(),
      status: row.submission.status,
      aiPolicy: row.homework.aiPolicy,
      questions: questions.map((q) => ({
        id: q.id,
        sequence: q.sequence,
        promptText: q.promptText,
        promptImageUrl: q.promptImageObjectId ? `/v1/student/storage/${q.promptImageObjectId}` : null,
        maxMarks: q.maxMarks,
      })),
      answers: answers.map((a) => ({
        questionId: a.questionId,
        mode: a.mode,
        answerText: a.answerText,
        answerObjectId: a.answerObjectId,
        updatedAt: a.updatedAt?.toISOString() ?? null,
        teacherMarks: a.teacherMarks,
        teacherFeedback: a.teacherFeedback,
      })),
      totalMarks: row.submission.totalMarks,
      totalMax: row.submission.totalMax,
      teacherNote: row.submission.teacherNote,
      submittedAt: row.submission.submittedAt?.toISOString() ?? null,
      returnedAt: row.submission.returnedAt?.toISOString() ?? null,
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
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });
    if (['submitted', 'returned', 'graded'].includes(row.submission.status)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });
    }
    await this.repo.upsertAnswer(row.submission.id, questionId, input);
    if (row.submission.status === 'assigned') {
      await this.repo.setSubmissionStatus(row.submission.id, 'in_progress');
    }
    return { saved: true };
  }

  async submit(principal: InstitutionalStudentPrincipal, homeworkId: string) {
    const rows = await this.repo.getDetail(homeworkId, principal.studentId);
    const row = rows[0];
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Homework not found' });
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

  aiPolicy(principal: InstitutionalStudentPrincipal, homeworkId: string) {
    return this.policy.resolveForHomework(homeworkId, principal.studentId);
  }

  private badgeFor(status: string, marks: number | null, max: number | null) {
    if (status === 'returned' && marks != null && max != null) {
      return { label: `${marks}/${max}`, tone: 'success' as const };
    }
    const map: Record<string, { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }> = {
      assigned: { label: 'Assigned', tone: 'neutral' },
      in_progress: { label: 'In progress', tone: 'info' },
      submitted: { label: 'Submitted', tone: 'info' },
      returned: { label: 'Returned', tone: 'success' },
      graded: { label: 'Graded', tone: 'success' },
    };
    return map[status] ?? { label: status, tone: 'neutral' };
  }

  private dueLabel(dueAt: Date, late: boolean) {
    const d = dueAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    return late ? `Due ${d} · Late` : `Due ${d}`;
  }
}
