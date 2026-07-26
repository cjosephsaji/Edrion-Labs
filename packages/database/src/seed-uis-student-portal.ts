/**
 * Idempotent: ensure one UIS student has an active portal login (no full UIS wipe).
 *
 *   pnpm --filter @edrion/database seed:uis-student-portal
 *
 * Login: student@uis.edu.in / password
 * Alt:   identifier UIS-2025-001 + institutionCode INST-UIS-00001
 */
import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { and, asc, eq } from 'drizzle-orm';
import { createDatabase } from './client';
import * as s from './schema/index';

const DEV_PASSWORD_HASH = '$2a$10$ByZT0oBbpXQboXG7ZlkzbOWfBfx9uAwu6Zf0HAt/G3yIcji9Rh.WG';
const INSTITUTION_NAME = 'United Indian School';
const PORTAL_EMAIL = 'student@uis.edu.in';
const ADMISSION_NO = 'UIS-2025-001';

async function main() {
  const db = createDatabase();

  const [institution] = await db
    .select()
    .from(s.institutions)
    .where(eq(s.institutions.displayName, INSTITUTION_NAME))
    .limit(1);
  if (!institution) {
    throw new Error(`"${INSTITUTION_NAME}" not found. Run pnpm db:seed then pnpm --filter @edrion/database seed:uis (or create the institution first).`);
  }

  const [campus] = await db
    .select({ id: s.campuses.id })
    .from(s.campuses)
    .where(eq(s.campuses.institutionId, institution.id))
    .orderBy(asc(s.campuses.code))
    .limit(1);
  if (!campus) {
    throw new Error('UIS has no campus. Run seed:uis once to create campus + directory.');
  }

  let [student] = await db
    .select()
    .from(s.students)
    .where(and(eq(s.students.institutionId, institution.id), eq(s.students.admissionNo, ADMISSION_NO)))
    .limit(1);

  if (!student) {
    [student] = await db
      .insert(s.students)
      .values({
        institutionId: institution.id,
        campusId: campus.id,
        admissionNo: ADMISSION_NO,
        firstName: 'Arjun',
        lastName: 'Sharma',
        gender: 'male',
        rollNo: '901',
        status: 'enrolled',
        enrollmentDate: '2025-06-10',
      })
      .returning();
    // eslint-disable-next-line no-console
    console.log(`✓ Created directory student ${ADMISSION_NO}`);
  }

  if (!student) throw new Error('Failed to resolve UIS demo student row.');

  const email = PORTAL_EMAIL.toLowerCase();
  let [portalUser] = await db
    .select()
    .from(s.institutionUsers)
    .where(and(eq(s.institutionUsers.institutionId, institution.id), eq(s.institutionUsers.email, email)))
    .limit(1);

  if (!portalUser) {
    [portalUser] = await db
      .insert(s.institutionUsers)
      .values({
        institutionId: institution.id,
        email,
        fullName: `${student.firstName} ${student.lastName}`,
        status: 'active',
        passwordHash: DEV_PASSWORD_HASH,
        activatedAt: new Date(),
      })
      .returning();
    // eslint-disable-next-line no-console
    console.log(`✓ Created portal user ${email}`);
  } else {
    await db
      .update(s.institutionUsers)
      .set({
        fullName: `${student.firstName} ${student.lastName}`,
        status: 'active',
        passwordHash: DEV_PASSWORD_HASH,
        activatedAt: portalUser.activatedAt ?? new Date(),
      })
      .where(eq(s.institutionUsers.id, portalUser.id));
    // eslint-disable-next-line no-console
    console.log(`✓ Refreshed portal user ${email} (dev password)`);
  }

  if (!portalUser) throw new Error('Failed to resolve portal user.');

  await db.delete(s.institutionUserRoles).where(eq(s.institutionUserRoles.institutionUserId, portalUser.id));
  await db.insert(s.institutionUserRoles).values({ institutionUserId: portalUser.id, roleKey: 'student' });

  await db.delete(s.campusUserAccess).where(eq(s.campusUserAccess.institutionUserId, portalUser.id));
  await db.insert(s.campusUserAccess).values({
    institutionUserId: portalUser.id,
    campusId: campus.id,
    accessLevel: 'manage',
  });

  await db
    .update(s.students)
    .set({ institutionUserId: portalUser.id })
    .where(eq(s.students.id, student.id));

  // eslint-disable-next-line no-console
  console.log(`
UIS student portal ready:
  Email:      ${email}
  Password:   password
  Admission:  ${ADMISSION_NO}
  Inst code:  ${institution.publicId}
  Student id: ${student.id}
  Portal id:  ${portalUser.id}
`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
