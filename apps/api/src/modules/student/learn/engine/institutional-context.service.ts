import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gt, lte, schema, sql, type Database } from '@edrion/database';
import type { CreateLearnSessionInput, EntryRef, SessionGoal } from '@edrion/schemas';
import { DATABASE } from '../../../../common/tokens';
import type { InstitutionalStudentPrincipal, StudentPrincipal } from '../../student.types';

const WEAK_RESULT_PCT = 0.55;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

export interface ResolvedInstitutionalContext {
  entryPoint?: CreateLearnSessionInput['entryPoint'];
  topicKey: string;
  topicTitle: string;
  subjectLabel: string;
  goal: SessionGoal;
  emotionalContext: 'neutral' | 'setback' | 'curious' | 'anxious';
  timeBudgetMinutes?: number;
  entryRef: EntryRef;
  sessionContextExtras: {
    source_report_card_entry_id?: string;
    source_exam_schedule_id?: string;
    days_until_exam?: number;
    subject_label?: string;
    active_assignment_overlap?: boolean;
  };
}

@Injectable()
export class InstitutionalContextService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async resolve(
    principal: StudentPrincipal,
    input: CreateLearnSessionInput,
  ): Promise<Partial<ResolvedInstitutionalContext>> {
    if (principal.kind !== 'institutional') {
      return {};
    }

    switch (input.entryPoint) {
      case 'bad_result':
        return this.resolveBadResult(principal, input.reportCardEntryId!);
      case 'upcoming_exam':
      case 'prep_countdown':
        return this.resolveExamEntry(principal, input.examScheduleId!, input.entryPoint);
      default:
        if (input.topicKey) {
          const overlap = await this.detectAssignmentOverlap(principal, input.topicKey);
          return overlap ? { sessionContextExtras: { active_assignment_overlap: true } } : {};
        }
        return {};
    }
  }

  private async resolveBadResult(
    principal: InstitutionalStudentPrincipal,
    reportCardEntryId: string,
  ): Promise<ResolvedInstitutionalContext> {
    const [row] = await this.db
      .select({
        entry: schema.reportCardEntries,
        card: schema.reportCards,
      })
      .from(schema.reportCardEntries)
      .innerJoin(schema.reportCards, eq(schema.reportCardEntries.reportCardId, schema.reportCards.id))
      .where(
        and(
          eq(schema.reportCardEntries.id, reportCardEntryId),
          eq(schema.reportCards.studentId, principal.studentId),
          eq(schema.reportCards.status, 'published'),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Published report card entry not found.',
      });
    }

    const pct = row.entry.maxMarks > 0 ? row.entry.marks / row.entry.maxMarks : 1;
    if (pct > WEAK_RESULT_PCT) {
      throw new ForbiddenException({
        code: 'RESULT_NOT_WEAK',
        message: 'This result is not flagged for remediation.',
      });
    }

    const subjectLabel = row.entry.subjectLabel;
    const topicKey = `subject:${slugify(subjectLabel)}`;
    const overlap = await this.detectAssignmentOverlap(principal, topicKey, subjectLabel);

    return {
      entryPoint: 'bad_result',
      topicKey,
      topicTitle: subjectLabel,
      subjectLabel,
      goal: 'remediation',
      emotionalContext: 'setback',
      timeBudgetMinutes: 20,
      entryRef: { report_card_entry_id: reportCardEntryId },
      sessionContextExtras: {
        source_report_card_entry_id: reportCardEntryId,
        subject_label: subjectLabel,
        active_assignment_overlap: overlap,
      },
    };
  }

  private async resolveExamEntry(
    principal: InstitutionalStudentPrincipal,
    examScheduleId: string,
    entryPoint: 'upcoming_exam' | 'prep_countdown',
  ): Promise<ResolvedInstitutionalContext> {
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    if (!student?.classId) throw new NotFoundException('Student class not found');

    const [row] = await this.db
      .select({
        scheduleId: schema.examSchedules.id,
        examName: schema.exams.name,
        subject: schema.subjects.name,
        date: schema.examSchedules.examDate,
      })
      .from(schema.examSchedules)
      .innerJoin(schema.exams, eq(schema.examSchedules.examId, schema.exams.id))
      .innerJoin(schema.subjects, eq(schema.examSchedules.subjectId, schema.subjects.id))
      .where(
        and(
          eq(schema.examSchedules.id, examScheduleId),
          eq(schema.examSchedules.classId, student.classId),
          eq(schema.examSchedules.published, true),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException({
        code: 'NOT_FOUND',
        message: 'Published exam schedule not found.',
      });
    }

    const today = new Date();
    const examDate = new Date(row.date!);
    const daysUntil = Math.max(0, Math.ceil((examDate.getTime() - today.getTime()) / 86400000));
    const subjectLabel = row.subject ?? row.examName;
    const topicKey = `subject:${slugify(subjectLabel)}`;
    const overlap = await this.detectAssignmentOverlap(principal, topicKey, subjectLabel);

    const resolvedEntryPoint =
      entryPoint === 'prep_countdown' || daysUntil <= 14 ? 'prep_countdown' : 'upcoming_exam';

    return {
      entryPoint: resolvedEntryPoint,
      topicKey,
      topicTitle: `${subjectLabel} — ${row.examName}`,
      subjectLabel,
      goal: 'revision',
      emotionalContext: daysUntil <= 3 ? 'anxious' : 'neutral',
      timeBudgetMinutes: resolvedEntryPoint === 'prep_countdown' ? 20 : 15,
      entryRef: { exam_schedule_id: examScheduleId },
      sessionContextExtras: {
        source_exam_schedule_id: examScheduleId,
        days_until_exam: daysUntil,
        subject_label: subjectLabel,
        active_assignment_overlap: overlap,
      },
    };
  }

  async detectAssignmentOverlap(
    principal: InstitutionalStudentPrincipal,
    _topicKey: string,
    subjectLabel?: string,
  ): Promise<boolean> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const [row] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(schema.homeworkSubmissions)
      .innerJoin(schema.homework, eq(schema.homeworkSubmissions.homeworkId, schema.homework.id))
      .where(
        and(
          eq(schema.homeworkSubmissions.studentId, principal.studentId),
          sql`${schema.homeworkSubmissions.status} IN ('assigned', 'in_progress')`,
          gt(schema.homework.dueAt, now),
          lte(schema.homework.dueAt, windowEnd),
          subjectLabel
            ? sql`lower(${schema.homework.title}) LIKE ${'%' + subjectLabel.toLowerCase().slice(0, 40) + '%'}`
            : sql`true`,
        ),
      )
      .limit(1);
    return Number(row?.c ?? 0) > 0;
  }
}
