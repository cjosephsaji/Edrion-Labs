import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNull, or, schema, sql, type Database, type PgColumn, type SQL } from '@edrion/database';
import { DATABASE } from '../../common/tokens';
import { PortalEntityResolver } from './portal-entity-resolver';
import { UsersRepository } from './users.repository';

const MESSAGE_PERMISSION = 'messages.use';

/** One recipient target: a kind + an optional anchor/entity id (see schema/recipients.ts). */
export interface Target {
  kind: string;
  refId?: string | null;
}

/** The concrete, de-duplicated, scope-confined people a target list expands to. */
export interface ResolvedRecipients {
  studentIds: string[];
  parentIds: string[];
  teacherIds: string[];
  staffIds: string[];
  userIds: string[];
  /** Total distinct people across all kinds. */
  count: number;
  byKind: { students: number; parents: number; teachers: number; staff: number; colleagues: number };
  /** A few readable names for the pre-send preview. */
  sample: string[];
  /** A short human description of the targets, e.g. "Grade 9 – A · Parents of Class 5 · +1 more". */
  summary: string;
}

const SAMPLE_SIZE = 8;

/**
 * Expands a recipient target list (individuals, structures, derived rules, broadcasts, saved groups)
 * to the concrete people who should receive an announcement/notification — de-duplicated and confined
 * to the caller's institution + campus scope. Backs the pre-send recipient preview (count + sample)
 * and the publish fan-out. Every query is scoped; nothing crosses a tenant or campus boundary.
 */
