import { and, eq } from 'drizzle-orm';
import { DEV_PASSWORD_HASH } from '@edrion/database/dev-constants';
import { schema as s } from '@edrion/database';
import type { DevSeedContext } from './_context.js';
import { DEV_PASSWORD, registerLogin, URLS } from './_context.js';
import type { InstitutionSeedResult } from './institution.js';

export interface PeopleSeedResult {
  teacherStaffId: string;
  classTeacherStaffId: string;
  studentIds: [string, string, string];
  parentId: string;
  classTeacherUserId: string;
}

interface PortalUserDef {
  email: string;
  fullName: string;
  roleKey: string;
  url: string;
  campusAccess: boolean;
}

const PORTAL_USERS: PortalUserDef[] = [
  {
    email: 'admin@greenwood.edu',
    fullName: 'Adam Admin',
    roleKey: 'institution_admin',
    url: URLS.institution,
    campusAccess: false,
  },
  {
    email: 'teacher@greenwood.edu',
    fullName: 'Tina Teacher',
    roleKey: 'teacher',
    url: URLS.institution,
    campusAccess: true,
  },
  {
    email: 'classteacher@greenwood.edu',
    fullName: 'Cara Class Teacher',
    roleKey: 'teacher',
    url: URLS.institution,
    campusAccess: true,
  },
  {
    email: 'parent@greenwood.edu',
    fullName: 'Paul Parent',
    roleKey: 'parent',
    url: URLS.parent,
    campusAccess: true,
  },
  {
    email: 'student1@greenwood.edu',
    fullName: 'Aarav Sharma',
    roleKey: 'student',
    url: URLS.student,
    campusAccess: true,
  },
  {
    email: 'student2@greenwood.edu',
    fullName: 'Bella Ortiz',
    roleKey: 'student',
    url: URLS.student,
    campusAccess: true,
  },
  {
    email: 'student3@greenwood.edu',
    fullName: 'Chen Wei',
    roleKey: 'student',
    url: URLS.student,
    campusAccess: true,
  },
];

export async function seedUsers(
  ctx: DevSeedContext,
  inst: InstitutionSeedResult,
): Promise<PeopleSeedResult> {
  const { db } = ctx;
  const { institutionId, campusId } = inst;
  const userIdByEmail = new Map<string, string>();

  for (const demo of PORTAL_USERS) {
    const email = demo.email.toLowerCase();
    const [existing] = await db
      .select({ id: s.institutionUsers.id })
      .from(s.institutionUsers)
      .where(and(eq(s.institutionUsers.institutionId, institutionId), eq(s.institutionUsers.email, email)))
      .limit(1);

    let userId = existing?.id;
    if (!userId) {
      const [created] = await db
        .insert(s.institutionUsers)
        .values({
          institutionId,
          email,
          fullName: demo.fullName,
          status: 'active',
          passwordHash: DEV_PASSWORD_HASH,
          activatedAt: new Date(),
        })
        .returning({ id: s.institutionUsers.id });
      userId = created?.id;
    }
    if (!userId) continue;
    userIdByEmail.set(email, userId);

    await db
      .delete(s.institutionUserRoles)
      .where(eq(s.institutionUserRoles.institutionUserId, userId));
    await db.insert(s.institutionUserRoles).values({ institutionUserId: userId, roleKey: demo.roleKey });

    await db.delete(s.campusUserAccess).where(eq(s.campusUserAccess.institutionUserId, userId));
    if (demo.campusAccess) {
      await db.insert(s.campusUserAccess).values({
        institutionUserId: userId,
        campusId,
        accessLevel: 'manage',
      });
    }

    registerLogin(ctx, {
      email,
      password: DEV_PASSWORD,
      role: demo.email.startsWith('classteacher@') ? 'class_teacher' : demo.roleKey,
      url: demo.url,
    });
  }

  const teacherUserId = userIdByEmail.get('teacher@greenwood.edu')!;
  const classTeacherUserId = userIdByEmail.get('classteacher@greenwood.edu')!;
  const parentUserId = userIdByEmail.get('parent@greenwood.edu')!;

  const teacherStaffId = await upsertStaff(db, institutionId, campusId, {
    employeeNo: 'T-100',
    firstName: 'Tina',
    lastName: 'Teacher',
    email: 'teacher@greenwood.edu',
    designation: 'Mathematics Teacher',
    institutionUserId: teacherUserId,
  });

  const classTeacherStaffId = await upsertStaff(db, institutionId, campusId, {
    employeeNo: 'T-101',
    firstName: 'Cara',
    lastName: 'Class Teacher',
    email: 'classteacher@greenwood.edu',
    designation: 'Class Teacher',
    institutionUserId: classTeacherUserId,
  });

  const parentId = await upsertParent(db, institutionId, campusId, {
    firstName: 'Paul',
    lastName: 'Parent',
    email: 'parent@greenwood.edu',
    occupation: 'Engineer',
    institutionUserId: parentUserId,
  });

  const studentIds = [
    await upsertStudent(db, institutionId, campusId, {
      admissionNo: 'GWD-001',
      firstName: 'Aarav',
      lastName: 'Sharma',
      rollNo: '1',
      institutionUserId: userIdByEmail.get('student1@greenwood.edu'),
    }),
    await upsertStudent(db, institutionId, campusId, {
      admissionNo: 'GWD-002',
      firstName: 'Bella',
      lastName: 'Ortiz',
      rollNo: '2',
      institutionUserId: userIdByEmail.get('student2@greenwood.edu'),
    }),
    await upsertStudent(db, institutionId, campusId, {
      admissionNo: 'GWD-003',
      firstName: 'Chen',
      lastName: 'Wei',
      rollNo: '3',
      institutionUserId: userIdByEmail.get('student3@greenwood.edu'),
    }),
  ] as [string, string, string];

  const [guardian] = await db
    .select({ id: s.studentGuardians.id })
    .from(s.studentGuardians)
    .where(
      and(
        eq(s.studentGuardians.institutionId, institutionId),
        eq(s.studentGuardians.studentId, studentIds[0]),
        eq(s.studentGuardians.parentId, parentId),
      ),
    )
    .limit(1);
  if (!guardian) {
    await db.insert(s.studentGuardians).values({
      institutionId,
      studentId: studentIds[0],
      parentId,
      relationship: 'father',
      isPrimary: true,
      isEmergencyContact: true,
    });
  }

  return { teacherStaffId, classTeacherStaffId, studentIds, parentId, classTeacherUserId };
}

