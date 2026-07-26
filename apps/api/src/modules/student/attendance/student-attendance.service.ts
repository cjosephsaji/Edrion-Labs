import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lt,
  lte,
  or,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import {
  computeForecast,
  formatAttendancePct,
  truncateAttendancePctNumber,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import { AttendancePolicyService } from '../../portal/attendance-policy.service';
import type { InstitutionalStudentPrincipal, StudentPrincipal } from '../student.types';
import { AttendanceRollupService } from './attendance-rollup.service';

@Injectable()
export class StudentAttendanceService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly features: FeatureControlsService,
    private readonly policyService: AttendancePolicyService,
    private readonly rollups: AttendanceRollupService,
  ) {}

  async summary(principal: InstitutionalStudentPrincipal, termId?: string) {
    await this.assertEnabled(principal);
    const term = await this.resolveTerm(principal.institutionId, termId);
    const policy = await this.policyService.resolvePolicyValues(principal.institutionId, principal.campusId);
    const rows = await this.db
      .select({
        rollup: schema.attendanceRollups,
        subjectName: schema.subjects.name,
      })
      .from(schema.attendanceRollups)
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceRollups.subjectId))
      .where(
        and(
          eq(schema.attendanceRollups.institutionId, principal.institutionId),
          eq(schema.attendanceRollups.studentId, principal.studentId),
          eq(schema.attendanceRollups.termId, term.id),
        ),
      );
    const overall = rows.find((row) => row.rollup.subjectId == null);
    const subjects = rows
      .filter((row) => row.rollup.subjectId != null)
      .map((row) => this.toLine(row.rollup, row.subjectName, policy))
      .sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
    const pendingRequests = await this.db
      .select({
        id: schema.studentRequests.id,
        type: schema.studentRequests.type,
        humanCode: schema.studentRequests.humanCode,
        status: schema.studentRequests.status,
      })
      .from(schema.studentRequests)
      .where(
        and(
          eq(schema.studentRequests.institutionId, principal.institutionId),
          eq(schema.studentRequests.studentId, principal.studentId),
          sql`${schema.studentRequests.type} in ('leave_request','od_request','attendance_correction')`,
          sql`${schema.studentRequests.status} not in ('fulfilled','rejected','cancelled','expired')`,
        ),
      )
      .orderBy(desc(schema.studentRequests.submittedAt))
      .limit(5);
    let dayView = false;
    try {
      dayView = (
        await this.features.resolveByKey('attendance.day_view', {
          institutionId: principal.institutionId,
          campusId: principal.campusId ?? undefined,
          institutionUserId: principal.institutionUserId,
        })
      ).value;
    } catch (err) {
      if (!(err instanceof NotFoundException)) throw err;
    }
    const dayStrip = dayView ? await this.dayStrip(principal, term.id) : null;
    return {
      termId: term.id,
      policy,
      overall: overall ? this.toLine(overall.rollup, null, policy) : this.emptyLine(policy),
      subjects,
      pendingRequests,
      updatedAt: overall?.rollup.updatedAt?.toISOString() ?? subjects[0]?.updatedAt ?? null,
      features: { dayView },
      dayStrip,
    };
  }

  async subjectDetail(principal: InstitutionalStudentPrincipal, subjectId: string, cursor?: string) {
    await this.assertEnabled(principal);
    const term = await this.resolveTerm(principal.institutionId);
    const policy = await this.policyService.resolvePolicyValues(principal.institutionId, principal.campusId);
    const [subject] = await this.db
      .select()
      .from(schema.subjects)
      .where(and(eq(schema.subjects.id, subjectId), eq(schema.subjects.institutionId, principal.institutionId)))
      .limit(1);
    if (!subject) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Subject not found.' });
    const [rollup] = await this.db
      .select()
      .from(schema.attendanceRollups)
      .where(
        and(
          eq(schema.attendanceRollups.studentId, principal.studentId),
          eq(schema.attendanceRollups.subjectId, subjectId),
          eq(schema.attendanceRollups.termId, term.id),
        ),
      )
      .limit(1);
    const live = rollup
      ? await this.rollups.recomputeStudent(principal.institutionId, principal.studentId, subjectId, term.id)
      : null;
    const metrics = live ?? rollup;
    const forecast = computeForecast({
      attended: metrics?.attended ?? 0,
      conducted: metrics?.conducted ?? 0,
      remaining: metrics?.remaining ?? 0,
      thresholdPct: policy.thresholdPct,
      safeMarginPct: policy.safeMarginPct,
    });
    const sessions = await this.listSessions(principal, subjectId, term.id, cursor);
    const [teacher] = await this.db
      .select({ name: sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})` })
      .from(schema.classSubjectTeachers)
      .innerJoin(schema.staff, eq(schema.staff.id, schema.classSubjectTeachers.teacherId))
      .innerJoin(schema.students, eq(schema.students.classId, schema.classSubjectTeachers.classId))
      .where(and(eq(schema.students.id, principal.studentId), eq(schema.classSubjectTeachers.subjectId, subjectId)))
      .limit(1);
    return {
      subjectId,
      subjectName: subject.name,
      teacherName: teacher?.name ?? null,
      rollup: rollup ? this.toLine(rollup, subject.name, policy) : this.emptyLine(policy),
      math: {
        attended: metrics?.attended ?? 0,
        conducted: metrics?.conducted ?? 0,
        remaining: metrics?.remaining ?? 0,
        branch: forecast.branch,
        n: forecast.n,
        nuances: [],
      },
      sessions: sessions.items,
      nextCursor: sessions.nextCursor,
    };
  }

  async coverage(principal: InstitutionalStudentPrincipal, start: string, end: string) {
    await this.assertEnabled(principal);
    const result = await this.rollups.coverageForStudent(principal.institutionId, principal.studentId, start, end);
    const subjects = result.subjectIds.length
      ? await this.db
          .select({ id: schema.subjects.id, name: schema.subjects.name })
          .from(schema.subjects)
          .where(inArray(schema.subjects.id, result.subjectIds))
      : [];
    return { count: result.count, occurrences: result.occurrences, subjects };
  }

  private async listSessions(
    principal: InstitutionalStudentPrincipal,
    subjectId: string,
    termId: string,
    cursor?: string,
  ) {
    const parsed = cursor ? decodeCursor(cursor) : null;
    const rows = await this.db
      .select({
        session: schema.attendanceSessions,
        record: schema.attendanceRecords,
        requestCode: schema.studentRequests.humanCode,
      })
      .from(schema.attendanceSessions)
      .leftJoin(
        schema.attendanceRecords,
        and(
          eq(schema.attendanceRecords.sessionId, schema.attendanceSessions.id),
          eq(schema.attendanceRecords.studentId, principal.studentId),
        ),
      )
      .leftJoin(
        schema.studentRequests,
        sql`${schema.attendanceRecords.provenance}->>'request_id' = ${schema.studentRequests.id}::text`,
      )
      .where(
        and(
          eq(schema.attendanceSessions.institutionId, principal.institutionId),
          eq(schema.attendanceSessions.subjectId, subjectId),
          eq(schema.attendanceSessions.termId, termId),
          parsed
            ? or(
                lt(schema.attendanceSessions.date, parsed.date),
                and(eq(schema.attendanceSessions.date, parsed.date), lt(schema.attendanceSessions.id, parsed.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(schema.attendanceSessions.date), desc(schema.attendanceSessions.id))
      .limit(21);
    const page = rows.slice(0, 20);
    const last = page.at(-1);
    return {
      items: page.map((row) => ({
        id: row.session.id,
        date: row.session.date,
        period: row.session.period,
        startTime: null,
        endTime: null,
        status: row.record?.status ?? null,
        displayStatus: row.record?.status ?? 'not_marked',
        provenance: row.record?.provenance
          ? { ...row.record.provenance, humanCode: row.requestCode ?? undefined }
          : null,
      })),
      nextCursor: rows.length > 20 && last ? encodeCursor(last.session.date, last.session.id) : null,
    };
  }

  private toLine(
    rollup: typeof schema.attendanceRollups.$inferSelect,
    subjectName: string | null,
    policy: { thresholdPct: number; safeMarginPct: number },
  ) {
    const pct = rollup.pct == null ? null : truncateAttendancePctNumber(Number(rollup.pct) * 100);
    const forecast = computeForecast({
      attended: rollup.attended,
      conducted: rollup.conducted,
      remaining: rollup.remaining,
      thresholdPct: policy.thresholdPct,
      safeMarginPct: policy.safeMarginPct,
    });
    return {
      subjectId: rollup.subjectId,
      subjectName,
      attended: rollup.attended,
      conducted: rollup.conducted,
      remaining: rollup.remaining,
      pct,
      zone: rollup.zone,
      forecast: {
        branch: forecast.branch,
        n: forecast.n,
        message: forecast.message,
      },
      updatedAt: rollup.updatedAt.toISOString(),
    };
  }

  private async dayStrip(principal: InstitutionalStudentPrincipal, termId: string) {
    const [term] = await this.db
      .select({ startDate: schema.academicTerms.startDate, endDate: schema.academicTerms.endDate })
      .from(schema.academicTerms)
      .where(eq(schema.academicTerms.id, termId))
      .limit(1);
    if (!term) return [];
    const rows = await this.db
      .select({
        date: schema.attendanceSessions.date,
        status: schema.attendanceRecords.status,
      })
      .from(schema.attendanceRecords)
      .innerJoin(schema.attendanceSessions, eq(schema.attendanceSessions.id, schema.attendanceRecords.sessionId))
      .where(
        and(
          eq(schema.attendanceRecords.studentId, principal.studentId),
          eq(schema.attendanceSessions.institutionId, principal.institutionId),
          gte(schema.attendanceSessions.date, term.startDate),
          lte(schema.attendanceSessions.date, term.endDate),
        ),
      );
    const byDate = new Map<string, { attended: number; conducted: number }>();
    for (const row of rows) {
      if (!row.date) continue;
      const bucket = byDate.get(row.date) ?? { attended: 0, conducted: 0 };
      bucket.conducted += 1;
      if (row.status === 'present' || row.status === 'late' || row.status === 'od') bucket.attended += 1;
      byDate.set(row.date, bucket);
    }
    return [...byDate.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, counts]) => ({ date, ...counts }));
  }

  private emptyLine(policy: { thresholdPct: number }) {
    return {
      subjectId: null,
      subjectName: null,
      attended: 0,
      conducted: 0,
      remaining: 0,
      pct: null,
      zone: 'safe' as const,
      forecast: { branch: 'none', n: 0, message: 'No sessions yet' },
      updatedAt: null,
    };
  }

  private async resolveTerm(institutionId: string, termId?: string) {
    const [term] = await this.db
      .select()
      .from(schema.academicTerms)
      .where(
        termId
          ? and(eq(schema.academicTerms.id, termId), eq(schema.academicTerms.institutionId, institutionId))
          : eq(schema.academicTerms.institutionId, institutionId),
      )
      .orderBy(desc(schema.academicTerms.isCurrent), desc(schema.academicTerms.startDate))
      .limit(1);
    if (!term) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Term not found.' });
    return term;
  }

  private async assertEnabled(principal: InstitutionalStudentPrincipal) {
    const result = await this.features.resolveByKey('student.surface.attendance', {
      institutionId: principal.institutionId,
      campusId: principal.campusId ?? undefined,
      institutionUserId: principal.institutionUserId,
    });
    if (!result.value) {
      throw new ForbiddenException({ code: 'MODULE_DISABLED', module: 'attendance' });
    }
  }
}

function encodeCursor(date: string, id: string) {
  return Buffer.from(`${date}|${id}`).toString('base64url');
}

function decodeCursor(cursor: string) {
  const [date, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (!date || !id) throw new NotFoundException({ code: 'BAD_CURSOR', message: 'Invalid cursor.' });
  return { date, id };
}
