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
import type { GradeEntry, NewGradeEntry } from '@edrion/database';
import type { GradebookListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

const studentDisplayName = sql<string>`concat_ws(' ', ${schema.students.firstName}, ${schema.students.lastName})`;

export interface GradeEntryRow extends GradeEntry {
  studentName: string | null;
  admissionNo: string | null;
  subjectName: string | null;
  examName: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type GradeRefTable = 'students' | 'subjects' | 'exams' | 'classes';

/**
 * Typed SQL for the institution-portal gradebook (a flat marks table). Every query is confined to
 * one institution; campus-scoped reads also include institution-owned (campus_id IS NULL) rows. The
 * service owns scope/version/FK/audit.
 */
@Injectable()
export class GradebookRepository {
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

  async existsInInstitution(table: GradeRefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  /** A grade already exists for this (student, subject, exam)? (friendly 409 on create). */
  async findByKey(
    institutionId: string,
    studentId: string,
    subjectId: string,
    examId: string,
  ): Promise<GradeEntry | undefined> {
    const t = schema.gradeEntries;
    const [row] = await this.db
      .select()
      .from(t)
      .where(
        and(
          eq(t.institutionId, institutionId),
          eq(t.studentId, studentId),
          eq(t.subjectId, subjectId),
          eq(t.examId, examId),
        ),
      )
      .limit(1);
    return row;
  }

  async list(institutionId: string, campusIds: CampusFilter, q: GradebookListQuery): Promise<Page<GradeEntryRow>> {
    const t = schema.gradeEntries;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.studentId) conds.push(eq(t.studentId, q.studentId));
    if (q.subjectId) conds.push(eq(t.subjectId, q.subjectId));
    if (q.examId) conds.push(eq(t.examId, q.examId));
    if (q.classId) conds.push(eq(t.classId, q.classId));
    if (q.search) {
      const s = ilike(t.assessmentName, `%${q.search}%`);
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      assessmentName: t.assessmentName,
      marksObtained: t.marksObtained,
      createdAt: t.createdAt,
    };
    const limit = q.pageSize;
    const offset = (q.page - 1) * q.pageSize;

    const rows = await this.db
      .select({
        grade: t,
        studentName: studentDisplayName,
        admissionNo: schema.students.admissionNo,
        subjectName: schema.subjects.name,
        examName: schema.exams.name,
      })
      .from(t)
      .leftJoin(schema.students, eq(schema.students.id, t.studentId))
      .leftJoin(schema.subjects, eq(schema.subjects.id, t.subjectId))
      .leftJoin(schema.exams, eq(schema.exams.id, t.examId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.grade,
        studentName: r.studentName,
        admissionNo: r.admissionNo,
        subjectName: r.subjectName,
        examName: r.examName,
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async find(id: string, institutionId: string): Promise<GradeEntry | undefined> {
    const t = schema.gradeEntries;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insert(values: NewGradeEntry): Promise<GradeEntry> {
    const [row] = await this.db.insert(schema.gradeEntries).values(values).returning();
    return row!;
  }

  async update(id: string, version: number, patch: Partial<NewGradeEntry>): Promise<GradeEntry | undefined> {
    const t = schema.gradeEntries;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async delete(id: string, version: number): Promise<boolean> {
    const t = schema.gradeEntries;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }
}
