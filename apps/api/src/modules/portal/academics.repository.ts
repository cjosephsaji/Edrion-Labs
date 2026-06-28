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
import type {
  AcademicYear,
  Class,
  ClassSubjectTeacher,
  Department,
  GradeLevel,
  NewAcademicYear,
  NewClass,
  NewClassSubjectTeacher,
  NewDepartment,
  NewGradeLevel,
  NewSubject,
  Subject,
} from '@edrion/database';
import type { AcademicsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

/** A campus filter resolved from the request scope (null = every campus in the institution). */
export type CampusFilter = string[] | null;

/** Display name for a teacher FK (class teacher / department head / subject teacher). */
const teacherDisplayName = sql<string>`concat_ws(' ', ${schema.teachers.firstName}, ${schema.teachers.lastName})`;

export interface Page<T> {
  items: T[];
  total: number;
}

/** Class row enriched with the display names its foreign keys point at. */
export interface ClassRow extends Class {
  academicYearName: string | null;
  gradeLevelName: string | null;
  classTeacherName: string | null;
}
export interface DepartmentRow extends Department {
  headUserName: string | null;
}
export interface GradeLevelRow extends GradeLevel {
  departmentName: string | null;
}
export interface SubjectRow extends Subject {
  departmentName: string | null;
}
export interface ClassSubjectRow extends ClassSubjectTeacher {
  subjectName: string | null;
  subjectCode: string | null;
  teacherName: string | null;
}

/**
 * Typed SQL for the institution-portal academic tables. EVERY query is confined to one
 * institution; campus-scoped reads additionally include institution-owned (campus_id IS NULL)
 * rows so shared structure (e.g. an institution-wide academic year) is visible in every campus
 * scope. No business rules live here — the service owns scope assertions, versioning and audit.
 */
@Injectable()
export class AcademicsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** institution_id match + (when campus-scoped) campus_id IN scope OR institution-owned. */
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

  private pageBounds(q: AcademicsListQuery): { limit: number; offset: number } {
    return { limit: q.pageSize, offset: (q.page - 1) * q.pageSize };
  }

  // --- academic years --------------------------------------------------------

  async listAcademicYears(
    institutionId: string,
    campusIds: CampusFilter,
    q: AcademicsListQuery,
  ): Promise<Page<AcademicYear>> {
    const t = schema.academicYears;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) conds.push(ilike(t.name, `%${q.search}%`));
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { name: t.name, startDate: t.startDate, status: t.status, createdAt: t.createdAt };
    const { limit, offset } = this.pageBounds(q);

    const items = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.startDate))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items, total: Number(tot?.value ?? 0) };
  }

  async findAcademicYear(id: string, institutionId: string): Promise<AcademicYear | undefined> {
    const t = schema.academicYears;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertAcademicYear(values: NewAcademicYear): Promise<AcademicYear> {
    const [row] = await this.db.insert(schema.academicYears).values(values).returning();
    return row!;
  }

  async updateAcademicYear(id: string, version: number, patch: Partial<NewAcademicYear>): Promise<AcademicYear | undefined> {
    const t = schema.academicYears;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  /** Clear `is_current` on every other year in the same scope (single-current invariant). */
  async clearCurrentAcademicYear(institutionId: string, campusId: string | null, exceptId: string): Promise<void> {
    const t = schema.academicYears;
    const conds: SQL[] = [eq(t.institutionId, institutionId), eq(t.isCurrent, true)];
    conds.push(campusId === null ? isNull(t.campusId) : eq(t.campusId, campusId));
    await this.db.update(t).set({ isCurrent: false, updatedAt: new Date() }).where(and(...conds, eq(t.isCurrent, true)));
    // exceptId is re-set to true by the caller's update; excluding it here is unnecessary.
    void exceptId;
  }

  deleteAcademicYear = (id: string, version: number) => this.del(schema.academicYears, id, version);

  // --- departments -----------------------------------------------------------

  async listDepartments(institutionId: string, campusIds: CampusFilter, q: AcademicsListQuery): Promise<Page<DepartmentRow>> {
    const t = schema.departments;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) {
      const s = or(ilike(t.name, `%${q.search}%`), ilike(t.code, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { name: t.name, code: t.code, createdAt: t.createdAt };
    const { limit, offset } = this.pageBounds(q);

    const rows = await this.db
      .select({ dept: t, headUserName: teacherDisplayName })
      .from(t)
      .leftJoin(schema.teachers, eq(schema.teachers.id, t.headUserId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.name))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items: rows.map((r) => ({ ...r.dept, headUserName: r.headUserName })), total: Number(tot?.value ?? 0) };
  }

  async findDepartment(id: string, institutionId: string): Promise<Department | undefined> {
    const t = schema.departments;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertDepartment(values: NewDepartment): Promise<Department> {
    const [row] = await this.db.insert(schema.departments).values(values).returning();
    return row!;
  }

  async updateDepartment(id: string, version: number, patch: Partial<NewDepartment>): Promise<Department | undefined> {
    const t = schema.departments;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  deleteDepartment = (id: string, version: number) => this.del(schema.departments, id, version);

  // --- grade levels ----------------------------------------------------------

  async listGradeLevels(institutionId: string, campusIds: CampusFilter, q: AcademicsListQuery): Promise<Page<GradeLevelRow>> {
    const t = schema.gradeLevels;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) conds.push(ilike(t.name, `%${q.search}%`));
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { name: t.name, level: t.level, createdAt: t.createdAt };
    const { limit, offset } = this.pageBounds(q);

    const rows = await this.db
      .select({ grade: t, departmentName: schema.departments.name })
      .from(t)
      .leftJoin(schema.departments, eq(schema.departments.id, t.departmentId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.level))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items: rows.map((r) => ({ ...r.grade, departmentName: r.departmentName })), total: Number(tot?.value ?? 0) };
  }

  async findGradeLevel(id: string, institutionId: string): Promise<GradeLevel | undefined> {
    const t = schema.gradeLevels;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertGradeLevel(values: NewGradeLevel): Promise<GradeLevel> {
    const [row] = await this.db.insert(schema.gradeLevels).values(values).returning();
    return row!;
  }

  async updateGradeLevel(id: string, version: number, patch: Partial<NewGradeLevel>): Promise<GradeLevel | undefined> {
    const t = schema.gradeLevels;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  deleteGradeLevel = (id: string, version: number) => this.del(schema.gradeLevels, id, version);

  // --- subjects --------------------------------------------------------------

  async listSubjects(institutionId: string, campusIds: CampusFilter, q: AcademicsListQuery): Promise<Page<SubjectRow>> {
    const t = schema.subjects;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) {
      const s = or(ilike(t.name, `%${q.search}%`), ilike(t.code, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { name: t.name, code: t.code, kind: t.kind, createdAt: t.createdAt };
    const { limit, offset } = this.pageBounds(q);

    const rows = await this.db
      .select({ subject: t, departmentName: schema.departments.name })
      .from(t)
      .leftJoin(schema.departments, eq(schema.departments.id, t.departmentId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.name))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items: rows.map((r) => ({ ...r.subject, departmentName: r.departmentName })), total: Number(tot?.value ?? 0) };
  }

  async findSubject(id: string, institutionId: string): Promise<Subject | undefined> {
    const t = schema.subjects;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertSubject(values: NewSubject): Promise<Subject> {
    const [row] = await this.db.insert(schema.subjects).values(values).returning();
    return row!;
  }

  async updateSubject(id: string, version: number, patch: Partial<NewSubject>): Promise<Subject | undefined> {
    const t = schema.subjects;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  deleteSubject = (id: string, version: number) => this.del(schema.subjects, id, version);

  // --- classes / sections ----------------------------------------------------

  async listClasses(institutionId: string, campusIds: CampusFilter, q: AcademicsListQuery): Promise<Page<ClassRow>> {
    const t = schema.classes;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) conds.push(ilike(t.name, `%${q.search}%`));
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { name: t.name, createdAt: t.createdAt };
    const { limit, offset } = this.pageBounds(q);

    const rows = await this.db
      .select({
        cls: t,
        academicYearName: schema.academicYears.name,
        gradeLevelName: schema.gradeLevels.name,
        classTeacherName: teacherDisplayName,
      })
      .from(t)
      .leftJoin(schema.academicYears, eq(schema.academicYears.id, t.academicYearId))
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, t.gradeLevelId))
      .leftJoin(schema.teachers, eq(schema.teachers.id, t.classTeacherId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.name))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.cls,
        academicYearName: r.academicYearName,
        gradeLevelName: r.gradeLevelName,
        classTeacherName: r.classTeacherName,
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findClass(id: string, institutionId: string): Promise<Class | undefined> {
    const t = schema.classes;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertClass(values: NewClass): Promise<Class> {
    const [row] = await this.db.insert(schema.classes).values(values).returning();
    return row!;
  }

  async updateClass(id: string, version: number, patch: Partial<NewClass>): Promise<Class | undefined> {
    const t = schema.classes;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  deleteClass = (id: string, version: number) => this.del(schema.classes, id, version);

  /** Confirm a referenced row exists in the institution (FK pre-check for friendly errors). */
  async existsInInstitution(
    table: 'academicYears' | 'gradeLevels' | 'departments' | 'subjects' | 'teachers',
    id: string,
    institutionId: string,
  ): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db.select({ id: t.id }).from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return !!row;
  }

  // --- class ↔ subject ↔ teacher --------------------------------------------

  async listClassSubjects(classId: string): Promise<ClassSubjectRow[]> {
    const t = schema.classSubjectTeachers;
    const rows = await this.db
      .select({
        link: t,
        subjectName: schema.subjects.name,
        subjectCode: schema.subjects.code,
        teacherName: teacherDisplayName,
      })
      .from(t)
      .leftJoin(schema.subjects, eq(schema.subjects.id, t.subjectId))
      .leftJoin(schema.teachers, eq(schema.teachers.id, t.teacherId))
      .where(eq(t.classId, classId))
      .orderBy(asc(schema.subjects.name));
    return rows.map((r) => ({
      ...r.link,
      subjectName: r.subjectName,
      subjectCode: r.subjectCode,
      teacherName: r.teacherName,
    }));
  }

  async findClassSubject(classId: string, subjectId: string): Promise<ClassSubjectTeacher | undefined> {
    const t = schema.classSubjectTeachers;
    const [row] = await this.db.select().from(t).where(and(eq(t.classId, classId), eq(t.subjectId, subjectId))).limit(1);
    return row;
  }

  async findClassSubjectById(id: string, classId: string): Promise<ClassSubjectTeacher | undefined> {
    const t = schema.classSubjectTeachers;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.classId, classId))).limit(1);
    return row;
  }

  async insertClassSubject(values: NewClassSubjectTeacher): Promise<ClassSubjectTeacher> {
    const [row] = await this.db.insert(schema.classSubjectTeachers).values(values).returning();
    return row!;
  }

  async updateClassSubjectTeacher(id: string, teacherId: string | null): Promise<ClassSubjectTeacher | undefined> {
    const t = schema.classSubjectTeachers;
    const [row] = await this.db
      .update(t)
      .set({ teacherId, version: sql`${t.version} + 1`, updatedAt: new Date() })
      .where(eq(t.id, id))
      .returning();
    return row;
  }

  async deleteClassSubject(id: string): Promise<boolean> {
    const t = schema.classSubjectTeachers;
    const rows = await this.db.delete(t).where(eq(t.id, id)).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- shared delete (version-guarded) --------------------------------------

  /** Version-guarded hard delete; returns false on a version mismatch (→ 409 in the service). */
  private async del(
    table:
      | typeof schema.academicYears
      | typeof schema.departments
      | typeof schema.gradeLevels
      | typeof schema.subjects
      | typeof schema.classes,
    id: string,
    version: number,
  ): Promise<boolean> {
    const rows = await this.db
      .delete(table)
      .where(and(eq(table.id, id), eq(table.version, version)))
      .returning({ id: table.id });
    return rows.length > 0;
  }
}
