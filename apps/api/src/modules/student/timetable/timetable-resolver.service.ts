import { createHash } from 'node:crypto';
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, inArray, isNull, lte, or, schema, sql, type Database } from '@edrion/database';
import {
  resolveTimetable,
  studentTimetableResponseSchema,
  type ResolverException,
  type ResolverExam,
  type ResolverHolidayRange,
  type ResolverSlot,
  type StudentTimetableResponse,
} from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { RedisService } from '../../../common/redis/redis.service';
import { FeatureControlsService } from '../../feature-controls/feature-controls.service';
import { SurfaceGateService } from '../surfaces/surface-gate.service';
import type { StudentPrincipal } from '../student.types';

const CACHE_TTL_SECONDS = 6 * 60 * 60;

@Injectable()
export class TimetableResolverService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly redis: RedisService,
    private readonly features: FeatureControlsService,
    private readonly gate: SurfaceGateService,
  ) {}

  async getStudentTimetable(
    principal: StudentPrincipal,
    from: string,
    to: string,
  ): Promise<{ payload: StudentTimetableResponse; etag: string }> {
    await this.assertTimetableEnabled(principal);
    if (principal.kind !== 'institutional') {
      return this.emptyResponse(from, to);
    }

    const cacheKey = this.cacheKey(principal.studentId, from);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      const parsed = JSON.parse(cached) as { payload: StudentTimetableResponse; etag: string };
      return parsed;
    }

    const payload = await this.resolveForStudent(principal, from, to);
    const etag = this.buildEtag(payload);
    const result = { payload, etag };
    await this.redis.set(cacheKey, JSON.stringify(result), CACHE_TTL_SECONDS);
    return result;
  }

  async getPeriodDetail(principal: StudentPrincipal, occurrenceId: string) {
    const [slotId, date] = occurrenceId.split(':');
    if (!slotId || !date) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Period not found.' });
    }
    const { payload } = await this.getStudentTimetable(principal, date, date);
    const occurrence = payload.occurrences.find((row) => row.id === occurrenceId);
    if (!occurrence) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Period not found.' });
    }
    return { occurrence, note: occurrence.note };
  }

  async resolveForStudent(
    principal: Extract<StudentPrincipal, { kind: 'institutional' }>,
    from: string,
    to: string,
    options?: { includeExams?: boolean },
  ): Promise<StudentTimetableResponse> {
    const sectionIds = await this.resolveSectionIds(principal);
    const [timezone, term, slots, exceptions, holidays, exams, cst, includeExams] = await Promise.all([
      this.institutionTimezone(principal.institutionId),
      this.currentTerm(principal),
      this.loadSlots(principal, sectionIds, from, to),
      this.loadExceptions(principal, sectionIds, from, to),
      this.loadHolidays(principal, from, to),
      this.loadExams(principal, sectionIds, from, to),
      this.loadClassSubjectTeachers(principal, sectionIds),
      this.shouldIncludeExams(principal, options?.includeExams),
    ]);

    const result = resolveTimetable({
      sectionIds,
      from,
      to,
      timezone,
      slots,
      exceptions,
      holidays,
      exams: includeExams ? exams : [],
      classSubjectTeachers: cst,
      term,
      includeExams,
    });

    return studentTimetableResponseSchema.parse({
      occurrences: result.occurrences,
      dayBounds: result.dayBounds,
      published: result.published,
      term: result.term,
    });
  }

  async resolveForClass(
    institutionId: string,
    campusId: string | null,
    classId: string,
    from: string,
    to: string,
  ): Promise<StudentTimetableResponse> {
    const sectionIds = [classId];
    const [timezone, term, slots, exceptions, holidays, cst] = await Promise.all([
      this.institutionTimezone(institutionId),
      this.currentTermForInstitution(institutionId, campusId),
      this.loadSlotsForInstitution(institutionId, sectionIds, from, to),
      this.loadExceptionsForInstitution(institutionId, sectionIds, from, to),
      this.loadHolidaysForInstitution(institutionId, campusId, from, to),
      this.loadClassSubjectTeachersForInstitution(institutionId, sectionIds),
    ]);

    const result = resolveTimetable({
      sectionIds,
      from,
      to,
      timezone,
      slots,
      exceptions,
      holidays,
      classSubjectTeachers: cst,
      term,
      includeExams: false,
    });

    return studentTimetableResponseSchema.parse({
      occurrences: result.occurrences,
      dayBounds: result.dayBounds,
      published: result.published,
      term: result.term,
    });
  }

  async invalidateStudentCache(studentId: string): Promise<void> {
    const anchor = new Date();
    for (let dayOffset = -14; dayOffset <= 42; dayOffset += 7) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() + dayOffset);
      await this.redis.del(this.cacheKey(studentId, d.toISOString().slice(0, 10)));
    }
  }

  private async assertTimetableEnabled(principal: StudentPrincipal): Promise<void> {
    if (principal.kind === 'independent') {
      throw new ForbiddenException({ code: 'MODULE_DISABLED', module: 'timetable' });
    }
    try {
      const resolution = await this.features.resolveByKey('student.surface.timetable', {
        institutionId: principal.institutionId,
        campusId: principal.campusId ?? undefined,
        institutionUserId: principal.institutionUserId,
      });
      if (!resolution.value) {
        throw new ForbiddenException({ code: 'MODULE_DISABLED', module: 'timetable' });
      }
    } catch (error) {
      if (error instanceof NotFoundException) return;
      throw error;
    }
  }

  private async resolveSectionIds(
    principal: Extract<StudentPrincipal, { kind: 'institutional' }>,
  ): Promise<string[]> {
    const term = await this.currentTerm(principal);
    const enrollmentWhere = and(
      eq(schema.studentEnrollments.studentId, principal.studentId),
      eq(schema.studentEnrollments.status, 'active'),
      term?.id
        ? or(
            eq(schema.studentEnrollments.termId, term.id),
            isNull(schema.studentEnrollments.termId),
          )
        : undefined,
    );

    const [enrollment] = await this.db
      .select({ classId: schema.studentEnrollments.classId })
      .from(schema.studentEnrollments)
      .where(enrollmentWhere)
      .orderBy(sql`case when ${schema.studentEnrollments.termId} is not null then 0 else 1 end`)
      .limit(1);

    if (enrollment?.classId) return [enrollment.classId];

    const [student] = await this.db
      .select({ classId: schema.students.classId })
      .from(schema.students)
      .where(eq(schema.students.id, principal.studentId))
      .limit(1);
    return student?.classId ? [student.classId] : [];
  }

  private async currentTerm(
    principal: Extract<StudentPrincipal, { kind: 'institutional' }>,
  ) {
    return this.currentTermForInstitution(principal.institutionId, principal.campusId);
  }

  private async currentTermForInstitution(institutionId: string, campusId: string | null) {
    const [term] = await this.db
      .select({
        id: schema.academicTerms.id,
        name: schema.academicTerms.name,
        startDate: schema.academicTerms.startDate,
        endDate: schema.academicTerms.endDate,
      })
      .from(schema.academicTerms)
      .where(
        and(
          eq(schema.academicTerms.institutionId, institutionId),
          eq(schema.academicTerms.isCurrent, true),
          campusId
            ? or(eq(schema.academicTerms.campusId, campusId), isNull(schema.academicTerms.campusId))
            : undefined,
        ),
      )
      .limit(1);
    if (!term) return null;
    return {
      id: term.id,
      name: term.name,
      startDate: term.startDate,
      endDate: term.endDate,
    };
  }

  private async institutionTimezone(institutionId: string): Promise<string> {
    const [row] = await this.db
      .select({ timezone: schema.institutions.timezone })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    return row?.timezone ?? 'UTC';
  }

  private async shouldIncludeExams(
    principal: Extract<StudentPrincipal, { kind: 'institutional' }>,
    override?: boolean,
  ): Promise<boolean> {
    if (override === false) return false;
    try {
      await this.gate.assertSurface(principal, 'exams');
      return true;
    } catch {
      return false;
    }
  }

  private async loadSlots(
    principal: Extract<StudentPrincipal, { kind: 'institutional' }>,
    sectionIds: string[],
    from: string,
    to: string,
  ): Promise<ResolverSlot[]> {
    void from;
    void to;
    return this.loadSlotsForInstitution(principal.institutionId, sectionIds, from, to);
  }

  private async loadSlotsForInstitution(
    institutionId: string,
    sectionIds: string[],
    _from: string,
    _to: string,
  ): Promise<ResolverSlot[]> {
    if (!sectionIds.length) return [];
    const teacherName = sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`;
    const rows = await this.db
      .select({
        id: schema.timetableSlots.id,
        classId: schema.timetableSlots.classId,
        subjectId: schema.timetableSlots.subjectId,
        subjectName: schema.subjects.name,
        teacherId: schema.timetableSlots.teacherId,
        teacherName,
        label: schema.timetableSlots.label,
        dayOfWeek: schema.timetableSlots.dayOfWeek,
        startTime: schema.timetableSlots.startTime,
        endTime: schema.timetableSlots.endTime,
        kind: schema.timetableSlots.kind,
        room: schema.timetableSlots.room,
        effectiveFrom: schema.timetableSlots.effectiveFrom,
        effectiveTo: schema.timetableSlots.effectiveTo,
        termStart: schema.academicTerms.startDate,
        termEnd: schema.academicTerms.endDate,
        updatedAt: schema.timetableSlots.updatedAt,
      })
      .from(schema.timetableSlots)
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.timetableSlots.subjectId))
      .leftJoin(schema.staff, eq(schema.staff.id, schema.timetableSlots.teacherId))
      .leftJoin(schema.academicTerms, eq(schema.academicTerms.id, schema.timetableSlots.termId))
      .where(
        and(
          eq(schema.timetableSlots.institutionId, institutionId),
          inArray(schema.timetableSlots.classId, sectionIds),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      classId: row.classId,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      teacherId: row.teacherId,
      teacherName: row.teacherName,
      label: row.label,
      dayOfWeek: row.dayOfWeek,
      startTime: row.startTime,
      endTime: row.endTime,
      kind: row.kind as ResolverSlot['kind'],
      room: row.room,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      termStart: row.termStart,
      termEnd: row.termEnd,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async loadExceptions(
    principal: Extract<StudentPrincipal, { kind: 'institutional' }>,
    sectionIds: string[],
    from: string,
    to: string,
  ): Promise<ResolverException[]> {
    return this.loadExceptionsForInstitution(principal.institutionId, sectionIds, from, to);
  }

  private async loadExceptionsForInstitution(
    institutionId: string,
    sectionIds: string[],
    from: string,
    to: string,
  ): Promise<ResolverException[]> {
    if (!sectionIds.length) return [];
    const teacherName = sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`;
    const rows = await this.db
      .select({
        id: schema.periodExceptions.id,
        slotId: schema.periodExceptions.slotId,
        classId: schema.periodExceptions.classId,
        date: schema.periodExceptions.date,
        recurring: schema.periodExceptions.recurring,
        recurringUntil: schema.periodExceptions.recurringUntil,
        type: schema.periodExceptions.type,
        newRoom: schema.periodExceptions.newRoom,
        newTeacherId: schema.periodExceptions.newTeacherId,
        newTeacherName: teacherName,
        subjectId: schema.periodExceptions.subjectId,
        subjectName: schema.subjects.name,
        startTime: schema.periodExceptions.startTime,
        endTime: schema.periodExceptions.endTime,
        note: schema.periodExceptions.note,
        createdAt: schema.periodExceptions.createdAt,
      })
      .from(schema.periodExceptions)
      .leftJoin(schema.staff, eq(schema.staff.id, schema.periodExceptions.newTeacherId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.periodExceptions.subjectId))
      .where(
        and(
          eq(schema.periodExceptions.institutionId, institutionId),
          inArray(schema.periodExceptions.classId, sectionIds),
          isNull(schema.periodExceptions.revokedAt),
          lte(schema.periodExceptions.date, to),
          or(
            gte(schema.periodExceptions.date, from),
            and(
              eq(schema.periodExceptions.recurring, true),
              gte(schema.periodExceptions.recurringUntil, from),
            ),
          ),
        ),
      );

    return rows.map((row) => ({
      id: row.id,
      slotId: row.slotId,
      classId: row.classId,
      date: row.date,
      recurring: row.recurring,
      recurringUntil: row.recurringUntil,
      type: row.type as ResolverException['type'],
      newRoom: row.newRoom,
      newTeacherId: row.newTeacherId,
      newTeacherName: row.newTeacherName,
      subjectId: row.subjectId,
      subjectName: row.subjectName,
      startTime: row.startTime,
      endTime: row.endTime,
      note: row.note,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  private async loadHolidays(
    principal: Extract<StudentPrincipal, { kind: 'institutional' }>,
    from: string,
    to: string,
  ): Promise<ResolverHolidayRange[]> {
    return this.loadHolidaysForInstitution(principal.institutionId, principal.campusId, from, to);
  }

  private async loadHolidaysForInstitution(
    institutionId: string,
    campusId: string | null,
    from: string,
    to: string,
  ): Promise<ResolverHolidayRange[]> {
    const rows = await this.db
      .select({
        startsOn: schema.calendarEvents.startsOn,
        endsOn: schema.calendarEvents.endsOn,
      })
      .from(schema.calendarEvents)
      .innerJoin(
        schema.calendarEventTypes,
        eq(schema.calendarEventTypes.id, schema.calendarEvents.eventTypeId),
      )
      .where(
        and(
          eq(schema.calendarEvents.institutionId, institutionId),
          eq(schema.calendarEvents.status, 'published'),
          eq(schema.calendarEventTypes.key, 'holiday'),
          lte(schema.calendarEvents.startsOn, to),
          or(isNull(schema.calendarEvents.endsOn), gte(schema.calendarEvents.endsOn, from)),
          campusId
            ? or(eq(schema.calendarEvents.campusId, campusId), isNull(schema.calendarEvents.campusId))
            : undefined,
        ),
      );
    return rows.map((row) => ({ startsOn: row.startsOn, endsOn: row.endsOn }));
  }

  private async loadExams(
    _principal: Extract<StudentPrincipal, { kind: 'institutional' }>,
    sectionIds: string[],
    from: string,
    to: string,
  ): Promise<ResolverExam[]> {
    if (!sectionIds.length) return [];
    const rows = await this.db
      .select({
        id: schema.examSchedules.id,
        classId: schema.examSchedules.classId,
        subjectId: schema.examSchedules.subjectId,
        subjectName: schema.subjects.name,
        examDate: schema.examSchedules.examDate,
        startTime: schema.examSchedules.startTime,
        endTime: schema.examSchedules.endTime,
        room: schema.examSchedules.room,
        updatedAt: schema.examSchedules.updatedAt,
      })
      .from(schema.examSchedules)
      .leftJoin(schema.subjects, eq(schema.subjects.id, schema.examSchedules.subjectId))
      .where(
        and(
          inArray(schema.examSchedules.classId, sectionIds),
          eq(schema.examSchedules.published, true),
          gte(schema.examSchedules.examDate, from),
          lte(schema.examSchedules.examDate, to),
        ),
      );
    return rows
      .filter((row) => row.examDate && row.startTime && row.endTime)
      .map((row) => ({
      id: row.id,
      classId: row.classId,
      subjectId: row.subjectId,
      subjectName: row.subjectName ?? 'Exam',
      examDate: row.examDate!,
      startTime: row.startTime!,
      endTime: row.endTime!,
      room: row.room,
      updatedAt: row.updatedAt.toISOString(),
    }));
  }

  private async loadClassSubjectTeachers(
    principal: Extract<StudentPrincipal, { kind: 'institutional' }>,
    sectionIds: string[],
  ) {
    return this.loadClassSubjectTeachersForInstitution(principal.institutionId, sectionIds);
  }

  private async loadClassSubjectTeachersForInstitution(institutionId: string, sectionIds: string[]) {
    if (!sectionIds.length) return [];
    const teacherName = sql<string>`concat_ws(' ', ${schema.staff.firstName}, ${schema.staff.lastName})`;
    const rows = await this.db
      .select({
        classId: schema.classSubjectTeachers.classId,
        subjectId: schema.classSubjectTeachers.subjectId,
        teacherId: schema.classSubjectTeachers.teacherId,
        teacherName,
      })
      .from(schema.classSubjectTeachers)
      .innerJoin(schema.staff, eq(schema.staff.id, schema.classSubjectTeachers.teacherId))
      .where(
        and(
          eq(schema.classSubjectTeachers.institutionId, institutionId),
          inArray(schema.classSubjectTeachers.classId, sectionIds),
        ),
      );
    return rows
      .filter((row) => row.teacherId)
      .map((row) => ({
        classId: row.classId,
        subjectId: row.subjectId,
        teacherId: row.teacherId!,
        teacherName: row.teacherName,
      }));
  }

  private cacheKey(studentId: string, from: string): string {
    const week = isoWeekKey(from);
    return `tt:${studentId}:${week}`;
  }

  private buildEtag(payload: StudentTimetableResponse): string {
    const digest = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    return `"${digest}"`;
  }

  private emptyResponse(_from: string, _to: string): { payload: StudentTimetableResponse; etag: string } {
    const payload: StudentTimetableResponse = {
      occurrences: [],
      dayBounds: { earliestStart: '08:00', latestEnd: '16:00' },
      published: false,
      term: null,
    };
    return { payload, etag: this.buildEtag(payload) };
  }
}

function isoWeekKey(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
