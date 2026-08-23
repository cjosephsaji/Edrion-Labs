/**
 * Idempotent end-to-end test dataset for the institution admin panel.
 *
 * Creates ONE fully linked chain — institution → campus → academic year → semester →
 * programme → programme year → curriculum → subjects → course → class/section →
 * timetable → one enrolled student → one assigned teacher — under unmistakably
 * "Test" names, so every related admin page shows the same data.
 *
 * Safe to run repeatedly: every row is matched on a natural key first, then either
 * inserted or patched back to the intended state. Nothing outside the test
 * institution is touched.
 *
 *   pnpm db:seed:test
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { and, eq, isNull } from 'drizzle-orm';
import {
  closeDatabase,
  createDatabase,
  schema as s,
  seedInstitutionScheduleDefaults,
  type Database,
} from '@edrion/database';
import { DEV_PASSWORD_HASH, DEV_PASSWORD_PLAINTEXT } from '@edrion/database/dev-constants';
import {
  STUDENT_MODULE_CATALOG,
  STUDENT_PORTAL_PRESETS,
  TERMINOLOGY_KEYS,
} from '@edrion/feature-flags';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: join(repoRoot, '.env'), override: true });

// --- fixture constants (the natural keys every upsert matches on) -------------

const INSTITUTION_PUBLIC_ID = 'INST-TEST-0001';
const CAMPUS_CODE = 'TEST-MAIN';
const YEAR_NAME = 'Test Year 2026-2027';
const PROGRAMME_CODE = 'TEST-BSCCS';
const GRADE_LEVEL_NAME = 'Test Year 1';
const CLASS_NAME = 'Test Class BSc CS Year 1 - Section A';
const ADMISSION_NO = 'TEST-STU-0001';
const EMPLOYEE_NO = 'TEST-EMP-0001';
const ROOM = 'Test Room 101';

const EMAILS = {
  admin: 'admin@testacademy.edu',
  teacher: 'teacher@testacademy.edu',
  student: 'student@testacademy.edu',
} as const;

const PRESET = STUDENT_PORTAL_PRESETS.indian_college;

const YEAR = { startDate: '2026-06-01', endDate: '2027-03-31' };

const SEMESTERS = [
  {
    name: 'Test Semester 1',
    sequence: 1,
    startDate: '2026-06-01',
    endDate: '2026-10-31',
    isCurrent: true,
  },
  {
    name: 'Test Semester 2',
    sequence: 2,
    startDate: '2026-11-01',
    endDate: '2027-03-31',
    isCurrent: false,
  },
] as const;

/** Weekly period quota per subject — must match the timetable grid below. */
const SUBJECTS = [
  { code: 'TEST-MATH-101', name: 'Test Subject: Mathematics I', weeklyPeriods: 9, credits: 4 },
  { code: 'TEST-PHY-101', name: 'Test Subject: Physics I', weeklyPeriods: 8, credits: 4 },
  { code: 'TEST-CS-101', name: 'Test Subject: Programming Fundamentals', weeklyPeriods: 8, credits: 4 },
] as const;

type SubjectCode = (typeof SUBJECTS)[number]['code'];

/** Mon–Fri: five teaching periods a day plus a break and a lunch. */
const PERIODS = [
  { label: 'Period 1', startTime: '09:00', endTime: '09:50', kind: 'teaching' },
  { label: 'Period 2', startTime: '09:55', endTime: '10:45', kind: 'teaching' },
  { label: 'Break', startTime: '10:45', endTime: '11:00', kind: 'break' },
  { label: 'Period 3', startTime: '11:00', endTime: '11:50', kind: 'teaching' },
  { label: 'Period 4', startTime: '11:55', endTime: '12:45', kind: 'teaching' },
  { label: 'Lunch', startTime: '12:45', endTime: '13:30', kind: 'lunch' },
  { label: 'Period 5', startTime: '13:30', endTime: '14:20', kind: 'teaching' },
] as const;

/** Subject taught in each of the five teaching periods, Monday (1) … Friday (5). */
const WEEK_PLAN: Record<number, SubjectCode[]> = {
  1: ['TEST-MATH-101', 'TEST-PHY-101', 'TEST-CS-101', 'TEST-MATH-101', 'TEST-CS-101'],
  2: ['TEST-PHY-101', 'TEST-MATH-101', 'TEST-CS-101', 'TEST-PHY-101', 'TEST-MATH-101'],
  3: ['TEST-CS-101', 'TEST-MATH-101', 'TEST-PHY-101', 'TEST-CS-101', 'TEST-PHY-101'],
  4: ['TEST-MATH-101', 'TEST-CS-101', 'TEST-PHY-101', 'TEST-MATH-101', 'TEST-CS-101'],
  5: ['TEST-PHY-101', 'TEST-MATH-101', 'TEST-CS-101', 'TEST-PHY-101', 'TEST-MATH-101'],
};

const GRADING_SCHEME = [
  { component: 'Internal Assessment', weightPct: 40 },
  { component: 'End Semester Exam', weightPct: 60 },
];

