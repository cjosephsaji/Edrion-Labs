import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, schema, type Database } from '@edrion/database';
import { formatPersonName } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

/**
 * A resolved, human-readable reference to a domain entity. `label` is the primary line (a name),
 * `sub` an optional secondary line (admission no, designation, code…), and `meta` carries a few
 * raw fields callers occasionally need (campus/class/grade ids, date of birth) without a second
 * round-trip. This is the ONE shape the portal uses everywhere a bare UUID used to surface.
 */
export interface EntityDisplay {
  id: string;
  label: string;
  sub?: string | null;
  meta?: Record<string, unknown>;
}

/** The entity kinds the resolver knows how to turn into an {@link EntityDisplay}. */
export type RefType =
  | 'student'
  | 'teacher'
  | 'staff'
  | 'parent'
  | 'class'
  | 'gradeLevel'
  | 'department'
  | 'subject'
  | 'campus'
  | 'user';

/** Id sets to resolve, keyed by entity kind. Empty/undefined sets are skipped (no query). */
export interface ResolveRequest {
  studentIds?: Iterable<string>;
  teacherIds?: Iterable<string>;
  staffIds?: Iterable<string>;
  parentIds?: Iterable<string>;
  classIds?: Iterable<string>;
  gradeLevelIds?: Iterable<string>;
  departmentIds?: Iterable<string>;
  subjectIds?: Iterable<string>;
  campusIds?: Iterable<string>;
  userIds?: Iterable<string>;
}

/** Display maps keyed by id, one bucket per entity kind. */
export type ResolvedRefs = Partial<Record<RefType, Record<string, EntityDisplay>>>;

/** A student's primary guardian, denormalised for a detail header. */
export interface GuardianDisplay {
  name: string;
  phone: string | null;
  email: string | null;
  relationship: string;
  isPrimary: boolean;
}

/**
 * The full "student card" the redesigned Health / Counseling / Attention screens show instead of a
 * UUID: the student ({@link EntityDisplay}) plus resolved class/grade/section/campus names, computed
 * age, and the primary guardian. One batched pass (students → their refs → guardians).
 */
export interface StudentContext extends EntityDisplay {
  className: string | null;
  gradeName: string | null;
  section: string | null;
  campusName: string | null;
  age: number | null;
  guardian: GuardianDisplay | null;
}

/** Whole years between an ISO `YYYY-MM-DD` date of birth and today; null if unparseable. */
function ageFrom(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 150 ? age : null;
}

const personName = (first: string, middle: string | null | undefined, last: string) =>
  formatPersonName({ firstName: first, middleName: middle, lastName: last });
const uniq = (ids?: Iterable<string>): string[] => {
  if (!ids) return [];
  return [...new Set([...ids].filter((v): v is string => typeof v === 'string' && v.length > 0))];
};
const byId = (rows: EntityDisplay[]): Record<string, EntityDisplay> =>
  Object.fromEntries(rows.map((r) => [r.id, r]));

/**
 * Batched UUID → readable resolver. Every method issues at most one `inArray` query per entity kind
 * (no N+1), always confined to the caller's institution. Used by the CRUD engine's `refs`
 * enrichment, the recipient pickers, and the Attention Centre — a single source of truth so a
 * student/teacher/campus renders the same way portal-wide.
 */
@Injectable()
export class PortalEntityResolver {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async resolve(institutionId: string, req: ResolveRequest): Promise<ResolvedRefs> {
    const out: ResolvedRefs = {};
    await Promise.all([
      this.students(institutionId, uniq(req.studentIds)).then((m) => m && (out.student = m)),
      this.people(institutionId, uniq(req.teacherIds), 'teacher').then((m) => m && (out.teacher = m)),
      this.people(institutionId, uniq(req.staffIds), 'staff').then((m) => m && (out.staff = m)),
      this.parents(institutionId, uniq(req.parentIds)).then((m) => m && (out.parent = m)),
      this.classes(institutionId, uniq(req.classIds)).then((m) => m && (out.class = m)),
      this.gradeLevels(institutionId, uniq(req.gradeLevelIds)).then((m) => m && (out.gradeLevel = m)),
      this.departments(institutionId, uniq(req.departmentIds)).then((m) => m && (out.department = m)),
      this.subjects(institutionId, uniq(req.subjectIds)).then((m) => m && (out.subject = m)),
      this.campuses(institutionId, uniq(req.campusIds)).then((m) => m && (out.campus = m)),
      this.users(institutionId, uniq(req.userIds)).then((m) => m && (out.user = m)),
    ]);
    return out;
  }

