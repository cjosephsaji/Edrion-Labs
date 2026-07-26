import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, gte, lt, schema, type Database } from '@edrion/database';
import type { CreatePlannerItemInput, UpdatePlannerItemInput } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal, StudentPrincipal } from '../student.types';

@Injectable()
export class StudentCalendarService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getCalendar(principal: InstitutionalStudentPrincipal, month: string) {
    const start = `${month}-01`;
    // First of next month, exclusive upper bound (fixes off-by-one from lte).
    const [y, m] = month.split('-').map(Number);
    const nextMonth = m === 12 ? 1 : m! + 1;
    const nextYear = m === 12 ? y! + 1 : y!;
    const end = `${String(nextYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;
    const daysMap = new Map<string, { kind: string; label: string; sourceLine: string }[]>();

    const push = (date: string, event: { kind: string; label: string; sourceLine: string }) => {
      const list = daysMap.get(date) ?? [];
      list.push(event);
      daysMap.set(date, list);
    };

    const instEvents = await this.db
      .select({
        startsOn: schema.calendarEvents.startsOn,
        title: schema.calendarEvents.title,
        typeKey: schema.calendarEventTypes.key,
      })
      .from(schema.calendarEvents)
      .leftJoin(
        schema.calendarEventTypes,
        eq(schema.calendarEventTypes.id, schema.calendarEvents.eventTypeId),
      )
      .where(
        and(
          eq(schema.calendarEvents.institutionId, principal.institutionId),
          eq(schema.calendarEvents.status, 'published'),
          gte(schema.calendarEvents.startsOn, start),
          lt(schema.calendarEvents.startsOn, end),
        ),
      );
    for (const e of instEvents) {
      push(e.startsOn, {
        kind: e.typeKey ?? 'event',
        label: e.title,
        sourceLine: 'Published by institution',
      });
    }

    const [nextExamRow] = await this.db
      .select({
        id: schema.examSchedules.id,
        examDate: schema.examSchedules.examDate,
        name: schema.exams.name,
      })
      .from(schema.examSchedules)
      .innerJoin(schema.exams, eq(schema.exams.id, schema.examSchedules.examId))
      .where(
        and(
          eq(schema.examSchedules.institutionId, principal.institutionId),
          eq(schema.examSchedules.published, true),
          gte(schema.examSchedules.examDate, start),
        ),
      )
      .orderBy(asc(schema.examSchedules.examDate))
      .limit(1);

    const [term] = await this.db
      .select({
        name: schema.academicTerms.name,
        startDate: schema.academicTerms.startDate,
        endDate: schema.academicTerms.endDate,
      })
      .from(schema.academicTerms)
      .where(
        and(
          eq(schema.academicTerms.institutionId, principal.institutionId),
          eq(schema.academicTerms.isCurrent, true),
        ),
      )
      .limit(1);

    const planner = await this.db
      .select()
      .from(schema.studentPlannerItems)
      .where(
        and(
          eq(schema.studentPlannerItems.studentId, principal.studentId),
          gte(schema.studentPlannerItems.onDate, start),
          lt(schema.studentPlannerItems.onDate, end),
        ),
      );
    for (const p of planner) {
      push(p.onDate, {
        kind: 'learn',
        label: p.title,
        sourceLine: p.kind === 'learn_plan' ? 'Your Learn plan' : 'Personal task',
      });
    }

    const days = [...daysMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, events]) => ({ date, events }));

    return {
      days,
      nextExam: nextExamRow
        ? { id: nextExamRow.id, date: nextExamRow.examDate, name: nextExamRow.name }
        : null,
      semesterBar: term
        ? { name: term.name, startDate: term.startDate, endDate: term.endDate }
        : null,
    };
  }

  async createPlanner(principal: StudentPrincipal, input: CreatePlannerItemInput) {
    const base = {
      title: input.title,
      onDate: input.onDate,
      timeLabel: input.timeLabel ?? null,
      kind: input.kind,
      topicKey: input.topicKey ?? null,
    };
    if (principal.kind === 'institutional') {
      const [row] = await this.db
        .insert(schema.studentPlannerItems)
        .values({ ...base, studentId: principal.studentId })
        .returning();
      return row;
    }
    const [row] = await this.db
      .insert(schema.studentPlannerItems)
      .values({ ...base, independentUserId: principal.independentUserId })
      .returning();
    return row;
  }

  async updatePlanner(principal: StudentPrincipal, id: string, input: UpdatePlannerItemInput) {
    await this.findPlanner(principal, id);
    const { version, ...patch } = input;
    const [updated] = await this.db
      .update(schema.studentPlannerItems)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(schema.studentPlannerItems.id, id), eq(schema.studentPlannerItems.version, version)))
      .returning();
    if (!updated) {
      throw new NotFoundException({
        code: 'VERSION_CONFLICT',
        message: 'Planner item was updated elsewhere',
      });
    }
    return updated;
  }

  async deletePlanner(principal: StudentPrincipal, id: string, version: number) {
    await this.findPlanner(principal, id);
    await this.db
      .delete(schema.studentPlannerItems)
      .where(and(eq(schema.studentPlannerItems.id, id), eq(schema.studentPlannerItems.version, version)));
    return { deleted: true };
  }

  private async findPlanner(principal: StudentPrincipal, id: string) {
    const cond =
      principal.kind === 'institutional'
        ? and(
            eq(schema.studentPlannerItems.id, id),
            eq(schema.studentPlannerItems.studentId, principal.studentId),
          )
        : and(
            eq(schema.studentPlannerItems.id, id),
            eq(schema.studentPlannerItems.independentUserId, principal.independentUserId),
          );
    const [row] = await this.db.select().from(schema.studentPlannerItems).where(cond).limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Planner item not found' });
    return row;
  }
}
