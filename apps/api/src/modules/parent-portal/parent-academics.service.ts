import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, schema, type Database } from '@edrion/database';
import { computeForecast, truncateAttendancePctNumber } from '@edrion/schemas';
import type { AssignmentsQuery, DateRangeQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import { AttendancePolicyService } from '../portal/attendance-policy.service';
import { assertWard } from './guardian-scope.guard';
import type { GuardianContext } from './guardian-context';

/**
 * Read-only academics for a ward: attendance, assignments, published results + datesheets, timetable.
 * Every method asserts the caller is a guardian of `studentId`. Publish gates (results, datesheets)
 * live in the SQL predicate — never a mapper.
 */
@Injectable()
export class ParentAcademicsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly policyService: AttendancePolicyService,
  ) {}

  async attendance(guardian: GuardianContext, studentId: string, q: DateRangeQuery) {
    assertWard(guardian, studentId);
    const [student] = await this.db
      .select({ campusId: schema.students.campusId })
      .from(schema.students)
      .where(eq(schema.students.id, studentId))
      .limit(1);
    const policy = await this.policyService.resolvePolicyValues(guardian.institutionId, student?.campusId ?? null);
    if (policy.parentVisibility === 'off') {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Attendance is not visible to parents at this institution.',
      });
    }

    const [term] = await this.db
      .select()
      .from(schema.academicTerms)
      .where(eq(schema.academicTerms.institutionId, guardian.institutionId))
      .orderBy(desc(schema.academicTerms.startDate))
      .limit(1);

    const rollups = term
      ? await this.db
          .select({
            rollup: schema.attendanceRollups,
            subjectName: schema.subjects.name,
          })
          .from(schema.attendanceRollups)
          .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceRollups.subjectId))
          .where(
            and(
              eq(schema.attendanceRollups.studentId, studentId),
              eq(schema.attendanceRollups.termId, term.id),
            ),
          )
      : [];
    const overall = rollups.find((row) => row.rollup.subjectId == null);
    const subjects = rollups
      .filter((row) => row.rollup.subjectId != null)
      .map((row) => {
        const pct = row.rollup.pct == null ? null : truncateAttendancePctNumber(Number(row.rollup.pct) * 100);
        const forecast = computeForecast({
          attended: row.rollup.attended,
          conducted: row.rollup.conducted,
          remaining: row.rollup.remaining,
          thresholdPct: policy.thresholdPct,
          safeMarginPct: policy.safeMarginPct,
        });
        return {
          subjectId: row.rollup.subjectId,
          subjectName: row.subjectName,
          pct,
          zone: row.rollup.zone,
          forecast: forecast.message,
        };
      });

    const rec = schema.attendanceRecords;
    const ses = schema.attendanceSessions;
    const conds = [eq(rec.studentId, studentId)];
    if (q.from) conds.push(gte(ses.date, q.from));
    if (q.to) conds.push(lte(ses.date, q.to));
    const rows = await this.db
      .select({ date: ses.date, period: ses.period, status: rec.status, remarks: rec.remarks })
      .from(rec)
      .innerJoin(ses, eq(ses.id, rec.sessionId))
      .where(and(...conds))
      .orderBy(desc(ses.date));

    const notes = await this.db
      .select({ from: schema.parentAbsenceNotes.dateFrom, to: schema.parentAbsenceNotes.dateTo })
      .from(schema.parentAbsenceNotes)
      .where(and(eq(schema.parentAbsenceNotes.studentId, studentId), eq(schema.parentAbsenceNotes.status, 'acknowledged')));
    const explained = (d: string | null) => !!d && notes.some((n) => n.from <= d && n.to >= d);

    const overallPct =
      overall?.rollup.pct == null ? null : truncateAttendancePctNumber(Number(overall.rollup.pct) * 100);
    const overallForecast = overall
      ? computeForecast({
          attended: overall.rollup.attended,
          conducted: overall.rollup.conducted,
          remaining: overall.rollup.remaining,
          thresholdPct: policy.thresholdPct,
          safeMarginPct: policy.safeMarginPct,
        })
      : null;

    return {
      studentId,
      summaryPct: overallPct,
      thresholdPct: policy.thresholdPct,
      zone: overall?.rollup.zone ?? 'safe',
      forecast: overallForecast?.message ?? null,
      subjects,
      days: rows.map((r) => ({
        date: r.date,
        status: r.status,
        period: r.period,
        remarks: r.remarks,
        explained: r.status === 'absent' ? explained(r.date) : true,
      })),
    };
  }

  async assignments(guardian: GuardianContext, studentId: string, q: AssignmentsQuery) {
    assertWard(guardian, studentId);
    const sub = schema.assignmentSubmissions;
    const asg = schema.assignments;
    const conds = [eq(sub.studentId, studentId)];
    if (q.status !== 'all' && q.status !== 'overdue' && q.status !== 'pending') {
      conds.push(eq(sub.status, q.status));
    }
    if (q.status === 'pending') conds.push(eq(sub.status, 'assigned'));
    const rows = await this.db
      .select({
        id: sub.id,
        status: sub.status,
        submittedDate: sub.submittedDate,
        pointsAwarded: sub.pointsAwarded,
        feedback: sub.feedback,
        title: asg.title,
        dueDate: asg.dueDate,
        maxPoints: asg.maxPoints,
        createdAt: sub.createdAt,
      })
      .from(sub)
      .innerJoin(asg, eq(asg.id, sub.assignmentId))
      .where(and(...conds))
      .orderBy(desc(asg.dueDate))
      .limit(q.limit + 1);
    const today = new Date().toISOString().slice(0, 10);
    let items = rows.map((r) => ({
      ...r,
      overdue: r.status === 'assigned' && !!r.dueDate && r.dueDate < today,
    }));
    if (q.status === 'overdue') items = items.filter((i) => i.overdue);
    const nextCursor = items.length > q.limit ? String(items[q.limit]!.createdAt.toISOString()) : null;
    return { items: items.slice(0, q.limit), nextCursor };
  }

  async results(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId, 'results');
    const g = schema.gradeEntries;
    const rows = await this.db
      .select({
        id: g.id,
        examId: g.examId,
        assessmentName: g.assessmentName,
        marksObtained: g.marksObtained,
        maxMarks: g.maxMarks,
        letterGrade: g.letterGrade,
        subject: schema.subjects.name,
        examName: schema.exams.name,
        examTerm: schema.exams.termLabel,
      })
      .from(g)
      .leftJoin(schema.subjects, eq(schema.subjects.id, g.subjectId))
      .leftJoin(schema.exams, eq(schema.exams.id, g.examId))
      .where(and(eq(g.studentId, studentId), eq(g.published, true)))
      .orderBy(desc(g.createdAt));

    const groups = new Map<string, { key: string; title: string; subjects: unknown[] }>();
    for (const r of rows) {
      const key = r.examId ?? `assessment:${r.assessmentName}`;
      const title = r.examName ? `${r.examName}${r.examTerm ? ` (${r.examTerm})` : ''}` : r.assessmentName;
      if (!groups.has(key)) groups.set(key, { key, title, subjects: [] });
      groups.get(key)!.subjects.push({
        subject: r.subject,
        marksObtained: r.marksObtained,
        maxMarks: r.maxMarks,
        letterGrade: r.letterGrade,
      });
    }
    return { studentId, terms: [...groups.values()] };
  }

  async exams(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, studentId))
      .limit(1);
    if (!student?.classId) return { studentId, papers: [] };
    const es = schema.examSchedules;
    const rows = await this.db
      .select({
        id: es.id,
        examDate: es.examDate,
        startTime: es.startTime,
        endTime: es.endTime,
        room: es.room,
        hall: es.hall,
        seatInfo: es.seatInfo,
        syllabusNote: es.syllabusNote,
        subject: schema.subjects.name,
        examName: schema.exams.name,
      })
      .from(es)
      .leftJoin(schema.subjects, eq(schema.subjects.id, es.subjectId))
      .leftJoin(schema.exams, eq(schema.exams.id, es.examId))
      .where(and(eq(es.classId, student.classId), eq(es.published, true)))
      .orderBy(asc(es.examDate));
    return { studentId, papers: rows };
  }

  async timetable(guardian: GuardianContext, studentId: string) {
    assertWard(guardian, studentId);
    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, studentId))
      .limit(1);
    if (!student?.classId) return { studentId, slots: [] };
    const t = schema.timetableSlots;
    const rows = await this.db
      .select({
        id: t.id,
        dayOfWeek: t.dayOfWeek,
        startTime: t.startTime,
        endTime: t.endTime,
        room: t.room,
        subject: schema.subjects.name,
      })
      .from(t)
      .leftJoin(schema.subjects, eq(schema.subjects.id, t.subjectId))
      .where(eq(t.classId, student.classId))
      .orderBy(asc(t.dayOfWeek), asc(t.startTime));
    return { studentId, slots: rows };
  }
}