  /**
   * Rich student cards for detail panels. Resolves each student's class/grade/campus names, section,
   * age (from DOB) and primary guardian in a handful of batched queries — reused wherever a screen
   * needs "who is this student", not just their name.
   */
  async studentContexts(institutionId: string, idsIn: Iterable<string>): Promise<Record<string, StudentContext>> {
    const ids = uniq(idsIn);
    if (ids.length === 0) return {};
    const t = schema.students;
    const students = await this.db
      .select({
        id: t.id,
        firstName: t.firstName,
        middleName: t.middleName,
        lastName: t.lastName,
        admissionNo: t.admissionNo,
        classId: t.classId,
        gradeLevelId: t.gradeLevelId,
        campusId: t.campusId,
        dateOfBirth: t.dateOfBirth,
      })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    if (students.length === 0) return {};

    const [classes, grades, campuses, guardians] = await Promise.all([
      this.classes(institutionId, uniq(students.map((s) => s.classId).filter((v): v is string => !!v))),
      this.gradeLevels(institutionId, uniq(students.map((s) => s.gradeLevelId).filter((v): v is string => !!v))),
      this.campuses(institutionId, uniq(students.map((s) => s.campusId).filter((v): v is string => !!v))),
      this.primaryGuardians(institutionId, ids),
    ]);

    return Object.fromEntries(
      students.map((s) => {
        const cls = s.classId ? classes?.[s.classId] : undefined;
        const grade = s.gradeLevelId ? grades?.[s.gradeLevelId] : undefined;
        const campus = s.campusId ? campuses?.[s.campusId] : undefined;
        const ctx: StudentContext = {
          id: s.id,
          label: personName(s.firstName, s.middleName, s.lastName),
          sub: s.admissionNo,
          meta: { admissionNo: s.admissionNo, dateOfBirth: s.dateOfBirth },
          className: cls?.label ?? null,
          section: (cls?.meta?.section as string | undefined) ?? null,
          gradeName: grade?.label ?? null,
          campusName: campus?.label ?? null,
          age: ageFrom(s.dateOfBirth),
          guardian: guardians[s.id] ?? null,
        };
        return [s.id, ctx];
      }),
    );
  }

  /** The primary guardian per student (falls back to any guardian when none is flagged primary). */
  private async primaryGuardians(institutionId: string, ids: string[]): Promise<Record<string, GuardianDisplay>> {
    const g = schema.studentGuardians;
    const p = schema.parents;
    const rows = await this.db
      .select({
        studentId: g.studentId,
        relationship: g.relationship,
        isPrimary: g.isPrimary,
        firstName: p.firstName,
        middleName: p.middleName,
        lastName: p.lastName,
        phone: p.phone,
        email: p.email,
      })
      .from(g)
      .innerJoin(p, eq(g.parentId, p.id))
      .where(and(eq(g.institutionId, institutionId), inArray(g.studentId, ids)));
    const out: Record<string, GuardianDisplay> = {};
    for (const r of rows) {
      const cur = out[r.studentId];
      // Prefer a primary guardian; otherwise keep the first seen.
      if (!cur || (r.isPrimary && !cur.isPrimary)) {
        out[r.studentId] = {
          name: personName(r.firstName, r.middleName, r.lastName),
          phone: r.phone,
          email: r.email,
          relationship: r.relationship,
          isPrimary: r.isPrimary,
        };
      }
    }
    return out;
  }