const ENROLLED_ON = '2026-06-01';

interface Scope {
  institutionId: string;
  campusId: string;
}

// --- helpers -----------------------------------------------------------------

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`  ${msg}`);
}

/** Insert when the natural key is absent, otherwise patch the existing row back into shape. */
async function upsert(
  find: () => Promise<{ id: string } | undefined>,
  insert: () => Promise<string>,
  patch?: (id: string) => Promise<void>,
): Promise<string> {
  const existing = await find();
  if (existing) {
    if (patch) await patch(existing.id);
    return existing.id;
  }
  return insert();
}

function required(id: string | undefined, what: string): string {
  if (!id) throw new Error(`Failed to seed ${what}`);
  return id;
}

// --- 1. institution + campus -------------------------------------------------

async function seedInstitution(db: Database): Promise<string> {
  const primaryContact = {
    name: 'Test Admin',
    email: EMAILS.admin,
    phone: '+919900000001',
    title: 'Administrator',
  };
  const id = await upsert(
    async () =>
      (
        await db
          .select({ id: s.institutions.id })
          .from(s.institutions)
          .where(eq(s.institutions.publicId, INSTITUTION_PUBLIC_ID))
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.institutions)
        .values({
          publicId: INSTITUTION_PUBLIC_ID,
          legalName: 'Test Academy Trust',
          displayName: 'Test Academy',
          type: 'college',
          country: 'IN',
          region: 'Kerala',
          timezone: 'Asia/Kolkata',
          currency: 'INR',
          status: 'active',
          onboardingStatus: 'completed',
          supportTier: 'standard',
          primaryContact,
          activatedAt: new Date(),
        })
        .returning({ id: s.institutions.id });
      return required(row?.id, 'institution');
    },
    async (id) => {
      await db
        .update(s.institutions)
        .set({
          status: 'active',
          onboardingStatus: 'completed',
          primaryContact,
          updatedAt: new Date(),
        })
        .where(eq(s.institutions.id, id));
    },
  );
  log(`institution   Test Academy (${INSTITUTION_PUBLIC_ID})`);
  return id;
}

async function seedSubscription(db: Database, institutionId: string): Promise<void> {
  const [existing] = await db
    .select({ id: s.subscriptions.id })
    .from(s.subscriptions)
    .where(eq(s.subscriptions.institutionId, institutionId))
    .limit(1);
  if (existing) return;

  const [planVersion] = await db
    .select({ id: s.planVersions.id })
    .from(s.planVersions)
    .where(eq(s.planVersions.status, 'published'))
    .limit(1);
  if (!planVersion) {
    log('subscription  skipped — no published plan version (run pnpm db:seed first)');
    return;
  }
  await db.insert(s.subscriptions).values({
    institutionId,
    planVersionId: planVersion.id,
    status: 'active',
    billingCycle: 'monthly',
    currency: 'INR',
    periodStart: new Date(),
    periodEnd: new Date(Date.now() + 30 * 86_400_000),
  });
  log('subscription  active');
}

async function seedCampus(db: Database, institutionId: string): Promise<string> {
  const id = await upsert(
    async () =>
      (
        await db
          .select({ id: s.campuses.id })
          .from(s.campuses)
          .where(and(eq(s.campuses.institutionId, institutionId), eq(s.campuses.code, CAMPUS_CODE)))
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.campuses)
        .values({
          institutionId,
          name: 'Test Main Campus',
          code: CAMPUS_CODE,
          isActive: true,
          billingStatus: 'included',
          studentCapacity: 500,
          currentUserCount: 3,
        })
        .returning({ id: s.campuses.id });
      return required(row?.id, 'campus');
    },
    async (id) => {
      await db
        .update(s.campuses)
        .set({ name: 'Test Main Campus', isActive: true, updatedAt: new Date() })
        .where(eq(s.campuses.id, id));
    },
  );
  log(`campus        Test Main Campus (${CAMPUS_CODE})`);
  return id;
}

// --- 2. academic structure ---------------------------------------------------

async function seedAcademicYear(db: Database, scope: Scope): Promise<string> {
  const id = await upsert(
    async () =>
      (
        await db
          .select({ id: s.academicYears.id })
          .from(s.academicYears)
          .where(
            and(
              eq(s.academicYears.institutionId, scope.institutionId),
              eq(s.academicYears.name, YEAR_NAME),
            ),
          )
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.academicYears)
        .values({ ...scope, name: YEAR_NAME, ...YEAR, isCurrent: true, status: 'active' })
        .returning({ id: s.academicYears.id });
      return required(row?.id, 'academic year');
    },
    async (id) => {
      await db
        .update(s.academicYears)
        .set({ ...YEAR, isCurrent: true, status: 'active', updatedAt: new Date() })
        .where(eq(s.academicYears.id, id));
    },
  );
  log(`year          ${YEAR_NAME} [current]`);
  return id;
}