async function upsertStaff(
  db: DevSeedContext['db'],
  institutionId: string,
  campusId: string,
  row: {
    employeeNo: string;
    firstName: string;
    lastName: string;
    email: string;
    designation: string;
    institutionUserId: string;
  },
): Promise<string> {
  const [existing] = await db
    .select({ id: s.staff.id })
    .from(s.staff)
    .where(and(eq(s.staff.institutionId, institutionId), eq(s.staff.employeeNo, row.employeeNo)))
    .limit(1);
  if (existing) {
    await db
      .update(s.staff)
      .set({ institutionUserId: row.institutionUserId })
      .where(eq(s.staff.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(s.staff)
    .values({
      institutionId,
      campusId,
      status: 'active',
      ...row,
    })
    .returning({ id: s.staff.id });
  if (!created?.id) throw new Error(`Failed to seed staff ${row.employeeNo}`);
  return created.id;
}

async function upsertParent(
  db: DevSeedContext['db'],
  institutionId: string,
  campusId: string,
  row: {
    firstName: string;
    lastName: string;
    email: string;
    occupation: string;
    institutionUserId: string;
  },
): Promise<string> {
  const [existing] = await db
    .select({ id: s.parents.id })
    .from(s.parents)
    .where(and(eq(s.parents.institutionId, institutionId), eq(s.parents.email, row.email)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(s.parents)
    .values({ institutionId, campusId, ...row })
    .returning({ id: s.parents.id });
  if (!created?.id) throw new Error('Failed to seed parent');
  return created.id;
}

async function upsertStudent(
  db: DevSeedContext['db'],
  institutionId: string,
  campusId: string,
  row: {
    admissionNo: string;
    firstName: string;
    lastName: string;
    rollNo: string;
    institutionUserId?: string;
  },
): Promise<string> {
  const [existing] = await db
    .select({ id: s.students.id })
    .from(s.students)
    .where(and(eq(s.students.institutionId, institutionId), eq(s.students.admissionNo, row.admissionNo)))
    .limit(1);
  if (existing) {
    if (row.institutionUserId) {
      await db
        .update(s.students)
        .set({ institutionUserId: row.institutionUserId })
        .where(eq(s.students.id, existing.id));
    }
    return existing.id;
  }
  const [created] = await db
    .insert(s.students)
    .values({
      institutionId,
      campusId,
      gender: 'male',
      status: 'enrolled',
      ...row,
    })
    .returning({ id: s.students.id });
  if (!created?.id) throw new Error(`Failed to seed student ${row.admissionNo}`);
  return created.id;
}