  private async students(institutionId: string, ids: string[]) {
    if (ids.length === 0) return undefined;
    const t = schema.students;
    const rows = await this.db
      .select({
        id: t.id,
        firstName: t.firstName,
        middleName: t.middleName,
        lastName: t.lastName,
        admissionNo: t.admissionNo,
        classId: t.classId,
        gradeLevelId: t.gradeLevelId,
        campusId: t.campusId,
        dateOfBirth: t.dateOfBirth,
        status: t.status,
      })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return byId(
      rows.map((r) => ({
        id: r.id,
        label: personName(r.firstName, r.middleName, r.lastName),
        sub: r.admissionNo,
        meta: {
          admissionNo: r.admissionNo,
          classId: r.classId,
          gradeLevelId: r.gradeLevelId,
          campusId: r.campusId,
          dateOfBirth: r.dateOfBirth,
          status: r.status,
        },
      })),
    );
  }

  private async people(institutionId: string, ids: string[], _kind: 'teacher' | 'staff') {
    if (ids.length === 0) return undefined;
    const t = schema.staff;
    const rows = await this.db
      .select({
        id: t.id,
        firstName: t.firstName,
        middleName: t.middleName,
        lastName: t.lastName,
        employeeNo: t.employeeNo,
        designation: t.designation,
        departmentId: t.departmentId,
        campusId: t.campusId,
      })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return byId(
      rows.map((r) => ({
        id: r.id,
        label: personName(r.firstName, r.middleName, r.lastName),
        sub: r.designation ?? r.employeeNo ?? null,
        meta: { employeeNo: r.employeeNo, designation: r.designation, departmentId: r.departmentId, campusId: r.campusId },
      })),
    );
  }

  private async parents(institutionId: string, ids: string[]) {
    if (ids.length === 0) return undefined;
    const t = schema.parents;
    const rows = await this.db
      .select({ id: t.id, firstName: t.firstName, middleName: t.middleName, lastName: t.lastName, phone: t.phone, email: t.email })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return byId(
      rows.map((r) => ({
        id: r.id,
        label: personName(r.firstName, r.middleName, r.lastName),
        sub: r.phone ?? r.email ?? null,
        meta: { phone: r.phone, email: r.email },
      })),
    );
  }

  private async classes(institutionId: string, ids: string[]) {
    if (ids.length === 0) return undefined;
    const t = schema.classes;
    const rows = await this.db
      .select({ id: t.id, name: t.name, section: t.section, gradeLevelId: t.gradeLevelId, campusId: t.campusId })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return byId(
      rows.map((r) => ({
        id: r.id,
        label: r.name,
        sub: r.section,
        meta: { section: r.section, gradeLevelId: r.gradeLevelId, campusId: r.campusId },
      })),
    );
  }

  private async gradeLevels(institutionId: string, ids: string[]) {
    if (ids.length === 0) return undefined;
    const t = schema.gradeLevels;
    const rows = await this.db
      .select({ id: t.id, name: t.name, level: t.level })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return byId(rows.map((r) => ({ id: r.id, label: r.name, sub: null, meta: { level: r.level } })));
  }

  private async departments(institutionId: string, ids: string[]) {
    if (ids.length === 0) return undefined;
    const t = schema.departments;
    const rows = await this.db
      .select({ id: t.id, name: t.name, code: t.code })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return byId(rows.map((r) => ({ id: r.id, label: r.name, sub: r.code, meta: { code: r.code } })));
  }

  private async subjects(institutionId: string, ids: string[]) {
    if (ids.length === 0) return undefined;
    const t = schema.subjects;
    const rows = await this.db
      .select({ id: t.id, name: t.name, code: t.code })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return byId(rows.map((r) => ({ id: r.id, label: r.name, sub: r.code, meta: { code: r.code } })));
  }

  private async campuses(institutionId: string, ids: string[]) {
    if (ids.length === 0) return undefined;
    const t = schema.campuses;
    const rows = await this.db
      .select({ id: t.id, name: t.name, code: t.code })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return byId(rows.map((r) => ({ id: r.id, label: r.name, sub: r.code, meta: { code: r.code } })));
  }

  private async users(institutionId: string, ids: string[]) {
    if (ids.length === 0) return undefined;
    const t = schema.institutionUsers;
    const rows = await this.db
      .select({ id: t.id, fullName: t.fullName, email: t.email })
      .from(t)
      .where(and(eq(t.institutionId, institutionId), inArray(t.id, ids)));
    return byId(rows.map((r) => ({ id: r.id, label: r.fullName, sub: r.email, meta: { email: r.email } })));
  }
}
