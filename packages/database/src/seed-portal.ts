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

import { and, asc, count, eq, schema as s } from './index';
import { createDatabase } from './client';

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
  { email: 'finance@greenwood.edu', fullName: 'Fred Finance', roleKey: 'finance_manager', campusCount: 0 },
  { email: 'hr@greenwood.edu', fullName: 'Hira HR', roleKey: 'hr_manager', campusCount: 0 },
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
        .values({ institutionId: institution.id, email, fullName: demo.fullName, status: 'active' })
        .returning({ id: s.institutionUsers.id });
      userId = created?.id;
    }
    if (!userId) continue;

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