async function seedProgramme(db: Database, scope: Scope): Promise<string> {
  const values = {
    name: 'Test Programme: BSc Computer Science',
    description: 'Test programme used for end-to-end admin panel checks.',
    termSystem: 'semester',
    durationMonths: 36,
    termsPerYear: 2,
  };
  const id = await upsert(
    async () =>
      (
        await db
          .select({ id: s.departments.id })
          .from(s.departments)
          .where(
            and(
              eq(s.departments.institutionId, scope.institutionId),
              eq(s.departments.code, PROGRAMME_CODE),
            ),
          )
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.departments)
        .values({ ...scope, code: PROGRAMME_CODE, ...values })
        .returning({ id: s.departments.id });
      return required(row?.id, 'programme');
    },
    async (id) => {
      await db
        .update(s.departments)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(s.departments.id, id));
    },
  );
  log(`programme     ${values.name} (${PROGRAMME_CODE}, semester system)`);
  return id;
}

async function seedGradeLevel(db: Database, scope: Scope, departmentId: string): Promise<string> {
  return upsert(
    async () =>
      (
        await db
          .select({ id: s.gradeLevels.id })
          .from(s.gradeLevels)
          .where(
            and(
              eq(s.gradeLevels.institutionId, scope.institutionId),
              eq(s.gradeLevels.name, GRADE_LEVEL_NAME),
            ),
          )
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.gradeLevels)
        .values({ ...scope, name: GRADE_LEVEL_NAME, level: 1, departmentId })
        .returning({ id: s.gradeLevels.id });
      return required(row?.id, 'grade level');
    },
    async (id) => {
      await db
        .update(s.gradeLevels)
        .set({ level: 1, departmentId, updatedAt: new Date() })
        .where(eq(s.gradeLevels.id, id));
    },
  );
}

async function seedProgrammeLevel(
  db: Database,
  scope: Scope,
  departmentId: string,
  gradeLevelId: string,
): Promise<string> {
  const id = await upsert(
    async () =>
      (
        await db
          .select({ id: s.departmentGradeLevels.id })
          .from(s.departmentGradeLevels)
          .where(
            and(
              eq(s.departmentGradeLevels.departmentId, departmentId),
              eq(s.departmentGradeLevels.gradeLevelId, gradeLevelId),
            ),
          )
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.departmentGradeLevels)
        .values({
          ...scope,
          departmentId,
          gradeLevelId,
          sequence: 1,
          durationLabel: '12 months',
          status: 'active',
        })
        .returning({ id: s.departmentGradeLevels.id });
      return required(row?.id, 'programme level');
    },
    async (id) => {
      await db
        .update(s.departmentGradeLevels)
        .set({ sequence: 1, durationLabel: '12 months', status: 'active', updatedAt: new Date() })
        .where(eq(s.departmentGradeLevels.id, id));
    },
  );
  log(`prog. level   ${GRADE_LEVEL_NAME} (programme year 1)`);
  return id;
}

/** Undated semester templates the dated terms are instances of. */
async function seedTermSlots(
  db: Database,
  scope: Scope,
  departmentId: string,
  programmeLevelId: string,
): Promise<Map<number, string>> {
  const bySequence = new Map<number, string>();
  for (const sem of SEMESTERS) {
    const id = await upsert(
      async () =>
        (
          await db
            .select({ id: s.programmeTermSlots.id })
            .from(s.programmeTermSlots)
            .where(
              and(
                eq(s.programmeTermSlots.programmeLevelId, programmeLevelId),
                eq(s.programmeTermSlots.sequenceInYear, sem.sequence),
              ),
            )
            .limit(1)
        )[0],
      async () => {
        const [row] = await db
          .insert(s.programmeTermSlots)
          .values({
            ...scope,
            departmentId,
            programmeLevelId,
            sequenceInYear: sem.sequence,
            absoluteSequence: sem.sequence,
            name: sem.name,
            kind: 'semester',
            durationMonths: 5,
          })
          .returning({ id: s.programmeTermSlots.id });
        return required(row?.id, 'programme term slot');
      },
      async (id) => {
        await db
          .update(s.programmeTermSlots)
          .set({ name: sem.name, kind: 'semester', durationMonths: 5, updatedAt: new Date() })
          .where(eq(s.programmeTermSlots.id, id));
      },
    );
    bySequence.set(sem.sequence, id);
  }
  return bySequence;
}

async function seedSemesters(
  db: Database,
  scope: Scope,
  ids: {
    academicYearId: string;
    departmentId: string;
    programmeLevelId: string;
    gradeLevelId: string;
    slots: Map<number, string>;
  },
): Promise<Map<number, string>> {
  const bySequence = new Map<number, string>();
  for (const sem of SEMESTERS) {
    const values = {
      academicYearId: ids.academicYearId,
      departmentId: ids.departmentId,
      programmeLevelId: ids.programmeLevelId,
      gradeLevelId: ids.gradeLevelId,
      slotId: ids.slots.get(sem.sequence) ?? null,
      kind: 'semester',
      sequence: sem.sequence,
      startDate: sem.startDate,
      endDate: sem.endDate,
      isCurrent: sem.isCurrent,
      status: 'active',
    };
    const id = await upsert(
      async () =>
        (
          await db
            .select({ id: s.academicTerms.id })
            .from(s.academicTerms)
            .where(
              and(
                eq(s.academicTerms.institutionId, scope.institutionId),
                eq(s.academicTerms.academicYearId, ids.academicYearId),
                eq(s.academicTerms.name, sem.name),
              ),
            )
            .limit(1)
        )[0],
      async () => {
        const [row] = await db
          .insert(s.academicTerms)
          .values({ ...scope, name: sem.name, ...values })
          .returning({ id: s.academicTerms.id });
        return required(row?.id, 'semester');
      },
      async (id) => {
        await db
          .update(s.academicTerms)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(s.academicTerms.id, id));
      },
    );
    bySequence.set(sem.sequence, id);
    log(
      `semester      ${sem.name} (${sem.startDate} → ${sem.endDate})${sem.isCurrent ? ' [current]' : ''}`,
    );
  }
  return bySequence;
}

