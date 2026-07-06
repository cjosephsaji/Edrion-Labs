import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, gte, lte, schema, type Database } from '@edrion/database';
import type { CreatePlannerItemInput, UpdatePlannerItemInput } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal, StudentPrincipal } from '../student.types';

@Injectable()
export class StudentCalendarService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getCalendar(principal: InstitutionalStudentPrincipal, month: string) {
    const start = `${month}-01`;
    const endDate = new Date(`${month}-01T00:00:00Z`);
    endDate.setMonth(endDate.getMonth() + 1);
    const end = endDate.toISOString().slice(0, 10);
    const daysMap = new Map<string, { kind: string; label: string; sourceLine: string }[]>();

    const push = (date: string, event: { kind: string; label: string; sourceLine: string }) => {
      const list = daysMap.get(date) ?? [];
      list.push(event);
      daysMap.set(date, list);
    };

    const instEvents = await this.db
      .select()
      .from(schema.portalCalendarEvents)
      .where(
        and(
          eq(schema.portalCalendarEvents.institutionId, principal.institutionId),
          eq(schema.portalCalendarEvents.status, 'published'),
          gte(schema.portalCalendarEvents.startsOn, start),
          lte(schema.portalCalendarEvents.startsOn, end),
        ),
      );
    for (const e of instEvents) push(e.startsOn, { kind: e.kind, label: e.title, sourceLine: 'Published by institution' });

    const planner = await this.db
      .select()
      .from(schema.studentPlannerItems)
      .where(
        and(
          eq(schema.studentPlannerItems.studentId, principal.studentId),
          gte(schema.studentPlannerItems.onDate, start),
          lte(schema.studentPlannerItems.onDate, end),
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

    return { days, nextExam: null, semesterBar: null };
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
      const [row] = await this.db.insert(schema.studentPlannerItems).values({ ...base, studentId: principal.studentId }).returning();
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
    if (!updated) throw new NotFoundException({ code: 'VERSION_CONFLICT', message: 'Planner item was updated elsewhere' });
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
        ? and(eq(schema.studentPlannerItems.id, id), eq(schema.studentPlannerItems.studentId, principal.studentId))
        : and(eq(schema.studentPlannerItems.id, id), eq(schema.studentPlannerItems.independentUserId, principal.independentUserId));
    const [row] = await this.db.select().from(schema.studentPlannerItems).where(cond).limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Planner item not found' });
    return row;
  }
}
