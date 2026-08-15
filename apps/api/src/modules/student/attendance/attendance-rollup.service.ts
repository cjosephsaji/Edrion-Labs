import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gte,
  isNull,
  lte,
  or,
  runInInstitutionTenant,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import type { AttendanceForecast } from '@edrion/database';
import {
  computeForecast,
  computeRemainingSessions,
  countAttended,
  countsTowardConducted,
  excludesFromConductedDenominator,
  formatAttendancePct,
  type AttendanceMarkStatus,
  type AttendancePolicyValues,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { AttendancePolicyService } from '../../portal/attendance-policy.service';
import { TodayNotifyService } from '../today/today-notify.service';
import { institutionNow } from '../../portal/institution-clock';
import { isDownwardZoneCrossing, attendanceZoneEventKey } from './attendance-zone';

const ZONE_RANK: Record<string, number> = {
  safe: 4,
  warning: 3,
  below: 2,
  unrecoverable: 1,
};

@Injectable()
export class AttendanceRollupService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly policyService: AttendancePolicyService,
    private readonly notify: TodayNotifyService,
  ) {}

  async enqueueStudentSubject(institutionId: string, studentId: string, subjectId: string | null, termId: string) {
    return { institutionId, studentId, subjectId, termId };
  }

  async recomputeStudent(
    institutionId: string,
    studentId: string,
    subjectId: string | null,
    termId: string,
  ) {
    return runInInstitutionTenant(this.db, institutionId, async () => {
      const context = await this.buildStudentContext(institutionId, studentId, termId);
      if (!context) return null;
      const policy = await this.policyService.resolvePolicyValues(institutionId, context.campusId);
      if (subjectId === null) {
        return this.recomputeOverall(institutionId, studentId, termId, context, policy);
      }
      return this.recomputeSubject(institutionId, studentId, subjectId, termId, context, policy);
    });
  }

  async rebuildInstitution(institutionId: string) {
    const students = await this.db
      .select({ id: schema.students.id })
      .from(schema.students)
      .where(eq(schema.students.institutionId, institutionId));
    let count = 0;
    for (const student of students) {
      const context = await this.buildStudentContext(institutionId, student.id, null);
      if (!context?.termId) continue;
      const subjects = await this.subjectIdsForStudent(institutionId, student.id, context.classId);
      for (const subject of subjects) {
        await this.recomputeStudent(institutionId, student.id, subject, context.termId);
        count += 1;
      }
      await this.recomputeStudent(institutionId, student.id, null, context.termId);
      count += 1;
    }
    return count;
  }

  async coverageForStudent(institutionId: string, studentId: string, start: string, end: string) {
    const context = await this.buildStudentContext(institutionId, studentId, null);
    if (!context) return { count: 0, occurrences: [] as Array<{ date: string; slotId: string }>, subjectIds: [] as string[] };
    const policy = await this.policyService.resolvePolicyValues(institutionId, context.campusId);
    const subjectIds = await this.subjectIdsForStudent(institutionId, studentId, context.classId);
    const occurrences: Array<{ date: string; slotId: string }> = [];
    for (const subjectId of subjectIds) {
      const result = computeRemainingSessions({
        subjectId,
        sectionIds: [context.classId],
        from: start,
        termEnd: end,
        timezone: context.timezone,
        slots: context.slots.filter((slot) => slot.subjectId === subjectId),
        holidays: context.holidays,
        exceptions: context.exceptions,
        workingDaysMask: policy.workingDaysMask,
        classSubjectTeachers: context.classSubjectTeachers,
        term: { id: context.termId, startDate: context.termStart, endDate: context.termEnd },
      });
      occurrences.push(...result.occurrences);
    }
    return { count: occurrences.length, occurrences, subjectIds };
  }

  private async recomputeSubject(
    institutionId: string,
    studentId: string,
    subjectId: string,
    termId: string,
    context: StudentContext,
    policy: AttendancePolicyValues,
  ) {
    const metrics = await this.computeMetrics(institutionId, studentId, subjectId, context, policy);
    const forecast = computeForecast({
      attended: metrics.attended,
      conducted: metrics.conducted,
      remaining: metrics.remaining,
      thresholdPct: policy.thresholdPct,
      safeMarginPct: policy.safeMarginPct,
    });
    const prior = await this.findRollup(studentId, subjectId, termId);
    const pct = metrics.conducted > 0 ? metrics.attended / metrics.conducted : null;
    const row = await this.upsertRollup({
      institutionId,
      studentId,
      subjectId,
      termId,
      attended: metrics.attended,
      conducted: metrics.conducted,
      remaining: metrics.remaining,
      pct: pct == null ? null : String(pct),
      forecast: { branch: forecast.branch, n: forecast.n },
      zone: forecast.zone,
      recoveredToastPending:
        prior && (ZONE_RANK[forecast.zone] ?? 0) > (ZONE_RANK[prior.zone] ?? 0)
          ? true
          : prior?.recoveredToastPending ?? false,
    });
    await this.detectZoneCrossing(institutionId, studentId, subjectId, termId, prior?.zone ?? null, forecast, policy, metrics.subjectName);
    return row;
  }

  private async recomputeOverall(
    institutionId: string,
    studentId: string,
    termId: string,
    context: StudentContext,
    policy: AttendancePolicyValues,
  ) {
    const subjects = await this.subjectIdsForStudent(institutionId, studentId, context.classId);
    let attended = 0;
    let conducted = 0;
    let remaining = 0;
    for (const subjectId of subjects) {
      const metrics = await this.computeMetrics(institutionId, studentId, subjectId, context, policy);
      attended += metrics.attended;
      conducted += metrics.conducted;
      remaining += metrics.remaining;
    }
    const forecast = computeForecast({
      attended,
      conducted,
      remaining,
      thresholdPct: policy.thresholdPct,
      safeMarginPct: policy.safeMarginPct,
    });
    const prior = await this.findRollup(studentId, null, termId);
    const pct = conducted > 0 ? attended / conducted : null;
    return this.upsertRollup({
      institutionId,
      studentId,
      subjectId: null,
      termId,
      attended,
      conducted,
      remaining,
      pct: pct == null ? null : String(pct),
      forecast: { branch: forecast.branch, n: forecast.n },
      zone: forecast.zone,
      recoveredToastPending:
        prior && (ZONE_RANK[forecast.zone] ?? 0) > (ZONE_RANK[prior.zone] ?? 0)
          ? true
          : prior?.recoveredToastPending ?? false,
    });
  }

  private async computeMetrics(
    institutionId: string,
    studentId: string,
    subjectId: string,
    context: StudentContext,
    policy: AttendancePolicyValues,
  ) {
    const sessions = await this.db
      .select({
        session: schema.attendanceSessions,
        record: schema.attendanceRecords,
        subjectName: schema.subjects.name,
      })
      .from(schema.attendanceSessions)
      .leftJoin(
        schema.attendanceRecords,
        and(
          eq(schema.attendanceRecords.sessionId, schema.attendanceSessions.id),
          eq(schema.attendanceRecords.studentId, studentId),
        ),
      )
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.attendanceSessions.subjectId))
      .where(
        and(
          eq(schema.attendanceSessions.institutionId, institutionId),
          eq(schema.attendanceSessions.termId, context.termId),
          eq(schema.attendanceSessions.classId, context.classId),
          eq(schema.attendanceSessions.subjectId, subjectId),
          lte(schema.attendanceSessions.date, context.today),
        ),
      );

    const cancelledKeys = await this.cancelledSessionKeys(institutionId, context.classId, context.termStart, context.termEnd);
    let attended = 0;
    let conducted = 0;
    let subjectName: string | null = null;

    for (const row of sessions) {
      subjectName = row.subjectName ?? subjectName;
      const slotKey = row.session.slotId ? `${row.session.date}:${row.session.slotId}` : `${row.session.date}:full`;
      if (cancelledKeys.has(slotKey)) continue;
      const marked = !!row.record;
      const status = (row.record?.status ?? null) as AttendanceMarkStatus | null;
      const mark = { marked, cancelled: false, status: status ?? 'absent' };
      if (!countsTowardConducted(mark, policy)) continue;
      if (status && excludesFromConductedDenominator(status, policy)) continue;
      conducted += 1;
      if (status && countAttended(status, policy)) attended += 1;
    }

    const remainingResult = computeRemainingSessions({
      subjectId,
      sectionIds: [context.classId],
      from: context.tomorrow,
      termEnd: context.termEnd,
      timezone: context.timezone,
      slots: context.slots.filter((slot) => slot.subjectId === subjectId),
      holidays: context.holidays,
      exceptions: context.exceptions,
      workingDaysMask: policy.workingDaysMask,
      classSubjectTeachers: context.classSubjectTeachers,
      term: { id: context.termId, startDate: context.termStart, endDate: context.termEnd },
    });

    return {
      attended,
      conducted,
      remaining: remainingResult.count,
      subjectName,
    };
  }

  private async buildStudentContext(
    institutionId: string,
    studentId: string,
    termId: string | null,
  ): Promise<StudentContext | null> {
    const [student] = await this.db
      .select({
        campusId: schema.students.campusId,
        classId: schema.students.classId,
      })
      .from(schema.students)
      .where(and(eq(schema.students.id, studentId), eq(schema.students.institutionId, institutionId)))
      .limit(1);
    if (!student?.classId) return null;

    const [term] = await this.db
      .select()
      .from(schema.academicTerms)
      .where(
        termId
          ? and(eq(schema.academicTerms.id, termId), eq(schema.academicTerms.institutionId, institutionId))
          : eq(schema.academicTerms.institutionId, institutionId),
      )
      .orderBy(desc(schema.academicTerms.startDate))
      .limit(1);
    if (!term) return null;

    const [institution] = await this.db
      .select({ timezone: schema.institutions.timezone })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    const timezone = institution?.timezone ?? 'UTC';
    const wall = institutionNow(timezone);
    const slots = await this.db.select().from(schema.timetableSlots).where(
      and(eq(schema.timetableSlots.institutionId, institutionId), eq(schema.timetableSlots.classId, student.classId)),
    );
    const exceptions = await this.db
      .select()
      .from(schema.periodExceptions)
      .where(
        and(
          eq(schema.periodExceptions.institutionId, institutionId),
          eq(schema.periodExceptions.classId, student.classId),
          isNull(schema.periodExceptions.revokedAt),
        ),
      );
    const holidays = await this.db
      .select({ startsOn: schema.calendarEvents.startsOn, endsOn: schema.calendarEvents.endsOn })
      .from(schema.calendarEvents)
      .innerJoin(schema.calendarEventTypes, eq(schema.calendarEventTypes.id, schema.calendarEvents.eventTypeId))
      .where(
        and(
          eq(schema.calendarEvents.institutionId, institutionId),
          eq(schema.calendarEventTypes.key, 'holiday'),
          lte(schema.calendarEvents.startsOn, term.endDate),
          or(isNull(schema.calendarEvents.endsOn), gte(schema.calendarEvents.endsOn, term.startDate)),
        ),
      );

    return {
      campusId: student.campusId,
      classId: student.classId,
      termId: term.id,
      termStart: term.startDate,
      termEnd: term.endDate,
      today: wall.date,
      tomorrow: addDays(wall.date, 1),
      timezone,
      slots: slots.map((row) => ({
        id: row.id,
        classId: row.classId,
        subjectId: row.subjectId,
        subjectName: null,
        teacherId: row.teacherId,
        teacherName: null,
        label: row.label,
        dayOfWeek: row.dayOfWeek,
        startTime: row.startTime,
        endTime: row.endTime,
        kind: row.kind as 'teaching' | 'break' | 'lunch',
        room: row.room,
        effectiveFrom: row.effectiveFrom,
        effectiveTo: row.effectiveTo,
        termStart: term.startDate,
        termEnd: term.endDate,
        updatedAt: row.updatedAt.toISOString(),
      })),
      exceptions: exceptions.map((row) => ({
        id: row.id,
        slotId: row.slotId,
        classId: row.classId,
        date: row.date,
        recurring: row.recurring,
        recurringUntil: row.recurringUntil,
        type: row.type as 'cancelled' | 'room_change' | 'substitution' | 'extra_class',
        newRoom: row.newRoom,
        newTeacherId: row.newTeacherId,
        newTeacherName: null,
        subjectId: row.subjectId,
        subjectName: null,
        startTime: row.startTime,
        endTime: row.endTime,
        note: row.note,
        createdAt: row.createdAt.toISOString(),
      })),
      holidays: holidays.flatMap((row) => expandDates(row.startsOn, row.endsOn ?? row.startsOn, term.startDate, term.endDate)),
      classSubjectTeachers: await this.loadClassSubjectTeachers(institutionId, student.classId),
    };
  }

  private async loadClassSubjectTeachers(institutionId: string, classId: string) {
    const rows = await this.db
      .select({
        classId: schema.classSubjectTeachers.classId,
        subjectId: schema.classSubjectTeachers.subjectId,
        teacherId: schema.classSubjectTeachers.teacherId,
        teacherName: sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`,
      })
      .from(schema.classSubjectTeachers)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.classSubjectTeachers.teacherId))
      .where(
        and(
          eq(schema.classSubjectTeachers.institutionId, institutionId),
          eq(schema.classSubjectTeachers.classId, classId),
        ),
      );
    return rows
      .filter((row) => row.teacherId)
      .map((row) => ({
        classId: row.classId,
        subjectId: row.subjectId,
        teacherId: row.teacherId!,
        teacherName: row.teacherName ?? 'Unassigned',
      }));
  }

  private async cancelledSessionKeys(
    institutionId: string,
    classId: string,
    from: string,
    to: string,
  ): Promise<Set<string>> {
    const rows = await this.db
      .select({ date: schema.periodExceptions.date, slotId: schema.periodExceptions.slotId })
      .from(schema.periodExceptions)
      .where(
        and(
          eq(schema.periodExceptions.institutionId, institutionId),
          eq(schema.periodExceptions.classId, classId),
          eq(schema.periodExceptions.type, 'cancelled'),
          isNull(schema.periodExceptions.revokedAt),
          gte(schema.periodExceptions.date, from),
          lte(schema.periodExceptions.date, to),
        ),
      );
    return new Set(rows.map((row) => (row.slotId ? `${row.date}:${row.slotId}` : `${row.date}:full`)));
  }

  private async subjectIdsForStudent(institutionId: string, _studentId: string, classId: string) {
    const rows = await this.db
      .select({ subjectId: schema.classSubjectTeachers.subjectId })
      .from(schema.classSubjectTeachers)
      .where(and(eq(schema.classSubjectTeachers.institutionId, institutionId), eq(schema.classSubjectTeachers.classId, classId)));
    return [...new Set(rows.map((row) => row.subjectId))];
  }

  private async findRollup(studentId: string, subjectId: string | null, termId: string) {
    const [row] = await this.db
      .select()
      .from(schema.attendanceRollups)
      .where(
        subjectId
          ? and(
              eq(schema.attendanceRollups.studentId, studentId),
              eq(schema.attendanceRollups.subjectId, subjectId),
              eq(schema.attendanceRollups.termId, termId),
            )
          : and(
              eq(schema.attendanceRollups.studentId, studentId),
              isNull(schema.attendanceRollups.subjectId),
              eq(schema.attendanceRollups.termId, termId),
            ),
      )
      .limit(1);
    return row;
  }

  private async upsertRollup(values: {
    institutionId: string;
    studentId: string;
    subjectId: string | null;
    termId: string;
    attended: number;
    conducted: number;
    remaining: number;
    pct: string | null;
    forecast: AttendanceForecast;
    zone: 'safe' | 'warning' | 'below' | 'unrecoverable';
    recoveredToastPending: boolean;
  }) {
    const existing = await this.findRollup(values.studentId, values.subjectId, values.termId);
    if (!existing) {
      const [created] = await this.db.insert(schema.attendanceRollups).values(values).returning();
      return created!;
    }
    const [updated] = await this.db
      .update(schema.attendanceRollups)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(schema.attendanceRollups.id, existing.id))
      .returning();
    return updated!;
  }

  private async detectZoneCrossing(
    institutionId: string,
    studentId: string,
    subjectId: string | null,
    termId: string,
    priorZone: string | null,
    forecast: ReturnType<typeof computeForecast>,
    policy: AttendancePolicyValues,
    subjectName: string | null,
  ) {
    if (!isDownwardZoneCrossing(priorZone, forecast.zone)) return;
    const [student] = await this.db
      .select({
        campusId: schema.students.campusId,
        institutionUserId: schema.students.institutionUserId,
        email: schema.institutionUsers.email,
        fullName: schema.institutionUsers.fullName,
      })
      .from(schema.students)
      .leftJoin(schema.institutionUsers, eq(schema.institutionUsers.id, schema.students.institutionUserId))
      .where(eq(schema.students.id, studentId))
      .limit(1);
    if (!student?.institutionUserId) return;
    const label = subjectName ?? 'Overall';
    const pctLabel = formatAttendancePct(forecast.currentPct) ?? '—';
    const today = new Date().toISOString().slice(0, 10);
    const zone = forecast.zone;
    const eventKey = attendanceZoneEventKey(studentId, subjectId, termId, zone, today);
    const deepLink = subjectId ? `/attendance/${subjectId}` : '/attendance';
    let body = '';
    if (zone === 'warning') {
      body =
        forecast.branch === 'can_miss' && forecast.n > 0
          ? `${label} slipped to ${pctLabel} — you can miss ${forecast.n} more.`
          : `${label} slipped to ${pctLabel} — attend the next ${forecast.n} to stay safe.`;
    } else if (zone === 'below') {
      body = `${label} is at ${pctLabel} — attend the next ${forecast.n} in a row to get back to ${policy.thresholdPct}%.`;
    } else if (zone === 'unrecoverable') {
      body = `${label}: ${policy.thresholdPct}% isn't reachable this term. Tap to see your options.`;
    } else {
      return;
    }
    await this.notify.dispatch(
      {
        kind: 'institutional',
        institutionId,
        campusId: student.campusId,
        institutionUserId: student.institutionUserId,
        studentId,
        email: student.email ?? '',
        fullName: student.fullName ?? '',
        lastAuthAt: null,
        permissions: [],
      },
      {
        eventKey,
        type: 'nudge',
        sourceModule: 'attendance',
        title: label,
        body,
        deepLink,
      },
    );
  }
}