async function seedSubjects(
  db: Database,
  scope: Scope,
  departmentId: string,
): Promise<Map<SubjectCode, string>> {
  const byCode = new Map<SubjectCode, string>();
  for (const subject of SUBJECTS) {
    const values = {
      name: subject.name,
      kind: 'core',
      departmentId,
      weeklyPeriods: subject.weeklyPeriods,
      isLabSubject: false,
    };
    const id = await upsert(
      async () =>
        (
          await db
            .select({ id: s.subjects.id })
            .from(s.subjects)
            .where(
              and(
                eq(s.subjects.institutionId, scope.institutionId),
                eq(s.subjects.code, subject.code),
              ),
            )
            .limit(1)
        )[0],
      async () => {
        const [row] = await db
          .insert(s.subjects)
          .values({ ...scope, code: subject.code, ...values })
          .returning({ id: s.subjects.id });
        return required(row?.id, `subject ${subject.code}`);
      },
      async (id) => {
        await db
          .update(s.subjects)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(s.subjects.id, id));
      },
    );
    byCode.set(subject.code, id);
    log(`subject       ${subject.code} — ${subject.name} (${subject.weeklyPeriods}/week)`);
  }
  return byCode;
}

/** Curriculum template: which subjects belong to Semester 1 of this programme year. */
async function seedCurriculum(
  db: Database,
  scope: Scope,
  ids: { departmentId: string; programmeLevelId: string; slotId: string | null },
  subjectIds: Map<SubjectCode, string>,
): Promise<void> {
  let sequence = 0;
  for (const subject of SUBJECTS) {
    sequence += 1;
    const seq = sequence;
    const subjectId = subjectIds.get(subject.code)!;
    await upsert(
      async () =>
        (
          await db
            .select({ id: s.programmeSubjects.id })
            .from(s.programmeSubjects)
            .where(
              and(
                eq(s.programmeSubjects.programmeLevelId, ids.programmeLevelId),
                eq(s.programmeSubjects.semesterSequence, 1),
                eq(s.programmeSubjects.subjectId, subjectId),
              ),
            )
            .limit(1)
        )[0],
      async () => {
        const [row] = await db
          .insert(s.programmeSubjects)
          .values({
            ...scope,
            departmentId: ids.departmentId,
            programmeLevelId: ids.programmeLevelId,
            semesterSequence: 1,
            subjectId,
            slotId: ids.slotId,
            credits: subject.credits,
            isElective: false,
            sequence: seq,
          })
          .returning({ id: s.programmeSubjects.id });
        return required(row?.id, `curriculum row for ${subject.code}`);
      },
      async (id) => {
        await db
          .update(s.programmeSubjects)
          .set({
            slotId: ids.slotId,
            credits: subject.credits,
            isElective: false,
            sequence: seq,
            updatedAt: new Date(),
          })
          .where(eq(s.programmeSubjects.id, id));
      },
    );
  }
  log(`curriculum    ${SUBJECTS.length} subjects mapped to ${SEMESTERS[0].name}`);
}

// --- 3. portal logins + people ----------------------------------------------

async function seedPortalUser(
  db: Database,
  scope: Scope,
  def: { email: string; fullName: string; roleKey: string; campusAccess: boolean },
): Promise<string> {
  const email = def.email.toLowerCase();
  const userId = await upsert(
    async () =>
      (
        await db
          .select({ id: s.institutionUsers.id })
          .from(s.institutionUsers)
          .where(
            and(
              eq(s.institutionUsers.institutionId, scope.institutionId),
              eq(s.institutionUsers.email, email),
            ),
          )
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.institutionUsers)
        .values({
          institutionId: scope.institutionId,
          email,
          fullName: def.fullName,
          status: 'active',
          passwordHash: DEV_PASSWORD_HASH,
          activatedAt: new Date(),
        })
        .returning({ id: s.institutionUsers.id });
      return required(row?.id, `portal user ${email}`);
    },
    async (id) => {
      await db
        .update(s.institutionUsers)
        .set({
          fullName: def.fullName,
          status: 'active',
          passwordHash: DEV_PASSWORD_HASH,
          failedLoginAttempts: 0,
          lockedUntil: null,
          activatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(s.institutionUsers.id, id));
    },
  );

  // Roles and campus access are fully owned by this fixture — replace, don't append.
  await db
    .delete(s.institutionUserRoles)
    .where(eq(s.institutionUserRoles.institutionUserId, userId));
  await db
    .insert(s.institutionUserRoles)
    .values({ institutionUserId: userId, roleKey: def.roleKey });

  await db.delete(s.campusUserAccess).where(eq(s.campusUserAccess.institutionUserId, userId));
  if (def.campusAccess) {
    await db.insert(s.campusUserAccess).values({
      institutionUserId: userId,
      campusId: scope.campusId,
      accessLevel: 'manage',
    });
  }
  log(`login         ${email} (${def.roleKey})`);
  return userId;
}

