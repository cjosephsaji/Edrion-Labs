/**
 * Institution-Portal demo seed. Idempotent. Attaches a set of demo portal users (one per
 * representative role) to the FIRST seeded institution + its campuses, wiring
 * institution_user_roles and campus_user_access so the portal's permission + scope system has
 * real data to resolve. Safe to run repeatedly.
 *
 *   pnpm --filter @edrion/database seed:portal
 *
 * Requires the platform seed to have run first (it creates the institutions + campuses).
 * Log in to the portal in dev with any email below via the x-institution-user-email header
 * (PORTAL_AUTH_DEV_HEADER=true). Default web user: owner@greenwood.edu.
 */
import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { and, asc, count, eq, isNull, schema as s } from './index';
import { createDatabase } from './client';

/** Dev-only bcrypt hash of the password `password` (cost 10) for native portal login. Never prod. */
const DEV_PASSWORD_HASH = '$2a$10$ByZT0oBbpXQboXG7ZlkzbOWfBfx9uAwu6Zf0HAt/G3yIcji9Rh.WG';

interface DemoUser {
  email: string;
  fullName: string;
  roleKey: string;
  /** Number of campuses (from the start of the campus list) this user may access. 0 = none / wide. */
  campusCount: number;
}

const DEMO_USERS: DemoUser[] = [
  { email: 'owner@greenwood.edu', fullName: 'Olivia Owner', roleKey: 'institution_owner', campusCount: 0 },
  { email: 'admin@greenwood.edu', fullName: 'Adam Admin', roleKey: 'institution_admin', campusCount: 0 },
  { email: 'campus.north@greenwood.edu', fullName: 'Cara Campus', roleKey: 'campus_admin', campusCount: 1 },
  { email: 'principal@greenwood.edu', fullName: 'Pat Principal', roleKey: 'principal', campusCount: 1 },
  // finance/hr are institution-level functional managers but are NOT in INSTITUTION_WIDE_ROLES,
  // so without an explicit campus grant they resolve as confined-with-no-campus and see zero
  // campus-scoped rows. Grant the first campus so their portal pages render populated in the demo.
  { email: 'finance@greenwood.edu', fullName: 'Fred Finance', roleKey: 'finance_manager', campusCount: 1 },
  { email: 'hr@greenwood.edu', fullName: 'Hira HR', roleKey: 'hr_manager', campusCount: 1 },
  { email: 'teacher@greenwood.edu', fullName: 'Tina Teacher', roleKey: 'teacher', campusCount: 1 },
  { email: 'parent@greenwood.edu', fullName: 'Paul Parent', roleKey: 'parent', campusCount: 1 },
  { email: 'student@greenwood.edu', fullName: 'Sam Student', roleKey: 'student', campusCount: 1 },
  // Phase 13: functional staff roles (each campus-scoped to the first campus).
  { email: 'nurse@greenwood.edu', fullName: 'Nadia Nurse', roleKey: 'school_nurse', campusCount: 1 },
  { email: 'counselor@greenwood.edu', fullName: 'Cory Counselor', roleKey: 'counselor', campusCount: 1 },
  { email: 'lab@greenwood.edu', fullName: 'Liam Lab', roleKey: 'lab_staff', campusCount: 1 },
  { email: 'reception@greenwood.edu', fullName: 'Rita Reception', roleKey: 'receptionist', campusCount: 1 },
  { email: 'it@greenwood.edu', fullName: 'Ivan IT', roleKey: 'it_staff', campusCount: 1 },
  { email: 'maintenance@greenwood.edu', fullName: 'Mona Maintenance', roleKey: 'maintenance_staff', campusCount: 1 },
  { email: 'security@greenwood.edu', fullName: 'Sergio Security', roleKey: 'security_staff', campusCount: 1 },
];