@Injectable()
export class RecipientResolver {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly entities: PortalEntityResolver,
    private readonly usersRepo: UsersRepository,
  ) {}

  async resolve(institutionId: string, campusIds: string[] | null, targets: Target[]): Promise<ResolvedRecipients> {
    const students = new Set<string>();
    const parents = new Set<string>();
    const teachers = new Set<string>();
    const staff = new Set<string>();
    const users = new Set<string>();

    // Expand any saved groups first (one level — a group never contains another group).
    const expanded = await this.expandGroups(institutionId, targets);

    // Bucket targets by kind so each kind runs at most one batched query.
    const byKind = new Map<string, string[]>();
    for (const t of expanded) {
      const list = byKind.get(t.kind) ?? [];
      if (t.refId) list.push(t.refId);
      byKind.set(t.kind, list);
    }
    const ids = (k: string) => [...new Set(byKind.get(k) ?? [])];
    const has = (k: string) => byKind.has(k);

    // --- direct individuals (validated + scoped below) ---
    ids('student').forEach((v) => students.add(v));
    ids('parent').forEach((v) => parents.add(v));
    ids('teacher').forEach((v) => teachers.add(v));
    ids('staff').forEach((v) => staff.add(v));
    ids('user').forEach((v) => users.add(v));

    // --- structural: students of a class/grade/department/campus ---
    if (ids('class').length) (await this.studentsBy('classId', ids('class'), institutionId, campusIds)).forEach((v) => students.add(v));
    if (ids('grade').length) (await this.studentsBy('gradeLevelId', ids('grade'), institutionId, campusIds)).forEach((v) => students.add(v));
    if (ids('department').length) (await this.studentsByDept(ids('department'), institutionId, campusIds)).forEach((v) => students.add(v));
    if (ids('campus').length) {
      const cs = this.intersectCampus(ids('campus'), campusIds);
      (await this.allPeople('students', institutionId, cs)).forEach((v) => students.add(v));
      (await this.allPeople('staff', institutionId, cs, 'teacher')).forEach((v) => teachers.add(v));
      (await this.allPeople('staff', institutionId, cs)).forEach((v) => staff.add(v));
      (await this.allPeople('parents', institutionId, cs)).forEach((v) => parents.add(v));
    }

    // --- derived: teachers of a class/grade/department; students of a subject ---
    if (ids('teachers_of_class').length) (await this.teachersOfClass(ids('teachers_of_class'), institutionId, campusIds)).forEach((v) => teachers.add(v));
    if (ids('teachers_of_grade').length) (await this.teachersOfGrade(ids('teachers_of_grade'), institutionId, campusIds)).forEach((v) => teachers.add(v));
    if (ids('teachers_of_department').length) (await this.teachersBy('departmentId', ids('teachers_of_department'), institutionId, campusIds)).forEach((v) => teachers.add(v));
    if (ids('students_of_class').length) (await this.studentsBy('classId', ids('students_of_class'), institutionId, campusIds)).forEach((v) => students.add(v));
    if (ids('students_of_grade').length) (await this.studentsBy('gradeLevelId', ids('students_of_grade'), institutionId, campusIds)).forEach((v) => students.add(v));
    if (ids('students_of_department').length) (await this.studentsByDept(ids('students_of_department'), institutionId, campusIds)).forEach((v) => students.add(v));
    if (ids('students_of_subject').length) (await this.studentsOfSubject(ids('students_of_subject'), institutionId, campusIds)).forEach((v) => students.add(v));

    // --- derived: parents of students in a class/grade/department ---
    const parentAnchorStudents = new Set<string>();
    if (ids('parents_of_class').length) (await this.studentsBy('classId', ids('parents_of_class'), institutionId, campusIds)).forEach((v) => parentAnchorStudents.add(v));
    if (ids('parents_of_grade').length) (await this.studentsBy('gradeLevelId', ids('parents_of_grade'), institutionId, campusIds)).forEach((v) => parentAnchorStudents.add(v));
    if (ids('parents_of_department').length) (await this.studentsByDept(ids('parents_of_department'), institutionId, campusIds)).forEach((v) => parentAnchorStudents.add(v));
    if (parentAnchorStudents.size) (await this.parentsOfStudents([...parentAnchorStudents], institutionId)).forEach((v) => parents.add(v));

    // --- broadcasts ---
    if (has('all') || has('all_students')) (await this.allPeople('students', institutionId, campusIds)).forEach((v) => students.add(v));
    if (has('all') || has('all_teachers')) (await this.allPeople('staff', institutionId, campusIds, 'teacher')).forEach((v) => teachers.add(v));
    if (has('all') || has('all_staff')) (await this.allPeople('staff', institutionId, campusIds)).forEach((v) => staff.add(v));
    if (has('all') || has('all_parents')) (await this.allPeople('parents', institutionId, campusIds)).forEach((v) => parents.add(v));
    if (has('all_colleagues')) (await this.allColleagues(institutionId, campusIds)).forEach((v) => users.add(v));

    // Validate the direct individual ids against scope/existence (structural/derived are already scoped).
    const [vStudents, vParents, vTeachers, vStaff, vUsers] = await Promise.all([
      this.validate('students', [...students], institutionId, campusIds),
      this.validate('parents', [...parents], institutionId, campusIds),
      this.validateStaff([...teachers], institutionId, campusIds, 'teacher'),
      this.validateStaff([...staff], institutionId, campusIds, 'staff'),
      this.validateUsers([...users], institutionId, campusIds),
    ]);

    const count = vStudents.length + vParents.length + vTeachers.length + vStaff.length + vUsers.length;
    const sample = await this.sampleNames(institutionId, vStudents, vParents, vTeachers, vStaff, vUsers);
    const summary = await this.summarize(institutionId, expanded);

    return {
      studentIds: vStudents,
      parentIds: vParents,
      teacherIds: vTeachers,
      staffIds: vStaff,
      userIds: vUsers,
      count,
      byKind: {
        students: vStudents.length,
        parents: vParents.length,
        teachers: vTeachers.length,
        staff: vStaff.length,
        colleagues: vUsers.length,
      },
      sample,
      summary,
    };
  }

  // === expansion helpers =====================================================

  /** Replace `group` targets with their members (one level; nested groups are ignored). */
  private async expandGroups(institutionId: string, targets: Target[]): Promise<Target[]> {
    const groupIds = [...new Set(targets.filter((t) => t.kind === 'group' && t.refId).map((t) => t.refId as string))];
    if (groupIds.length === 0) return targets;
    const members = await this.db
      .select({ kind: schema.recipientGroupMembers.kind, refId: schema.recipientGroupMembers.refId })
      .from(schema.recipientGroupMembers)
      .where(and(eq(schema.recipientGroupMembers.institutionId, institutionId), inArray(schema.recipientGroupMembers.groupId, groupIds)));
    const rest = targets.filter((t) => t.kind !== 'group');
    return [...rest, ...members.filter((m) => m.kind !== 'group')];
  }

  private intersectCampus(anchorCampusIds: string[], scope: string[] | null): string[] {
    if (scope === null) return anchorCampusIds;
    return anchorCampusIds.filter((c) => scope.includes(c));
  }

  /** `institution_id = ? AND (campus_id IS NULL OR campus_id IN scope)` for any campus-scoped table. */
  private scopeConds(table: { institutionId: PgColumn; campusId: PgColumn }, institutionId: string, campusIds: string[] | null): SQL[] {
    const conds: SQL[] = [eq(table.institutionId, institutionId)];
    if (campusIds) {
      const c = or(isNull(table.campusId), inArray(table.campusId, campusIds));
      if (c) conds.push(c);
    }
    return conds;
  }

  private async studentsBy(col: 'classId' | 'gradeLevelId', anchorIds: string[], institutionId: string, campusIds: string[] | null) {
    const t = schema.students;
    const rows = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(...this.scopeConds(t, institutionId, campusIds), inArray(t[col], anchorIds)));
    return rows.map((r) => r.id);
  }

  /** Students in grades belonging to the given departments (grade_levels.department_id). */
  private async studentsByDept(deptIds: string[], institutionId: string, campusIds: string[] | null) {
    const gl = schema.gradeLevels;
    const grades = await this.db
      .select({ id: gl.id })
      .from(gl)
      .where(and(eq(gl.institutionId, institutionId), inArray(gl.departmentId, deptIds)));
    const gradeIds = grades.map((g) => g.id);
    if (gradeIds.length === 0) return [];
    return this.studentsBy('gradeLevelId', gradeIds, institutionId, campusIds);
  }

  private async studentsOfSubject(subjectIds: string[], institutionId: string, campusIds: string[] | null) {
    const cst = schema.classSubjectTeachers;
    const rows = await this.db
      .select({ classId: cst.classId })
      .from(cst)
      .where(and(eq(cst.institutionId, institutionId), inArray(cst.subjectId, subjectIds)));
    const classIds = [...new Set(rows.map((r) => r.classId))];
    if (classIds.length === 0) return [];
    return this.studentsBy('classId', classIds, institutionId, campusIds);
  }

  private async teachersBy(col: 'departmentId', anchorIds: string[], institutionId: string, campusIds: string[] | null) {
    const t = schema.staff;
    const rows = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(...this.scopeConds(t, institutionId, campusIds), inArray(t[col], anchorIds)));
    return rows.map((r) => r.id);
  }

  private async teachersOfClass(classIds: string[], institutionId: string, campusIds: string[] | null) {
    const out = new Set<string>();
    const cst = schema.classSubjectTeachers;
    const subjectTeachers = await this.db
      .select({ teacherId: cst.teacherId })
      .from(cst)
      .where(and(eq(cst.institutionId, institutionId), inArray(cst.classId, classIds)));
    subjectTeachers.forEach((r) => r.teacherId && out.add(r.teacherId));
    const cl = schema.classes;
    const classTeachers = await this.db
      .select({ teacherId: cl.classTeacherId })
      .from(cl)
      .where(and(eq(cl.institutionId, institutionId), inArray(cl.id, classIds)));
    classTeachers.forEach((r) => r.teacherId && out.add(r.teacherId));
    return this.validateStaff([...out], institutionId, campusIds, 'teacher');
  }

  private async teachersOfGrade(gradeIds: string[], institutionId: string, campusIds: string[] | null) {
    const cl = schema.classes;
    const classes = await this.db
      .select({ id: cl.id })
      .from(cl)
      .where(and(eq(cl.institutionId, institutionId), inArray(cl.gradeLevelId, gradeIds)));
    const classIds = classes.map((c) => c.id);
    if (classIds.length === 0) return [];
    return this.teachersOfClass(classIds, institutionId, campusIds);
  }

  private async parentsOfStudents(studentIds: string[], institutionId: string) {
    const g = schema.studentGuardians;
    const rows = await this.db
      .select({ parentId: g.parentId })
      .from(g)
      .where(and(eq(g.institutionId, institutionId), inArray(g.studentId, studentIds)));
    return [...new Set(rows.map((r) => r.parentId))];
  }

  private async allPeople(
    tableName: 'students' | 'staff' | 'parents',
    institutionId: string,
    campusIds: string[] | null,
    staffKind?: 'teacher' | 'staff',
  ) {
    if (campusIds !== null && campusIds.length === 0) return [];
    const t = schema[tableName];
    const conds = this.scopeConds(t, institutionId, campusIds);
    if (tableName === 'staff' && staffKind === 'teacher') {
      conds.push(
        sql`${t.id} in (
          select class_teacher_id from classes where institution_id = ${institutionId} and class_teacher_id is not null
          union select teacher_id from class_subject_teachers where institution_id = ${institutionId} and teacher_id is not null
        )`,
      );
    }
    const rows = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(...conds));
    return rows.map((r) => r.id);
  }

  /** Keep only the ids that exist in this institution + campus scope. */
  private async allColleagues(institutionId: string, campusIds: string[] | null): Promise<string[]> {
    const messageableIds = await this.usersRepo.userIdsWithPermission(institutionId, MESSAGE_PERMISSION);
    const rows = await this.usersRepo.listMessagingColleagues(institutionId, messageableIds, campusIds);
    return rows.map((r) => r.id);
  }

  private async validateUsers(candidateIds: string[], institutionId: string, campusIds: string[] | null) {
    if (candidateIds.length === 0) return [];
    const messageableIds = await this.usersRepo.userIdsWithPermission(institutionId, MESSAGE_PERMISSION);
    const allowed = new Set(messageableIds);
    const filtered = candidateIds.filter((id) => allowed.has(id));
    const rows = await this.usersRepo.listMessagingColleagues(institutionId, filtered, campusIds);
    return rows.map((r) => r.id);
  }

  private async validate(tableName: 'students' | 'parents', candidateIds: string[], institutionId: string, campusIds: string[] | null) {
    if (candidateIds.length === 0) return [];
    const t = schema[tableName];
    const rows = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(...this.scopeConds(t, institutionId, campusIds), inArray(t.id, candidateIds)));
    return rows.map((r) => r.id);
  }

  private async validateStaff(
    candidateIds: string[],
    institutionId: string,
    campusIds: string[] | null,
    _kind: 'teacher' | 'staff',
  ) {
    if (candidateIds.length === 0) return [];
    const t = schema.staff;
    const rows = await this.db
      .select({ id: t.id })
      .from(t)
      .where(and(...this.scopeConds(t, institutionId, campusIds), inArray(t.id, candidateIds)));
    return rows.map((r) => r.id);
  }

  private async sampleNames(
    institutionId: string,
    students: string[],
    parents: string[],
    teachers: string[],
    staff: string[],
    users: string[],
  ): Promise<string[]> {
    const refs = await this.entities.resolve(institutionId, {
      studentIds: students.slice(0, SAMPLE_SIZE),
      parentIds: parents.slice(0, SAMPLE_SIZE),
      teacherIds: teachers.slice(0, SAMPLE_SIZE),
      staffIds: staff.slice(0, SAMPLE_SIZE),
      userIds: users.slice(0, SAMPLE_SIZE),
    });
    const names: string[] = [];
    for (const bucket of [refs.student, refs.parent, refs.teacher, refs.staff, refs.user]) {
      for (const d of Object.values(bucket ?? {})) {
        names.push(d.label);
        if (names.length >= SAMPLE_SIZE) return names;
      }
    }
    return names;
  }

  /** Human summary of the targets (first three labels + "+N more"). */
  private async summarize(institutionId: string, targets: Target[]): Promise<string> {
    if (targets.length === 0) return 'No recipients';
    const described = await this.describeTargets(institutionId, targets);
    const labels = described.map((d) => d.label);
    const shown = labels.slice(0, 3);
    const more = labels.length - shown.length;
    return more > 0 ? `${shown.join(' · ')} · +${more} more` : shown.join(' · ');
  }

  /**
   * Turn each target into a readable `{kind, refId, label}` — resolving anchor entity names for
   * individuals/structures/derived kinds (person, class, grade, department, subject, campus). Reused
   * by the announcement + group DTO enrichment and the summary line.
   */
  async describeTargets(institutionId: string, targets: Target[]): Promise<Array<{ kind: string; refId: string | null; label: string }>> {
    const bucket = (pred: (k: string) => boolean) =>
      targets.filter((t) => t.refId && pred(t.kind)).map((t) => t.refId as string);
    const refs = await this.entities.resolve(institutionId, {
      studentIds: bucket((k) => k === 'student'),
      parentIds: bucket((k) => k === 'parent'),
      teacherIds: bucket((k) => k === 'teacher'),
      staffIds: bucket((k) => k === 'staff'),
      userIds: bucket((k) => k === 'user'),
      classIds: bucket((k) => k.includes('class')),
      gradeLevelIds: bucket((k) => k.includes('grade')),
      departmentIds: bucket((k) => k.includes('department')),
      subjectIds: bucket((k) => k.includes('subject')),
      campusIds: bucket((k) => k === 'campus'),
    });
    return targets.map((t) => ({ kind: t.kind, refId: t.refId ?? null, label: this.labelFor(t, refs) }));
  }

  private labelFor(t: Target, refs: Awaited<ReturnType<PortalEntityResolver['resolve']>>): string {
    const BROADCAST: Record<string, string> = {
      all: 'Everyone',
      all_students: 'All students',
      all_parents: 'All parents',
      all_teachers: 'All teachers',
      all_staff: 'All staff',
      all_colleagues: 'All colleagues',
    };
    const broadcast = BROADCAST[t.kind];
    if (broadcast) return broadcast;
    if (!t.refId) return t.kind;
    const name =
      t.kind === 'student'
        ? refs.student?.[t.refId]?.label
        : t.kind === 'parent'
          ? refs.parent?.[t.refId]?.label
          : t.kind === 'teacher'
            ? refs.teacher?.[t.refId]?.label
            : t.kind === 'staff'
              ? refs.staff?.[t.refId]?.label
              : t.kind === 'user'
                ? refs.user?.[t.refId]?.label
                : t.kind.includes('subject')
                ? refs.subject?.[t.refId]?.label
                : t.kind.includes('class')
                  ? refs.class?.[t.refId]?.label
                  : t.kind.includes('grade')
                    ? refs.gradeLevel?.[t.refId]?.label
                    : t.kind.includes('department')
                      ? refs.department?.[t.refId]?.label
                      : t.kind === 'campus'
                        ? refs.campus?.[t.refId]?.label
                        : undefined;
    const PREFIX: Record<string, string> = {
      class: 'Class',
      grade: 'Grade',
      department: 'Dept',
      campus: 'Campus',
      parents_of_class: 'Parents of class',
      parents_of_grade: 'Parents of grade',
      parents_of_department: 'Parents of dept',
      teachers_of_class: 'Teachers of class',
      teachers_of_grade: 'Teachers of grade',
      teachers_of_department: 'Teachers of dept',
      students_of_class: 'Students of class',
      students_of_grade: 'Students of grade',
      students_of_department: 'Students of dept',
      students_of_subject: 'Students of subject',
    };
    // Individuals show just the person's name; structures/derived get a readable prefix.
    if (['student', 'parent', 'teacher', 'staff'].includes(t.kind)) return name ?? t.kind;
    const prefix = PREFIX[t.kind] ?? t.kind;
    return name ? `${prefix} ${name}` : prefix;
  }
}