async function seedTeacher(
  db: Database,
  scope: Scope,
  departmentId: string,
  institutionUserId: string,
): Promise<string> {
  const values = {
    firstName: 'Test',
    lastName: 'Teacher',
    email: EMAILS.teacher,
    phone: '+919900000002',
    departmentId,
    designation: 'Test Professor',
    employmentType: 'full_time',
    status: 'active',
    joinDate: '2026-05-15',
    institutionUserId,
  };
  const id = await upsert(
    async () =>
      (
        await db
          .select({ id: s.staff.id })
          .from(s.staff)
          .where(
            and(eq(s.staff.institutionId, scope.institutionId), eq(s.staff.employeeNo, EMPLOYEE_NO)),
          )
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.staff)
        .values({ ...scope, employeeNo: EMPLOYEE_NO, ...values })
        .returning({ id: s.staff.id });
      return required(row?.id, 'teacher');
    },
    async (id) => {
      await db
        .update(s.staff)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(s.staff.id, id));
    },
  );
  log(`teacher       Test Teacher (${EMPLOYEE_NO})`);
  return id;
}

async function seedStudent(
  db: Database,
  scope: Scope,
  institutionUserId: string,
): Promise<string> {
  const values = {
    firstName: 'Test',
    lastName: 'Student',
    email: EMAILS.student,
    phone: '+919900000003',
    gender: 'female',
    dateOfBirth: '2008-04-12',
    rollNo: '1',
    status: 'enrolled',
    enrollmentDate: ENROLLED_ON,
    institutionUserId,
  };
  const id = await upsert(
    async () =>
      (
        await db
          .select({ id: s.students.id })
          .from(s.students)
          .where(
            and(
              eq(s.students.institutionId, scope.institutionId),
              eq(s.students.admissionNo, ADMISSION_NO),
            ),
          )
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.students)
        .values({ ...scope, admissionNo: ADMISSION_NO, ...values })
        .returning({ id: s.students.id });
      return required(row?.id, 'student');
    },
    async (id) => {
      await db
        .update(s.students)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(s.students.id, id));
    },
  );
  log(`student       Test Student (${ADMISSION_NO})`);
  return id;
}

// --- 4. class / section, teaching assignments, roster ------------------------

async function seedClass(
  db: Database,
  scope: Scope,
  ids: {
    academicYearId: string;
    gradeLevelId: string;
    programmeLevelId: string;
    termId: string;
    teacherId: string;
  },
): Promise<string> {
  const values = {
    academicYearId: ids.academicYearId,
    gradeLevelId: ids.gradeLevelId,
    programmeLevelId: ids.programmeLevelId,
    termId: ids.termId,
    section: 'A',
    classTeacherId: ids.teacherId,
    room: ROOM,
    capacity: 40,
  };
  const id = await upsert(
    async () =>
      (
        await db
          .select({ id: s.classes.id })
          .from(s.classes)
          .where(and(eq(s.classes.institutionId, scope.institutionId), eq(s.classes.name, CLASS_NAME)))
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.classes)
        .values({ ...scope, name: CLASS_NAME, ...values })
        .returning({ id: s.classes.id });
      return required(row?.id, 'class');
    },
    async (id) => {
      await db
        .update(s.classes)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(s.classes.id, id));
    },
  );
  log(`class         ${CLASS_NAME} (room ${ROOM}, capacity 40)`);
  return id;
}

async function seedClassSubjects(
  db: Database,
  institutionId: string,
  classId: string,
  teacherId: string,
  subjectIds: Map<SubjectCode, string>,
): Promise<void> {
  for (const subject of SUBJECTS) {
    const subjectId = subjectIds.get(subject.code)!;
    await upsert(
      async () =>
        (
          await db
            .select({ id: s.classSubjectTeachers.id })
            .from(s.classSubjectTeachers)
            .where(
              and(
                eq(s.classSubjectTeachers.classId, classId),
                eq(s.classSubjectTeachers.subjectId, subjectId),
              ),
            )
            .limit(1)
        )[0],
      async () => {
        const [row] = await db
          .insert(s.classSubjectTeachers)
          .values({ institutionId, classId, subjectId, teacherId })
          .returning({ id: s.classSubjectTeachers.id });
        return required(row?.id, `class subject ${subject.code}`);
      },
      async (id) => {
        await db
          .update(s.classSubjectTeachers)
          .set({ teacherId, updatedAt: new Date() })
          .where(eq(s.classSubjectTeachers.id, id));
      },
    );
  }
  log(`teaching      Test Teacher assigned to all ${SUBJECTS.length} subjects of the class`);
}