async function main() {
  const db = createDatabase();

  // The first institution (lowest createdAt) + its campuses.
  const [institution] = await db
    .select({ id: s.institutions.id, name: s.institutions.displayName })
    .from(s.institutions)
    .orderBy(asc(s.institutions.createdAt))
    .limit(1);

  if (!institution) {
    throw new Error('No institutions found. Run the platform seed first (pnpm db:seed).');
  }

  const campuses = await db
    .select({ id: s.campuses.id, name: s.campuses.name })
    .from(s.campuses)
    .where(eq(s.campuses.institutionId, institution.id))
    .orderBy(asc(s.campuses.code));

  // eslint-disable-next-line no-console
  console.log(`→ Seeding portal users for "${institution.name}" (${campuses.length} campuses)…`);

  // email → institution_users.id, so People directory rows can link back to a portal login.
  const userIdByEmail = new Map<string, string>();

  for (const demo of DEMO_USERS) {
    const email = demo.email.toLowerCase();

    // Upsert the institution user (unique per institution+email).
    const [existing] = await db
      .select({ id: s.institutionUsers.id })
      .from(s.institutionUsers)
      .where(and(eq(s.institutionUsers.institutionId, institution.id), eq(s.institutionUsers.email, email)))
      .limit(1);

    let userId = existing?.id;
    if (!userId) {
      const [created] = await db
        .insert(s.institutionUsers)
        .values({
          institutionId: institution.id,
          email,
          fullName: demo.fullName,
          status: 'active',
          // Dev password login: <email> / password (see DEV_PASSWORD_HASH).
          passwordHash: DEV_PASSWORD_HASH,
          activatedAt: new Date(),
        })
        .returning({ id: s.institutionUsers.id });
      userId = created?.id;
    }
    if (!userId) continue;
    userIdByEmail.set(email, userId);

    // Reset roles to exactly this demo role.
    await db.delete(s.institutionUserRoles).where(eq(s.institutionUserRoles.institutionUserId, userId));
    await db.insert(s.institutionUserRoles).values({ institutionUserId: userId, roleKey: demo.roleKey });

    // Reset + grant campus access for confined users.
    await db.delete(s.campusUserAccess).where(eq(s.campusUserAccess.institutionUserId, userId));
    if (demo.campusCount > 0) {
      const grantTo = campuses.slice(0, demo.campusCount);
      for (const c of grantTo) {
        await db
          .insert(s.campusUserAccess)
          .values({ institutionUserId: userId, campusId: c.id, accessLevel: 'manage' });
      }
    }

    // eslint-disable-next-line no-console
    console.log(`  ✓ ${email} → ${demo.roleKey}${demo.campusCount ? ` (+${demo.campusCount} campus)` : ''}`);
  }

  // Phase 4 People directory: students / teachers / staff / parents. The institution_users above
  // are auth identities, NOT directory records — without these the People + staff pages render
  // empty. Idempotent per table (seed only when the table has no rows for this institution). Some
  // teacher/staff/parent rows link back to a portal login via institution_user_id.
  const peopleCampusId = campuses[0]?.id ?? null;
  const link = (e: string) => userIdByEmail.get(e.toLowerCase()) ?? null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seedPeople = async (table: any, rows: Record<string, unknown>[]): Promise<{ id: string }[]> => {
    const [c] = await db.select({ v: count() }).from(table).where(eq(table.institutionId, institution.id));
    if (Number(c?.v ?? 0) > 0) {
      return db.select({ id: table.id }).from(table).where(eq(table.institutionId, institution.id));
    }
    return db
      .insert(table)
      .values(rows.map((r) => ({ institutionId: institution.id, campusId: peopleCampusId, ...r })))
      .returning({ id: table.id });
  };

  const studentIds = await seedPeople(s.students, [
    { admissionNo: 'ADM-001', firstName: 'Aarav', lastName: 'Sharma', gender: 'male', rollNo: '1', status: 'enrolled' },
    { admissionNo: 'ADM-002', firstName: 'Bella', lastName: 'Ortiz', gender: 'female', rollNo: '2', status: 'enrolled' },
    { admissionNo: 'ADM-003', firstName: 'Chen', lastName: 'Wei', gender: 'male', rollNo: '3', status: 'enrolled' },
    { admissionNo: 'ADM-004', firstName: 'Diya', lastName: 'Patel', gender: 'female', rollNo: '4', status: 'enrolled' },
    { admissionNo: 'ADM-005', firstName: 'Ethan', lastName: 'Brown', gender: 'male', rollNo: '5', status: 'enrolled' },
  ]);

  await seedPeople(s.teachers, [
    { employeeNo: 'T-001', firstName: 'Tina', lastName: 'Teacher', email: 'teacher@greenwood.edu', designation: 'Senior Teacher', institutionUserId: link('teacher@greenwood.edu') },
    { employeeNo: 'T-002', firstName: 'George', lastName: 'Gomez', email: 'g.gomez@greenwood.edu', designation: 'Mathematics Teacher' },
    { employeeNo: 'T-003', firstName: 'Hana', lastName: 'Khan', email: 'h.khan@greenwood.edu', designation: 'HOD Science' },
  ]);

  await seedPeople(s.staff, [
    { employeeNo: 'S-001', firstName: 'Hira', lastName: 'HR', email: 'hr@greenwood.edu', designation: 'HR Manager', institutionUserId: link('hr@greenwood.edu') },
    { employeeNo: 'S-002', firstName: 'Ivan', lastName: 'IT', email: 'it@greenwood.edu', designation: 'IT Administrator', institutionUserId: link('it@greenwood.edu') },
    { employeeNo: 'S-003', firstName: 'Rita', lastName: 'Reception', email: 'reception@greenwood.edu', designation: 'Front Office', institutionUserId: link('reception@greenwood.edu') },
    { employeeNo: 'S-004', firstName: 'Nadia', lastName: 'Nurse', email: 'nurse@greenwood.edu', designation: 'School Nurse', institutionUserId: link('nurse@greenwood.edu') },
    { employeeNo: 'S-005', firstName: 'Cory', lastName: 'Counselor', email: 'counselor@greenwood.edu', designation: 'Counselor', institutionUserId: link('counselor@greenwood.edu') },
    { employeeNo: 'S-006', firstName: 'Liam', lastName: 'Lab', email: 'lab@greenwood.edu', designation: 'Lab Technician', institutionUserId: link('lab@greenwood.edu') },
    { employeeNo: 'S-007', firstName: 'Mona', lastName: 'Maintenance', email: 'maintenance@greenwood.edu', designation: 'Maintenance Supervisor', institutionUserId: link('maintenance@greenwood.edu') },
    { employeeNo: 'S-008', firstName: 'Sergio', lastName: 'Security', email: 'security@greenwood.edu', designation: 'Security Officer', institutionUserId: link('security@greenwood.edu') },
    { employeeNo: 'S-009', firstName: 'Fred', lastName: 'Finance', email: 'finance@greenwood.edu', designation: 'Accountant', institutionUserId: link('finance@greenwood.edu') },
  ]);

  const parentIds = await seedPeople(s.parents, [
    { firstName: 'Paul', lastName: 'Parent', email: 'parent@greenwood.edu', occupation: 'Engineer', institutionUserId: link('parent@greenwood.edu') },
  ]);

  // Link the first parent to the first student as primary guardian (idempotent).
  if (studentIds[0] && parentIds[0]) {
    const [g] = await db
      .select({ v: count() })
      .from(s.studentGuardians)
      .where(eq(s.studentGuardians.institutionId, institution.id));
    if (Number(g?.v ?? 0) === 0) {
      await db.insert(s.studentGuardians).values({
        institutionId: institution.id,
        studentId: studentIds[0].id,
        parentId: parentIds[0].id,
        relationship: 'father',
        isPrimary: true,
        isEmergencyContact: true,
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`  ✓ People directory seeded (${studentIds.length} students + teachers/staff/parents).`);

  // Phase 13: sample rows per new module so pages render populated (not just empty-state).
  const campusId = campuses[0]?.id ?? null;
  const [firstStudent] = await db
    .select({ id: s.students.id })
    .from(s.students)
    .where(eq(s.students.institutionId, institution.id))
    .limit(1);
  const studentId = firstStudent?.id ?? null;
  const today = new Date().toISOString().slice(0, 10);
  const now = new Date();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insertIfEmpty = async (table: any, rows: Record<string, unknown>[]) => {
    const [c] = await db.select({ v: count() }).from(table).where(eq(table.institutionId, institution.id));
    if (Number(c?.v ?? 0) > 0) return;
    await db.insert(table).values(rows.map((r) => ({ institutionId: institution.id, campusId, ...r })));
  };

  await insertIfEmpty(s.healthRecords, [
    { studentId, recordType: 'allergy', title: 'Peanut allergy', details: 'Carries an EpiPen.', bloodGroup: 'O+', status: 'active', recordedAt: today },
  ]);
  await insertIfEmpty(s.medicalIncidents, [
    { studentId, title: 'Minor fall in playground', description: 'Grazed knee, cleaned and bandaged.', severity: 'low', location: 'Playground', occurredAt: now, status: 'resolved' },
  ]);
  await insertIfEmpty(s.medicationLogs, [
    { studentId, medication: 'Paracetamol', dosage: '500mg', administeredAt: now, notes: 'For headache.', status: 'administered' },
  ]);
  await insertIfEmpty(s.counselingRecords, [
    { studentId, sessionType: 'intake', title: 'Initial intake session', notes: 'Confidential — initial assessment completed.', sessionAt: now, status: 'open' },
  ]);
  await insertIfEmpty(s.counselingCases, [
    { studentId, title: 'Attendance support', summary: 'Monitoring attendance and engagement.', priority: 'medium', status: 'open' },
  ]);
  await insertIfEmpty(s.labAssets, [
    { name: 'Compound Microscope', kind: 'equipment', quantity: 10, unit: 'units', location: 'Science Lab 1', status: 'available' },
    { name: 'Test Tubes', kind: 'consumable', quantity: 200, unit: 'pcs', location: 'Science Lab 1', status: 'available' },
  ]);
  await insertIfEmpty(s.labSchedules, [
    { labName: 'Science Lab 1', title: 'Grade 9 practical', scheduledAt: now, durationMinutes: 60, status: 'scheduled' },
  ]);
  await insertIfEmpty(s.labIncidents, [
    { title: 'Spilled reagent', description: 'Small spill, neutralised and cleaned.', severity: 'low', occurredAt: now, status: 'resolved' },
  ]);
  await insertIfEmpty(s.visitors, [
    { fullName: 'Jane Visitor', purpose: 'Parent meeting', host: 'Principal', badgeNo: 'V-001', checkInAt: now, status: 'checked_in' },
  ]);
  await insertIfEmpty(s.appointments, [
    { visitorName: 'Mr. Smith', withWhom: 'Counselor', scheduledAt: now, notes: 'Discuss progress.', status: 'scheduled' },
  ]);
  await insertIfEmpty(s.facilities, [
    { name: 'Main Building', kind: 'building', location: 'North Campus', status: 'operational' },
  ]);
  await insertIfEmpty(s.workOrders, [
    { title: 'Fix leaking tap', description: 'Boys washroom, ground floor.', priority: 'medium', assignedTo: 'Mona Maintenance', dueAt: today, status: 'open' },
  ]);
  await insertIfEmpty(s.maintenanceTasks, [
    { title: 'HVAC filter change', frequency: 'monthly', nextDueAt: today, notes: 'All blocks.', status: 'pending' },
  ]);
  await insertIfEmpty(s.facilityAssets, [
    { name: 'Ride-on Lawn Mower', category: 'Grounds', location: 'Storage Shed', status: 'active' },
  ]);
  await insertIfEmpty(s.gatePasses, [
    { holderName: 'Delivery Driver', kind: 'vehicle', reason: 'Cafeteria supplies', issuedAt: now, status: 'active' },
  ]);
  await insertIfEmpty(s.securityIncidents, [
    { title: 'Unauthorized entry attempt', description: 'Spotted at rear gate, escorted out.', severity: 'medium', location: 'Rear Gate', occurredAt: now, status: 'investigating' },
  ]);
  await insertIfEmpty(s.emergencyAlerts, [
    { title: 'Fire drill scheduled', message: 'Routine fire drill at 11:00.', level: 'info', raisedAt: now, status: 'active' },
  ]);
  await insertIfEmpty(s.campusAccessLogs, [
    { subjectName: 'Jane Visitor', direction: 'in', gate: 'Main Gate', method: 'badge', occurredAt: now, status: 'recorded' },
  ]);
  await insertIfEmpty(s.devices, [
    { name: 'Lab PC 12', kind: 'desktop', assetTag: 'EDR-PC-012', assignedTo: 'Science Lab 1', status: 'active' },
  ]);
  await insertIfEmpty(s.accessRequests, [
    { requesterName: 'Tina Teacher', system: 'Staff Wi-Fi', reason: 'New laptop setup', priority: 'low', status: 'open' },
  ]);

  // Backfill: Phase 13 rows that were inserted before any students existed got a null studentId.
  // Now that the People directory is seeded, point those orphaned rows at the first student.
  if (studentId) {
    for (const t of [s.healthRecords, s.medicalIncidents, s.medicationLogs, s.counselingRecords, s.counselingCases]) {
      await db
        .update(t)
        .set({ studentId })
        .where(and(eq(t.institutionId, institution.id), isNull(t.studentId)));
    }
  }

  // eslint-disable-next-line no-console
  console.log('  ✓ Phase 13 sample rows ensured (health/counseling/labs/front-desk/facilities/security/it).');

  // eslint-disable-next-line no-console
  console.log('✓ Portal demo users seeded.');
  process.exit(0);
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Portal seed failed:', err);
  process.exit(1);
});
