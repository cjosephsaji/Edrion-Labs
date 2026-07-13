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
  personSqlName,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type {
  AcademicYear,
  AcademicTerm,
  Class,
  ClassSubjectTeacher,
  Department,
  DepartmentGradeLevel,
  GradeLevel,
  NewAcademicYear,
  NewAcademicTerm,
  NewClass,
  NewClassSubjectTeacher,
  NewDepartment,
  NewDepartmentGradeLevel,
  NewGradeLevel,
  NewProgrammeSubject,
  NewSubject,
  ProgrammeSubject,
  Subject,
} from '@edrion/database';
import type { AcademicsListQuery, RosterCandidateQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import { studentSearchCondition } from './student-search';

/** A campus filter resolved from the request scope (null = every campus in the institution). */
export type CampusFilter = string[] | null;

/** Display name for a teacher FK (class teacher / department head / subject teacher). */
const teacherDisplayName = personSqlName(schema.staff.firstName, schema.staff.middleName, schema.staff.lastName);

export interface Page<T> {
  items: T[];
  total: number;
}

/** Class row enriched with the display names its foreign keys point at. */
export interface ClassRow extends Class {
  academicYearName: string | null;
  gradeLevelName: string | null;
  classTeacherName: string | null;
  studentCount: number;
  /** Programme → semester lineage, so a class row states where it sits without a second lookup. */
  termName: string | null;
  termSequence: number | null;
  departmentId: string | null;
  departmentName: string | null;
  subjectCount: number;
}
export interface DepartmentRow extends Department {
  headUserName: string | null;
  gradeLevelCount: number;
  subjectCount: number;
  staffCount: number;
}
export interface GradeLevelRow extends GradeLevel {
  departmentName: string | null;
  classCount: number;
  studentCount: number;
}
export interface DepartmentGradeLevelRow extends DepartmentGradeLevel {
  departmentName: string | null;
  gradeLevelName: string | null;
}
/** Where a subject sits in the curriculum — "Applied Psychology · Year 1 · Semester 1". */
export interface SubjectPlacement {
  id: string;
  programmeLevelId: string;
  departmentId: string;
  departmentName: string | null;
  gradeLevelName: string | null;
  semesterSequence: number;
  credits: number | null;
  isElective: boolean;
}
export interface SubjectRow extends Subject {
  departmentName: string | null;
  classCount: number;
  placements: SubjectPlacement[];
}
export interface ProgrammeSubjectRow extends ProgrammeSubject {
  subjectName: string | null;
  subjectCode: string | null;
  subjectKind: string | null;
  departmentName: string | null;
  gradeLevelName: string | null;
  programmeSequence: number | null;
}
export interface ClassSubjectRow extends ClassSubjectTeacher {
  subjectName: string | null;
  subjectCode: string | null;
  teacherName: string | null;
}
/** A curriculum row resolved against a class, with whether the class already teaches it. */
export interface ClassCurriculumRow extends ProgrammeSubjectRow {
  assigned: boolean;
}
export interface AcademicTermRow extends AcademicTerm {
  academicYearName: string | null;
  departmentName: string | null;
  gradeLevelName: string | null;
  classCount: number;
  subjectCount: number;
}
export interface RosterCandidate {
  id: string;
  admissionNo: string;
  firstName: string;
  lastName: string;
  rollNo: string | null;
  status: string;
  currentClassId: string | null;
  currentClassName: string | null;
}

export interface ProgrammeStructureSection {
  id: string;
  name: string;
  section: string | null;
  termId: string | null;
  programmeLevelId: string | null;
  studentCount: number;
  subjectCount: number;
}

/** A curriculum entry hanging off a semester node in the programme tree. */
export interface ProgrammeStructureSubject {
  id: string;
  subjectId: string;
  name: string;
  code: string;
  kind: string;
  credits: number | null;
  isElective: boolean;
  version: number;
}

export interface ProgrammeStructureTerm {
  id: string;
  name: string;
  kind: string;
  sequence: number;
  startDate: string;
  endDate: string;
  status: string;
  programmeLevelId: string | null;
  sections: ProgrammeStructureSection[];
  subjects: ProgrammeStructureSubject[];
}

export interface ProgrammeStructureLevel {
  id: string;
  departmentId: string;
  gradeLevelId: string;
  gradeLevelName: string;
  sequence: number;
  durationLabel: string | null;
  status: string;
  version: number;
  terms: ProgrammeStructureTerm[];
}

export interface ProgrammeStructureDepartment {
  id: string;
  name: string;
  code: string;
  levels: ProgrammeStructureLevel[];
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

  // --- academic terms --------------------------------------------------------

  async listAcademicTerms(institutionId: string, campusIds: CampusFilter, q: AcademicsListQuery): Promise<Page<AcademicTermRow>> {
    const t = schema.academicTerms;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) conds.push(ilike(t.name, `%${q.search}%`));
    if (q.programmeLevelId) conds.push(eq(t.programmeLevelId, q.programmeLevelId));
    if (q.departmentId) conds.push(eq(t.departmentId, q.departmentId));
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { name: t.name, sequence: t.sequence, startDate: t.startDate, createdAt: t.createdAt };
    const { limit, offset } = this.pageBounds(q);

    const rows = await this.db
      .select({
        term: t,
        academicYearName: schema.academicYears.name,
        departmentName: schema.departments.name,
        gradeLevelName: schema.gradeLevels.name,
      })
      .from(t)
      .leftJoin(schema.academicYears, eq(schema.academicYears.id, t.academicYearId))
      .leftJoin(schema.departments, eq(schema.departments.id, t.departmentId))
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, t.gradeLevelId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.sequence))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);

    const termIds = rows.map((r) => r.term.id);
    const classCounts = await this.countByForeignKey(schema.classes, schema.classes.termId, termIds);
    const subjectCounts = await this.countTermCurriculum(rows.map((r) => r.term));

    return {
      items: rows.map((r) => ({
        ...r.term,
        academicYearName: r.academicYearName,
        departmentName: r.departmentName,
        gradeLevelName: r.gradeLevelName,
        classCount: classCounts.get(r.term.id) ?? 0,
        subjectCount: subjectCounts.get(r.term.id) ?? 0,
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  /**
   * How many curriculum subjects each term inherits. A term's subjects are the programme_subjects
   * rows for its (programme_level_id, sequence) slot — the curriculum is a template, so the count
   * is derived rather than stored.
   */
  private async countTermCurriculum(
    terms: { id: string; programmeLevelId: string | null; sequence: number }[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const placed = terms.filter((t) => t.programmeLevelId);
    if (placed.length === 0) return map;

    const ps = schema.programmeSubjects;
    const rows = await this.db
      .select({
        programmeLevelId: ps.programmeLevelId,
        semesterSequence: ps.semesterSequence,
        value: count(),
      })
      .from(ps)
      .where(inArray(ps.programmeLevelId, [...new Set(placed.map((t) => t.programmeLevelId!))]))
      .groupBy(ps.programmeLevelId, ps.semesterSequence);

    const bySlot = new Map<string, number>();
    for (const r of rows) bySlot.set(`${r.programmeLevelId}:${r.semesterSequence}`, Number(r.value ?? 0));
    for (const t of placed) map.set(t.id, bySlot.get(`${t.programmeLevelId}:${t.sequence}`) ?? 0);
    return map;
  }

  async findAcademicTerm(id: string, institutionId: string): Promise<AcademicTerm | undefined> {
    const t = schema.academicTerms;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertAcademicTerm(values: NewAcademicTerm): Promise<AcademicTerm> {
    const [row] = await this.db.insert(schema.academicTerms).values(values).returning();
    return row!;
  }

  async updateAcademicTerm(id: string, version: number, patch: Partial<NewAcademicTerm>): Promise<AcademicTerm | undefined> {
    const t = schema.academicTerms;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async clearCurrentAcademicTerm(institutionId: string, campusId: string | null, exceptId: string): Promise<void> {
    const t = schema.academicTerms;
    const conds: SQL[] = [eq(t.institutionId, institutionId), eq(t.isCurrent, true)];
    conds.push(campusId === null ? isNull(t.campusId) : eq(t.campusId, campusId));
    await this.db.update(t).set({ isCurrent: false, updatedAt: new Date() }).where(and(...conds));
    void exceptId;
  }

  deleteAcademicTerm = (id: string, version: number) => this.del(schema.academicTerms, id, version);

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
      .leftJoin(schema.staff, eq(schema.staff.id, t.headUserId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.name))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);

    const deptIds = rows.map((r) => r.dept.id);
    const gradeCounts = await this.countByForeignKey(schema.gradeLevels, schema.gradeLevels.departmentId, deptIds);
    const subjectCounts = await this.countByForeignKey(schema.subjects, schema.subjects.departmentId, deptIds);
    const staffCounts = await this.countByForeignKey(schema.staff, schema.staff.departmentId, deptIds);

    return {
      items: rows.map((r) => ({
        ...r.dept,
        headUserName: r.headUserName,
        gradeLevelCount: gradeCounts.get(r.dept.id) ?? 0,
        subjectCount: subjectCounts.get(r.dept.id) ?? 0,
        staffCount: staffCounts.get(r.dept.id) ?? 0,
      })),
      total: Number(tot?.value ?? 0),
    };
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

    const gradeIds = rows.map((r) => r.grade.id);
    const classCounts = await this.countByForeignKey(schema.classes, schema.classes.gradeLevelId, gradeIds);
    const studentCounts = await this.countByForeignKey(schema.students, schema.students.gradeLevelId, gradeIds);

    return {
      items: rows.map((r) => ({
        ...r.grade,
        departmentName: r.departmentName,
        classCount: classCounts.get(r.grade.id) ?? 0,
        studentCount: studentCounts.get(r.grade.id) ?? 0,
      })),
      total: Number(tot?.value ?? 0),
    };
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

  // --- department grade levels (programme ↔ year) ----------------------------

  async listDepartmentGradeLevels(
    institutionId: string,
    campusIds: CampusFilter,
    q: AcademicsListQuery,
  ): Promise<Page<DepartmentGradeLevelRow>> {
    const t = schema.departmentGradeLevels;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.departmentId) conds.push(eq(t.departmentId, q.departmentId));
    if (q.search) {
      const s = or(
        ilike(schema.departments.name, `%${q.search}%`),
        ilike(schema.gradeLevels.name, `%${q.search}%`),
      );
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { sequence: t.sequence, createdAt: t.createdAt };
    const { limit, offset } = this.pageBounds(q);

    const rows = await this.db
      .select({
        link: t,
        departmentName: schema.departments.name,
        gradeLevelName: schema.gradeLevels.name,
      })
      .from(t)
      .innerJoin(schema.departments, eq(schema.departments.id, t.departmentId))
      .innerJoin(schema.gradeLevels, eq(schema.gradeLevels.id, t.gradeLevelId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.sequence))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({
        ...r.link,
        departmentName: r.departmentName,
        gradeLevelName: r.gradeLevelName,
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findDepartmentGradeLevel(id: string, institutionId: string): Promise<DepartmentGradeLevel | undefined> {
    const t = schema.departmentGradeLevels;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.id, id), eq(t.institutionId, institutionId)))
      .limit(1);
    return row;
  }

  async findDepartmentGradeLevelByPair(
    institutionId: string,
    departmentId: string,
    gradeLevelId: string,
  ): Promise<DepartmentGradeLevel | undefined> {
    const t = schema.departmentGradeLevels;
    const [row] = await this.db
      .select()
      .from(t)
      .where(
        and(
          eq(t.institutionId, institutionId),
          eq(t.departmentId, departmentId),
          eq(t.gradeLevelId, gradeLevelId),
        ),
      )
      .limit(1);
    return row;
  }

  async insertDepartmentGradeLevel(values: NewDepartmentGradeLevel): Promise<DepartmentGradeLevel> {
    const [row] = await this.db.insert(schema.departmentGradeLevels).values(values).returning();
    return row!;
  }

  async updateDepartmentGradeLevel(
    id: string,
    version: number,
    patch: Partial<NewDepartmentGradeLevel>,
  ): Promise<DepartmentGradeLevel | undefined> {
    const t = schema.departmentGradeLevels;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  deleteDepartmentGradeLevel = (id: string, version: number) =>
    this.del(schema.departmentGradeLevels, id, version);

  async getProgrammeStructure(
    institutionId: string,
    campusIds: CampusFilter,
    departmentId?: string,
  ): Promise<ProgrammeStructureDepartment[]> {
    const deptConds = this.scopeConds(
      schema.departments.institutionId,
      schema.departments.campusId,
      institutionId,
      campusIds,
    );
    if (departmentId) deptConds.push(eq(schema.departments.id, departmentId));
    const depts = await this.db
      .select({
        id: schema.departments.id,
        name: schema.departments.name,
        code: schema.departments.code,
      })
      .from(schema.departments)
      .where(and(...deptConds))
      .orderBy(asc(schema.departments.name));

    if (depts.length === 0) return [];

    const deptIds = depts.map((d) => d.id);
    const levelConds = [
      eq(schema.departmentGradeLevels.institutionId, institutionId),
      inArray(schema.departmentGradeLevels.departmentId, deptIds),
    ];
    if (campusIds) {
      const inScope = or(
        isNull(schema.departmentGradeLevels.campusId),
        inArray(schema.departmentGradeLevels.campusId, campusIds),
      );
      if (inScope) levelConds.push(inScope);
    }

    const levelRows = await this.db
      .select({
        link: schema.departmentGradeLevels,
        gradeLevelName: schema.gradeLevels.name,
      })
      .from(schema.departmentGradeLevels)
      .innerJoin(schema.gradeLevels, eq(schema.gradeLevels.id, schema.departmentGradeLevels.gradeLevelId))
      .where(and(...levelConds))
      .orderBy(asc(schema.departmentGradeLevels.sequence), asc(schema.gradeLevels.level));

    const levelIds = levelRows.map((r) => r.link.id);
    if (levelIds.length === 0) {
      return depts.map((d) => ({ ...d, levels: [] }));
    }

    const termRows = await this.db
      .select()
      .from(schema.academicTerms)
      .where(
        and(
          eq(schema.academicTerms.institutionId, institutionId),
          inArray(schema.academicTerms.programmeLevelId, levelIds),
        ),
      )
      .orderBy(asc(schema.academicTerms.sequence));

    const sectionRows = await this.db
      .select({
        id: schema.classes.id,
        name: schema.classes.name,
        section: schema.classes.section,
        termId: schema.classes.termId,
        programmeLevelId: schema.classes.programmeLevelId,
      })
      .from(schema.classes)
      .where(
        and(
          eq(schema.classes.institutionId, institutionId),
          inArray(schema.classes.programmeLevelId, levelIds),
        ),
      )
      .orderBy(asc(schema.classes.name));

    const sectionIds = sectionRows.map((s) => s.id);
    const sectionStudentCounts = await this.countByForeignKey(
      schema.students,
      schema.students.classId,
      sectionIds,
    );
    const sectionSubjectCounts = await this.countByForeignKey(
      schema.classSubjectTeachers,
      schema.classSubjectTeachers.classId,
      sectionIds,
    );

    // Curriculum for the whole tree in one read, bucketed by (programme level, semester slot).
    const ps = schema.programmeSubjects;
    const curriculumRows = await this.db
      .select({
        id: ps.id,
        programmeLevelId: ps.programmeLevelId,
        semesterSequence: ps.semesterSequence,
        subjectId: ps.subjectId,
        credits: ps.credits,
        isElective: ps.isElective,
        version: ps.version,
        name: schema.subjects.name,
        code: schema.subjects.code,
        kind: schema.subjects.kind,
      })
      .from(ps)
      .innerJoin(schema.subjects, eq(schema.subjects.id, ps.subjectId))
      .where(and(eq(ps.institutionId, institutionId), inArray(ps.programmeLevelId, levelIds)))
      .orderBy(asc(ps.sequence), asc(schema.subjects.name));

    const subjectsBySlot = new Map<string, ProgrammeStructureSubject[]>();
    for (const r of curriculumRows) {
      const key = `${r.programmeLevelId}:${r.semesterSequence}`;
      const list = subjectsBySlot.get(key) ?? [];
      list.push({
        id: r.id,
        subjectId: r.subjectId,
        name: r.name,
        code: r.code,
        kind: r.kind,
        credits: r.credits,
        isElective: r.isElective,
        version: r.version,
      });
      subjectsBySlot.set(key, list);
    }

    const sectionsByTerm = new Map<string, ProgrammeStructureSection[]>();
    const sectionsByLevel = new Map<string, ProgrammeStructureSection[]>();
    for (const s of sectionRows) {
      const node: ProgrammeStructureSection = {
        id: s.id,
        name: s.name,
        section: s.section,
        termId: s.termId,
        programmeLevelId: s.programmeLevelId,
        studentCount: sectionStudentCounts.get(s.id) ?? 0,
        subjectCount: sectionSubjectCounts.get(s.id) ?? 0,
      };
      if (s.termId) {
        const list = sectionsByTerm.get(s.termId) ?? [];
        list.push(node);
        sectionsByTerm.set(s.termId, list);
      } else if (s.programmeLevelId) {
        const list = sectionsByLevel.get(s.programmeLevelId) ?? [];
        list.push(node);
        sectionsByLevel.set(s.programmeLevelId, list);
      }
    }

    const termsByLevel = new Map<string, ProgrammeStructureTerm[]>();
    for (const term of termRows) {
      if (!term.programmeLevelId) continue;
      const node: ProgrammeStructureTerm = {
        id: term.id,
        name: term.name,
        kind: term.kind,
        sequence: term.sequence,
        startDate: term.startDate,
        endDate: term.endDate,
        status: term.status,
        programmeLevelId: term.programmeLevelId,
        sections: sectionsByTerm.get(term.id) ?? [],
        subjects: subjectsBySlot.get(`${term.programmeLevelId}:${term.sequence}`) ?? [],
      };
      const list = termsByLevel.get(term.programmeLevelId) ?? [];
      list.push(node);
      termsByLevel.set(term.programmeLevelId, list);
    }

    const levelsByDept = new Map<string, ProgrammeStructureLevel[]>();
    for (const r of levelRows) {
      const node: ProgrammeStructureLevel = {
        id: r.link.id,
        departmentId: r.link.departmentId,
        gradeLevelId: r.link.gradeLevelId,
        gradeLevelName: r.gradeLevelName,
        sequence: r.link.sequence,
        durationLabel: r.link.durationLabel,
        status: r.link.status,
        version: r.link.version,
        terms: termsByLevel.get(r.link.id) ?? [],
      };
      const orphanSections = sectionsByLevel.get(r.link.id) ?? [];
      if (orphanSections.length > 0 && node.terms.length === 0) {
        node.terms.push({
          id: `orphan-${r.link.id}`,
          name: '(Unassigned)',
          kind: 'term',
          sequence: 0,
          startDate: '',
          endDate: '',
          status: 'planning',
          programmeLevelId: r.link.id,
          sections: orphanSections,
          subjects: [],
        });
      }
      const list = levelsByDept.get(r.link.departmentId) ?? [];
      list.push(node);
      levelsByDept.set(r.link.departmentId, list);
    }

    return depts.map((d) => ({
      ...d,
      levels: levelsByDept.get(d.id) ?? [],
    }));
  }

  // --- subjects --------------------------------------------------------------

  async listSubjects(institutionId: string, campusIds: CampusFilter, q: AcademicsListQuery): Promise<Page<SubjectRow>> {
    const t = schema.subjects;
    const ps = schema.programmeSubjects;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) {
      const s = or(ilike(t.name, `%${q.search}%`), ilike(t.code, `%${q.search}%`));
      if (s) conds.push(s);
    }
    if (q.kind) conds.push(eq(t.kind, q.kind));
    if (q.departmentId) conds.push(eq(t.departmentId, q.departmentId));

    // Year and semester are properties of the CURRICULUM, not of the subject itself, so these two
    // facets narrow the catalogue to subjects that have a matching placement.
    const slotConds: SQL[] = [];
    if (q.programmeLevelId) slotConds.push(eq(ps.programmeLevelId, q.programmeLevelId));
    if (q.semesterSequence) slotConds.push(eq(ps.semesterSequence, q.semesterSequence));

    if (slotConds.length > 0) {
      conds.push(
        inArray(
          t.id,
          this.db.select({ id: ps.subjectId }).from(ps).where(and(...slotConds)),
        ),
      );
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

    const subjectIds = rows.map((r) => r.subject.id);
    const classCounts = await this.countDistinctByForeignKey(
      schema.classSubjectTeachers,
      schema.classSubjectTeachers.subjectId,
      schema.classSubjectTeachers.classId,
      subjectIds,
    );
    const placements = await this.listSubjectPlacements(subjectIds);

    return {
      items: rows.map((r) => ({
        ...r.subject,
        departmentName: r.departmentName,
        classCount: classCounts.get(r.subject.id) ?? 0,
        placements: placements.get(r.subject.id) ?? [],
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  /** Every curriculum slot each of these subjects is taught in, keyed by subject id. */
  async listSubjectPlacements(subjectIds: string[]): Promise<Map<string, SubjectPlacement[]>> {
    const map = new Map<string, SubjectPlacement[]>();
    if (subjectIds.length === 0) return map;

    const ps = schema.programmeSubjects;
    const rows = await this.db
      .select({
        id: ps.id,
        subjectId: ps.subjectId,
        programmeLevelId: ps.programmeLevelId,
        departmentId: ps.departmentId,
        semesterSequence: ps.semesterSequence,
        credits: ps.credits,
        isElective: ps.isElective,
        departmentName: schema.departments.name,
        gradeLevelName: schema.gradeLevels.name,
        programmeSequence: schema.departmentGradeLevels.sequence,
      })
      .from(ps)
      .leftJoin(schema.departments, eq(schema.departments.id, ps.departmentId))
      .leftJoin(schema.departmentGradeLevels, eq(schema.departmentGradeLevels.id, ps.programmeLevelId))
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, schema.departmentGradeLevels.gradeLevelId))
      .where(inArray(ps.subjectId, subjectIds))
      .orderBy(
        asc(schema.departments.name),
        asc(schema.departmentGradeLevels.sequence),
        asc(ps.semesterSequence),
      );

    for (const r of rows) {
      const list = map.get(r.subjectId) ?? [];
      list.push({
        id: r.id,
        programmeLevelId: r.programmeLevelId,
        departmentId: r.departmentId,
        departmentName: r.departmentName,
        gradeLevelName: r.gradeLevelName,
        semesterSequence: r.semesterSequence,
        credits: r.credits,
        isElective: r.isElective,
      });
      map.set(r.subjectId, list);
    }
    return map;
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

  // --- programme subjects (curriculum) ---------------------------------------

  /** The joins every curriculum read needs: subject + programme + year names. */
  private programmeSubjectSelect() {
    const ps = schema.programmeSubjects;
    return {
      row: ps,
      subjectName: schema.subjects.name,
      subjectCode: schema.subjects.code,
      subjectKind: schema.subjects.kind,
      departmentName: schema.departments.name,
      gradeLevelName: schema.gradeLevels.name,
      programmeSequence: schema.departmentGradeLevels.sequence,
    };
  }

  private toProgrammeSubjectRow(r: {
    row: ProgrammeSubject;
    subjectName: string | null;
    subjectCode: string | null;
    subjectKind: string | null;
    departmentName: string | null;
    gradeLevelName: string | null;
    programmeSequence: number | null;
  }): ProgrammeSubjectRow {
    return {
      ...r.row,
      subjectName: r.subjectName,
      subjectCode: r.subjectCode,
      subjectKind: r.subjectKind,
      departmentName: r.departmentName,
      gradeLevelName: r.gradeLevelName,
      programmeSequence: r.programmeSequence,
    };
  }

  async listProgrammeSubjects(
    institutionId: string,
    campusIds: CampusFilter,
    q: AcademicsListQuery,
  ): Promise<Page<ProgrammeSubjectRow>> {
    const ps = schema.programmeSubjects;
    const conds = this.scopeConds(ps.institutionId, ps.campusId, institutionId, campusIds);
    if (q.departmentId) conds.push(eq(ps.departmentId, q.departmentId));
    if (q.programmeLevelId) conds.push(eq(ps.programmeLevelId, q.programmeLevelId));
    if (q.semesterSequence) conds.push(eq(ps.semesterSequence, q.semesterSequence));
    if (q.subjectId) conds.push(eq(ps.subjectId, q.subjectId));
    if (q.search) {
      const s = or(ilike(schema.subjects.name, `%${q.search}%`), ilike(schema.subjects.code, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      semesterSequence: ps.semesterSequence,
      sequence: ps.sequence,
      credits: ps.credits,
      name: schema.subjects.name,
      createdAt: ps.createdAt,
    };
    const { limit, offset } = this.pageBounds(q);

    const base = this.db
      .select(this.programmeSubjectSelect())
      .from(ps)
      .leftJoin(schema.subjects, eq(schema.subjects.id, ps.subjectId))
      .leftJoin(schema.departments, eq(schema.departments.id, ps.departmentId))
      .leftJoin(schema.departmentGradeLevels, eq(schema.departmentGradeLevels.id, ps.programmeLevelId))
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, schema.departmentGradeLevels.gradeLevelId));

    const rows = await base
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, ps.semesterSequence))
      .limit(limit)
      .offset(offset);

    const [tot] = await this.db
      .select({ value: count() })
      .from(ps)
      .leftJoin(schema.subjects, eq(schema.subjects.id, ps.subjectId))
      .where(where);

    return {
      items: rows.map((r) => this.toProgrammeSubjectRow(r)),
      total: Number(tot?.value ?? 0),
    };
  }

  async findProgrammeSubject(id: string, institutionId: string): Promise<ProgrammeSubject | undefined> {
    const ps = schema.programmeSubjects;
    const [row] = await this.db
      .select()
      .from(ps)
      .where(and(eq(ps.id, id), eq(ps.institutionId, institutionId)))
      .limit(1);
    return row;
  }

  /** The unique curriculum slot — used to turn a duplicate insert into a friendly 409. */
  async findProgrammeSubjectSlot(
    programmeLevelId: string,
    semesterSequence: number,
    subjectId: string,
  ): Promise<ProgrammeSubject | undefined> {
    const ps = schema.programmeSubjects;
    const [row] = await this.db
      .select()
      .from(ps)
      .where(
        and(
          eq(ps.programmeLevelId, programmeLevelId),
          eq(ps.semesterSequence, semesterSequence),
          eq(ps.subjectId, subjectId),
        ),
      )
      .limit(1);
    return row;
  }

  async insertProgrammeSubject(values: NewProgrammeSubject): Promise<ProgrammeSubject> {
    const [row] = await this.db.insert(schema.programmeSubjects).values(values).returning();
    return row!;
  }

  async updateProgrammeSubject(
    id: string,
    version: number,
    patch: Partial<NewProgrammeSubject>,
  ): Promise<ProgrammeSubject | undefined> {
    const ps = schema.programmeSubjects;
    const [row] = await this.db
      .update(ps)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(ps.id, id), eq(ps.version, version)))
      .returning();
    return row;
  }

  deleteProgrammeSubject = (id: string, version: number) =>
    this.del(schema.programmeSubjects, id, version);

  /**
   * The curriculum a class inherits: every programme_subjects row for the class's programme level
   * and its term's semester slot, flagged with whether the class already teaches it.
   */
  async listClassCurriculum(cls: Class): Promise<ClassCurriculumRow[]> {
    if (!cls.programmeLevelId) return [];

    let semesterSequence: number | null = null;
    if (cls.termId) {
      const term = await this.db
        .select({ sequence: schema.academicTerms.sequence })
        .from(schema.academicTerms)
        .where(eq(schema.academicTerms.id, cls.termId))
        .limit(1);
      semesterSequence = term[0]?.sequence ?? null;
    }

    const ps = schema.programmeSubjects;
    const conds: SQL[] = [eq(ps.programmeLevelId, cls.programmeLevelId)];
    // A class with no term inherits the whole year's curriculum rather than nothing.
    if (semesterSequence !== null) conds.push(eq(ps.semesterSequence, semesterSequence));

    const rows = await this.db
      .select(this.programmeSubjectSelect())
      .from(ps)
      .leftJoin(schema.subjects, eq(schema.subjects.id, ps.subjectId))
      .leftJoin(schema.departments, eq(schema.departments.id, ps.departmentId))
      .leftJoin(schema.departmentGradeLevels, eq(schema.departmentGradeLevels.id, ps.programmeLevelId))
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, schema.departmentGradeLevels.gradeLevelId))
      .where(and(...conds))
      .orderBy(asc(ps.semesterSequence), asc(ps.sequence), asc(schema.subjects.name));

    const assigned = await this.db
      .select({ subjectId: schema.classSubjectTeachers.subjectId })
      .from(schema.classSubjectTeachers)
      .where(eq(schema.classSubjectTeachers.classId, cls.id));
    const assignedIds = new Set(assigned.map((a) => a.subjectId));

    return rows.map((r) => ({
      ...this.toProgrammeSubjectRow(r),
      assigned: assignedIds.has(r.row.subjectId),
    }));
  }

  /** Add several subjects to a class at once; ignores subjects the class already teaches. */
  async insertClassSubjects(values: NewClassSubjectTeacher[]): Promise<ClassSubjectTeacher[]> {
    if (values.length === 0) return [];
    return this.db
      .insert(schema.classSubjectTeachers)
      .values(values)
      .onConflictDoNothing({
        target: [schema.classSubjectTeachers.classId, schema.classSubjectTeachers.subjectId],
      })
      .returning();
  }

  // --- classes / sections ----------------------------------------------------

  async listClasses(institutionId: string, campusIds: CampusFilter, q: AcademicsListQuery): Promise<Page<ClassRow>> {
    const t = schema.classes;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.search) conds.push(ilike(t.name, `%${q.search}%`));
    if (q.programmeLevelId) conds.push(eq(t.programmeLevelId, q.programmeLevelId));
    if (q.termId) conds.push(eq(t.termId, q.termId));
    if (q.departmentId) {
      conds.push(
        inArray(
          t.programmeLevelId,
          this.db
            .select({ id: schema.departmentGradeLevels.id })
            .from(schema.departmentGradeLevels)
            .where(eq(schema.departmentGradeLevels.departmentId, q.departmentId)),
        ),
      );
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = { name: t.name, createdAt: t.createdAt };
    const { limit, offset } = this.pageBounds(q);

    const studentCountSq = this.db
      .select({
        classId: schema.students.classId,
        value: count().as('value'),
      })
      .from(schema.students)
      .groupBy(schema.students.classId)
      .as('student_counts');

    const rows = await this.db
      .select({
        cls: t,
        academicYearName: schema.academicYears.name,
        gradeLevelName: schema.gradeLevels.name,
        classTeacherName: teacherDisplayName,
        studentCount: sql<number>`coalesce(${studentCountSq.value}, 0)`,
        termName: schema.academicTerms.name,
        termSequence: schema.academicTerms.sequence,
        departmentId: schema.departmentGradeLevels.departmentId,
        departmentName: schema.departments.name,
      })
      .from(t)
      .leftJoin(schema.academicYears, eq(schema.academicYears.id, t.academicYearId))
      .leftJoin(schema.gradeLevels, eq(schema.gradeLevels.id, t.gradeLevelId))
      .leftJoin(schema.staff, eq(schema.staff.id, t.classTeacherId))
      .leftJoin(studentCountSq, eq(studentCountSq.classId, t.id))
      .leftJoin(schema.academicTerms, eq(schema.academicTerms.id, t.termId))
      .leftJoin(schema.departmentGradeLevels, eq(schema.departmentGradeLevels.id, t.programmeLevelId))
      .leftJoin(schema.departments, eq(schema.departments.id, schema.departmentGradeLevels.departmentId))
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.name))
      .limit(limit)
      .offset(offset);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);

    const subjectCounts = await this.countByForeignKey(
      schema.classSubjectTeachers,
      schema.classSubjectTeachers.classId,
      rows.map((r) => r.cls.id),
    );

    return {
      items: rows.map((r) => ({
        ...r.cls,
        academicYearName: r.academicYearName,
        gradeLevelName: r.gradeLevelName,
        classTeacherName: r.classTeacherName,
        studentCount: Number(r.studentCount ?? 0),
        termName: r.termName,
        termSequence: r.termSequence,
        departmentId: r.departmentId,
        departmentName: r.departmentName,
        subjectCount: subjectCounts.get(r.cls.id) ?? 0,
      })),
      total: Number(tot?.value ?? 0),
    };
  }

  async listClassRoster(classId: string, institutionId: string) {
    const t = schema.students;
    return this.db
      .select({
        id: t.id,
        admissionNo: t.admissionNo,
        firstName: t.firstName,
        middleName: t.middleName,
        lastName: t.lastName,
        rollNo: t.rollNo,
        status: t.status,
        gender: t.gender,
      })
      .from(t)
      .where(and(eq(t.classId, classId), eq(t.institutionId, institutionId)))
      .orderBy(asc(t.rollNo), asc(t.lastName), asc(t.firstName));
  }

  /**
   * Students who could join this class. By default only students with no class at all, so the
   * common "fill an empty section" case can't silently poach another section's roster; pass
   * `includeAssigned` to move students between classes.
   */
  async listRosterCandidates(
    institutionId: string,
    campusIds: CampusFilter,
    classId: string,
    q: RosterCandidateQuery,
  ): Promise<RosterCandidate[]> {
    const t = schema.students;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    // Only students on the roll can be seated: graduated / transferred / inactive ones can't.
    conds.push(eq(t.status, 'enrolled'));

    if (q.includeAssigned) {
      const notThisClass = or(isNull(t.classId), sql`${t.classId} <> ${classId}`);
      if (notThisClass) conds.push(notThisClass);
    } else {
      conds.push(isNull(t.classId));
    }

    if (q.search) conds.push(studentSearchCondition(t, q.search));

    const rows = await this.db
      .select({
        id: t.id,
        admissionNo: t.admissionNo,
        firstName: t.firstName,
        middleName: t.middleName,
        lastName: t.lastName,
        rollNo: t.rollNo,
        status: t.status,
        currentClassId: t.classId,
        currentClassName: schema.classes.name,
      })
      .from(t)
      .leftJoin(schema.classes, eq(schema.classes.id, t.classId))
      .where(and(...conds))
      .orderBy(asc(t.lastName), asc(t.firstName))
      .limit(q.limit);

    return rows;
  }

  /** Move students into / out of a class in one transaction. Returns how many rows each way. */
  async updateClassRoster(
    institutionId: string,
    classId: string,
    add: string[],
    remove: string[],
    actorId: string | null,
  ): Promise<{ added: number; removed: number }> {
    const t = schema.students;
    return this.db.transaction(async (tx) => {
      let added = 0;
      let removed = 0;

      if (add.length > 0) {
        const rows = await tx
          .update(t)
          .set({ classId, updatedBy: actorId, updatedAt: new Date() })
          .where(and(eq(t.institutionId, institutionId), inArray(t.id, add)))
          .returning({ id: t.id });
        added = rows.length;
      }

      if (remove.length > 0) {
        const rows = await tx
          .update(t)
          .set({ classId: null, updatedBy: actorId, updatedAt: new Date() })
          .where(
            and(eq(t.institutionId, institutionId), eq(t.classId, classId), inArray(t.id, remove)),
          )
          .returning({ id: t.id });
        removed = rows.length;
      }

      return { added, removed };
    });
  }

  /** Every one of these student ids exists inside the institution (FK pre-check for bulk writes). */
  async countStudentsInInstitution(institutionId: string, ids: string[]): Promise<number> {
    if (ids.length === 0) return 0;
    const t = schema.students;
    const [row] = await this.db
      .select({ value: count() })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return Number(row?.value ?? 0);
  }

  async findCurrentAcademicYear(institutionId: string, campusIds: CampusFilter) {
    const t = schema.academicYears;
    const conds = [...this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds), eq(t.isCurrent, true)];
    const [row] = await this.db.select().from(t).where(and(...conds)).limit(1);
    return row;
  }

  async findCurrentAcademicTerm(institutionId: string, campusIds: CampusFilter) {
    const t = schema.academicTerms;
    const conds = [...this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds), eq(t.isCurrent, true)];
    const [row] = await this.db.select().from(t).where(and(...conds)).limit(1);
    return row;
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
    table:
      | 'academicYears'
      | 'academicTerms'
      | 'gradeLevels'
      | 'departments'
      | 'subjects'
      | 'staff'
      | 'departmentGradeLevels',
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
      .leftJoin(schema.staff, eq(schema.staff.id, t.teacherId))
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

  private async countByForeignKey(table: typeof schema.gradeLevels | typeof schema.subjects | typeof schema.staff | typeof schema.classes | typeof schema.students | typeof schema.classSubjectTeachers, fkCol: PgColumn, parentIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (parentIds.length === 0) return map;
    const rows = await this.db
      .select({ parentId: fkCol, value: count() })
      .from(table)
      .where(inArray(fkCol, parentIds))
      .groupBy(fkCol);
    for (const r of rows) map.set(String(r.parentId), Number(r.value ?? 0));
    return map;
  }

  private async countDistinctByForeignKey(
    table: typeof schema.classSubjectTeachers,
    fkCol: PgColumn,
    distinctCol: PgColumn,
    parentIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (parentIds.length === 0) return map;
    const rows = await this.db
      .select({ parentId: fkCol, value: sql<number>`count(distinct ${distinctCol})` })
      .from(table)
      .where(inArray(fkCol, parentIds))
      .groupBy(fkCol);
    for (const r of rows) map.set(String(r.parentId), Number(r.value ?? 0));
    return map;
  }

  /** Version-guarded hard delete; returns false on a version mismatch (→ 409 in the service). */
  private async del(
    table:
      | typeof schema.academicYears
      | typeof schema.academicTerms
      | typeof schema.departments
      | typeof schema.gradeLevels
      | typeof schema.departmentGradeLevels
      | typeof schema.subjects
      | typeof schema.programmeSubjects
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