/**
 * Placement rows the directory filters read. Mirrors what the portal writes when a student is
 * added to a class roster / a staff member is assigned: one row per (person, year, term).
 */
async function seedPlacements(
  db: Database,
  scope: Scope,
  ids: {
    studentId: string;
    teacherId: string;
    academicYearId: string;
    termId: string;
    programmeLevelId: string;
    gradeLevelId: string;
    classId: string;
    departmentId: string;
  },
): Promise<void> {
  const enrollment = {
    ...scope,
    studentId: ids.studentId,
    academicYearId: ids.academicYearId,
    termId: ids.termId,
    programmeLevelId: ids.programmeLevelId,
    gradeLevelId: ids.gradeLevelId,
    classId: ids.classId,
    rollNo: '1',
    status: 'active',
    enrolledOn: ENROLLED_ON,
    exitedOn: null,
  };
  await upsert(
    async () =>
      (
        await db
          .select({ id: s.studentEnrollments.id })
          .from(s.studentEnrollments)
          .where(
            and(
              eq(s.studentEnrollments.studentId, ids.studentId),
              eq(s.studentEnrollments.academicYearId, ids.academicYearId),
              eq(s.studentEnrollments.termId, ids.termId),
            ),
          )
          .limit(1)
      )[0],
    async () => {
      const [row] = await db
        .insert(s.studentEnrollments)
        .values(enrollment)
        .returning({ id: s.studentEnrollments.id });
      return required(row?.id, 'student enrollment');
    },
    async (id) => {
      await db
        .update(s.studentEnrollments)
        .set({ ...enrollment, updatedAt: new Date() })
        .where(eq(s.studentEnrollments.id, id));
    },
  );
  log(`enrollment    Test Student → ${CLASS_NAME} (${SEMESTERS[0].name})`);

  // Whole-year assignment (written on staff create) + the class's term assignment.
  const assignmentBase = {
    ...scope,
    staffId: ids.teacherId,
    academicYearId: ids.academicYearId,
    departmentId: ids.departmentId,
    designation: 'Test Professor',
    employmentType: 'full_time',
    status: 'active',
    startedOn: '2026-05-15',
  };
  for (const termId of [null, ids.termId]) {
    await upsert(
      async () =>
        (
          await db
            .select({ id: s.staffAssignments.id })
            .from(s.staffAssignments)
            .where(
              and(
                eq(s.staffAssignments.staffId, ids.teacherId),
                eq(s.staffAssignments.academicYearId, ids.academicYearId),
                termId === null
                  ? isNull(s.staffAssignments.termId)
                  : eq(s.staffAssignments.termId, termId),
              ),
            )
            .limit(1)
        )[0],
      async () => {
        const [row] = await db
          .insert(s.staffAssignments)
          .values({ ...assignmentBase, termId })
          .returning({ id: s.staffAssignments.id });
        return required(row?.id, 'staff assignment');
      },
      async (id) => {
        await db
          .update(s.staffAssignments)
          .set({ ...assignmentBase, termId, updatedAt: new Date() })
          .where(eq(s.staffAssignments.id, id));
      },
    );
  }
  log(`assignment    Test Teacher → ${YEAR_NAME} (whole year + ${SEMESTERS[0].name})`);
}

// --- 5. courses --------------------------------------------------------------

async function seedCourses(
  db: Database,
  scope: Scope,
  ids: { termId: string; teacherId: string; studentId: string },
): Promise<void> {
  for (const subject of SUBJECTS) {
    const values = {
      name: subject.name.replace('Test Subject:', 'Test Course:'),
      credits: subject.credits,
      professorTeacherId: ids.teacherId,
      officeHours: 'Wed 15:00–16:00, Test Room 101',
      gradingScheme: GRADING_SCHEME,
      attendanceRequiredPct: 75,
      status: 'active',
    };
    const courseId = await upsert(
      async () =>
        (
          await db
            .select({ id: s.courses.id })
            .from(s.courses)
            .where(
              and(
                eq(s.courses.institutionId, scope.institutionId),
                eq(s.courses.code, subject.code),
                eq(s.courses.termId, ids.termId),
              ),
            )
            .limit(1)
        )[0],
      async () => {
        const [row] = await db
          .insert(s.courses)
          .values({ ...scope, code: subject.code, termId: ids.termId, ...values })
          .returning({ id: s.courses.id });
        return required(row?.id, `course ${subject.code}`);
      },
      async (id) => {
        await db
          .update(s.courses)
          .set({ ...values, updatedAt: new Date() })
          .where(eq(s.courses.id, id));
      },
    );

    await db
      .insert(s.courseEnrollments)
      .values({
        institutionId: scope.institutionId,
        campusId: scope.campusId,
        courseId,
        studentId: ids.studentId,
      })
      .onConflictDoNothing();
  }
  log(`courses       ${SUBJECTS.length} courses in ${SEMESTERS[0].name}, Test Student enrolled in each`);
}

