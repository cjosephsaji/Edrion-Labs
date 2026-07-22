import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, isNull, schema, type Database } from '@edrion/database';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { CreatePeriodExceptionInput, PortalTimetableDayQuery, RevokePeriodExceptionInput } from '@edrion/schemas';
import { can } from '@edrion/permissions';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import { IdempotencyService } from '../../common/idempotency.service';
import { JobsService } from '../../common/queue/jobs.service';
import type { PortalActionContext } from './portal-action-context';
import { basePortalAudit } from './portal-action-context';
import { TIMETABLE_EXCEPTION_FANOUT_JOB } from './timetable-fanout.processor';
import { resolveTimetable } from '@edrion/schemas';

const MODULE = 'portal-timetable';

@Injectable()
export class TimetableExceptionsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly idempotency: IdempotencyService,
    private readonly jobs: JobsService,
  ) {}

  async dayView(ctx: PortalActionContext, query: PortalTimetableDayQuery) {
    await this.assertCanView(ctx);
    const input = await this.buildResolveInput(ctx.principal.institutionId, [query.classId], query.date, query.date);
    const result = resolveTimetable(input);
    return { date: query.date, classId: query.classId, occurrences: result.occurrences };
  }

  async create(
    ctx: PortalActionContext,
    input: CreatePeriodExceptionInput,
    idempotencyKey: string | undefined,
  ) {
    const result = await this.idempotency.run(idempotencyKey, 'timetable_exception_create', async () => {
      const row = await this.createException(ctx, input);
      return row as Record<string, unknown>;
    });
    return { ...result.result, replayed: result.replayed };
  }

  async revoke(
    ctx: PortalActionContext,
    id: string,
    input: RevokePeriodExceptionInput,
  ) {
    const row = await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(schema.periodExceptions)
        .where(
          and(
            eq(schema.periodExceptions.id, id),
            eq(schema.periodExceptions.institutionId, ctx.principal.institutionId),
            isNull(schema.periodExceptions.revokedAt),
          ),
        )
        .limit(1);
      if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Exception not found.' });
      await this.assertCanManageOccurrence(ctx, existing);
      const [updated] = await tx
        .update(schema.periodExceptions)
        .set({
          revokedAt: new Date(),
          revokedBy: ctx.principal.institutionUserId,
          revokedReason: input.reason,
          version: input.version + 1,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(schema.periodExceptions.id, id),
            eq(schema.periodExceptions.version, input.version),
          ),
        )
        .returning();
      if (!updated) throw this.versionConflict();
      await this.audit.logAudit({
        ...basePortalAudit(ctx),
        action: 'timetable.exception_revoked',
        module: MODULE,
        entityType: 'period_exception',
        entityId: id,
        campusId: updated.campusId,
        payload: { exception_id: id, type: updated.type, class_id: updated.classId, date: updated.date, recurring: updated.recurring },
      } as AuditEventInput);
      return updated;
    });

    await this.jobs.enqueue(
      'notifications',
      TIMETABLE_EXCEPTION_FANOUT_JOB,
      { kind: 'exception_revoke', institutionId: ctx.principal.institutionId, exceptionId: row.id, classIds: [row.classId] },
      { jobId: `tt-fanout:revoke:${row.id}` },
    );
    return row;
  }

  private async createException(ctx: PortalActionContext, input: CreatePeriodExceptionInput) {
    const [classRow] = await this.db
      .select({ campusId: schema.classes.campusId })
      .from(schema.classes)
      .where(and(eq(schema.classes.id, input.classId), eq(schema.classes.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!classRow) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: 'Unknown class.' });
    const campusId =
      classRow.campusId ??
      (ctx.scope.mode === 'campus' ? ctx.scope.campusId : null);
    if (!campusId) {
      throw new BadRequestException({ code: 'CAMPUS_REQUIRED', message: 'Class campus is required for exceptions.' });
    }

    await this.assertCanManageOccurrence(ctx, { classId: input.classId, slotId: input.slotId ?? null });

    if (input.slotId) {
      const [slot] = await this.db
        .select()
        .from(schema.timetableSlots)
        .where(and(eq(schema.timetableSlots.id, input.slotId), eq(schema.timetableSlots.classId, input.classId)))
        .limit(1);
      if (!slot) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: 'Unknown slot.' });
      await this.assertCanManageOccurrence(ctx, { slotId: slot.id, classId: slot.classId });
      if (slot.dayOfWeek !== weekdayForDate(input.date)) {
        throw new BadRequestException({ code: 'DATE_WEEKDAY_MISMATCH', message: 'Date does not match the slot weekday.' });
      }
    } else if (input.type !== 'extra_class') {
      throw new BadRequestException({ code: 'SLOT_REQUIRED', message: 'slotId is required for this exception type.' });
    }

    if (input.type === 'extra_class' && input.slotId) {
      throw new BadRequestException({ code: 'INVALID_EXTRA_CLASS', message: 'extra_class cannot reference a slot.' });
    }

    const row = await this.db.transaction(async (tx) => {
      const sameType = input.slotId
        ? await tx
            .select()
            .from(schema.periodExceptions)
            .where(
              and(
                eq(schema.periodExceptions.institutionId, ctx.principal.institutionId),
                eq(schema.periodExceptions.slotId, input.slotId!),
                eq(schema.periodExceptions.type, input.type),
                isNull(schema.periodExceptions.revokedAt),
              ),
            )
        : [];
      for (const prior of sameType) {
        await tx
          .update(schema.periodExceptions)
          .set({
            revokedAt: new Date(),
            revokedBy: ctx.principal.institutionUserId,
            revokedReason: 'superseded',
            version: prior.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(schema.periodExceptions.id, prior.id));
      }

      const [inserted] = await tx
        .insert(schema.periodExceptions)
        .values({
          institutionId: ctx.principal.institutionId,
          campusId,
          slotId: input.slotId ?? null,
          classId: input.classId,
          date: input.date,
          recurring: input.recurring,
          recurringUntil: input.recurringUntil ?? null,
          type: input.type,
          newRoom: input.newRoom ?? null,
          newTeacherId: input.newTeacherId ?? null,
          subjectId: input.subjectId ?? null,
          startTime: input.startTime ?? null,
          endTime: input.endTime ?? null,
          note: input.note ?? null,
          createdBy: ctx.principal.institutionUserId,
        })
        .returning();
      await this.audit.logAudit({
        ...basePortalAudit(ctx),
        action: 'timetable.exception_published',
        module: MODULE,
        entityType: 'period_exception',
        entityId: inserted!.id,
        campusId: inserted!.campusId,
        payload: {
          exception_id: inserted!.id,
          type: inserted!.type,
          class_id: inserted!.classId,
          date: inserted!.date,
          recurring: inserted!.recurring,
        },
      } as AuditEventInput);
      return inserted!;
    });

    await this.jobs.enqueue(
      'notifications',
      TIMETABLE_EXCEPTION_FANOUT_JOB,
      { kind: 'exception', institutionId: ctx.principal.institutionId, exceptionId: row.id, classIds: [row.classId] },
      { jobId: `tt-fanout:${row.id}` },
    );
    return row;
  }

  private async assertCanView(ctx: PortalActionContext) {
    if (!can(ctx.principal.permissions, 'timetable.view')) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
    }
  }

  private async assertCanManageOccurrence(
    ctx: PortalActionContext,
    occurrence: { slotId?: string | null; classId: string },
  ) {
    if (can(ctx.principal.permissions, 'timetable.exception.manage_all')) return;
    if (!can(ctx.principal.permissions, 'timetable.exception.manage_own')) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
    }
    const staffId = await this.staffIdForUser(ctx.principal.institutionUserId);
    if (!staffId) throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });

    const [classRow] = await this.db
      .select({ classTeacherId: schema.classes.classTeacherId })
      .from(schema.classes)
      .where(eq(schema.classes.id, occurrence.classId))
      .limit(1);
    if (classRow?.classTeacherId === staffId) return;

    if (!occurrence.slotId) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
    }

    const [slot] = await this.db
      .select({ teacherId: schema.timetableSlots.teacherId, subjectId: schema.timetableSlots.subjectId })
      .from(schema.timetableSlots)
      .where(eq(schema.timetableSlots.id, occurrence.slotId))
      .limit(1);
    if (slot?.teacherId === staffId) return;
    if (slot?.subjectId) {
      const [cst] = await this.db
        .select({ teacherId: schema.classSubjectTeachers.teacherId })
        .from(schema.classSubjectTeachers)
        .where(
          and(
            eq(schema.classSubjectTeachers.classId, occurrence.classId),
            eq(schema.classSubjectTeachers.subjectId, slot.subjectId),
          ),
        )
        .limit(1);
      if (cst?.teacherId === staffId) return;
    }
    throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Insufficient permissions.' });
  }

  private async staffIdForUser(institutionUserId: string): Promise<string | null> {
    const [row] = await this.db
      .select({ id: schema.staff.id })
      .from(schema.staff)
      .where(eq(schema.staff.institutionUserId, institutionUserId))
      .limit(1);
    return row?.id ?? null;
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }

  private async buildResolveInput(institutionId: string, classIds: string[], from: string, to: string) {
    const [timezoneRow] = await this.db
      .select({ timezone: schema.institutions.timezone })
      .from(schema.institutions)
      .where(eq(schema.institutions.id, institutionId))
      .limit(1);
    const slots = await this.db
      .select()
      .from(schema.timetableSlots)
      .where(and(eq(schema.timetableSlots.institutionId, institutionId), inArray(schema.timetableSlots.classId, classIds)));
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

function weekdayForDate(date: string): number {
  const d = new Date(`${date}T12:00:00Z`);
  const js = d.getUTCDay();
  return js === 0 ? 7 : js;
}
