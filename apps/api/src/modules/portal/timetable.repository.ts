import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  schema,
  personSqlName,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { NewTimetableSlot, TimetableSlot } from '@edrion/database';
import type { TimetableListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';
import { programmeListFilterConds } from './programme-list-filters';
import { scopeConds } from './portal-scope';

const teacherDisplayName = personSqlName(schema.staff.firstName, schema.staff.middleName, schema.staff.lastName);

export interface TimetableSlotRow extends TimetableSlot {
  className: string | null;
  subjectName: string | null;
  teacherName: string | null;
  termName: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type TimetableRefTable = 'classes' | 'subjects' | 'staff' | 'academicYears' | 'academicTerms';

/**
 * Typed SQL for the institution-portal timetable table. Every query is confined to one institution;
 * campus-scoped reads also include institution-owned (campus_id IS NULL) rows. The service owns
 * scope/version/FK/audit.
 */
@Injectable()
export class TimetableRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  async existsInInstitution(table: TimetableRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  async list(institutionId: string, campusIds: CampusFilter, q: TimetableListQuery): Promise<Page<TimetableSlotRow>> {
    const t = schema.timetableSlots;
    const conds = scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.classId) conds.push(eq(t.classId, q.classId));
    if (q.dayOfWeek) conds.push(eq(t.dayOfWeek, q.dayOfWeek));
    conds.push(
      ...programmeListFilterConds(this.db, q, {
        academicYearId: t.academicYearId,
        termId: t.termId,
        classId: t.classId,
      }),
    );
    if (q.search) {
      const s = or(ilike(t.room, `%${q.search}%`), ilike(t.startTime, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      dayOfWeek: t.dayOfWeek,
      startTime: t.startTime,
      createdAt: t.createdAt,
    };
    const limit = q.pageSize;
    const offset = (q.page - 1) * q.pageSize;

    const rows = await this.db
      .select({
        slot: t,
        className: schema.classes.name,
        subjectName: schema.subjects.name,
        teacherName: teacherDisplayName,
        termName: schema.academicTerms.name,
      })
      .from(t)
      .leftJoin(schema.classes, eq(schema.classes.id, t.classId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, t.subjectId))
      .leftJoin(schema.staff, eq(schema.staff.id, t.teacherId))
      .leftJoin(schema.academicTerms, eq(schema.academicTerms.id, t.termId))
      .where(where)
      // a stable weekly ordering: day, then start time
      .orderBy(asc(t.dayOfWeek), this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.startTime))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.slot,
        className: r.className,
        subjectName: r.subjectName,
        teacherName: r.teacherName,
        termName: r.termName,
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async find(id: string, institutionId: string): Promise<TimetableSlot | undefined> {
    const t = schema.timetableSlots;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insert(values: NewTimetableSlot): Promise<TimetableSlot> {
    const [row] = await this.db.insert(schema.timetableSlots).values(values).returning();
    return row!;
  }

  async update(id: string, version: number, patch: Partial<NewTimetableSlot>): Promise<TimetableSlot | undefined> {
    const t = schema.timetableSlots;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async delete(id: string, version: number): Promise<boolean> {
    const t = schema.timetableSlots;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }
}