type StudentContext = {
  campusId: string | null;
  classId: string;
  termId: string;
  termStart: string;
  termEnd: string;
  today: string;
  tomorrow: string;
  timezone: string;
  slots: Array<{
    id: string;
    classId: string;
    subjectId: string | null;
    subjectName: string | null;
    teacherId: string | null;
    teacherName: string | null;
    label: string | null;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    kind: 'teaching' | 'break' | 'lunch';
    room: string | null;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    termStart: string;
    termEnd: string;
    updatedAt: string;
  }>;
  exceptions: Array<{
    id: string;
    slotId: string | null;
    classId: string;
    date: string;
    recurring: boolean;
    recurringUntil: string | null;
    type: 'cancelled' | 'room_change' | 'substitution' | 'extra_class';
    newRoom: string | null;
    newTeacherId: string | null;
    newTeacherName: string | null;
    subjectId: string | null;
    subjectName: string | null;
    startTime: string | null;
    endTime: string | null;
    note: string | null;
    createdAt: string;
  }>;
  holidays: string[];
  classSubjectTeachers: Array<{ classId: string; subjectId: string; teacherId: string; teacherName: string }>;
};

function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d! + days));
  return date.toISOString().slice(0, 10);
}

function expandDates(start: string, end: string, min: string, max: string): string[] {
  const out: string[] = [];
  let cursor = start < min ? min : start;
  const last = end > max ? max : end;
  while (cursor <= last) {
    out.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return out;
}