// --- 6. timetable ------------------------------------------------------------

async function seedTimetable(
  db: Database,
  scope: Scope,
  ids: {
    classId: string;
    teacherId: string;
    academicYearId: string;
    termId: string;
  },
  subjectIds: Map<SubjectCode, string>,
): Promise<void> {
  let written = 0;
  for (const dayOfWeek of [1, 2, 3, 4, 5]) {
    let teachingIndex = 0;
    for (const period of PERIODS) {
      const teaching = period.kind === 'teaching';
      const subjectCode = teaching ? WEEK_PLAN[dayOfWeek]![teachingIndex] : undefined;
      if (teaching) teachingIndex += 1;

      const values = {
        subjectId: subjectCode ? subjectIds.get(subjectCode)! : null,
        teacherId: teaching ? ids.teacherId : null,
        academicYearId: ids.academicYearId,
        termId: ids.termId,
        endTime: period.endTime,
        label: period.label,
        kind: period.kind,
        room: teaching ? ROOM : null,
      };
      await upsert(
        async () =>
          (
            await db
              .select({ id: s.timetableSlots.id })
              .from(s.timetableSlots)
              .where(
                and(
                  eq(s.timetableSlots.classId, ids.classId),
                  eq(s.timetableSlots.dayOfWeek, dayOfWeek),
                  eq(s.timetableSlots.startTime, period.startTime),
                ),
              )
              .limit(1)
          )[0],
        async () => {
          const [row] = await db
            .insert(s.timetableSlots)
            .values({
              ...scope,
              classId: ids.classId,
              dayOfWeek,
              startTime: period.startTime,
              ...values,
            })
            .returning({ id: s.timetableSlots.id });
          return required(row?.id, 'timetable slot');
        },
        async (id) => {
          await db
            .update(s.timetableSlots)
            .set({ ...values, updatedAt: new Date() })
            .where(eq(s.timetableSlots.id, id));
        },
      );
      written += 1;
    }
  }
  log(`timetable     ${written} weekly slots (Mon–Fri, 5 teaching periods + break + lunch)`);
}

// --- 7. student-portal preset ------------------------------------------------

