import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
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
  Parent,
  Staff,
  Student,
  StudentGuardian,
} from '@edrion/database';
import type { PeopleListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

const parentName = sql<string>`concat_ws(' ', ${schema.parents.firstName}, ${schema.parents.lastName})`;

export interface StudentRow extends Student {
  gradeLevelName: string | null;
  className: string | null;
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

export interface ClassRosterRow {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  rollNo: string | null;
  status: string;
  gender: string | null;
}

export interface StaffProfileData {
  staff: Staff;
  departmentName: string | null;
  campusName: string | null;
  roleKeys: string[];
  classTeacherOf: Array<{ id: string; name: string }>;
  subjectTeaching: Array<{ classId: string; className: string; subjectId: string; subjectName: string }>;
}

/** Which referenceable table an FK points at (for friendly-400 pre-checks). */
export type RefTable =
  | 'gradeLevels'
  | 'classes'
  | 'departments'
  | 'institutionUsers'
  | 'staff'
  | 'students'
  | 'parents';

/**
 * Typed SQL for the institution-portal people tables (students, staff, parents + the
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

  /** Join staff to institution user roles when filtering by roleKey. */
  private listStaffWithRoleFilter(
    t: typeof schema.staff,
    roleKey: string,
  ): { join: SQL | undefined; cond: SQL } {
    const iu = schema.institutionUsers;
    const iur = schema.institutionUserRoles;
    return {
      join: and(eq(iu.id, t.institutionUserId), eq(iur.institutionUserId, iu.id)),
      cond: eq(iur.roleKey, roleKey),
    };
  }

  /** Confirm a referenced row exists in the institution (FK pre-check for friendly errors). */
  async existsInInstitution(table: RefTable, id: string, institutionId: string): Promise<boolean> {
    const tbl = schema[table];
    const [row] = await this.db
      .select({ id: tbl.id })
      .from(tbl)
      .where(and(eq(tbl.id, id), eq(tbl.institutionId, institutionId)))
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

  // --- staff -----------------------------------------------------------------

  async listStaff(
    institutionId: string,
    campusIds: CampusFilter,
    q: PeopleListQuery,
    teachingUserIds: string[] | null = null,
  ): Promise<Page<StaffRow>> {
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
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.employmentType) conds.push(eq(t.employmentType, q.employmentType));
    if (q.departmentId) conds.push(eq(t.departmentId, q.departmentId));
    if (q.teaching === 'true') {
      if (teachingUserIds && teachingUserIds.length === 0) return { items: [], total: 0 };
      if (teachingUserIds) conds.push(inArray(t.institutionUserId, teachingUserIds));
      else conds.push(isNotNull(t.institutionUserId));
    } else if (q.teaching === 'false' && teachingUserIds) {
      if (teachingUserIds.length > 0) {
        conds.push(or(isNull(t.institutionUserId), sql`${t.institutionUserId} not in (${sql.join(teachingUserIds.map((id) => sql`${id}`), sql`, `)})`)!);
      }
    }

    const roleFilter = q.roleKey ? this.listStaffWithRoleFilter(t, q.roleKey) : null;
    if (roleFilter) conds.push(roleFilter.cond);

    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      firstName: t.firstName,
      lastName: t.lastName,
      status: t.status,
      createdAt: t.createdAt,
    };
    const { limit, offset } = this.pageBounds(q);

    const base = this.db
      .select({ staff: t, departmentName: schema.departments.name })
      .from(t)
      .leftJoin(schema.departments, eq(schema.departments.id, t.departmentId));

    const rows = await (roleFilter
      ? base
          .innerJoin(schema.institutionUsers, eq(schema.institutionUsers.id, t.institutionUserId))
          .innerJoin(schema.institutionUserRoles, eq(schema.institutionUserRoles.institutionUserId, schema.institutionUsers.id))
      : base
    )
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.lastName))
      .limit(limit)
      .offset(offset);

    const countBase = this.db.select({ value: count() }).from(t);
    const [tot] = await (roleFilter
      ? countBase
          .innerJoin(schema.institutionUsers, eq(schema.institutionUsers.id, t.institutionUserId))
          .innerJoin(schema.institutionUserRoles, eq(schema.institutionUserRoles.institutionUserId, schema.institutionUsers.id))
      : countBase
    ).where(where);

    return {
      items: rows.map((r) => ({ ...r.staff, departmentName: r.departmentName })),
      total: Number(tot?.value ?? 0),
    };
  }

  /** Staff whose linked institution user holds academics.teach (teaching staff picker). */
  async listTeachingStaff(institutionId: string, campusIds: CampusFilter, teachingUserIds: string[]): Promise<StaffRow[]> {
    if (teachingUserIds.length === 0) return [];
    const t = schema.staff;
    const conds = [...this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds), eq(t.status, 'active')];
    conds.push(inArray(t.institutionUserId, teachingUserIds));
    const rows = await this.db
      .select({ staff: t, departmentName: schema.departments.name })
      .from(t)
      .leftJoin(schema.departments, eq(schema.departments.id, t.departmentId))
      .where(and(...conds))
      .orderBy(asc(t.lastName), asc(t.firstName));
    return rows.map((r) => ({ ...r.staff, departmentName: r.departmentName }));
  }

  async findStaff(id: string, institutionId: string): Promise<Staff | undefined> {
    const t = schema.staff;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async getStaffProfile(id: string, institutionId: string): Promise<StaffProfileData | undefined> {
    const t = schema.staff;
    const [base] = await this.db
      .select({
        staff: t,
        departmentName: schema.departments.name,
        campusName: schema.campuses.name,
      })
      .from(t)
      .leftJoin(schema.departments, eq(schema.departments.id, t.departmentId))
      .leftJoin(schema.campuses, eq(schema.campuses.id, t.campusId))
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    if (!base) return undefined;

    const roleKeys = base.staff.institutionUserId
      ? (
          await this.db
            .select({ roleKey: schema.institutionUserRoles.roleKey })
            .from(schema.institutionUserRoles)
            .where(eq(schema.institutionUserRoles.institutionUserId, base.staff.institutionUserId))
        ).map((r) => r.roleKey)
      : [];

    const classTeacherOf = await this.db
      .select({ id: schema.classes.id, name: schema.classes.name })
      .from(schema.classes)
      .where(and(eq(schema.classes.institutionId, institutionId), eq(schema.classes.classTeacherId, id)))
      .orderBy(asc(schema.classes.name));

    const subjectTeaching = await this.db
      .select({
        classId: schema.classSubjectTeachers.classId,
        className: schema.classes.name,
        subjectId: schema.classSubjectTeachers.subjectId,
        subjectName: schema.subjects.name,
      })
      .from(schema.classSubjectTeachers)
      .innerJoin(schema.classes, eq(schema.classes.id, schema.classSubjectTeachers.classId))
      .innerJoin(schema.subjects, eq(schema.subjects.id, schema.classSubjectTeachers.subjectId))
      .where(and(eq(schema.classSubjectTeachers.institutionId, institutionId), eq(schema.classSubjectTeachers.teacherId, id)))
      .orderBy(asc(schema.classes.name), asc(schema.subjects.name));

    return {
      staff: base.staff,
      departmentName: base.departmentName,
      campusName: base.campusName,
      roleKeys,
      classTeacherOf,
      subjectTeaching,
    };
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

  async listParentChildren(parentId: string, institutionId: string) {
    const sg = schema.studentGuardians;
    const rows = await this.db
      .select({
        studentId: sg.studentId,
        relationship: sg.relationship,
        isPrimary: sg.isPrimary,
        admissionNo: schema.students.admissionNo,
        firstName: schema.students.firstName,
        lastName: schema.students.lastName,
        className: schema.classes.name,
        gradeLevelName: schema.gradeLevels.name,
        status: schema.students.status,
      })
      .from(sg)
      .innerJoin(schema.students, eq(schema.students.id, sg.studentId))
      .leftJoin(schema.classes, eq(schema.classes.id, schema.students.classId))
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, schema.students.gradeLevelId))
      .where(and(eq(sg.parentId, parentId), eq(sg.institutionId, institutionId)))
      .orderBy(desc(sg.isPrimary), asc(schema.students.lastName));
    return rows;
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
    table: typeof schema.students | typeof schema.staff | typeof schema.parents,
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
