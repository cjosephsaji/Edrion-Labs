import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  eq,
  gte,
  lte,
  or,
  schema,
  sql,
  type Database,
} from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import type { PortalActionContext } from './portal-action-context';
import { resolveScopeFilter } from '@edrion/auth';
import { scopeConds } from './portal-scope';

export type CalendarSource = 'events' | 'exams' | 'assignments' | 'terms';

export interface CalendarItem {
  id: string;
  source: CalendarSource;
  title: string;
  date: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  typeKey: string | null;
  color: string | null;
  detail: string | null;
  editable: boolean;
  href: string | null;
  meta: Record<string, unknown>;
}

@Injectable()
export class CalendarService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async unified(
    ctx: PortalActionContext,
    q: { from: string; to: string; sources: string[] },
  ): Promise<{ items: CalendarItem[] }> {
    const institutionId = ctx.principal.institutionId;
    const f = resolveScopeFilter(ctx.principal, ctx.scope);
    const sources = new Set(q.sources as CalendarSource[]);
    const items: CalendarItem[] = [];

    if (sources.has('events')) {
      const t = schema.calendarEvents;
      const et = schema.calendarEventTypes;
      const conds = scopeConds(t.institutionId, t.campusId, institutionId, f.campusIds);
      conds.push(lte(t.startsOn, q.to));
      conds.push(or(sql`${t.endsOn} is null`, gte(t.endsOn, q.from))!);
      const rows = await this.db
        .select({
          id: t.id,
          title: t.title,
          startsOn: t.startsOn,
          endsOn: t.endsOn,
          startTime: t.startTime,
          endTime: t.endTime,
          description: t.description,
          status: t.status,
          version: t.version,
          typeKey: et.key,
          color: et.color,
        })
        .from(t)
        .leftJoin(et, eq(et.id, t.eventTypeId))
        .where(and(...conds));
      for (const r of rows) {
        items.push({
          id: `events:${r.id}`,
          source: 'events',
          title: r.title,
          date: r.startsOn,
          endDate: r.endsOn,
          startTime: r.startTime,
          endTime: r.endTime,
          typeKey: r.typeKey,
          color: r.color,
          detail: r.description,
          editable: true,
          href: null,
          meta: { status: r.status, version: r.version },
        });
      }
    }

    if (sources.has('exams')) {
      const t = schema.examSchedules;
      const rows = await this.db
        .select({
          id: t.id,
          examId: t.examId,
          examDate: t.examDate,
          startTime: t.startTime,
          endTime: t.endTime,
          name: schema.exams.name,
        })
        .from(t)
        .innerJoin(schema.exams, eq(schema.exams.id, t.examId))
        .where(
          and(
            eq(t.institutionId, institutionId),
            eq(t.published, true),
            gte(t.examDate, q.from),
            lte(t.examDate, q.to),
          ),
        );
      for (const r of rows) {
        if (!r.examDate) continue;
        items.push({
          id: `exams:${r.id}`,
          source: 'exams',
          title: r.name,
          date: r.examDate,
          endDate: null,
          startTime: r.startTime,
          endTime: r.endTime,
          typeKey: 'exam',
          color: 'amber',
          detail: null,
          editable: false,
          href: `/exams/${r.examId}`,
          meta: {},
        });
      }
    }

    if (sources.has('assignments')) {
      const t = schema.assignments;
      const rows = await this.db
        .select({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate,
        })
        .from(t)
        .where(
          and(
            eq(t.institutionId, institutionId),
            eq(t.status, 'published'),
            gte(t.dueDate, q.from),
            lte(t.dueDate, q.to),
          ),
        );
      for (const r of rows) {
        if (!r.dueDate) continue;
        items.push({
          id: `assignments:${r.id}`,
          source: 'assignments',
          title: r.title,
          date: r.dueDate,
          endDate: null,
          startTime: null,
          endTime: null,
          typeKey: 'deadline',
          color: 'orange',
          detail: null,
          editable: false,
          href: `/assignments/${r.id}`,
          meta: {},
        });
      }
    }

    if (sources.has('terms')) {
      const t = schema.academicTerms;
      const rows = await this.db
        .select({
          id: t.id,
          name: t.name,
          startDate: t.startDate,
          endDate: t.endDate,
        })
        .from(t)
        .where(
          and(
            eq(t.institutionId, institutionId),
            lte(t.startDate, q.to),
            gte(t.endDate, q.from),
          ),
        );
      for (const r of rows) {
        items.push({
          id: `terms:${r.id}`,
          source: 'terms',
          title: r.name,
          date: r.startDate,
          endDate: r.endDate,
          startTime: null,
          endTime: null,
          typeKey: 'term',
          color: 'slate',
          detail: null,
          editable: false,
          href: null,
          meta: {},
        });
      }
    }

    items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
    return { items };
  }

  listEventTypes(ctx: PortalActionContext) {
    return this.db
      .select()
      .from(schema.calendarEventTypes)
      .where(eq(schema.calendarEventTypes.institutionId, ctx.principal.institutionId))
      .orderBy(schema.calendarEventTypes.sortOrder);
  }

  async createEventType(
    ctx: PortalActionContext,
    input: {
      key: string;
      label: string;
      color: string;
      sortOrder?: number;
    },
  ) {
    const [row] = await this.db
      .insert(schema.calendarEventTypes)
      .values({
        institutionId: ctx.principal.institutionId,
        key: input.key,
        label: input.label,
        color: input.color,
        sortOrder: input.sortOrder ?? 0,
        isSystem: false,
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();
    return row;
  }

  async updateEventType(
    ctx: PortalActionContext,
    id: string,
    input: {
      key?: string;
      label?: string;
      color?: string;
      sortOrder?: number;
      version: number;
    },
  ) {
    const t = schema.calendarEventTypes;
    const [existing] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!existing) return null;
    const [updated] = await this.db
      .update(t)
      .set({
        key: input.key ?? existing.key,
        label: input.label ?? existing.label,
        color: input.color ?? existing.color,
        sortOrder: input.sortOrder ?? existing.sortOrder,
        version: existing.version + 1,
        updatedBy: ctx.principal.institutionUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(t.id, id), eq(t.version, input.version)))
      .returning();
    return updated;
  }

  async deleteEventType(ctx: PortalActionContext, id: string, version: number) {
    const t = schema.calendarEventTypes;
    const [existing] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!existing) return { deleted: false, reason: 'not_found' as const };
    if (existing.isSystem) return { deleted: false, reason: 'system_type' as const };
    const [inUse] = await this.db
      .select({ id: schema.calendarEvents.id })
      .from(schema.calendarEvents)
      .where(eq(schema.calendarEvents.eventTypeId, id))
      .limit(1);
    if (inUse) return { deleted: false, reason: 'in_use' as const };
    const deleted = await this.db
      .delete(t)
      .where(and(eq(t.id, id), eq(t.version, version), eq(t.isSystem, false)))
      .returning({ id: t.id });
    return { deleted: deleted.length > 0, reason: null };
  }
}