async function upsertFeatureAssignment(
  db: Database,
  input: { featureId: string; institutionId: string; value: boolean },
): Promise<void> {
  const [existing] = await db
    .select({ id: s.featureAssignments.id })
    .from(s.featureAssignments)
    .where(
      and(
        eq(s.featureAssignments.featureId, input.featureId),
        eq(s.featureAssignments.scope, 'institution'),
        eq(s.featureAssignments.scopeId, input.institutionId),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(s.featureAssignments)
      .set({ value: input.value, enabled: true, updatedAt: new Date() })
      .where(eq(s.featureAssignments.id, existing.id));
    return;
  }
  await db.insert(s.featureAssignments).values({
    featureId: input.featureId,
    scope: 'institution',
    scopeId: input.institutionId,
    value: input.value,
    enabled: true,
    reason: 'Test dataset seed (indian_college preset)',
    setByName: 'Test dataset seed',
  });
}

/** institution_settings has no unique index, so match on (institution, category, key) by hand. */
async function upsertSetting(
  db: Database,
  institutionId: string,
  row: { category: string; key: string; label: string; valueType: string; value: string },
): Promise<void> {
  const [existing] = await db
    .select({ id: s.institutionSettings.id })
    .from(s.institutionSettings)
    .where(
      and(
        eq(s.institutionSettings.institutionId, institutionId),
        eq(s.institutionSettings.category, row.category),
        eq(s.institutionSettings.key, row.key),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(s.institutionSettings)
      .set({ label: row.label, valueType: row.valueType, value: row.value, updatedAt: new Date() })
      .where(eq(s.institutionSettings.id, existing.id));
    return;
  }
  await db.insert(s.institutionSettings).values({ institutionId, ...row });
}

async function applyStudentPortalPreset(db: Database, institutionId: string): Promise<void> {
  const definitions = await db.select().from(s.featureDefinitions);
  const byKey = new Map(definitions.map((d) => [d.key, d]));

  for (const mod of STUDENT_MODULE_CATALOG) {
    const surfaceDef = byKey.get(`student.surface.${mod.key}`);
    if (surfaceDef) {
      await upsertFeatureAssignment(db, {
        featureId: surfaceDef.id,
        institutionId,
        value: PRESET.modules[mod.key],
      });
    }
    if (mod.requiresInstitutionModule) {
      const modDef = byKey.get(`institution.module.${mod.requiresInstitutionModule}`);
      if (modDef) {
        await upsertFeatureAssignment(db, { featureId: modDef.id, institutionId, value: true });
      }
    }
  }

  const examsSurface = byKey.get('student.surface.exams');
  if (examsSurface) {
    await upsertFeatureAssignment(db, { featureId: examsSurface.id, institutionId, value: true });
  }

  await upsertSetting(db, institutionId, {
    category: 'student_portal',
    key: 'preset_key',
    label: 'Student portal preset',
    valueType: 'string',
    value: PRESET.key,
  });
  await upsertSetting(db, institutionId, {
    category: 'student_portal',
    key: 'attendance_threshold',
    label: 'Attendance threshold',
    valueType: 'number',
    value: String(PRESET.defaults.attendanceThreshold),
  });
  await upsertSetting(db, institutionId, {
    category: 'student_portal',
    key: 'grading_scheme',
    label: 'Grading scheme',
    valueType: 'string',
    value: PRESET.defaults.gradingScheme,
  });
  for (const key of TERMINOLOGY_KEYS) {
    await upsertSetting(db, institutionId, {
      category: 'terminology',
      key,
      label: `Terminology: ${key}`,
      valueType: 'string',
      value: PRESET.terminology[key],
    });
  }
  log(`portal preset ${PRESET.label} (${PRESET.key}) applied`);
}

// --- orchestration -----------------------------------------------------------

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const db = createDatabase({ url });

  try {
    // eslint-disable-next-line no-console
    console.log('\nSeeding institution admin test dataset\n');

    const institutionId = await seedInstitution(db);
    await seedSubscription(db, institutionId);
    const campusId = await seedCampus(db, institutionId);
    const scope: Scope = { institutionId, campusId };

    await seedInstitutionScheduleDefaults(db, institutionId);

    const academicYearId = await seedAcademicYear(db, scope);
    const departmentId = await seedProgramme(db, scope);
    const gradeLevelId = await seedGradeLevel(db, scope, departmentId);
    const programmeLevelId = await seedProgrammeLevel(db, scope, departmentId, gradeLevelId);
    const slots = await seedTermSlots(db, scope, departmentId, programmeLevelId);
    const semesters = await seedSemesters(db, scope, {
      academicYearId,
      departmentId,
      programmeLevelId,
      gradeLevelId,
      slots,
    });
    const termId = semesters.get(1)!;

    const subjectIds = await seedSubjects(db, scope, departmentId);
    await seedCurriculum(
      db,
      scope,
      { departmentId, programmeLevelId, slotId: slots.get(1) ?? null },
      subjectIds,
    );

    const adminUserId = await seedPortalUser(db, scope, {
      email: EMAILS.admin,
      fullName: 'Test Admin',
      roleKey: 'institution_admin',
      campusAccess: false,
    });
    const teacherUserId = await seedPortalUser(db, scope, {
      email: EMAILS.teacher,
      fullName: 'Test Teacher',
      roleKey: 'teacher',
      campusAccess: true,
    });
    const studentUserId = await seedPortalUser(db, scope, {
      email: EMAILS.student,
      fullName: 'Test Student',
      roleKey: 'student',
      campusAccess: true,
    });
    void adminUserId;

    const teacherId = await seedTeacher(db, scope, departmentId, teacherUserId);
    const studentId = await seedStudent(db, scope, studentUserId);

    const classId = await seedClass(db, scope, {
      academicYearId,
      gradeLevelId,
      programmeLevelId,
      termId,
      teacherId,
    });

    // Seat the student in the class (students.class_id is what the roster + counts read).
    await db
      .update(s.students)
      .set({ classId, gradeLevelId, updatedAt: new Date() })
      .where(eq(s.students.id, studentId));

    await seedClassSubjects(db, institutionId, classId, teacherId, subjectIds);
    await seedPlacements(db, scope, {
      studentId,
      teacherId,
      academicYearId,
      termId,
      programmeLevelId,
      gradeLevelId,
      classId,
      departmentId,
    });
    await seedCourses(db, scope, { termId, teacherId, studentId });
    await seedTimetable(db, scope, { classId, teacherId, academicYearId, termId }, subjectIds);
    await applyStudentPortalPreset(db, institutionId);

    printLogins();
  } finally {
    await closeDatabase();
  }
}

function printLogins(): void {
  const rows = [
    ['Institution admin', EMAILS.admin, DEV_PASSWORD_PLAINTEXT, 'http://localhost:3008'],
    ['Teacher (portal)', EMAILS.teacher, DEV_PASSWORD_PLAINTEXT, 'http://localhost:3008'],
    ['Student (portal)', EMAILS.student, DEV_PASSWORD_PLAINTEXT, 'http://localhost:3011'],
  ];
  const widths = [0, 1, 2, 3].map((i) => Math.max(...rows.map((r) => r[i]!.length)));
  const pad = (v: string, w: number) => v.padEnd(w);
  // eslint-disable-next-line no-console
  console.log('\nTest logins\n');
  for (const r of rows) {
    // eslint-disable-next-line no-console
    console.log(`  ${pad(r[0]!, widths[0]!)}  ${pad(r[1]!, widths[1]!)}  ${pad(r[2]!, widths[2]!)}  ${r[3]}`);
  }
  // eslint-disable-next-line no-console
  console.log('\n✓ Test dataset seeded.\n');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('✗ seed-test-dataset failed:', err instanceof Error ? err.stack : err);
  process.exit(1);
});
