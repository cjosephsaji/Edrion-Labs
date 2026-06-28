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
  NewParent,
  NewStaff,
  NewStudent,
  NewStudentGuardian,
  NewTeacher,
  Parent,
  Staff,
  Student,
  StudentGuardian,
  Teacher,
} from '@edrion/database';
import type { PeopleListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

const parentName = sql<string>`concat_ws(' ', ${schema.parents.firstName}, ${schema.parents.lastName})`;

export interface StudentRow extends Student {
  gradeLevelName: string | null;
  className: string | null;
}
export interface TeacherRow extends Teacher {
  departmentName: string | null;
}
export interface StaffRow extends Staff {
  departmentName: string | null;
}
export type ParentRow = Parent;
export interface GuardianRow extends StudentGuardian {
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type RefTable =
  | 'gradeLevels'
  | 'classes'
  | 'departments'
  | 'institutionUsers'
  | 'teachers'
  | 'students'
  | 'parents';

/**
 * Typed SQL for the institution-portal people tables (students, teachers, staff, parents + the
 * student↔guardian join). Same contract as AcademicsRepository: every query is confined to one
 * institution; campus-scoped reads also include institution-owned (campus_id IS NULL) rows. No
 * business rules here — the service owns scope assertions, versioning, FK pre-checks and audit.
 */
@Injectable()
export class PeopleRepository {
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

  private pageBounds(q: PeopleListQuery): { limit: number; offset: number } {
    return { limit: q.pageSize, offset: (q.page - 1) * q.pageSize };
  }

  /** Confirm a referenced row exists in the institution (FK pre-check for friendly errors). */
  async existsInInstitution(table: RefTable, id: string, institutionId: string): Promise<boolean> {
    const t = schema[table];
    const [row] = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return !!row;
  }

  // --- students --------------------------------------------------------------

  async listStudents(institutionId: string, campusIds: CampusFilter, q: PeopleListQuery): Promise<Page<StudentRow>> {
    const t = schema.students;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) {
      const s = or(
        ilike(t.firstName, `%${q.search}%`),
        ilike(t.lastName, `%${q.search}%`),
        ilike(t.admissionNo, `%${q.search}%`),
      );
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      admissionNo: t.admissionNo,
      firstName: t.firstName,
      lastName: t.lastName,
      status: t.status,
      createdAt: t.createdAt,
    };
    const { limit, offset } = this.pageBounds(q);

    const rows = await this.db
      .select({ student: t, gradeLevelName: schema.gradeLevels.name, className: schema.classes.name })
      .from(t)
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, t.gradeLevelId))
      .leftJoin(schema.classes, eq(schema.classes.id, t.classId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.lastName))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({ ...r.student, gradeLevelName: r.gradeLevelName, className: r.className })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findStudent(id: string, institutionId: string): Promise<Student | undefined> {
    const t = schema.students;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertStudent(values: NewStudent): Promise<Student> {
    const [row] = await this.db.insert(schema.students).values(values).returning();
    return row!;
  }

  async updateStudent(id: string, version: number, patch: Partial<NewStudent>): Promise<Student | undefined> {
    const t = schema.students;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  deleteStudent = (id: string, version: number) => this.del(schema.students, id, version);

  // --- teachers --------------------------------------------------------------

  async listTeachers(institutionId: string, campusIds: CampusFilter, q: PeopleListQuery): Promise<Page<TeacherRow>> {
    const t = schema.teachers;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) {
      const s = or(
        ilike(t.firstName, `%${q.search}%`),
        ilike(t.lastName, `%${q.search}%`),
        ilike(t.email, `%${q.search}%`),
        ilike(t.employeeNo, `%${q.search}%`),
      );
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      firstName: t.firstName,
      lastName: t.lastName,
      status: t.status,
      createdAt: t.createdAt,
    };
    const { limit, offset } = this.pageBounds(q);

    const rows = await this.db
      .select({ teacher: t, departmentName: schema.departments.name })
      .from(t)
      .leftJoin(schema.departments, eq(schema.departments.id, t.departmentId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.lastName))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items: rows.map((r) => ({ ...r.teacher, departmentName: r.departmentName })), total: Number(tot?.value ?? 0) };
  }

  async findTeacher(id: string, institutionId: string): Promise<Teacher | undefined> {
    const t = schema.teachers;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertTeacher(values: NewTeacher): Promise<Teacher> {
    const [row] = await this.db.insert(schema.teachers).values(values).returning();
    return row!;
  }

  async updateTeacher(id: string, version: number, patch: Partial<NewTeacher>): Promise<Teacher | undefined> {
    const t = schema.teachers;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  deleteTeacher = (id: string, version: number) => this.del(schema.teachers, id, version);

  // --- staff -----------------------------------------------------------------

  async listStaff(institutionId: string, campusIds: CampusFilter, q: PeopleListQuery): Promise<Page<StaffRow>> {
    const t = schema.staff;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) {
      const s = or(
        ilike(t.firstName, `%${q.search}%`),
        ilike(t.lastName, `%${q.search}%`),
        ilike(t.email, `%${q.search}%`),
        ilike(t.employeeNo, `%${q.search}%`),
      );
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      firstName: t.firstName,
      lastName: t.lastName,
      status: t.status,
      createdAt: t.createdAt,
    };
    const { limit, offset } = this.pageBounds(q);

    const rows = await this.db
      .select({ staff: t, departmentName: schema.departments.name })
      .from(t)
      .leftJoin(schema.departments, eq(schema.departments.id, t.departmentId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.lastName))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items: rows.map((r) => ({ ...r.staff, departmentName: r.departmentName })), total: Number(tot?.value ?? 0) };
  }

  async findStaff(id: string, institutionId: string): Promise<Staff | undefined> {
    const t = schema.staff;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertStaff(values: NewStaff): Promise<Staff> {
    const [row] = await this.db.insert(schema.staff).values(values).returning();
    return row!;
  }

  async updateStaff(id: string, version: number, patch: Partial<NewStaff>): Promise<Staff | undefined> {
    const t = schema.staff;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  deleteStaff = (id: string, version: number) => this.del(schema.staff, id, version);

  // --- parents ---------------------------------------------------------------

  async listParents(institutionId: string, campusIds: CampusFilter, q: PeopleListQuery): Promise<Page<ParentRow>> {
    const t = schema.parents;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) {
      const s = or(
        ilike(t.firstName, `%${q.search}%`),
        ilike(t.lastName, `%${q.search}%`),
        ilike(t.email, `%${q.search}%`),
      );
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      firstName: t.firstName,
      lastName: t.lastName,
      createdAt: t.createdAt,
    };
    const { limit, offset } = this.pageBounds(q);

    const items = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.lastName))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items, total: Number(tot?.value ?? 0) };
  }

  async findParent(id: string, institutionId: string): Promise<Parent | undefined> {
    const t = schema.parents;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertParent(values: NewParent): Promise<Parent> {
    const [row] = await this.db.insert(schema.parents).values(values).returning();
    return row!;
  }

  async updateParent(id: string, version: number, patch: Partial<NewParent>): Promise<Parent | undefined> {
    const t = schema.parents;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  deleteParent = (id: string, version: number) => this.del(schema.parents, id, version);

  // --- student ↔ guardian links ----------------------------------------------

  async listGuardians(studentId: string): Promise<GuardianRow[]> {
    const t = schema.studentGuardians;
    const rows = await this.db
      .select({
        link: t,
        parentName,
        parentEmail: schema.parents.email,
        parentPhone: schema.parents.phone,
      })
      .from(t)
      .leftJoin(schema.parents, eq(schema.parents.id, t.parentId))
      .where(eq(t.studentId, studentId))
      .orderBy(desc(t.isPrimary), asc(parentName));
    return rows.map((r) => ({
      ...r.link,
      parentName: r.parentName,
      parentEmail: r.parentEmail,
      parentPhone: r.parentPhone,
    }));
  }

  async findGuardian(studentId: string, parentId: string): Promise<StudentGuardian | undefined> {
    const t = schema.studentGuardians;
    const [row] = await this.db.select().from(t).where(and(eq(t.studentId, studentId), eq(t.parentId, parentId))).limit(1);
    return row;
  }

  async findGuardianById(id: string, studentId: string): Promise<StudentGuardian | undefined> {
    const t = schema.studentGuardians;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.studentId, studentId))).limit(1);
    return row;
  }

  async insertGuardian(values: NewStudentGuardian): Promise<StudentGuardian> {
    const [row] = await this.db.insert(schema.studentGuardians).values(values).returning();
    return row!;
  }

  async updateGuardian(id: string, patch: Partial<NewStudentGuardian>): Promise<StudentGuardian | undefined> {
    const t = schema.studentGuardians;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: sql`${t.version} + 1`, updatedAt: new Date() })
      .where(eq(t.id, id))
      .returning();
    return row;
  }

  async deleteGuardian(id: string): Promise<boolean> {
    const t = schema.studentGuardians;
    const rows = await this.db.delete(t).where(eq(t.id, id)).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- shared delete (version-guarded) ---------------------------------------

  /** Version-guarded hard delete; returns false on a version mismatch (→ 409 in the service). */
  private async del(
    table:
      | typeof schema.students
      | typeof schema.teachers
      | typeof schema.staff
      | typeof schema.parents,
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
