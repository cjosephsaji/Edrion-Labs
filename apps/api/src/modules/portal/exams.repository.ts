import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  schema,
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { Exam, ExamSchedule, NewExam, NewExamSchedule } from '@edrion/database';
import type { ExamsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

export interface ExamRow extends Exam {
  academicYearName: string | null;
  scheduleCount: number;
}
export interface ExamScheduleRow extends ExamSchedule {
  className: string | null;
  subjectName: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type ExamRefTable = 'academicYears' | 'classes' | 'subjects';

/**
 * Typed SQL for the institution-portal exams tables (exams + scheduled papers). Same contract as the
 * other portal repos: every query is confined to one institution; campus-scoped exam reads also
 * include institution-owned (campus_id IS NULL) rows. The service owns scope/version/FK/audit.
 */
@Injectable()
export class ExamsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(
    instCol: PgColumn,
    campusCol: PgColumn,
    institutionId: string,
    campusIds: CampusFilter,
  ): SQL[] {
    const conds: SQL[] = [eq(instCol, institutionId)];
    if (campusIds) {
      const inScope = or(isNull(campusCol), inArray(campusCol, campusIds));
      if (inScope) conds.push(inScope);
    }
    return conds;
  }

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  async existsInInstitution(table: ExamRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  // --- exams -----------------------------------------------------------------

  async list(institutionId: string, campusIds: CampusFilter, q: ExamsListQuery): Promise<Page<ExamRow>> {
    const t = schema.exams;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.examType) conds.push(eq(t.examType, q.examType));
    if (q.search) {
      const s = or(ilike(t.name, `%${q.search}%`), ilike(t.termLabel, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      name: t.name,
      examType: t.examType,
      status: t.status,
      startDate: t.startDate,
      createdAt: t.createdAt,
    };
    const limit = q.pageSize;
    const offset = (q.page - 1) * q.pageSize;

    const scheduleCount = sql<number>`(select count(*) from ${schema.examSchedules} es where es.exam_id = ${t.id})`;
    const rows = await this.db
      .select({ exam: t, academicYearName: schema.academicYears.name, scheduleCount })
      .from(t)
      .leftJoin(schema.academicYears, eq(schema.academicYears.id, t.academicYearId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.exam,
        academicYearName: r.academicYearName,
        scheduleCount: Number(r.scheduleCount ?? 0),
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async find(id: string, institutionId: string): Promise<Exam | undefined> {
    const t = schema.exams;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insert(values: NewExam): Promise<Exam> {
    const [row] = await this.db.insert(schema.exams).values(values).returning();
    return row!;
  }

  async update(id: string, version: number, patch: Partial<NewExam>): Promise<Exam | undefined> {
    const t = schema.exams;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async delete(id: string, version: number): Promise<boolean> {
    const t = schema.exams;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- schedules (papers) ----------------------------------------------------

  async listSchedules(examId: string): Promise<ExamScheduleRow[]> {
    const t = schema.examSchedules;
    const rows = await this.db
      .select({ sched: t, className: schema.classes.name, subjectName: schema.subjects.name })
      .from(t)
      .leftJoin(schema.classes, eq(schema.classes.id, t.classId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, t.subjectId))
      .where(eq(t.examId, examId))
      .orderBy(asc(schema.classes.name), asc(schema.subjects.name));
    return rows.map((r) => ({ ...r.sched, className: r.className, subjectName: r.subjectName }));
  }

  /** A paper already exists for this (exam, class, subject)? (friendly 409 instead of a 500). */
  async findScheduleByKey(examId: string, classId: string, subjectId: string): Promise<ExamSchedule | undefined> {
    const t = schema.examSchedules;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.examId, examId), eq(t.classId, classId), eq(t.subjectId, subjectId)))
      .limit(1);
    return row;
  }

  async findSchedule(id: string, examId: string): Promise<ExamSchedule | undefined> {
    const t = schema.examSchedules;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.examId, examId))).limit(1);
    return row;
  }

  async insertSchedule(values: NewExamSchedule): Promise<ExamSchedule> {
    const [row] = await this.db.insert(schema.examSchedules).values(values).returning();
    return row!;
  }

  async updateSchedule(id: string, version: number, patch: Partial<NewExamSchedule>): Promise<ExamSchedule | undefined> {
    const t = schema.examSchedules;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteSchedule(id: string, version: number): Promise<boolean> {
    const t = schema.examSchedules;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }
}
