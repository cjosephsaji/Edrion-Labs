import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { Job } from 'bullmq';
import { and, eq, inArray, isNull, runInInstitutionTenant, schema, type Database } from '@edrion/database';
import { resolveTimetable } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import { QueueWorkers } from '../../common/queue/queue.worker';
import { JobTracker } from '../../common/queue/job-tracker.service';
import { TodayNotifyService } from '../student/today/today-notify.service';
import { RedisService } from '../../common/redis/redis.service';

export const TIMETABLE_EXCEPTION_FANOUT_JOB = 'timetable.exception.fanout';

@Injectable()
export class TimetableFanoutProcessor implements OnModuleInit {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly workers: QueueWorkers,
    private readonly tracker: JobTracker,
    private readonly notify: TodayNotifyService,
    private readonly redis: RedisService,
  ) {}

  onModuleInit() {
    this.workers.register(TIMETABLE_EXCEPTION_FANOUT_JOB, (job: Job) =>
      this.tracker.run(TIMETABLE_EXCEPTION_FANOUT_JOB, 'notifications', async () => {
        const data = job.data as {
          kind: 'exception' | 'exception_revoke' | 'builder_edit';
          institutionId: string;
          exceptionId?: string;
          classIds: string[];
          editBatchId?: string;
        };
        const count = await runInInstitutionTenant(this.db, data.institutionId, () =>
          this.handleFanout(data),
        );
        return { itemsProcessed: count };
      }),
    );
  }

  async resolveDay(institutionId: string, classId: string, date: string) {
    const result = resolveTimetable(
      await this.buildResolveInput(institutionId, [classId], date, date),
    );
    return { date, classId, occurrences: result.occurrences };
  }

  private async handleFanout(data: {
    kind: string;
    institutionId: string;
    exceptionId?: string;
    classIds: string[];
    editBatchId?: string;
  }): Promise<number> {
    const students = await this.db
      .select({ id: schema.studentEnrollments.studentId })
      .from(schema.studentEnrollments)
      .where(
        and(
          eq(schema.studentEnrollments.institutionId, data.institutionId),
          inArray(schema.studentEnrollments.classId, data.classIds),
          eq(schema.studentEnrollments.status, 'active'),
        ),
      );
    const studentIds = [...new Set(students.map((row) => row.id).filter(Boolean))] as string[];
    for (const studentId of studentIds) {
      await this.invalidateCache(studentId);
    }

    if (!data.exceptionId) return studentIds.length;

    const [exception] = await this.db
      .select()
      .from(schema.periodExceptions)
      .where(eq(schema.periodExceptions.id, data.exceptionId))
      .limit(1);
    if (!exception) return 0;

    const eventKey =
      data.kind === 'exception_revoke'
        ? `tt:revoke:${exception.id}`
        : `tt:${exception.id}`;
    const title = this.notificationTitle(exception, data.kind === 'exception_revoke');
    let delivered = 0;
    for (const studentId of studentIds) {
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
      if (!student?.institutionUserId) continue;
      const result = await this.notify.dispatch(
        {
          kind: 'institutional',
          institutionId: data.institutionId,
          campusId: student.campusId,
          institutionUserId: student.institutionUserId,
          studentId,
          email: student.email ?? '',
          fullName: student.fullName ?? '',
          lastAuthAt: null,
          permissions: [],
        },
        {
          eventKey: `${eventKey}:${studentId}`,
          type: 'announcement',
          sourceModule: 'timetable',
          title,
          body: exception.note ?? title,
          deepLink: `/timetable?date=${exception.date}`,
        },
      );
      if (result.eventWritten) delivered += 1;
    }
    return delivered;
  }

  private notificationTitle(
    exception: typeof schema.periodExceptions.$inferSelect,
    revoked: boolean,
  ): string {
    if (revoked) return 'Update: your class is back on as scheduled.';
    switch (exception.type) {
      case 'cancelled':
        return 'A class today was cancelled.';
      case 'room_change':
        return `Room change on ${exception.date}.`;
      case 'substitution':
        return `Substitute teacher on ${exception.date}.`;
      case 'extra_class':
        return `Extra class on ${exception.date}.`;
      default:
        return 'Timetable update.';
    }
  }

  private async invalidateCache(studentId: string) {
    const anchor = new Date();
    for (let offset = -14; offset <= 42; offset += 7) {
      const d = new Date(anchor);
      d.setUTCDate(d.getUTCDate() + offset);
      const week = isoWeekKey(d.toISOString().slice(0, 10));
      await this.redis.del(`tt:${studentId}:${week}`);
    }
  }

  private async buildResolveInput(
    institutionId: string,
    classIds: string[],
    from: string,
    to: string,
  ) {
    const [timezoneRow] = await this.db
      .select({ timezone: schema.institutions.timezone })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);

    const slots = await this.db.select().from(schema.timetableSlots).where(
      and(eq(schema.timetableSlots.institutionId, institutionId), inArray(schema.timetableSlots.classId, classIds)),
    );
    const exceptions = await this.db
      .select()
      .from(schema.periodExceptions)
      .where(
        and(
          eq(schema.periodExceptions.institutionId, institutionId),
          inArray(schema.periodExceptions.classId, classIds),
          isNull(schema.periodExceptions.revokedAt),
        ),
      );

    return {
      sectionIds: classIds,
      from,
      to,
      timezone: timezoneRow?.timezone ?? 'UTC',
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
        termStart: null,
        termEnd: null,
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
      holidays: [],
      classSubjectTeachers: [],
      term: null,
      includeExams: false,
    };
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
