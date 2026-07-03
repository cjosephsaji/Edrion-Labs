/**
 * United Indian School — Full Institution Seed
 * ─────────────────────────────────────────────
 * Clears ALL portal data for United Indian School and repopulates every module
 * with realistic, fully-linked data using an Indian school context.
 *
 * Run with:
 *   pnpm --filter @edrion/database seed:uis
 *
 * Or directly:
 *   tsx packages/database/src/seed-uis.ts
 *
 * Creates/reuses the United Indian School institution + campus, then refreshes
 * all institution-scoped portal data. Run the base platform seed first when you
 * also need the shared platform reference data, employees, plans, and roles.
 */
import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { and, asc, eq } from 'drizzle-orm';
import { createDatabase } from './client';
import * as s from './schema/index';

/** Dev-only bcrypt hash of "password" (cost 10). Never prod. */
const DEV_PASSWORD_HASH = '$2a$10$ByZT0oBbpXQboXG7ZlkzbOWfBfx9uAwu6Zf0HAt/G3yIcji9Rh.WG';

const INSTITUTION_NAME = 'United Indian School';

// ─── Date helpers ────────────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const now = new Date();
function daysAgo(n: number) { return new Date(Date.now() - n * 86_400_000); }
function daysFromNow(n: number) { return new Date(Date.now() + n * 86_400_000); }
function dateStr(d: Date) { return d.toISOString().slice(0, 10); }

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const db = createDatabase();

  // ── 1. Find or create the institution ────────────────────────────────────
  let [institution] = await db
    .select()
    .from(s.institutions)
    .where(eq(s.institutions.displayName, INSTITUTION_NAME))
    .limit(1);

  if (!institution) {
    [institution] = await db
      .insert(s.institutions)
      .values({
        publicId: 'INST-UIS-00001',
        legalName: 'United Indian School Trust',
        displayName: INSTITUTION_NAME,
        type: 'school',
        country: 'IN',
        region: 'Kerala',
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        address: {
          line1: 'Edappally Campus Road',
          city: 'Kochi',
          region: 'Kerala',
          postalCode: '682024',
          country: 'IN',
        },
        primaryContact: {
          name: 'Rekha Nambiar',
          email: 'admin@uis.edu.in',
          phone: '+919876543210',
          title: 'Administrator',
        },
        billingContact: {
          name: 'Rajan Mathew',
          email: 'finance@uis.edu.in',
          phone: '+919876543211',
          title: 'Finance Manager',
        },
        technicalContact: {
          name: 'Pradeep George',
          email: 'it@uis.edu.in',
          phone: '+919876543212',
          title: 'IT Manager',
        },
        status: 'active',
        onboardingStatus: 'completed',
        supportTier: 'standard',
        activatedAt: now,
        usageStats: { students: 18, staff: 12, campuses: 1 },
        internalNotes: 'Created by the United Indian School full demo seed.',
      })
      .returning();

    if (!institution) throw new Error(`Unable to create institution "${INSTITUTION_NAME}".`);
    console.log(`✓ Created institution: ${institution.displayName} (${institution.id})`);
  } else {
    console.log(`✓ Found institution: ${institution.displayName} (${institution.id})`);
  }

  const instId = institution.id;

  // ── 2. Find or create campus ─────────────────────────────────────────────
  let [campus] = await db
    .select()
    .from(s.campuses)
    .where(eq(s.campuses.institutionId, instId))
    .orderBy(asc(s.campuses.code))
    .limit(1);

  if (!campus) {
    [campus] = await db
      .insert(s.campuses)
      .values({
        institutionId: instId,
        name: 'Main Campus',
        code: 'MAIN',
        address: {
          line1: 'Edappally Campus Road',
          city: 'Kochi',
          region: 'Kerala',
          postalCode: '682024',
          country: 'IN',
        },
        contact: {
          phone: '+914842400001',
          email: 'office@uis.edu.in',
        },
        timezoneOverride: 'Asia/Kolkata',
        studentCapacity: 1200,
        currentUserCount: 0,
        billingStatus: 'included',
        openingDate: new Date('2005-06-01T00:00:00.000Z'),
      })
      .returning();

    if (!campus) throw new Error('Unable to create UIS main campus.');
    console.log(`✓ Created campus: ${campus.name} (${campus.id})`);
  } else {
    console.log(`✓ Found campus: ${campus.name} (${campus.id})`);
  }

  const campusId = campus.id;

  // ── 3. CLEAR all institution-scoped data (dependency order — children first) ─
  console.log('\n→ Clearing all existing data for this institution…');
  const tables = [
    // leaf / child tables first
    s.webhookEndpoints, s.institutionSettings, s.institutionRoles,
    s.campusAccessLogs, s.emergencyAlerts, s.securityIncidents, s.gatePasses,
    s.accessRequests, s.devices,
    s.medicationLogs, s.medicalIncidents, s.healthRecords,
    s.counselingCases, s.counselingRecords,
    s.labIncidents, s.labSchedules, s.labAssets,
    s.messagePosts, s.messageThreads,
    s.notifications, s.announcements,
    s.hostelAllocations, s.hostelRooms, s.hostelBlocks,
    s.inventoryMovements, s.inventoryItems,
    s.transportAssignments, s.transportVehicles, s.transportRoutes,
    s.libraryLoans, s.libraryBooks,
    s.payrollItems, s.payrollRuns,
    s.feePayments, s.feeInvoices, s.feeStructures,
    s.assignmentSubmissions, s.assignments,
    s.gradeEntries,
    s.examSchedules, s.exams,
    s.timetableSlots,
    s.attendanceRecords, s.attendanceSessions,
    s.admissionApplications,
    s.studentGuardians,
    s.parents, s.students, s.staff, s.teachers,
    // portal users
    s.institutionUsers,
    // academic structure
    s.classSubjectTeachers, s.classes,
    s.subjects, s.gradeLevels, s.departments, s.academicYears,
    // campus operations
    s.facilityAssets, s.maintenanceTasks, s.workOrders, s.facilities,
    s.visitors, s.appointments,
  ];

  for (const table of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await db.delete(table as any).where(eq((table as any).institutionId, instId));
  }
  console.log('  ✓ Cleared.');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 1: ACADEMIC STRUCTURE
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding academic structure…');

  // ── Academic Years ────────────────────────────────────────────────────────
  const [, ay2526] = await db
    .insert(s.academicYears)
    .values([
      {
        institutionId: instId,
        campusId,
        name: '2024–2025',
        startDate: '2024-06-01',
        endDate: '2025-03-31',
        isCurrent: false,
        status: 'archived',
      },
      {
        institutionId: instId,
        campusId,
        name: '2025–2026',
        startDate: '2025-06-01',
        endDate: '2026-03-31',
        isCurrent: true,
        status: 'active',
      },
    ])
    .returning();
  const ayId = ay2526!.id;
  console.log('  ✓ Academic Years: 2024–2025, 2025–2026 (current)');

  // ── Departments ───────────────────────────────────────────────────────────
  const deptRows = await db
    .insert(s.departments)
    .values([
      { institutionId: instId, campusId, name: 'Mathematics', code: 'MATH', description: 'Pure and Applied Mathematics' },
      { institutionId: instId, campusId, name: 'Science', code: 'SCI', description: 'Physics, Chemistry & Biology' },
      { institutionId: instId, campusId, name: 'English & Literature', code: 'ENG', description: 'English Language and Literature' },
      { institutionId: instId, campusId, name: 'Social Studies', code: 'SOC', description: 'History, Geography & Civics' },
      { institutionId: instId, campusId, name: 'Hindi', code: 'HIN', description: 'Hindi Language & Literature' },
      { institutionId: instId, campusId, name: 'Computer Science', code: 'CS', description: 'Information Technology & Computing' },
      { institutionId: instId, campusId, name: 'Physical Education', code: 'PE', description: 'Sports, Health & Fitness' },
      { institutionId: instId, campusId, name: 'Arts & Crafts', code: 'ART', description: 'Fine Arts and Creative Studies' },
      { institutionId: instId, campusId, name: 'Administration', code: 'ADMIN', description: 'School Administration & Management' },
    ])
    .returning();

  const deptByCode: Record<string, string> = {};
  for (const d of deptRows) deptByCode[d.code] = d.id;
  console.log(`  ✓ Departments: ${deptRows.length}`);

  // ── Grade Levels ──────────────────────────────────────────────────────────
  const gradeData = [
    { name: 'Grade 1', level: 1 },
    { name: 'Grade 2', level: 2 },
    { name: 'Grade 3', level: 3 },
    { name: 'Grade 4', level: 4 },
    { name: 'Grade 5', level: 5 },
    { name: 'Grade 6', level: 6 },
    { name: 'Grade 7', level: 7 },
    { name: 'Grade 8', level: 8 },
    { name: 'Grade 9', level: 9 },
    { name: 'Grade 10', level: 10 },
    { name: 'Grade 11 Science', level: 11 },
    { name: 'Grade 12 Science', level: 12 },
  ];
  const gradeRows = await db
    .insert(s.gradeLevels)
    .values(gradeData.map((g) => ({ institutionId: instId, campusId, ...g })))
    .returning();
  const gradeByLevel: Record<number, string> = {};
  for (const g of gradeRows) gradeByLevel[g.level] = g.id;
  console.log(`  ✓ Grade Levels: ${gradeRows.length}`);

  // ── Subjects ──────────────────────────────────────────────────────────────
  const subjectData = [
    { name: 'Mathematics', code: 'MATH101', kind: 'core', departmentId: deptByCode['MATH'] },
    { name: 'Science', code: 'SCI101', kind: 'core', departmentId: deptByCode['SCI'] },
    { name: 'Physics', code: 'PHY301', kind: 'core', departmentId: deptByCode['SCI'] },
    { name: 'Chemistry', code: 'CHEM301', kind: 'core', departmentId: deptByCode['SCI'] },
    { name: 'Biology', code: 'BIO301', kind: 'core', departmentId: deptByCode['SCI'] },
    { name: 'English', code: 'ENG101', kind: 'core', departmentId: deptByCode['ENG'] },
    { name: 'Hindi', code: 'HIN101', kind: 'core', departmentId: deptByCode['HIN'] },
    { name: 'Social Studies', code: 'SOC101', kind: 'core', departmentId: deptByCode['SOC'] },
    { name: 'History', code: 'HIST201', kind: 'core', departmentId: deptByCode['SOC'] },
    { name: 'Geography', code: 'GEO201', kind: 'core', departmentId: deptByCode['SOC'] },
    { name: 'Computer Science', code: 'CS101', kind: 'elective', departmentId: deptByCode['CS'] },
    { name: 'Physical Education', code: 'PE101', kind: 'core', departmentId: deptByCode['PE'] },
    { name: 'Art & Craft', code: 'ART101', kind: 'elective', departmentId: deptByCode['ART'] },
    { name: 'Moral Science', code: 'MOR101', kind: 'elective', departmentId: null },
  ];
  const subjectRows = await db
    .insert(s.subjects)
    .values(subjectData.map((sub) => ({ institutionId: instId, campusId, ...sub })))
    .returning();
  const subByCode: Record<string, string> = {};
  for (const sub of subjectRows) subByCode[sub.code] = sub.id;
  console.log(`  ✓ Subjects: ${subjectRows.length}`);

  // ─────────────────────────────────────────────────────────────────────────
  // SECTION 2: TEACHERS (needed before classes for classTeacherId)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n→ Seeding teachers…');

  const teacherData = [
    { employeeNo: 'T-001', firstName: 'Rajesh', lastName: 'Kumar', email: 'r.kumar@uis.edu.in', phone: '9876543201', designation: 'HOD Mathematics', departmentId: deptByCode['MATH'], employmentType: 'full_time', joinDate: '2018-06-01' },
    { employeeNo: 'T-002', firstName: 'Priya', lastName: 'Sharma', email: 'p.sharma@uis.edu.in', phone: '9876543202', designation: 'Senior Science Teacher', departmentId: deptByCode['SCI'], employmentType: 'full_time', joinDate: '2019-07-01' },
    { employeeNo: 'T-003', firstName: 'Anjali', lastName: 'Singh', email: 'a.singh@uis.edu.in', phone: '9876543203', designation: 'HOD English', departmentId: deptByCode['ENG'], employmentType: 'full_time', joinDate: '2017-06-01' },
    { employeeNo: 'T-004', firstName: 'Mohan', lastName: 'Rao', email: 'm.rao@uis.edu.in', phone: '9876543204', designation: 'Social Studies Teacher', departmentId: deptByCode['SOC'], employmentType: 'full_time', joinDate: '2020-07-01' },
    { employeeNo: 'T-005', firstName: 'Sunita', lastName: 'Verma', email: 's.verma@uis.edu.in', phone: '9876543205', designation: 'Hindi Teacher', departmentId: deptByCode['HIN'], employmentType: 'full_time', joinDate: '2019-06-01' },
    { employeeNo: 'T-006', firstName: 'Arun', lastName: 'Nair', email: 'a.nair@uis.edu.in', phone: '9876543206', designation: 'Computer Science Teacher', departmentId: deptByCode['CS'], employmentType: 'full_time', joinDate: '2021-07-01' },
    { employeeNo: 'T-007', firstName: 'Kavitha', lastName: 'Menon', email: 'k.menon@uis.edu.in', phone: '9876543207', designation: 'Physics Teacher', departmentId: deptByCode['SCI'], employmentType: 'full_time', joinDate: '2020-06-01' },
    { employeeNo: 'T-008', firstName: 'Suresh', lastName: 'Pillai', email: 's.pillai@uis.edu.in', phone: '9876543208', designation: 'Mathematics Teacher', departmentId: deptByCode['MATH'], employmentType: 'full_time', joinDate: '2022-07-01' },
    { employeeNo: 'T-009', firstName: 'Deepa', lastName: 'Krishnan', email: 'd.krishnan@uis.edu.in', phone: '9876543209', designation: 'Chemistry Teacher', departmentId: deptByCode['SCI'], employmentType: 'full_time', joinDate: '2021-06-01' },
    { employeeNo: 'T-010', firstName: 'Ramesh', lastName: 'Iyer', email: 'r.iyer@uis.edu.in', phone: '9876543210', designation: 'Biology Teacher', departmentId: deptByCode['SCI'], employmentType: 'full_time', joinDate: '2019-06-01' },
    { employeeNo: 'T-011', firstName: 'Lakshmi', lastName: 'Patel', email: 'l.patel@uis.edu.in', phone: '9876543211', designation: 'English Teacher', departmentId: deptByCode['ENG'], employmentType: 'full_time', joinDate: '2023-07-01' },
    { employeeNo: 'T-012', firstName: 'Vinod', lastName: 'Gupta', email: 'v.gupta@uis.edu.in', phone: '9876543212', designation: 'Physical Education Teacher', departmentId: deptByCode['PE'], employmentType: 'full_time', joinDate: '2020-07-01' },
    { employeeNo: 'T-013', firstName: 'Meena', lastName: 'Joshi', email: 'm.joshi@uis.edu.in', phone: '9876543213', designation: 'Art Teacher', departmentId: deptByCode['ART'], employmentType: 'part_time', joinDate: '2022-06-01' },
    { employeeNo: 'T-014', firstName: 'Prakash', lastName: 'Tiwari', email: 'p.tiwari@uis.edu.in', phone: '9876543214', designation: 'History Teacher', departmentId: deptByCode['SOC'], employmentType: 'full_time', joinDate: '2021-07-01' },
    { employeeNo: 'T-015', firstName: 'Sarala', lastName: 'Desai', email: 's.desai@uis.edu.in', phone: '9876543215', designation: 'Grade 1 Class Teacher', departmentId: null, employmentType: 'full_time', joinDate: '2018-06-01' },
  ];

  const teacherRows = await db
    .insert(s.teachers)
    .values(teacherData.map((t) => ({ institutionId: instId, campusId, status: 'active', ...t })))
    .returning();
  const teacherByNo: Record<string, string> = {};
  for (const t of teacherRows) if (t.employeeNo) teacherByNo[t.employeeNo] = t.id;
  console.log(`  ✓ Teachers: ${teacherRows.length}`);

  // Update department heads now that we have teacher IDs
  await db.update(s.departments).set({ headUserId: teacherByNo['T-001'] }).where(eq(s.departments.id, deptByCode['MATH']!));
  await db.update(s.departments).set({ headUserId: teacherByNo['T-002'] }).where(eq(s.departments.id, deptByCode['SCI']!));
  await db.update(s.departments).set({ headUserId: teacherByNo['T-003'] }).where(eq(s.departments.id, deptByCode['ENG']!));
  await db.update(s.departments).set({ headUserId: teacherByNo['T-004'] }).where(eq(s.departments.id, deptByCode['SOC']!));
  console.log('  ✓ Department heads assigned');

  // ── Classes ───────────────────────────────────────────────────────────────
  console.log('\n→ Seeding classes…');
  const classData = [
    { name: 'Grade 1 – A', section: 'A', gradeLevelId: gradeByLevel[1]!, classTeacherId: teacherByNo['T-015'], room: 'Room 101', capacity: 35 },
    { name: 'Grade 1 – B', section: 'B', gradeLevelId: gradeByLevel[1]!, classTeacherId: null, room: 'Room 102', capacity: 35 },
    { name: 'Grade 5 – A', section: 'A', gradeLevelId: gradeByLevel[5]!, classTeacherId: teacherByNo['T-005'], room: 'Room 201', capacity: 38 },
    { name: 'Grade 6 – A', section: 'A', gradeLevelId: gradeByLevel[6]!, classTeacherId: teacherByNo['T-004'], room: 'Room 301', capacity: 40 },
    { name: 'Grade 7 – A', section: 'A', gradeLevelId: gradeByLevel[7]!, classTeacherId: teacherByNo['T-001'], room: 'Room 302', capacity: 40 },
    { name: 'Grade 8 – A', section: 'A', gradeLevelId: gradeByLevel[8]!, classTeacherId: teacherByNo['T-003'], room: 'Room 401', capacity: 42 },
    { name: 'Grade 9 – A', section: 'A', gradeLevelId: gradeByLevel[9]!, classTeacherId: teacherByNo['T-002'], room: 'Room 402', capacity: 42 },
    { name: 'Grade 9 – B', section: 'B', gradeLevelId: gradeByLevel[9]!, classTeacherId: teacherByNo['T-007'], room: 'Room 403', capacity: 42 },
    { name: 'Grade 10 – A', section: 'A', gradeLevelId: gradeByLevel[10]!, classTeacherId: teacherByNo['T-008'], room: 'Room 404', capacity: 40 },
    { name: 'Grade 10 – B', section: 'B', gradeLevelId: gradeByLevel[10]!, classTeacherId: teacherByNo['T-011'], room: 'Room 405', capacity: 40 },
    { name: 'Grade 11 Science – A', section: 'A', gradeLevelId: gradeByLevel[11]!, classTeacherId: teacherByNo['T-009'], room: 'Room 501', capacity: 35 },
    { name: 'Grade 12 Science – A', section: 'A', gradeLevelId: gradeByLevel[12]!, classTeacherId: teacherByNo['T-010'], room: 'Room 502', capacity: 35 },
  ];
  const classRows = await db
    .insert(s.classes)
    .values(classData.map((c) => ({ institutionId: instId, campusId, academicYearId: ayId, ...c })))
    .returning();
  const classByName: Record<string, string> = {};
  for (const c of classRows) classByName[c.name] = c.id;
  console.log(`  ✓ Classes: ${classRows.length}`);

  // ── Class-Subject-Teacher links ───────────────────────────────────────────
  const cst = [
    // Grade 9A
    { classId: classByName['Grade 9 – A']!, subjectId: subByCode['MATH101']!, teacherId: teacherByNo['T-001'] },
    { classId: classByName['Grade 9 – A']!, subjectId: subByCode['PHY301']!, teacherId: teacherByNo['T-007'] },
    { classId: classByName['Grade 9 – A']!, subjectId: subByCode['CHEM301']!, teacherId: teacherByNo['T-009'] },
    { classId: classByName['Grade 9 – A']!, subjectId: subByCode['BIO301']!, teacherId: teacherByNo['T-010'] },
    { classId: classByName['Grade 9 – A']!, subjectId: subByCode['ENG101']!, teacherId: teacherByNo['T-003'] },
    { classId: classByName['Grade 9 – A']!, subjectId: subByCode['HIN101']!, teacherId: teacherByNo['T-005'] },
    { classId: classByName['Grade 9 – A']!, subjectId: subByCode['SOC101']!, teacherId: teacherByNo['T-004'] },
    { classId: classByName['Grade 9 – A']!, subjectId: subByCode['CS101']!, teacherId: teacherByNo['T-006'] },
    // Grade 10A
    { classId: classByName['Grade 10 – A']!, subjectId: subByCode['MATH101']!, teacherId: teacherByNo['T-008'] },
    { classId: classByName['Grade 10 – A']!, subjectId: subByCode['PHY301']!, teacherId: teacherByNo['T-007'] },
    { classId: classByName['Grade 10 – A']!, subjectId: subByCode['CHEM301']!, teacherId: teacherByNo['T-009'] },
    { classId: classByName['Grade 10 – A']!, subjectId: subByCode['BIO301']!, teacherId: teacherByNo['T-010'] },
    { classId: classByName['Grade 10 – A']!, subjectId: subByCode['ENG101']!, teacherId: teacherByNo['T-011'] },
    { classId: classByName['Grade 10 – A']!, subjectId: subByCode['HIN101']!, teacherId: teacherByNo['T-005'] },
    // Grade 12 Science
    { classId: classByName['Grade 12 Science – A']!, subjectId: subByCode['PHY301']!, teacherId: teacherByNo['T-007'] },
    { classId: classByName['Grade 12 Science – A']!, subjectId: subByCode['CHEM301']!, teacherId: teacherByNo['T-009'] },
    { classId: classByName['Grade 12 Science – A']!, subjectId: subByCode['BIO301']!, teacherId: teacherByNo['T-010'] },
    { classId: classByName['Grade 12 Science – A']!, subjectId: subByCode['MATH101']!, teacherId: teacherByNo['T-001'] },
    { classId: classByName['Grade 12 Science – A']!, subjectId: subByCode['CS101']!, teacherId: teacherByNo['T-006'] },
  ];
  await db.insert(s.classSubjectTeachers).values(cst.map((r) => ({ institutionId: instId, ...r })));
  console.log(`  ✓ Class-Subject-Teacher links: ${cst.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 3: STAFF
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding staff…');
  const staffData = [
    { employeeNo: 'S-001', firstName: 'Anand', lastName: 'Sharma', email: 'principal@uis.edu.in', phone: '9876540001', designation: 'Principal', departmentId: deptByCode['ADMIN'], joinDate: '2015-06-01' },
    { employeeNo: 'S-002', firstName: 'Rekha', lastName: 'Nambiar', email: 'viceprincipal@uis.edu.in', phone: '9876540002', designation: 'Vice Principal', departmentId: deptByCode['ADMIN'], joinDate: '2017-06-01' },
    { employeeNo: 'S-003', firstName: 'Geeta', lastName: 'Pillai', email: 'hr@uis.edu.in', phone: '9876540003', designation: 'HR Manager', departmentId: deptByCode['ADMIN'], joinDate: '2018-07-01' },
    { employeeNo: 'S-004', firstName: 'Rajan', lastName: 'Mathew', email: 'finance@uis.edu.in', phone: '9876540004', designation: 'Finance Officer', departmentId: deptByCode['ADMIN'], joinDate: '2016-06-01' },
    { employeeNo: 'S-005', firstName: 'Sujatha', lastName: 'Krishnan', email: 'accounts@uis.edu.in', phone: '9876540005', designation: 'Accountant', departmentId: deptByCode['ADMIN'], joinDate: '2020-07-01' },
    { employeeNo: 'S-006', firstName: 'Pradeep', lastName: 'George', email: 'it@uis.edu.in', phone: '9876540006', designation: 'IT Administrator', departmentId: deptByCode['CS'], joinDate: '2021-06-01' },
    { employeeNo: 'S-007', firstName: 'Usha', lastName: 'Thomas', email: 'nurse@uis.edu.in', phone: '9876540007', designation: 'School Nurse', departmentId: null, joinDate: '2019-07-01' },
    { employeeNo: 'S-008', firstName: 'Binu', lastName: 'Joseph', email: 'counselor@uis.edu.in', phone: '9876540008', designation: 'Counselor', departmentId: null, joinDate: '2020-06-01' },
    { employeeNo: 'S-009', firstName: 'Harish', lastName: 'Menon', email: 'reception@uis.edu.in', phone: '9876540009', designation: 'Front Office Executive', departmentId: deptByCode['ADMIN'], joinDate: '2022-07-01' },
    { employeeNo: 'S-010', firstName: 'Santhosh', lastName: 'Varma', email: 'lab@uis.edu.in', phone: '9876540010', designation: 'Lab Technician', departmentId: deptByCode['SCI'], joinDate: '2021-06-01' },
    { employeeNo: 'S-011', firstName: 'Murali', lastName: 'Krishnan', email: 'maintenance@uis.edu.in', phone: '9876540011', designation: 'Maintenance Supervisor', departmentId: null, joinDate: '2018-07-01' },
    { employeeNo: 'S-012', firstName: 'Raju', lastName: 'Singh', email: 'security@uis.edu.in', phone: '9876540012', designation: 'Security Officer', departmentId: null, joinDate: '2019-06-01' },
    { employeeNo: 'S-013', firstName: 'Dhanya', lastName: 'Suresh', email: 'librarian@uis.edu.in', phone: '9876540013', designation: 'Librarian', departmentId: null, joinDate: '2020-07-01' },
    { employeeNo: 'S-014', firstName: 'Anitha', lastName: 'Rajan', email: 'transport@uis.edu.in', phone: '9876540014', designation: 'Transport Coordinator', departmentId: null, joinDate: '2022-06-01' },
    { employeeNo: 'S-015', firstName: 'Vijay', lastName: 'Kumar', email: 'hostel@uis.edu.in', phone: '9876540015', designation: 'Hostel Warden', departmentId: null, joinDate: '2019-07-01' },
  ];
  const staffRows = await db
    .insert(s.staff)
    .values(staffData.map((st) => ({ institutionId: instId, campusId, status: 'active', ...st })))
    .returning();
  const staffByNo: Record<string, string> = {};
  for (const st of staffRows) if (st.employeeNo) staffByNo[st.employeeNo] = st.id;
  console.log(`  ✓ Staff: ${staffRows.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 4: STUDENTS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding students…');
  const studentData = [
    // Grade 9 A
    { admissionNo: 'UIS-2025-001', firstName: 'Arjun', lastName: 'Sharma', gender: 'male', dateOfBirth: '2010-04-15', email: 'arjun.sharma@student.uis.edu.in', phone: '9876541001', rollNo: '901', gradeLevelId: gradeByLevel[9], classId: classByName['Grade 9 – A'], enrollmentDate: '2025-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2025-002', firstName: 'Nithya', lastName: 'Krishnan', gender: 'female', dateOfBirth: '2010-07-22', email: 'nithya.k@student.uis.edu.in', phone: '9876541002', rollNo: '902', gradeLevelId: gradeByLevel[9], classId: classByName['Grade 9 – A'], enrollmentDate: '2025-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2025-003', firstName: 'Rohan', lastName: 'Mehta', gender: 'male', dateOfBirth: '2010-02-10', email: 'rohan.m@student.uis.edu.in', phone: '9876541003', rollNo: '903', gradeLevelId: gradeByLevel[9], classId: classByName['Grade 9 – A'], enrollmentDate: '2025-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2025-004', firstName: 'Divya', lastName: 'Nair', gender: 'female', dateOfBirth: '2010-11-05', email: 'divya.n@student.uis.edu.in', phone: '9876541004', rollNo: '904', gradeLevelId: gradeByLevel[9], classId: classByName['Grade 9 – A'], enrollmentDate: '2025-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2025-005', firstName: 'Aditya', lastName: 'Patel', gender: 'male', dateOfBirth: '2010-09-18', email: 'aditya.p@student.uis.edu.in', phone: '9876541005', rollNo: '905', gradeLevelId: gradeByLevel[9], classId: classByName['Grade 9 – A'], enrollmentDate: '2025-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2025-006', firstName: 'Sneha', lastName: 'Pillai', gender: 'female', dateOfBirth: '2010-03-28', email: 'sneha.p@student.uis.edu.in', phone: '9876541006', rollNo: '906', gradeLevelId: gradeByLevel[9], classId: classByName['Grade 9 – A'], enrollmentDate: '2025-06-10', status: 'enrolled' },
    // Grade 9 B
    { admissionNo: 'UIS-2025-007', firstName: 'Karan', lastName: 'Verma', gender: 'male', dateOfBirth: '2010-06-12', email: 'karan.v@student.uis.edu.in', phone: '9876541007', rollNo: '921', gradeLevelId: gradeByLevel[9], classId: classByName['Grade 9 – B'], enrollmentDate: '2025-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2025-008', firstName: 'Pooja', lastName: 'Iyer', gender: 'female', dateOfBirth: '2010-08-30', email: 'pooja.i@student.uis.edu.in', phone: '9876541008', rollNo: '922', gradeLevelId: gradeByLevel[9], classId: classByName['Grade 9 – B'], enrollmentDate: '2025-06-10', status: 'enrolled' },
    // Grade 10 A
    { admissionNo: 'UIS-2024-015', firstName: 'Vivek', lastName: 'Subramaniam', gender: 'male', dateOfBirth: '2009-05-20', email: 'vivek.s@student.uis.edu.in', phone: '9876541015', rollNo: '1001', gradeLevelId: gradeByLevel[10], classId: classByName['Grade 10 – A'], enrollmentDate: '2024-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2024-016', firstName: 'Kavya', lastName: 'Menon', gender: 'female', dateOfBirth: '2009-10-14', email: 'kavya.m@student.uis.edu.in', phone: '9876541016', rollNo: '1002', gradeLevelId: gradeByLevel[10], classId: classByName['Grade 10 – A'], enrollmentDate: '2024-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2024-017', firstName: 'Akash', lastName: 'Singh', gender: 'male', dateOfBirth: '2009-01-08', email: 'akash.s@student.uis.edu.in', phone: '9876541017', rollNo: '1003', gradeLevelId: gradeByLevel[10], classId: classByName['Grade 10 – A'], enrollmentDate: '2024-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2024-018', firstName: 'Meghna', lastName: 'Joshi', gender: 'female', dateOfBirth: '2009-07-25', email: 'meghna.j@student.uis.edu.in', phone: '9876541018', rollNo: '1004', gradeLevelId: gradeByLevel[10], classId: classByName['Grade 10 – A'], enrollmentDate: '2024-06-10', status: 'enrolled' },
    // Grade 12 Science A
    { admissionNo: 'UIS-2023-031', firstName: 'Rahul', lastName: 'Kumar', gender: 'male', dateOfBirth: '2007-03-11', email: 'rahul.k@student.uis.edu.in', phone: '9876541031', rollNo: '1201', gradeLevelId: gradeByLevel[12], classId: classByName['Grade 12 Science – A'], enrollmentDate: '2023-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2023-032', firstName: 'Preethi', lastName: 'Rajan', gender: 'female', dateOfBirth: '2007-09-17', email: 'preethi.r@student.uis.edu.in', phone: '9876541032', rollNo: '1202', gradeLevelId: gradeByLevel[12], classId: classByName['Grade 12 Science – A'], enrollmentDate: '2023-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2023-033', firstName: 'Siddharth', lastName: 'Nambiar', gender: 'male', dateOfBirth: '2007-12-03', email: 'sidd.n@student.uis.edu.in', phone: '9876541033', rollNo: '1203', gradeLevelId: gradeByLevel[12], classId: classByName['Grade 12 Science – A'], enrollmentDate: '2023-06-10', status: 'enrolled' },
    // Grade 1 A
    { admissionNo: 'UIS-2025-070', firstName: 'Aanya', lastName: 'Kapoor', gender: 'female', dateOfBirth: '2018-04-05', phone: '9876541070', rollNo: '101', gradeLevelId: gradeByLevel[1], classId: classByName['Grade 1 – A'], enrollmentDate: '2025-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2025-071', firstName: 'Dev', lastName: 'Reddy', gender: 'male', dateOfBirth: '2018-08-22', phone: '9876541071', rollNo: '102', gradeLevelId: gradeByLevel[1], classId: classByName['Grade 1 – A'], enrollmentDate: '2025-06-10', status: 'enrolled' },
    { admissionNo: 'UIS-2025-072', firstName: 'Tanvi', lastName: 'Ghosh', gender: 'female', dateOfBirth: '2018-11-30', phone: '9876541072', rollNo: '103', gradeLevelId: gradeByLevel[1], classId: classByName['Grade 1 – A'], enrollmentDate: '2025-06-10', status: 'enrolled' },
  ];
  const studentRows = await db
    .insert(s.students)
    .values(studentData.map((st) => ({ institutionId: instId, campusId, ...st })))
    .returning();
  const studentByAdm: Record<string, string> = {};
  for (const st of studentRows) studentByAdm[st.admissionNo] = st.id;
  const [s1Id, s2Id, s3Id, s4Id, s5Id, s6Id, s7Id, s8Id, s9Id, s10Id, s11Id, s12Id, s13Id, s14Id, _s15Id, s16Id, s17Id, _s18Id] = studentRows.map(r => r.id);
  console.log(`  ✓ Students: ${studentRows.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 5: PARENTS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding parents…');
  const parentData = [
    { firstName: 'Suresh', lastName: 'Sharma', email: 'suresh.sharma@gmail.com', phone: '9876550001', occupation: 'Software Engineer', address: '14, MG Road, Kochi, Kerala' },
    { firstName: 'Radha', lastName: 'Sharma', email: 'radha.sharma@gmail.com', phone: '9876550002', occupation: 'Doctor', address: '14, MG Road, Kochi, Kerala' },
    { firstName: 'Praveen', lastName: 'Krishnan', email: 'praveen.k@gmail.com', phone: '9876550003', occupation: 'Business', address: '22, Palarivattom, Kochi, Kerala' },
    { firstName: 'Anupama', lastName: 'Mehta', email: 'anupama.m@gmail.com', phone: '9876550004', occupation: 'Teacher', address: '8, Kaloor, Kochi, Kerala' },
    { firstName: 'Ravi', lastName: 'Nair', email: 'ravi.nair@gmail.com', phone: '9876550005', occupation: 'Government Officer', address: '5, Thrippunithura, Kochi, Kerala' },
    { firstName: 'Seetha', lastName: 'Patel', email: 'seetha.p@gmail.com', phone: '9876550006', occupation: 'Homemaker', address: '33, Edapally, Kochi, Kerala' },
    { firstName: 'Gopinath', lastName: 'Pillai', email: 'gopinath.p@gmail.com', phone: '9876550007', occupation: 'Chartered Accountant', address: '11, Kakkanad, Kochi, Kerala' },
    { firstName: 'Latha', lastName: 'Verma', email: 'latha.v@gmail.com', phone: '9876550008', occupation: 'Banker', address: '6, Vyttila, Kochi, Kerala' },
    { firstName: 'Biju', lastName: 'Iyer', email: 'biju.i@gmail.com', phone: '9876550009', occupation: 'Entrepreneur', address: '18, Vytila Hub, Kochi, Kerala' },
    { firstName: 'Sheela', lastName: 'Subramaniam', email: 'sheela.s@gmail.com', phone: '9876550010', occupation: 'Nurse', address: '27, Aluva, Ernakulam, Kerala' },
    { firstName: 'Jayesh', lastName: 'Kapoor', email: 'jayesh.k@gmail.com', phone: '9876550011', occupation: 'Manager', address: '3, Panampilly Nagar, Kochi, Kerala' },
  ];
  const parentRows = await db
    .insert(s.parents)
    .values(parentData.map((p) => ({ institutionId: instId, campusId, ...p })))
    .returning();
  const pIds = parentRows.map(r => r.id);
  console.log(`  ✓ Parents: ${parentRows.length}`);

  // ── Student-Guardian links ────────────────────────────────────────────────
  const guardianLinks = [
    { studentId: s1Id!, parentId: pIds[0]!, relationship: 'father', isPrimary: true, isEmergencyContact: true },
    { studentId: s1Id!, parentId: pIds[1]!, relationship: 'mother', isPrimary: false, isEmergencyContact: true },
    { studentId: s2Id!, parentId: pIds[2]!, relationship: 'father', isPrimary: true, isEmergencyContact: true },
    { studentId: s3Id!, parentId: pIds[3]!, relationship: 'mother', isPrimary: true, isEmergencyContact: true },
    { studentId: s4Id!, parentId: pIds[4]!, relationship: 'father', isPrimary: true, isEmergencyContact: true },
    { studentId: s5Id!, parentId: pIds[5]!, relationship: 'mother', isPrimary: true, isEmergencyContact: true },
    { studentId: s6Id!, parentId: pIds[6]!, relationship: 'father', isPrimary: true, isEmergencyContact: true },
    { studentId: s7Id!, parentId: pIds[7]!, relationship: 'mother', isPrimary: true, isEmergencyContact: true },
    { studentId: s8Id!, parentId: pIds[8]!, relationship: 'father', isPrimary: true, isEmergencyContact: true },
    { studentId: s9Id!, parentId: pIds[9]!, relationship: 'mother', isPrimary: true, isEmergencyContact: true },
    { studentId: s16Id!, parentId: pIds[10]!, relationship: 'father', isPrimary: true, isEmergencyContact: true },
  ];
  await db.insert(s.studentGuardians).values(guardianLinks.map(g => ({ institutionId: instId, ...g })));
  console.log(`  ✓ Student-Guardian links: ${guardianLinks.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 6: PORTAL USERS (institution_users + roles + campus access)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding portal users…');
  interface PortalUserDef { email: string; fullName: string; roleKey: string; campusAccess: boolean; }
  const portalUsers: PortalUserDef[] = [
    { email: 'owner@uis.edu.in', fullName: 'Anand Sharma', roleKey: 'institution_owner', campusAccess: false },
    { email: 'admin@uis.edu.in', fullName: 'Rekha Nambiar', roleKey: 'institution_admin', campusAccess: false },
    { email: 'principal@uis.edu.in', fullName: 'Anand Sharma', roleKey: 'principal', campusAccess: true },
    { email: 'finance@uis.edu.in', fullName: 'Rajan Mathew', roleKey: 'finance_manager', campusAccess: true },
    { email: 'hr@uis.edu.in', fullName: 'Geeta Pillai', roleKey: 'hr_manager', campusAccess: true },
    { email: 'teacher@uis.edu.in', fullName: 'Rajesh Kumar', roleKey: 'teacher', campusAccess: true },
    { email: 'parent@uis.edu.in', fullName: 'Suresh Sharma', roleKey: 'parent', campusAccess: true },
    { email: 'student@uis.edu.in', fullName: 'Arjun Sharma', roleKey: 'student', campusAccess: true },
    { email: 'nurse@uis.edu.in', fullName: 'Usha Thomas', roleKey: 'school_nurse', campusAccess: true },
    { email: 'counselor@uis.edu.in', fullName: 'Binu Joseph', roleKey: 'counselor', campusAccess: true },
    { email: 'lab@uis.edu.in', fullName: 'Santhosh Varma', roleKey: 'lab_staff', campusAccess: true },
    { email: 'reception@uis.edu.in', fullName: 'Harish Menon', roleKey: 'receptionist', campusAccess: true },
    { email: 'it@uis.edu.in', fullName: 'Pradeep George', roleKey: 'it_staff', campusAccess: true },
    { email: 'maintenance@uis.edu.in', fullName: 'Murali Krishnan', roleKey: 'maintenance_staff', campusAccess: true },
    { email: 'security@uis.edu.in', fullName: 'Raju Singh', roleKey: 'security_staff', campusAccess: true },
  ];

  for (const pu of portalUsers) {
    const [existing] = await db.select({ id: s.institutionUsers.id }).from(s.institutionUsers)
      .where(and(eq(s.institutionUsers.institutionId, instId), eq(s.institutionUsers.email, pu.email))).limit(1);
    let userId = existing?.id;
    if (!userId) {
      const [created] = await db.insert(s.institutionUsers).values({
        institutionId: instId, email: pu.email, fullName: pu.fullName,
        status: 'active', passwordHash: DEV_PASSWORD_HASH, activatedAt: new Date(),
      }).returning({ id: s.institutionUsers.id });
      userId = created?.id;
    }
    if (!userId) continue;
    await db.insert(s.institutionUserRoles).values({ institutionUserId: userId, roleKey: pu.roleKey }).onConflictDoNothing();
    if (pu.campusAccess) {
      await db.insert(s.campusUserAccess).values({ institutionUserId: userId, campusId, accessLevel: 'manage' }).onConflictDoNothing();
    }
  }
  console.log(`  ✓ Portal users: ${portalUsers.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 7: ADMISSIONS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding admissions…');
  await db.insert(s.admissionApplications).values([
    { institutionId: instId, campusId, applicationNo: 'APP-2025-001', firstName: 'Ishaan', lastName: 'Tripathi', gender: 'male', dateOfBirth: '2018-06-10', email: 'ishaan.t@gmail.com', phone: '9800001001', gradeLevelId: gradeByLevel[1], previousSchool: 'Little Stars Kindergarten', guardianName: 'Alok Tripathi', guardianPhone: '9800001000', guardianEmail: 'alok.t@gmail.com', status: 'accepted', appliedDate: '2025-01-15', decisionDate: '2025-02-20', decisionNote: 'Passed entrance assessment.', enrolledStudentId: null },
    { institutionId: instId, campusId, applicationNo: 'APP-2025-002', firstName: 'Mira', lastName: 'Shah', gender: 'female', dateOfBirth: '2018-09-25', phone: '9800001003', gradeLevelId: gradeByLevel[1], previousSchool: 'Sunshine Nursery', guardianName: 'Nitin Shah', guardianPhone: '9800001002', status: 'under_review', appliedDate: '2025-03-01' },
    { institutionId: instId, campusId, applicationNo: 'APP-2025-003', firstName: 'Kiran', lastName: 'Bose', gender: 'male', dateOfBirth: '2010-07-18', phone: '9800001005', gradeLevelId: gradeByLevel[9], previousSchool: 'Delhi Public School', guardianName: 'Subhash Bose', guardianPhone: '9800001004', status: 'submitted', appliedDate: '2025-04-10' },
    { institutionId: instId, campusId, applicationNo: 'APP-2025-004', firstName: 'Anjana', lastName: 'Pillai', gender: 'female', dateOfBirth: '2009-03-12', phone: '9800001007', gradeLevelId: gradeByLevel[10], previousSchool: 'Kendriya Vidyalaya', guardianName: 'Rajan Pillai', guardianPhone: '9800001006', status: 'waitlisted', appliedDate: '2025-03-20', decisionDate: '2025-04-25', decisionNote: 'Strong candidate, on waitlist for open seat.' },
    { institutionId: instId, campusId, applicationNo: 'APP-2025-005', firstName: 'Samir', lastName: 'Khan', gender: 'male', dateOfBirth: '2018-12-01', phone: '9800001009', gradeLevelId: gradeByLevel[1], previousSchool: 'Kiddie Land', guardianName: 'Irfan Khan', guardianPhone: '9800001008', status: 'rejected', appliedDate: '2025-02-05', decisionDate: '2025-03-15', decisionNote: 'Age does not meet entry criteria for the current year.' },
    { institutionId: instId, campusId, applicationNo: 'APP-2025-006', firstName: 'Lakshmi', lastName: 'Reddy', gender: 'female', dateOfBirth: '2010-05-05', phone: '9800001011', gradeLevelId: gradeByLevel[9], previousSchool: 'Navodaya Vidyalaya', guardianName: 'Venkat Reddy', guardianPhone: '9800001010', status: 'enrolled', appliedDate: '2025-01-20', decisionDate: '2025-02-15', decisionNote: 'Admitted — exceptional merit.', enrolledStudentId: s1Id },
  ]);
  console.log('  ✓ Admission Applications: 6');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 8: TIMETABLE
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding timetable…');
  const cls9a = classByName['Grade 9 – A']!;
  const cls10a = classByName['Grade 10 – A']!;
  const timetableSlots = [
    // Grade 9A — Mon to Fri
    { classId: cls9a, subjectId: subByCode['MATH101']!, teacherId: teacherByNo['T-001'], dayOfWeek: 1, startTime: '08:00', endTime: '08:45', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['ENG101']!, teacherId: teacherByNo['T-003'], dayOfWeek: 1, startTime: '08:50', endTime: '09:35', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['PHY301']!, teacherId: teacherByNo['T-007'], dayOfWeek: 1, startTime: '09:45', endTime: '10:30', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['HIN101']!, teacherId: teacherByNo['T-005'], dayOfWeek: 1, startTime: '11:00', endTime: '11:45', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['CHEM301']!, teacherId: teacherByNo['T-009'], dayOfWeek: 1, startTime: '11:50', endTime: '12:35', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['MATH101']!, teacherId: teacherByNo['T-001'], dayOfWeek: 2, startTime: '08:00', endTime: '08:45', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['BIO301']!, teacherId: teacherByNo['T-010'], dayOfWeek: 2, startTime: '08:50', endTime: '09:35', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['SOC101']!, teacherId: teacherByNo['T-004'], dayOfWeek: 2, startTime: '09:45', endTime: '10:30', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['CS101']!, teacherId: teacherByNo['T-006'], dayOfWeek: 2, startTime: '11:00', endTime: '11:45', room: 'Computer Lab' },
    { classId: cls9a, subjectId: subByCode['ENG101']!, teacherId: teacherByNo['T-003'], dayOfWeek: 3, startTime: '08:00', endTime: '08:45', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['PHY301']!, teacherId: teacherByNo['T-007'], dayOfWeek: 3, startTime: '08:50', endTime: '09:35', room: 'Physics Lab' },
    { classId: cls9a, subjectId: subByCode['MATH101']!, teacherId: teacherByNo['T-001'], dayOfWeek: 4, startTime: '08:00', endTime: '08:45', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['CHEM301']!, teacherId: teacherByNo['T-009'], dayOfWeek: 4, startTime: '08:50', endTime: '09:35', room: 'Chemistry Lab' },
    { classId: cls9a, subjectId: subByCode['BIO301']!, teacherId: teacherByNo['T-010'], dayOfWeek: 4, startTime: '09:45', endTime: '10:30', room: 'Biology Lab' },
    { classId: cls9a, subjectId: subByCode['HIN101']!, teacherId: teacherByNo['T-005'], dayOfWeek: 5, startTime: '08:00', endTime: '08:45', room: 'Room 402' },
    { classId: cls9a, subjectId: subByCode['SOC101']!, teacherId: teacherByNo['T-004'], dayOfWeek: 5, startTime: '08:50', endTime: '09:35', room: 'Room 402' },
    // Grade 10A
    { classId: cls10a, subjectId: subByCode['MATH101']!, teacherId: teacherByNo['T-008'], dayOfWeek: 1, startTime: '08:00', endTime: '08:45', room: 'Room 404' },
    { classId: cls10a, subjectId: subByCode['PHY301']!, teacherId: teacherByNo['T-007'], dayOfWeek: 1, startTime: '08:50', endTime: '09:35', room: 'Room 404' },
    { classId: cls10a, subjectId: subByCode['ENG101']!, teacherId: teacherByNo['T-011'], dayOfWeek: 2, startTime: '08:00', endTime: '08:45', room: 'Room 404' },
    { classId: cls10a, subjectId: subByCode['CHEM301']!, teacherId: teacherByNo['T-009'], dayOfWeek: 2, startTime: '08:50', endTime: '09:35', room: 'Room 404' },
    { classId: cls10a, subjectId: subByCode['MATH101']!, teacherId: teacherByNo['T-008'], dayOfWeek: 3, startTime: '08:00', endTime: '08:45', room: 'Room 404' },
    { classId: cls10a, subjectId: subByCode['BIO301']!, teacherId: teacherByNo['T-010'], dayOfWeek: 3, startTime: '08:50', endTime: '09:35', room: 'Room 404' },
  ];
  await db.insert(s.timetableSlots).values(timetableSlots.map(t => ({ institutionId: instId, campusId, academicYearId: ayId, version: 0, ...t })));
  console.log(`  ✓ Timetable slots: ${timetableSlots.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 9: ATTENDANCE
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding attendance…');
  const attDates = [dateStr(daysAgo(5)), dateStr(daysAgo(4)), dateStr(daysAgo(3)), dateStr(daysAgo(2)), dateStr(daysAgo(1)), today];
  const sessionInserts = [];
  for (const d of attDates) {
    sessionInserts.push({ institutionId: instId, campusId, classId: cls9a, date: d, period: 'full_day', takenById: teacherByNo['T-002'] });
    sessionInserts.push({ institutionId: instId, campusId, classId: cls10a, date: d, period: 'full_day', takenById: teacherByNo['T-008'] });
  }
  const sessionRows = await db.insert(s.attendanceSessions).values(sessionInserts).returning();

  // Per-student attendance records for Grade 9A
  const gr9aStudents = [s1Id!, s2Id!, s3Id!, s4Id!, s5Id!, s6Id!];
  for (const sess of sessionRows.filter(se => se.classId === cls9a)) {
    await db.insert(s.attendanceRecords).values(
      gr9aStudents.map((sid, i) => ({
        institutionId: instId, sessionId: sess.id, studentId: sid,
        status: i === 4 && sess.date === dateStr(daysAgo(2)) ? 'absent' : 'present',
        remarks: i === 4 && sess.date === dateStr(daysAgo(2)) ? 'Sick leave' : null,
      }))
    );
  }
  // Grade 10A students
  const gr10aStudents = [s9Id!, s10Id!, s11Id!, s12Id!];
  for (const sess of sessionRows.filter(se => se.classId === cls10a)) {
    await db.insert(s.attendanceRecords).values(
      gr10aStudents.map((sid) => ({ institutionId: instId, sessionId: sess.id, studentId: sid, status: 'present' }))
    );
  }
  console.log(`  ✓ Attendance sessions: ${sessionRows.length}, records seeded`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 10: EXAMS & GRADEBOOK
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding exams…');
  const [exam1] = await db.insert(s.exams).values({
    institutionId: instId, campusId, academicYearId: ayId,
    name: 'First Term Examination 2025–26',
    examType: 'term', termLabel: 'Term 1',
    startDate: '2025-09-01', endDate: '2025-09-10',
    status: 'completed', description: 'End of First Term — all grades',
  }).returning();

  const [exam2] = await db.insert(s.exams).values({
    institutionId: instId, campusId, academicYearId: ayId,
    name: 'Second Term Examination 2025–26',
    examType: 'term', termLabel: 'Term 2',
    startDate: '2025-12-10', endDate: '2025-12-20',
    status: 'scheduled', description: 'End of Second Term — all grades',
  }).returning();

  const [exam3] = await db.insert(s.exams).values({
    institutionId: instId, campusId, academicYearId: ayId,
    name: 'Annual Board Preparation Mock — Grade 10',
    examType: 'mock', termLabel: 'Term 2',
    startDate: '2026-01-15', endDate: '2026-01-20',
    status: 'draft', description: 'Full board-pattern mock for Grade 10 students',
  }).returning();

  // Exam schedules for exam1
  const examScheduleData = [
    { examId: exam1!.id, classId: cls9a, subjectId: subByCode['MATH101']!, examDate: '2025-09-01', startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 35, room: 'Hall A' },
    { examId: exam1!.id, classId: cls9a, subjectId: subByCode['ENG101']!, examDate: '2025-09-02', startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 35, room: 'Hall A' },
    { examId: exam1!.id, classId: cls9a, subjectId: subByCode['PHY301']!, examDate: '2025-09-03', startTime: '09:00', endTime: '12:00', maxMarks: 70, passMarks: 25, room: 'Hall A' },
    { examId: exam1!.id, classId: cls9a, subjectId: subByCode['CHEM301']!, examDate: '2025-09-04', startTime: '09:00', endTime: '12:00', maxMarks: 70, passMarks: 25, room: 'Hall A' },
    { examId: exam1!.id, classId: cls9a, subjectId: subByCode['BIO301']!, examDate: '2025-09-05', startTime: '09:00', endTime: '12:00', maxMarks: 70, passMarks: 25, room: 'Hall B' },
    { examId: exam1!.id, classId: cls10a, subjectId: subByCode['MATH101']!, examDate: '2025-09-01', startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 35, room: 'Hall B' },
    { examId: exam1!.id, classId: cls10a, subjectId: subByCode['ENG101']!, examDate: '2025-09-02', startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 35, room: 'Hall B' },
    { examId: exam2!.id, classId: cls9a, subjectId: subByCode['MATH101']!, examDate: '2025-12-10', startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 35, room: 'Hall A' },
    { examId: exam2!.id, classId: cls10a, subjectId: subByCode['MATH101']!, examDate: '2025-12-10', startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 35, room: 'Hall B' },
    { examId: exam3!.id, classId: cls10a, subjectId: subByCode['MATH101']!, examDate: '2026-01-15', startTime: '09:00', endTime: '12:00', maxMarks: 100, passMarks: 35, room: 'Exam Hall' },
    { examId: exam3!.id, classId: cls10a, subjectId: subByCode['PHY301']!, examDate: '2026-01-16', startTime: '09:00', endTime: '12:00', maxMarks: 70, passMarks: 25, room: 'Exam Hall' },
  ];
  await db.insert(s.examSchedules).values(examScheduleData.map(e => ({ institutionId: instId, ...e })));
  console.log(`  ✓ Exams: 3, Exam Schedules: ${examScheduleData.length}`);

  // ── Gradebook ─────────────────────────────────────────────────────────────
  const gradeEntryData = [
    // Term 1 — Arjun (s1)
    { studentId: s1Id!, subjectId: subByCode['MATH101']!, examId: exam1!.id, classId: cls9a, assessmentName: 'Term 1 Maths', marksObtained: 88, maxMarks: 100, letterGrade: 'A' },
    { studentId: s1Id!, subjectId: subByCode['ENG101']!, examId: exam1!.id, classId: cls9a, assessmentName: 'Term 1 English', marksObtained: 76, maxMarks: 100, letterGrade: 'B+' },
    { studentId: s1Id!, subjectId: subByCode['PHY301']!, examId: exam1!.id, classId: cls9a, assessmentName: 'Term 1 Physics', marksObtained: 62, maxMarks: 70, letterGrade: 'A' },
    { studentId: s1Id!, subjectId: subByCode['CHEM301']!, examId: exam1!.id, classId: cls9a, assessmentName: 'Term 1 Chemistry', marksObtained: 58, maxMarks: 70, letterGrade: 'B+' },
    // Nithya (s2)
    { studentId: s2Id!, subjectId: subByCode['MATH101']!, examId: exam1!.id, classId: cls9a, assessmentName: 'Term 1 Maths', marksObtained: 94, maxMarks: 100, letterGrade: 'A+' },
    { studentId: s2Id!, subjectId: subByCode['ENG101']!, examId: exam1!.id, classId: cls9a, assessmentName: 'Term 1 English', marksObtained: 89, maxMarks: 100, letterGrade: 'A' },
    // Rohan (s3)
    { studentId: s3Id!, subjectId: subByCode['MATH101']!, examId: exam1!.id, classId: cls9a, assessmentName: 'Term 1 Maths', marksObtained: 72, maxMarks: 100, letterGrade: 'B' },
    // Vivek Gr10 (s9)
    { studentId: s9Id!, subjectId: subByCode['MATH101']!, examId: exam1!.id, classId: cls10a, assessmentName: 'Term 1 Maths', marksObtained: 85, maxMarks: 100, letterGrade: 'A' },
    { studentId: s9Id!, subjectId: subByCode['ENG101']!, examId: exam1!.id, classId: cls10a, assessmentName: 'Term 1 English', marksObtained: 78, maxMarks: 100, letterGrade: 'B+' },
    // Kavya Gr10 (s10)
    { studentId: s10Id!, subjectId: subByCode['MATH101']!, examId: exam1!.id, classId: cls10a, assessmentName: 'Term 1 Maths', marksObtained: 91, maxMarks: 100, letterGrade: 'A+' },
  ];
  await db.insert(s.gradeEntries).values(gradeEntryData.map(g => ({ institutionId: instId, campusId, ...g })));
  console.log(`  ✓ Grade entries: ${gradeEntryData.length}`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 11: ASSIGNMENTS
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding assignments…');
  const [asgn1] = await db.insert(s.assignments).values({
    institutionId: instId, campusId, title: 'Quadratic Equations Practice Set',
    classId: cls9a, subjectId: subByCode['MATH101']!, teacherId: teacherByNo['T-001'],
    instructions: 'Solve all 20 problems from Chapter 4. Show full working. Due Monday.',
    dueDate: dateStr(daysFromNow(3)), maxPoints: 50, status: 'published',
  }).returning();

  const [asgn2] = await db.insert(s.assignments).values({
    institutionId: instId, campusId, title: 'Newton\'s Laws — Lab Report',
    classId: cls9a, subjectId: subByCode['PHY301']!, teacherId: teacherByNo['T-007'],
    instructions: 'Write a structured lab report on the pendulum experiment conducted on Tuesday.',
    dueDate: dateStr(daysFromNow(7)), maxPoints: 30, status: 'published',
  }).returning();

  const [asgn3] = await db.insert(s.assignments).values({
    institutionId: instId, campusId, title: 'Board-Style Essay — The Role of Science in Society',
    classId: cls10a, subjectId: subByCode['ENG101']!, teacherId: teacherByNo['T-011'],
    instructions: 'Write a 600-word essay. Use formal register. Marks for structure, grammar and content.',
    dueDate: dateStr(daysFromNow(5)), maxPoints: 40, status: 'published',
  }).returning();

  await db.insert(s.assignments).values({
    institutionId: instId, campusId, title: 'Periodic Table Quiz Prep',
    classId: cls9a, subjectId: subByCode['CHEM301']!, teacherId: teacherByNo['T-009'],
    instructions: 'Memorise first 20 elements and their properties for a quiz next week.',
    dueDate: dateStr(daysFromNow(6)), maxPoints: 20, status: 'draft',
  });

  // Submissions
  await db.insert(s.assignmentSubmissions).values([
    { institutionId: instId, assignmentId: asgn1!.id, studentId: s1Id!, status: 'submitted', submittedDate: dateStr(daysAgo(1)), pointsAwarded: null, feedback: null },
    { institutionId: instId, assignmentId: asgn1!.id, studentId: s2Id!, status: 'graded', submittedDate: dateStr(daysAgo(2)), pointsAwarded: 48, feedback: 'Excellent work! Minor error in problem 17.' },
    { institutionId: instId, assignmentId: asgn1!.id, studentId: s3Id!, status: 'late', submittedDate: today, pointsAwarded: null, feedback: null },
    { institutionId: instId, assignmentId: asgn1!.id, studentId: s4Id!, status: 'assigned', submittedDate: null, pointsAwarded: null, feedback: null },
    { institutionId: instId, assignmentId: asgn1!.id, studentId: s5Id!, status: 'graded', submittedDate: dateStr(daysAgo(1)), pointsAwarded: 42, feedback: 'Good effort. Review Section 4.3.' },
    { institutionId: instId, assignmentId: asgn2!.id, studentId: s1Id!, status: 'assigned', submittedDate: null, pointsAwarded: null, feedback: null },
    { institutionId: instId, assignmentId: asgn2!.id, studentId: s2Id!, status: 'assigned', submittedDate: null, pointsAwarded: null, feedback: null },
    { institutionId: instId, assignmentId: asgn3!.id, studentId: s9Id!, status: 'submitted', submittedDate: dateStr(daysAgo(1)), pointsAwarded: null, feedback: null },
    { institutionId: instId, assignmentId: asgn3!.id, studentId: s10Id!, status: 'graded', submittedDate: dateStr(daysAgo(2)), pointsAwarded: 38, feedback: 'Excellent structure and arguments. A few grammar slips.' },
  ]);
  console.log('  ✓ Assignments: 4, Submissions: 9');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 12: FEES
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding fees…');
  const [fsTuition] = await db.insert(s.feeStructures).values({ institutionId: instId, campusId, name: 'Annual Tuition Fee — Secondary', feeType: 'tuition', gradeLevelId: gradeByLevel[9], academicYearId: ayId, amount: 6000000, frequency: 'annual', status: 'active', description: 'Tuition for Grades 9–10 per academic year (₹60,000)' }).returning();
  const [fsTuitionSr] = await db.insert(s.feeStructures).values({ institutionId: instId, campusId, name: 'Annual Tuition Fee — Senior Secondary', feeType: 'tuition', gradeLevelId: gradeByLevel[11], academicYearId: ayId, amount: 7500000, frequency: 'annual', status: 'active', description: 'Tuition for Grades 11–12 per academic year (₹75,000)' }).returning();
  const [fsTransport] = await db.insert(s.feeStructures).values({ institutionId: instId, campusId, name: 'Transport Fee — Annual', feeType: 'transport', academicYearId: ayId, amount: 1200000, frequency: 'annual', status: 'active', description: 'School bus annual fee (₹12,000)' }).returning();
  const [fsHostel] = await db.insert(s.feeStructures).values({ institutionId: instId, campusId, name: 'Hostel Fee — Annual', feeType: 'hostel', academicYearId: ayId, amount: 8000000, frequency: 'annual', status: 'active', description: 'Hostel boarding fee per year (₹80,000)' }).returning();
  const [fsExam] = await db.insert(s.feeStructures).values({ institutionId: instId, campusId, name: 'Examination Fee — Term 1', feeType: 'exam', academicYearId: ayId, amount: 50000, frequency: 'one_time', status: 'active', description: 'Term examination fee (₹500)' }).returning();

  // Invoices
  const invoices = [
    { invoiceNo: 'INV-2025-001', studentId: s1Id!, feeStructureId: fsTuition!.id, amount: 6000000, amountPaid: 6000000, status: 'paid', issueDate: '2025-06-15', dueDate: '2025-07-15' },
    { invoiceNo: 'INV-2025-002', studentId: s1Id!, feeStructureId: fsTransport!.id, amount: 1200000, amountPaid: 1200000, status: 'paid', issueDate: '2025-06-15', dueDate: '2025-07-15' },
    { invoiceNo: 'INV-2025-003', studentId: s2Id!, feeStructureId: fsTuition!.id, amount: 6000000, amountPaid: 3000000, status: 'partial', issueDate: '2025-06-15', dueDate: '2025-07-15', notes: 'Partial payment received; balance due.' },
    { invoiceNo: 'INV-2025-004', studentId: s3Id!, feeStructureId: fsTuition!.id, amount: 6000000, amountPaid: 0, status: 'overdue', issueDate: '2025-06-15', dueDate: '2025-07-15', notes: 'Payment overdue. Contact finance office.' },
    { invoiceNo: 'INV-2025-005', studentId: s9Id!, feeStructureId: fsTuition!.id, amount: 6000000, amountPaid: 6000000, status: 'paid', issueDate: '2025-06-10', dueDate: '2025-07-10' },
    { invoiceNo: 'INV-2025-006', studentId: s9Id!, feeStructureId: fsTransport!.id, amount: 1200000, amountPaid: 1200000, status: 'paid', issueDate: '2025-06-10', dueDate: '2025-07-10' },
    { invoiceNo: 'INV-2025-007', studentId: s13Id!, feeStructureId: fsTuitionSr!.id, amount: 7500000, amountPaid: 7500000, status: 'paid', issueDate: '2025-06-10', dueDate: '2025-07-10' },
    { invoiceNo: 'INV-2025-008', studentId: s13Id!, feeStructureId: fsHostel!.id, amount: 8000000, amountPaid: 4000000, status: 'partial', issueDate: '2025-06-10', dueDate: '2025-07-10' },
    { invoiceNo: 'INV-2025-009', studentId: s4Id!, feeStructureId: fsExam!.id, amount: 50000, amountPaid: 50000, status: 'paid', issueDate: '2025-08-15', dueDate: '2025-08-25' },
    { invoiceNo: 'INV-2025-010', studentId: s5Id!, feeStructureId: fsTuition!.id, amount: 6000000, amountPaid: 0, status: 'pending', issueDate: '2025-06-15', dueDate: '2025-08-01' },
  ];
  const invoiceRows = await db.insert(s.feeInvoices).values(invoices.map(i => ({ institutionId: instId, campusId, ...i }))).returning();

  // Payments
  await db.insert(s.feePayments).values([
    { institutionId: instId, invoiceId: invoiceRows[0]!.id, amount: 6000000, method: 'bank_transfer', reference: 'NEFT-2025-06154012', paidDate: '2025-06-20', notes: 'Full year tuition paid.' },
    { institutionId: instId, invoiceId: invoiceRows[1]!.id, amount: 1200000, method: 'online', reference: 'RAZORPAY-TXN-2025062001', paidDate: '2025-06-20' },
    { institutionId: instId, invoiceId: invoiceRows[2]!.id, amount: 3000000, method: 'cash', paidDate: '2025-07-01', notes: 'First instalment paid at counter.' },
    { institutionId: instId, invoiceId: invoiceRows[4]!.id, amount: 6000000, method: 'cheque', reference: 'CHQ-80012-SBI', paidDate: '2025-06-15' },
    { institutionId: instId, invoiceId: invoiceRows[5]!.id, amount: 1200000, method: 'bank_transfer', reference: 'NEFT-2025-06154020', paidDate: '2025-06-15' },
    { institutionId: instId, invoiceId: invoiceRows[6]!.id, amount: 7500000, method: 'online', reference: 'PAYTM-2025-06100123', paidDate: '2025-06-12' },
    { institutionId: instId, invoiceId: invoiceRows[7]!.id, amount: 4000000, method: 'cash', paidDate: '2025-06-12', notes: 'Hostel fee — first half.' },
    { institutionId: instId, invoiceId: invoiceRows[8]!.id, amount: 50000, method: 'cash', paidDate: '2025-08-20', notes: 'Exam fee at counter.' },
  ]);
  console.log('  ✓ Fee structures: 5, Invoices: 10, Payments: 8');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 13: PAYROLL
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding payroll…');
  const [payrollJune] = await db.insert(s.payrollRuns).values({
    institutionId: instId, campusId, name: 'June 2025 Payroll',
    periodLabel: 'June 2025', periodStart: '2025-06-01', periodEnd: '2025-06-30',
    payDate: '2025-06-30', status: 'paid', notes: 'All confirmed. Disbursed via NEFT.',
  }).returning();

  const [payrollJuly] = await db.insert(s.payrollRuns).values({
    institutionId: instId, campusId, name: 'July 2025 Payroll',
    periodLabel: 'July 2025', periodStart: '2025-07-01', periodEnd: '2025-07-31',
    payDate: '2025-07-31', status: 'approved',
  }).returning();

  await db.insert(s.payrollItems).values([
    { institutionId: instId, payrollRunId: payrollJune!.id, employeeType: 'teacher', teacherId: teacherByNo['T-001'], gross: 7500000, deductions: 900000, net: 6600000 },
    { institutionId: instId, payrollRunId: payrollJune!.id, employeeType: 'teacher', teacherId: teacherByNo['T-002'], gross: 6800000, deductions: 816000, net: 5984000 },
    { institutionId: instId, payrollRunId: payrollJune!.id, employeeType: 'teacher', teacherId: teacherByNo['T-003'], gross: 7000000, deductions: 840000, net: 6160000 },
    { institutionId: instId, payrollRunId: payrollJune!.id, employeeType: 'teacher', teacherId: teacherByNo['T-007'], gross: 6500000, deductions: 780000, net: 5720000 },
    { institutionId: instId, payrollRunId: payrollJune!.id, employeeType: 'staff', staffId: staffByNo['S-001'], gross: 12000000, deductions: 1440000, net: 10560000 },
    { institutionId: instId, payrollRunId: payrollJune!.id, employeeType: 'staff', staffId: staffByNo['S-003'], gross: 6000000, deductions: 720000, net: 5280000 },
    { institutionId: instId, payrollRunId: payrollJune!.id, employeeType: 'staff', staffId: staffByNo['S-004'], gross: 7000000, deductions: 840000, net: 6160000 },
    { institutionId: instId, payrollRunId: payrollJune!.id, employeeType: 'staff', staffId: staffByNo['S-006'], gross: 5500000, deductions: 660000, net: 4840000 },
    { institutionId: instId, payrollRunId: payrollJuly!.id, employeeType: 'teacher', teacherId: teacherByNo['T-001'], gross: 7500000, deductions: 900000, net: 6600000 },
    { institutionId: instId, payrollRunId: payrollJuly!.id, employeeType: 'teacher', teacherId: teacherByNo['T-002'], gross: 6800000, deductions: 816000, net: 5984000 },
    { institutionId: instId, payrollRunId: payrollJuly!.id, employeeType: 'staff', staffId: staffByNo['S-001'], gross: 12000000, deductions: 1440000, net: 10560000 },
  ]);
  console.log('  ✓ Payroll runs: 2, Items: 11');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 14: LIBRARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding library…');
  const bookData = [
    { title: 'Mathematics NCERT Grade 9', author: 'NCERT', isbn: '9788174504876', category: 'Textbook', publisher: 'NCERT', totalCopies: 40, availableCopies: 37, status: 'available' },
    { title: 'Science NCERT Grade 9', author: 'NCERT', isbn: '9788174506849', category: 'Textbook', publisher: 'NCERT', totalCopies: 40, availableCopies: 39, status: 'available' },
    { title: 'English Beehive Grade 9', author: 'NCERT', isbn: '9788174507747', category: 'Textbook', publisher: 'NCERT', totalCopies: 38, availableCopies: 38, status: 'available' },
    { title: 'Wings of Fire', author: 'A.P.J. Abdul Kalam', isbn: '9788173711466', category: 'Biography', publisher: 'Universities Press', totalCopies: 5, availableCopies: 3, status: 'available' },
    { title: 'The Alchemist', author: 'Paulo Coelho', isbn: '9788172236014', category: 'Fiction', publisher: 'HarperCollins India', totalCopies: 4, availableCopies: 4, status: 'available' },
    { title: 'India After Gandhi', author: 'Ramachandra Guha', isbn: '9789352775002', category: 'History', publisher: 'Picador India', totalCopies: 3, availableCopies: 2, status: 'available' },
    { title: 'Fundamentals of Physics — Halliday', author: 'Halliday, Resnick & Walker', isbn: '9780471401940', category: 'Reference', publisher: 'Wiley India', totalCopies: 10, availableCopies: 8, status: 'available' },
    { title: 'Malgudi Days', author: 'R.K. Narayan', isbn: '9780140099607', category: 'Fiction', publisher: 'Penguin India', totalCopies: 6, availableCopies: 6, status: 'available' },
    { title: 'Discovery of India', author: 'Jawaharlal Nehru', isbn: '9780195623598', category: 'History', publisher: 'Oxford University Press', totalCopies: 3, availableCopies: 3, status: 'available' },
    { title: 'Python for Kids', author: 'Jason R. Briggs', isbn: '9781593274078', category: 'Computer Science', publisher: 'No Starch Press', totalCopies: 8, availableCopies: 7, status: 'available' },
    { title: 'Organic Chemistry — Morrison & Boyd', author: 'Morrison, Boyd', isbn: '9788120307957', category: 'Reference', publisher: 'Prentice Hall India', totalCopies: 6, availableCopies: 5, status: 'available' },
    { title: 'Oxford School Atlas', author: 'Oxford Cartography', isbn: '9780199467587', category: 'Reference', publisher: 'Oxford University Press', totalCopies: 15, availableCopies: 14, status: 'available' },
  ];
  const bookRows = await db.insert(s.libraryBooks).values(bookData.map(b => ({ institutionId: instId, campusId, ...b }))).returning();

  await db.insert(s.libraryLoans).values([
    { institutionId: instId, bookId: bookRows[0]!.id, studentId: s1Id!, status: 'issued', issueDate: dateStr(daysAgo(7)), dueDate: dateStr(daysFromNow(7)), fineAmount: 0 },
    { institutionId: instId, bookId: bookRows[3]!.id, studentId: s2Id!, status: 'issued', issueDate: dateStr(daysAgo(5)), dueDate: dateStr(daysFromNow(9)), fineAmount: 0, notes: 'Handle with care — last copy on loan.' },
    { institutionId: instId, bookId: bookRows[5]!.id, studentId: s9Id!, status: 'issued', issueDate: dateStr(daysAgo(14)), dueDate: dateStr(daysAgo(0)), fineAmount: 0 },
    { institutionId: instId, bookId: bookRows[6]!.id, studentId: s13Id!, status: 'issued', issueDate: dateStr(daysAgo(3)), dueDate: dateStr(daysFromNow(11)), fineAmount: 0 },
    { institutionId: instId, bookId: bookRows[9]!.id, studentId: s11Id!, status: 'returned', issueDate: dateStr(daysAgo(20)), dueDate: dateStr(daysAgo(6)), returnDate: dateStr(daysAgo(8)), fineAmount: 0 },
    { institutionId: instId, bookId: bookRows[10]!.id, studentId: s14Id!, status: 'returned', issueDate: dateStr(daysAgo(30)), dueDate: dateStr(daysAgo(16)), returnDate: dateStr(daysAgo(14)), fineAmount: 1000, notes: 'Returned 2 days late. Fine of ₹10 collected.' },
  ]);
  console.log(`  ✓ Library books: ${bookRows.length}, Loans: 6`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 15: TRANSPORT
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding transport…');
  const [routeErnakulam] = await db.insert(s.transportRoutes).values({ institutionId: instId, campusId, name: 'Ernakulam Central Route', code: 'RT-01', description: 'Ernakulam – MG Road – School', fare: 1200000, status: 'active' }).returning();
  const [routeAluva] = await db.insert(s.transportRoutes).values({ institutionId: instId, campusId, name: 'Aluva Route', code: 'RT-02', description: 'Aluva – Perumbavoor – School', fare: 1500000, status: 'active' }).returning();
  const [routeKakanad] = await db.insert(s.transportRoutes).values({ institutionId: instId, campusId, name: 'Kakkanad Route', code: 'RT-03', description: 'Kakkanad – Infopark – School', fare: 900000, status: 'active' }).returning();
  const [routeKaloor] = await db.insert(s.transportRoutes).values({ institutionId: instId, campusId, name: 'Kaloor–Edapally Route', code: 'RT-04', description: 'Kaloor – Edapally – School', fare: 1000000, status: 'active' }).returning();

  await db.insert(s.transportVehicles).values([
    { institutionId: instId, campusId, registrationNo: 'KL-07-AW-2345', model: 'Tata Starbus 54-Seater', capacity: 54, routeId: routeErnakulam!.id, driverName: 'Benny Thomas', driverPhone: '9876560001', status: 'active' },
    { institutionId: instId, campusId, registrationNo: 'KL-07-BX-6789', model: 'Ashok Leyland 45-Seater', capacity: 45, routeId: routeAluva!.id, driverName: 'Shibu Varghese', driverPhone: '9876560002', status: 'active' },
    { institutionId: instId, campusId, registrationNo: 'KL-07-CY-1122', model: 'Force Traveller 18-Seater', capacity: 18, routeId: routeKakanad!.id, driverName: 'Joby Mathew', driverPhone: '9876560003', status: 'active' },
    { institutionId: instId, campusId, registrationNo: 'KL-07-DZ-3344', model: 'Tata Winger 12-Seater', capacity: 12, routeId: routeKaloor!.id, driverName: 'Prasad Nair', driverPhone: '9876560004', status: 'maintenance' },
    { institutionId: instId, campusId, registrationNo: 'KL-07-EW-5566', model: 'Tata Starbus 54-Seater (Reserve)', capacity: 54, driverName: 'George Paul', driverPhone: '9876560005', status: 'active' },
  ]);

  await db.insert(s.transportAssignments).values([
    { institutionId: instId, routeId: routeErnakulam!.id, studentId: s1Id!, stopName: 'MG Road Junction', pickupTime: '07:15', dropTime: '14:45', status: 'active' },
    { institutionId: instId, routeId: routeErnakulam!.id, studentId: s3Id!, stopName: 'Atlantis Junction', pickupTime: '07:20', dropTime: '14:50', status: 'active' },
    { institutionId: instId, routeId: routeKakanad!.id, studentId: s9Id!, stopName: 'Infopark Gate', pickupTime: '07:30', dropTime: '14:55', status: 'active' },
    { institutionId: instId, routeId: routeAluva!.id, studentId: s16Id!, stopName: 'Aluva Bus Stand', pickupTime: '06:55', dropTime: '15:20', status: 'active' },
    { institutionId: instId, routeId: routeKaloor!.id, studentId: s17Id!, stopName: 'Kaloor Stadium', pickupTime: '07:10', dropTime: '14:50', status: 'active' },
  ]);
  console.log('  ✓ Transport routes: 4, Vehicles: 5, Assignments: 5');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 16: INVENTORY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding inventory…');
  const inventoryItems = [
    { name: 'A4 Paper (500-sheet Ream)', sku: 'INV-STATY-001', category: 'Stationery', unit: 'reams', quantity: 150, reorderLevel: 30, unitValue: 29900 },
    { name: 'Whiteboard Markers (Box of 10)', sku: 'INV-STATY-002', category: 'Stationery', unit: 'boxes', quantity: 40, reorderLevel: 10, unitValue: 18000 },
    { name: 'Chalk (Box of 100)', sku: 'INV-STATY-003', category: 'Stationery', unit: 'boxes', quantity: 60, reorderLevel: 15, unitValue: 5000 },
    { name: 'Printer Ink Cartridge — HP 802', sku: 'INV-IT-001', category: 'IT Consumables', unit: 'pcs', quantity: 12, reorderLevel: 4, unitValue: 65000 },
    { name: 'Hand Sanitiser (1L Bottle)', sku: 'INV-HEALTH-001', category: 'Health & Safety', unit: 'bottles', quantity: 30, reorderLevel: 10, unitValue: 18000 },
    { name: 'First Aid Kit', sku: 'INV-HEALTH-002', category: 'Health & Safety', unit: 'kits', quantity: 8, reorderLevel: 3, unitValue: 120000 },
    { name: 'Sports Ball — Football', sku: 'INV-SPORTS-001', category: 'Sports', unit: 'pcs', quantity: 10, reorderLevel: 3, unitValue: 50000 },
    { name: 'Sports Ball — Cricket Ball', sku: 'INV-SPORTS-002', category: 'Sports', unit: 'pcs', quantity: 12, reorderLevel: 4, unitValue: 35000 },
    { name: 'Projector Bulb (Compatible)', sku: 'INV-AV-001', category: 'AV Equipment', unit: 'pcs', quantity: 5, reorderLevel: 2, unitValue: 350000 },
    { name: 'Cleaning Liquid (5L Can)', sku: 'INV-MAINT-001', category: 'Maintenance', unit: 'cans', quantity: 20, reorderLevel: 5, unitValue: 25000 },
    { name: 'Drawing Paper (A3, Pkg of 50)', sku: 'INV-ART-001', category: 'Arts & Crafts', unit: 'pkgs', quantity: 25, reorderLevel: 8, unitValue: 40000 },
    { name: 'Stapler (Heavy Duty)', sku: 'INV-STATY-004', category: 'Stationery', unit: 'pcs', quantity: 15, reorderLevel: 5, unitValue: 45000 },
  ];
  const invRows = await db.insert(s.inventoryItems).values(inventoryItems.map(i => ({ institutionId: instId, campusId, status: 'active', description: null, ...i }))).returning();

  await db.insert(s.inventoryMovements).values([
    { institutionId: instId, itemId: invRows[0]!.id, movementType: 'in', quantity: 50, reason: 'Monthly restock', reference: 'PO-2025-0601', movedDate: dateStr(daysAgo(30)), notes: 'Received from Manorama Stationery' },
    { institutionId: instId, itemId: invRows[0]!.id, movementType: 'out', quantity: 20, reason: 'Distributed to Admin Block', movedDate: dateStr(daysAgo(15)) },
    { institutionId: instId, itemId: invRows[1]!.id, movementType: 'in', quantity: 20, reason: 'Term start restock', movedDate: dateStr(daysAgo(30)) },
    { institutionId: instId, itemId: invRows[3]!.id, movementType: 'out', quantity: 3, reason: 'Printer replacements — IT Lab', movedDate: dateStr(daysAgo(10)) },
    { institutionId: instId, itemId: invRows[6]!.id, movementType: 'in', quantity: 5, reason: 'Sports Day prep', reference: 'PO-2025-0605', movedDate: dateStr(daysAgo(5)) },
  ]);
  console.log(`  ✓ Inventory items: ${invRows.length}, Movements: 5`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 17: HOSTEL
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding hostel…');
  const [blockBoys] = await db.insert(s.hostelBlocks).values({ institutionId: instId, campusId, name: 'Bharath Boys Hostel', code: 'BH-BOYS', blockType: 'boys', warden: 'Vijay Kumar', description: 'Main boys hostel block, 4 floors', status: 'active' }).returning();
  const [blockGirls] = await db.insert(s.hostelBlocks).values({ institutionId: instId, campusId, name: 'Saraswati Girls Hostel', code: 'BH-GIRLS', blockType: 'girls', warden: 'Geeta Pillai', description: 'Girls hostel block, 3 floors', status: 'active' }).returning();

  const hostelRoomData = [
    { blockId: blockBoys!.id, roomNo: 'B-101', floor: 'Ground', capacity: 4, occupied: 3, roomType: 'standard', status: 'available' },
    { blockId: blockBoys!.id, roomNo: 'B-102', floor: 'Ground', capacity: 4, occupied: 4, roomType: 'standard', status: 'full' },
    { blockId: blockBoys!.id, roomNo: 'B-201', floor: 'First', capacity: 4, occupied: 2, roomType: 'standard', status: 'available' },
    { blockId: blockBoys!.id, roomNo: 'B-202', floor: 'First', capacity: 2, occupied: 1, roomType: 'deluxe', status: 'available' },
    { blockId: blockGirls!.id, roomNo: 'G-101', floor: 'Ground', capacity: 4, occupied: 3, roomType: 'standard', status: 'available' },
    { blockId: blockGirls!.id, roomNo: 'G-102', floor: 'Ground', capacity: 4, occupied: 4, roomType: 'standard', status: 'full' },
    { blockId: blockGirls!.id, roomNo: 'G-201', floor: 'First', capacity: 2, occupied: 0, roomType: 'deluxe', status: 'available' },
    { blockId: null, roomNo: 'DORM-01', floor: 'Ground', capacity: 20, occupied: 14, roomType: 'dormitory', status: 'available' },
  ];
  const hostelRoomRows = await db.insert(s.hostelRooms).values(hostelRoomData.map(r => ({ institutionId: instId, campusId, ...r }))).returning();

  // Allocations — hostel students
  await db.insert(s.hostelAllocations).values([
    { institutionId: instId, roomId: hostelRoomRows[0]!.id, studentId: s1Id!, bedNo: 'B-101/1', fromDate: '2025-06-10', status: 'active' },
    { institutionId: instId, roomId: hostelRoomRows[0]!.id, studentId: s3Id!, bedNo: 'B-101/2', fromDate: '2025-06-10', status: 'active' },
    { institutionId: instId, roomId: hostelRoomRows[2]!.id, studentId: s7Id!, bedNo: 'B-201/1', fromDate: '2025-06-10', status: 'active' },
    { institutionId: instId, roomId: hostelRoomRows[4]!.id, studentId: s2Id!, bedNo: 'G-101/1', fromDate: '2025-06-10', status: 'active' },
    { institutionId: instId, roomId: hostelRoomRows[4]!.id, studentId: s4Id!, bedNo: 'G-101/2', fromDate: '2025-06-10', status: 'active' },
    { institutionId: instId, roomId: hostelRoomRows[4]!.id, studentId: s6Id!, bedNo: 'G-101/3', fromDate: '2025-06-10', status: 'active' },
    { institutionId: instId, roomId: hostelRoomRows[6]!.id, studentId: s14Id!, bedNo: 'G-201/1', fromDate: '2025-06-10', status: 'active' },
    { institutionId: instId, roomId: hostelRoomRows[7]!.id, studentId: s13Id!, bedNo: 'DORM-01/5', fromDate: '2025-06-10', status: 'active' },
  ]);
  console.log(`  ✓ Hostel blocks: 2, Rooms: ${hostelRoomRows.length}, Allocations: 8`);

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 18: HEALTH & WELLBEING
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding health & wellbeing…');
  await db.insert(s.healthRecords).values([
    { institutionId: instId, campusId, studentId: s1Id!, recordType: 'allergy', title: 'Dust Allergy', details: 'Mild. No medication required unless prolonged exposure.', bloodGroup: 'B+', status: 'active', recordedAt: '2025-06-12' },
    { institutionId: instId, campusId, studentId: s2Id!, recordType: 'vaccination', title: 'Hepatitis B Booster', details: 'Administered by school nurse on Annual Health Day.', bloodGroup: 'A+', status: 'active', recordedAt: '2025-07-15' },
    { institutionId: instId, campusId, studentId: s3Id!, recordType: 'condition', title: 'Mild Asthma', details: 'Uses inhaler. Inform PE teacher. Avoid intense cold-weather activity.', bloodGroup: 'O+', status: 'active', recordedAt: '2025-06-14' },
    { institutionId: instId, campusId, studentId: s4Id!, recordType: 'allergy', title: 'Peanut Allergy (Severe)', details: 'Carries EpiPen at all times. Canteen informed. Emergency contact: Ravi Nair 9876550005.', bloodGroup: 'AB+', status: 'active', recordedAt: '2025-06-12' },
    { institutionId: instId, campusId, studentId: s9Id!, recordType: 'vaccination', title: 'COVID-19 Booster', details: 'Second booster administered.', bloodGroup: 'O-', status: 'active', recordedAt: '2025-06-10' },
    { institutionId: instId, campusId, studentId: s13Id!, recordType: 'note', title: 'Wears Spectacles', details: 'Prescription -2.5D. Should sit in front rows.', bloodGroup: 'B-', status: 'active', recordedAt: '2025-06-14' },
  ]);

  await db.insert(s.medicalIncidents).values([
    { institutionId: instId, campusId, studentId: s5Id!, title: 'Sprained Ankle — PE Class', description: 'Twisted ankle during football drill. Ice pack applied. Parents informed. Rest for 3 days.', severity: 'medium', location: 'Ground Floor — PE Room', occurredAt: daysAgo(8), status: 'resolved' },
    { institutionId: instId, campusId, studentId: s3Id!, title: 'Asthma Episode in Classroom', description: 'Mild wheezing. Inhaler administered. Student recovered within 15 min. Parents informed.', severity: 'medium', location: 'Grade 9 A — Room 402', occurredAt: daysAgo(3), status: 'resolved' },
    { institutionId: instId, campusId, studentId: s1Id!, title: 'Mild Headache — Heat', description: 'Complained of headache after outdoor sports. ORS administered. Rested in sick room for 1 hr.', severity: 'low', location: 'Sick Room', occurredAt: daysAgo(1), status: 'resolved' },
    { institutionId: instId, campusId, studentId: s16Id!, title: 'Minor Cut on Hand — Art Class', description: 'Paper cut from craft project. Cleaned and bandaged. No further treatment needed.', severity: 'low', location: 'Art Room', occurredAt: now, status: 'open' },
  ]);

  await db.insert(s.medicationLogs).values([
    { institutionId: instId, campusId, studentId: s3Id!, medication: 'Salbutamol Inhaler', dosage: '100mcg × 2 puffs', administeredAt: daysAgo(3), notes: 'Post-asthma episode. Supervised by nurse.', status: 'administered' },
    { institutionId: instId, campusId, studentId: s5Id!, medication: 'Diclofenac Gel', dosage: 'Apply to affected ankle 2× daily', administeredAt: daysAgo(8), notes: 'For sprained ankle — physiotherapy also advised.', status: 'administered' },
    { institutionId: instId, campusId, studentId: s1Id!, medication: 'ORS Sachet', dosage: '1 sachet in 200ml water', administeredAt: daysAgo(1), notes: 'Administered in sick room during heat episode.', status: 'administered' },
    { institutionId: instId, campusId, studentId: s4Id!, medication: 'Cetirizine 5mg', dosage: 'Once daily after lunch', administeredAt: daysAgo(5), notes: 'For seasonal allergies — prescribed by Dr. Anupama.', status: 'scheduled' },
  ]);
  console.log('  ✓ Health records: 6, Incidents: 4, Medication logs: 4');

  // ── Counseling ────────────────────────────────────────────────────────────
  await db.insert(s.counselingRecords).values([
    { institutionId: instId, campusId, studentId: s3Id!, sessionType: 'academic', title: 'Study habits improvement', notes: 'Discussion on time management, creating a study schedule. Student receptive.', sessionAt: daysAgo(10), status: 'closed' },
    { institutionId: instId, campusId, studentId: s7Id!, sessionType: 'personal', title: 'Adjustment to new school', notes: 'First meeting. Student new this year — feeling socially isolated. Assigned buddy program.', sessionAt: daysAgo(15), status: 'open' },
    { institutionId: instId, campusId, studentId: s7Id!, sessionType: 'follow_up', title: 'Buddy program check-in', notes: 'Student reports improved connection. Positive attitude. Continue monthly follow-up.', sessionAt: daysAgo(1), status: 'open' },
    { institutionId: instId, campusId, studentId: s5Id!, sessionType: 'intake', title: 'Initial intake session', notes: 'Parent requested counseling due to exam anxiety. Assessment done. Referred for deep breathing techniques.', sessionAt: daysAgo(7), status: 'open' },
  ]);

  await db.insert(s.counselingCases).values([
    { institutionId: instId, campusId, studentId: s3Id!, title: 'Academic performance monitoring', summary: 'Monitoring study habits and academic progress post-counseling.', priority: 'low', status: 'closed' },
    { institutionId: instId, campusId, studentId: s7Id!, title: 'Social integration — new student', summary: 'Supporting student in building social connections in new school. Ongoing monthly check-ins.', priority: 'medium', status: 'open' },
    { institutionId: instId, campusId, studentId: s5Id!, title: 'Exam anxiety management', summary: 'Addressing test anxiety. Providing coping strategies ahead of Term 2 exams.', priority: 'high', status: 'open' },
  ]);
  console.log('  ✓ Counseling records: 4, Cases: 3');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 19: COMMUNICATION (Announcements + Messages)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding communication…');

  // Announcements
  const [annPtm] = await db.insert(s.announcements).values({
    institutionId: instId, campusId, title: 'Parent-Teacher Meeting — Saturday 12 July',
    body: 'Dear Parents,\n\nWe are pleased to invite you to the Parent-Teacher Meeting scheduled for Saturday, 12 July 2025 from 9:00 AM to 1:00 PM. Please collect slot slips from your child\'s class teacher.\n\nRegards,\nPrincipal — United Indian School',
    referenceCode: 'ANN-2025-001', audience: 'parents', category: 'Events', status: 'published',
    pinned: true, publishAt: dateStr(daysAgo(3)), publishedAt: daysAgo(3),
  }).returning();

  const [annSports] = await db.insert(s.announcements).values({
    institutionId: instId, campusId, title: 'Annual Sports Day — 25 August 2025',
    body: 'Sports Day will be held on 25 August 2025 at the school grounds. All students are encouraged to participate. Trials for track events begin next week.',
    referenceCode: 'ANN-2025-002', audience: 'all', category: 'Events', status: 'published',
    pinned: true, publishAt: dateStr(daysAgo(7)), publishedAt: daysAgo(7),
  }).returning();

  const [annExam] = await db.insert(s.announcements).values({
    institutionId: instId, campusId, title: 'Second Term Exam Schedule Released',
    body: 'The Second Term examination schedule for 2025–26 has been released. Students may collect their hall tickets from the office from 1 December 2025.',
    referenceCode: 'ANN-2025-003', audience: 'students', category: 'Academics', status: 'published',
    pinned: false, publishAt: dateStr(daysAgo(1)), publishedAt: daysAgo(1),
  }).returning();

  await db.insert(s.announcements).values({
    institutionId: instId, campusId, title: 'Holiday Notice — Onam Break',
    body: 'The school will remain closed from 25 August to 2 September on account of Onam. Classes resume on 3 September 2025.',
    referenceCode: 'ANN-2025-004', audience: 'all', category: 'Holiday', status: 'draft',
    pinned: false, publishAt: dateStr(daysFromNow(5)),
  });

  // Notifications linked to announcements
  await db.insert(s.notifications).values([
    { institutionId: instId, campusId, title: 'PTM on 12 July', body: 'Parent-Teacher Meeting scheduled for Saturday 12 July.', kind: 'announcement', audience: 'parents', announcementId: annPtm!.id, status: 'unread' },
    { institutionId: instId, campusId, title: 'Sports Day — 25 August', body: 'Annual Sports Day is on 25 August. Trials start next week!', kind: 'announcement', audience: 'all', announcementId: annSports!.id, status: 'unread' },
    { institutionId: instId, campusId, title: 'Term 2 Exam Schedule', body: 'Second Term exam schedule is now available.', kind: 'announcement', audience: 'students', announcementId: annExam!.id, status: 'read', readAt: daysAgo(0) },
    { institutionId: instId, campusId, title: 'Fee Payment Reminder', body: 'Your child\'s tuition fee invoice INV-2025-003 has an outstanding balance. Please pay by 15 July.', kind: 'system', audience: 'parents', status: 'unread' },
  ]);
  console.log('  ✓ Announcements: 4, Notifications: 4');

  // Message threads
  const [thrFee] = await db.insert(s.messageThreads).values({ institutionId: instId, campusId, subject: 'Fee Payment Query — Nithya Krishnan', referenceCode: 'MSG-2025-001', category: 'Finance', status: 'open' }).returning();
  const [thrHealth] = await db.insert(s.messageThreads).values({ institutionId: instId, campusId, subject: 'Asthma — Rohan Mehta', referenceCode: 'MSG-2025-002', category: 'Health', status: 'open' }).returning();
  const [thrGeneral] = await db.insert(s.messageThreads).values({ institutionId: instId, campusId, subject: 'Library Book Return — Rahul Kumar', referenceCode: 'MSG-2025-003', category: 'Library', status: 'closed' }).returning();

  await db.insert(s.messagePosts).values([
    { institutionId: instId, threadId: thrFee!.id, body: 'Dear Finance Team, I wanted to check on the balance remaining on our fee account. We paid ₹30,000 in July. Please advise on the next instalment date.', authorName: 'Praveen Krishnan', senderType: 'parent', postedDate: dateStr(daysAgo(3)) },
    { institutionId: instId, threadId: thrFee!.id, body: 'Dear Mr. Krishnan, Thank you for your payment. The outstanding balance of ₹30,000 is due by 15 August 2025. You may pay via bank transfer or at the finance counter.', authorName: 'Rajan Mathew', senderType: 'staff', postedDate: dateStr(daysAgo(2)) },
    { institutionId: instId, threadId: thrHealth!.id, body: 'Dear School Nurse, Rohan had an asthma episode on Tuesday. He is fine now but I wanted to check whether he has had any episodes at school this week.', authorName: 'Anupama Mehta', senderType: 'parent', postedDate: dateStr(daysAgo(2)) },
    { institutionId: instId, threadId: thrHealth!.id, body: 'Dear Mrs. Mehta, We are aware. Rohan had a mild episode on Tuesday morning. He used his inhaler and recovered fully. We are monitoring him closely. Please ensure his spare inhaler is always in his bag.', authorName: 'Usha Thomas', senderType: 'staff', postedDate: dateStr(daysAgo(1)) },
    { institutionId: instId, threadId: thrGeneral!.id, body: 'Hi, I have returned the book "India After Gandhi" today at the library counter. Please confirm receipt.', authorName: 'Rahul Kumar', senderType: 'student', postedDate: dateStr(daysAgo(14)) },
    { institutionId: instId, threadId: thrGeneral!.id, body: 'Confirmed. Book received in good condition. Your library account is now clear. Thank you!', authorName: 'Dhanya Suresh', senderType: 'staff', postedDate: dateStr(daysAgo(14)) },
  ]);
  console.log('  ✓ Message threads: 3, Posts: 6');

  // ══════════════════════════════════════════════════════════════════════════
  // SECTION 20: CAMPUS OPERATIONS — Labs
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n→ Seeding campus operations (labs, facilities, front desk, security, IT)…');

  await db.insert(s.labAssets).values([
    { institutionId: instId, campusId, name: 'Compound Microscope (Olympus CX23)', kind: 'equipment', quantity: 15, unit: 'units', location: 'Biology Lab — Room 103', status: 'available' },
    { institutionId: instId, campusId, name: 'Digital Weighing Balance', kind: 'equipment', quantity: 6, unit: 'units', location: 'Chemistry Lab — Room 104', status: 'available' },
    { institutionId: instId, campusId, name: 'Bunsen Burners', kind: 'equipment', quantity: 12, unit: 'units', location: 'Chemistry Lab — Room 104', status: 'available' },
    { institutionId: instId, campusId, name: 'Test Tubes (Borosilicate)', kind: 'consumable', quantity: 300, unit: 'pcs', location: 'Chemistry Lab — Room 104', status: 'available' },
    { institutionId: instId, campusId, name: 'Oscilloscope (2-Channel)', kind: 'equipment', quantity: 4, unit: 'units', location: 'Physics Lab — Room 105', status: 'available' },
    { institutionId: instId, campusId, name: 'Magnets (Bar & Horseshoe)', kind: 'equipment', quantity: 20, unit: 'sets', location: 'Physics Lab — Room 105', status: 'available' },
    { institutionId: instId, campusId, name: 'Desktop PCs (HP ProDesk)', kind: 'equipment', quantity: 30, unit: 'units', location: 'Computer Lab — Room 106', status: 'available' },
    { institutionId: instId, campusId, name: 'Sodium Hydroxide (NaOH)', kind: 'chemical', quantity: 5, unit: 'kg', location: 'Chemistry Lab — Storage', status: 'available' },
    { institutionId: instId, campusId, name: 'Sodium Chloride (NaCl)', kind: 'chemical', quantity: 3, unit: 'kg', location: 'Chemistry Lab — Storage', status: 'available' },
  ]);

  await db.insert(s.labSchedules).values([
    { institutionId: instId, campusId, labName: 'Biology Lab — Room 103', title: 'Grade 9A — Microscopy Practical', scheduledAt: daysFromNow(2), durationMinutes: 90, status: 'scheduled' },
    { institutionId: instId, campusId, labName: 'Chemistry Lab — Room 104', title: 'Grade 10A — Titration Experiment', scheduledAt: daysFromNow(3), durationMinutes: 90, status: 'scheduled' },
    { institutionId: instId, campusId, labName: 'Physics Lab — Room 105', title: 'Grade 12A — Ohm\'s Law Verification', scheduledAt: daysAgo(1), durationMinutes: 120, status: 'completed' },
    { institutionId: instId, campusId, labName: 'Computer Lab — Room 106', title: 'Grade 9A — Python Intro', scheduledAt: daysAgo(3), durationMinutes: 60, status: 'completed' },
  ]);

  await db.insert(s.labIncidents).values([
    { institutionId: instId, campusId, title: 'Minor Chemical Spill — NaOH Solution', description: 'Small spill during Grade 10 titration practical. Area neutralised with dilute acid and cleaned. No injuries. Lab tech Mr. Santhosh managed the response.', severity: 'low', occurredAt: daysAgo(6), status: 'resolved' },
  ]);

  // ── Facilities & Campus Operations ─────────────────────────────────────────
  await db.insert(s.facilities).values([
    { institutionId: instId, campusId, name: 'Main Academic Block', kind: 'building', location: 'North Zone — Main Campus', status: 'operational' },
    { institutionId: instId, campusId, name: 'Science & Lab Block', kind: 'building', location: 'East Zone — Main Campus', status: 'operational' },
    { institutionId: instId, campusId, name: 'Sports Ground', kind: 'ground', location: 'South Zone — Main Campus', status: 'operational' },
    { institutionId: instId, campusId, name: 'Indoor Sports Hall', kind: 'hall', location: 'West Zone — Main Campus', status: 'operational' },
    { institutionId: instId, campusId, name: 'Auditorium', kind: 'hall', location: 'Main Academic Block — Ground Floor', status: 'operational' },
    { institutionId: instId, campusId, name: 'Library', kind: 'room', location: 'Main Academic Block — 1st Floor', status: 'operational' },
    { institutionId: instId, campusId, name: 'Canteen', kind: 'room', location: 'Ground Floor — North Wing', status: 'operational' },
    { institutionId: instId, campusId, name: 'Boys Washroom Block A', kind: 'room', location: 'Ground Floor — Main Building', status: 'under_maintenance' },
  ]);

  await db.insert(s.workOrders).values([
    { institutionId: instId, campusId, title: 'Fix Leaking Pipe — Boys Washroom Block A', description: 'Leaking pipe in Boys Washroom Ground Floor, Block A. Water seeping to corridor.', priority: 'high', assignedTo: 'Murali Krishnan', dueAt: dateStr(daysFromNow(1)), status: 'in_progress' },
    { institutionId: instId, campusId, title: 'Replace Projector Bulb — Room 402', description: 'Projector in Room 402 requires bulb replacement. Students reporting poor visibility.', priority: 'medium', assignedTo: 'Pradeep George', dueAt: dateStr(daysFromNow(2)), status: 'open' },
    { institutionId: instId, campusId, title: 'Repaint Corridor — 2nd Floor', description: 'Corridor walls on 2nd floor need repainting. Surface peeling in two sections.', priority: 'low', assignedTo: 'Murali Krishnan', dueAt: dateStr(daysFromNow(30)), status: 'open' },
    { institutionId: instId, campusId, title: 'Replace Broken Window — Room 301', description: 'Window glass cracked in Room 301. Safety hazard.', priority: 'high', assignedTo: 'Murali Krishnan', dueAt: today, status: 'completed' },
  ]);

  await db.insert(s.maintenanceTasks).values([
    { institutionId: instId, campusId, title: 'Generator Monthly Service', frequency: 'monthly', nextDueAt: dateStr(daysFromNow(15)), notes: 'DG Set 1 & 2 — filter change + oil check.', status: 'pending' },
    { institutionId: instId, campusId, title: 'HVAC Filter Replacement — Admin Block', frequency: 'quarterly', nextDueAt: dateStr(daysFromNow(45)), notes: 'All 6 units in Admin Block.', status: 'pending' },
    { institutionId: instId, campusId, title: 'Fire Extinguisher Inspection', frequency: 'monthly', nextDueAt: dateStr(daysFromNow(5)), notes: 'All 42 extinguishers campus-wide.', status: 'pending' },
    { institutionId: instId, campusId, title: 'Annual Pest Control', frequency: 'annual', nextDueAt: dateStr(daysFromNow(60)), notes: 'Full campus treatment — schedule with vendor Shine Pest Control.', status: 'pending' },
  ]);

  await db.insert(s.facilityAssets).values([
    { institutionId: instId, campusId, name: 'Ride-on Lawn Mower', category: 'Grounds', location: 'Groundskeeper Shed — South Zone', status: 'active' },
    { institutionId: instId, campusId, name: 'DG Set 1 (100KVA — Kirloskar)', category: 'Power', location: 'Generator Room — North Block', status: 'active' },
    { institutionId: instId, campusId, name: 'DG Set 2 (60KVA — Cummins)', category: 'Power', location: 'Generator Room — South Block', status: 'active' },
    { institutionId: instId, campusId, name: 'CCTV System (64 Cameras)', category: 'Security', location: 'Security Control Room', status: 'active' },
    { institutionId: instId, campusId, name: 'Overhead Water Tank (50,000L)', category: 'Utilities', location: 'Rooftop — Main Block', status: 'active' },
  ]);

  // ── Front Desk / Reception ─────────────────────────────────────────────────
  await db.insert(s.visitors).values([
    { institutionId: instId, campusId, fullName: 'Praveen Krishnan', purpose: 'Parent-Teacher Discussion', host: 'Rajesh Kumar', badgeNo: 'V-0701-001', checkInAt: now, status: 'checked_in' },
    { institutionId: instId, campusId, fullName: 'Inspector M. Rajan (Education Dept.)', purpose: 'Routine Inspection', host: 'Anand Sharma (Principal)', badgeNo: 'V-0625-001', checkInAt: daysAgo(6), checkOutAt: daysAgo(6), status: 'checked_out' },
    { institutionId: instId, campusId, fullName: 'Fresh Express Delivery', purpose: 'Canteen Supplies Delivery', host: 'Canteen — Mr. Raju', badgeNo: 'V-0701-002', checkInAt: daysAgo(0), status: 'checked_in' },
  ]);

  await db.insert(s.appointments).values([
    { institutionId: instId, campusId, visitorName: 'Suresh Sharma', withWhom: 'Rajesh Kumar (Math Teacher)', scheduledAt: daysFromNow(2), notes: 'Discussion about Arjun\'s performance in Term 1.', status: 'scheduled' },
    { institutionId: instId, campusId, visitorName: 'Rep — National Book Trust', withWhom: 'Dhanya Suresh (Librarian)', scheduledAt: daysFromNow(5), notes: 'Book donation programme discussion.', status: 'scheduled' },
    { institutionId: instId, campusId, visitorName: 'Biju Iyer', withWhom: 'Binu Joseph (Counselor)', scheduledAt: daysAgo(5), notes: 'Discuss Pooja Iyer\'s progress.', status: 'completed' },
  ]);

  // ── Security ───────────────────────────────────────────────────────────────
  await db.insert(s.securityIncidents).values([
    { institutionId: instId, campusId, title: 'Unauthorised Entry Attempt — Rear Gate', description: 'Unknown individual attempted entry through the rear gate without a pass. Security on duty (Raju Singh) intercepted and escorted out. CCTV footage preserved.', severity: 'medium', location: 'Rear Gate — South Perimeter', occurredAt: daysAgo(4), status: 'investigating' },
    { institutionId: instId, campusId, title: 'Missing Bicycle — Bicycle Shed', description: 'Student Aditya Patel reported bicycle missing from the shed. Police complaint filed. CCTV review ongoing.', severity: 'low', location: 'Bicycle Shed — East Zone', occurredAt: daysAgo(2), status: 'open' },
    { institutionId: instId, campusId, title: 'After-Hours Alarm — Science Block', description: 'Motion sensor alarm triggered at 22:15 in Science Block. Security patrol found window improperly latched. No intrusion. Window secured.', severity: 'low', location: 'Science & Lab Block', occurredAt: daysAgo(10), status: 'resolved' },
  ]);

  await db.insert(s.emergencyAlerts).values([
    { institutionId: instId, campusId, title: 'Fire Drill — Annual', message: 'Annual fire drill scheduled for Thursday 10 July at 10:30 AM. All students, teachers and staff to participate. No evacuation is required — drill only.', level: 'info', raisedAt: daysAgo(1), status: 'active' },
    { institutionId: instId, campusId, title: 'Power Outage Advisory', message: 'KSEB scheduled maintenance on 8 July between 9:00–13:00. DG sets will be active. Minimal disruption expected.', level: 'info', raisedAt: daysAgo(3), status: 'resolved' },
  ]);

  await db.insert(s.gatePasses).values([
    { institutionId: instId, campusId, holderName: 'Fresh Express Supply Van', kind: 'vehicle', reason: 'Canteen daily supplies', issuedAt: now, expiresAt: daysFromNow(1), status: 'active' },
    { institutionId: instId, campusId, holderName: 'Murali Krishnan (Maintenance)', kind: 'person', reason: 'After-hours maintenance work — plumbing', issuedAt: daysAgo(1), expiresAt: daysFromNow(2), status: 'active' },
  ]);

  await db.insert(s.campusAccessLogs).values([
    { institutionId: instId, campusId, subjectName: 'Praveen Krishnan', direction: 'in', gate: 'Main Gate', method: 'badge', occurredAt: now, status: 'recorded' },
    { institutionId: instId, campusId, subjectName: 'Fresh Express Delivery Van', direction: 'in', gate: 'Delivery Gate', method: 'manual', occurredAt: daysAgo(0), status: 'recorded' },
    { institutionId: instId, campusId, subjectName: 'Inspector M. Rajan', direction: 'out', gate: 'Main Gate', method: 'badge', occurredAt: daysAgo(6), status: 'recorded' },
  ]);

  // ── IT ────────────────────────────────────────────────────────────────────
  await db.insert(s.devices).values([
    { institutionId: instId, campusId, name: 'Staff Laptop — Rajesh Kumar', kind: 'laptop', assetTag: 'UIS-LT-001', assignedTo: 'Rajesh Kumar — Mathematics Dept.', status: 'active' },
    { institutionId: instId, campusId, name: 'Staff Laptop — Priya Sharma', kind: 'laptop', assetTag: 'UIS-LT-002', assignedTo: 'Priya Sharma — Science Dept.', status: 'active' },
    { institutionId: instId, campusId, name: 'Computer Lab PC 01', kind: 'desktop', assetTag: 'UIS-PC-001', assignedTo: 'Computer Lab — Room 106', status: 'active' },
    { institutionId: instId, campusId, name: 'Computer Lab PC 02', kind: 'desktop', assetTag: 'UIS-PC-002', assignedTo: 'Computer Lab — Room 106', status: 'active' },
    { institutionId: instId, campusId, name: 'Office Printer — HP LaserJet', kind: 'printer', assetTag: 'UIS-PR-001', assignedTo: 'Admin Office — Ground Floor', status: 'active' },
    { institutionId: instId, campusId, name: 'Projector — Room 402', kind: 'projector', assetTag: 'UIS-PJ-402', assignedTo: 'Room 402 — Grade 9A', status: 'repair' },
    { institutionId: instId, campusId, name: 'Wi-Fi Router — Admin Block', kind: 'network', assetTag: 'UIS-NW-001', assignedTo: 'Admin Block — Ceiling Mount', status: 'active' },
    { institutionId: instId, campusId, name: 'NAS Storage Server', kind: 'other', assetTag: 'UIS-SRV-001', assignedTo: 'Server Room — Room 001', status: 'active' },
    { institutionId: instId, campusId, name: 'Smart Board — Auditorium', kind: 'other', assetTag: 'UIS-SB-AUD', assignedTo: 'Auditorium', status: 'active' },
    { institutionId: instId, campusId, name: 'Tablet — Library OPAC', kind: 'other', assetTag: 'UIS-TAB-LIB', assignedTo: 'Library — OPAC Terminal', status: 'active' },
  ]);

  await db.insert(s.accessRequests).values([
    { institutionId: instId, campusId, requesterName: 'Arun Nair', system: 'Google Workspace Admin', reason: 'CS teacher needs admin access to set up student accounts for new semester.', priority: 'medium', status: 'approved' },
    { institutionId: instId, campusId, requesterName: 'Anjali Singh', system: 'Staff Wi-Fi — 5GHz Band', reason: 'New laptop purchased; needs Wi-Fi credentials configured.', priority: 'low', status: 'open' },
    { institutionId: instId, campusId, requesterName: 'Kavitha Menon', system: 'Physics Lab Software (Logger Pro)', reason: 'New academic year — license renewal required for Physics Lab PCs.', priority: 'high', status: 'open' },
    { institutionId: instId, campusId, requesterName: 'Dhanya Suresh', system: 'Library Management System — Admin', reason: 'Password reset required — locked out after 3 failed attempts.', priority: 'medium', status: 'approved' },
  ]);

  // ── Administration settings, custom roles, and webhooks ────────────────────
  console.log('\n→ Seeding administrative settings, custom roles, and webhooks…');
  
  await db.insert(s.institutionSettings).values([
    { institutionId: instId, campusId: null, category: 'general', key: 'school_name', label: 'School Name', valueType: 'string', value: 'United Indian School', description: 'Official name of the institution' },
    { institutionId: instId, campusId: null, category: 'general', key: 'support_email', label: 'Support Email', valueType: 'string', value: 'support@uis.edu.in', description: 'Contact email for parents and students' },
    { institutionId: instId, campusId: null, category: 'localization', key: 'timezone', label: 'Default Timezone', valueType: 'string', value: 'Asia/Kolkata', description: 'Timezone used for attendance logs and timetables' },
    { institutionId: instId, campusId: null, category: 'localization', key: 'currency', label: 'System Currency', valueType: 'string', value: 'INR', description: 'Base currency for fees, payments, and payroll' },
    { institutionId: instId, campusId: null, category: 'branding', key: 'primary_color', label: 'Primary Theme Color', valueType: 'string', value: '#005A9C', description: 'Primary brand color used on dashboard header' },
    { institutionId: instId, campusId: null, category: 'branding', key: 'secondary_color', label: 'Secondary Accent Color', valueType: 'string', value: '#FF8C00', description: 'Accent color for buttons and highlights' },
    { institutionId: instId, campusId: null, category: 'branding', key: 'logo_url', label: 'School Logo URL', valueType: 'string', value: 'https://images.unsplash.com/photo-1546410531-bb4caa6b424d?auto=format&fit=crop&w=256&h=256', description: 'URL to the school logo' },
    { institutionId: instId, campusId: null, category: 'security', key: 'mfa_enforced', label: 'Enforce Multi-Factor Auth', valueType: 'boolean', value: 'false', description: 'If true, all staff must enrol in MFA to log in' },
    { institutionId: instId, campusId: null, category: 'security', key: 'session_timeout_minutes', label: 'Session Idle Timeout (Min)', valueType: 'number', value: '60', description: 'Auto logout time when idle' },
    { institutionId: instId, campusId: null, category: 'notifications', key: 'email_parent_on_absence', label: 'Email Parent on Absence', valueType: 'boolean', value: 'true', description: 'Auto send email to parents when student is marked absent' },
    { institutionId: instId, campusId: null, category: 'notifications', key: 'email_announcements', label: 'Email Announcements', valueType: 'boolean', value: 'true', description: 'Broadcast announcements via email' },
    { institutionId: instId, campusId: null, category: 'academic', key: 'default_pass_percentage', label: 'Default Pass Percentage', valueType: 'number', value: '35', description: 'Default benchmark to calculate pass status in exams' },
    { institutionId: instId, campusId: null, category: 'academic', key: 'grading_scale', label: 'Grading Scale', valueType: 'json', value: '{"A+":90,"A":80,"B+":70,"B":60,"C":50,"D":35,"F":0}', description: 'JSON mapping of letter grades to minimum score percentage' }
  ]);

  await db.insert(s.institutionRoles).values([
    { institutionId: instId, key: 'exam_officer', name: 'Exam Officer', description: 'Manages exam schedules and student grades.', permissions: ['exams.view', 'exams.manage', 'gradebook.view', 'gradebook.manage', 'academics.view'], isSystem: false },
    { institutionId: instId, key: 'librarian_admin', name: 'Library Administrator', description: 'Manages library books, cataloguing, and issues/returns.', permissions: ['library.view', 'library.manage', 'student_basic_profile.view', 'staff_basic_profile.view'], isSystem: false },
    { institutionId: instId, key: 'campus_operations_manager', name: 'Campus Operations Manager', description: 'Manages facilities, work orders, assets, and security logs.', permissions: ['facilities.view', 'work_orders.manage', 'maintenance_tasks.manage', 'assets.view', 'security_incidents.manage', 'emergency_alerts.view', 'campus_access_logs.view'], isSystem: false }
  ]);

  await db.insert(s.webhookEndpoints).values([
    { institutionId: instId, url: 'https://api.uis.edu.in/webhooks/moodle', secret: 'whsec_moodle_secret_key_123456', description: 'Moodle LMS Integration for Student sync', events: ['students.create', 'students.update', 'students.delete'], active: true },
    { institutionId: instId, url: 'https://api.uis.edu.in/webhooks/tally', secret: 'whsec_tally_secret_key_789012', description: 'Tally ERP integration for school fee sync', events: ['fees.manage'], active: true }
  ]);

  console.log('  ✓ Lab assets: 9, Schedules: 4, Incidents: 1');
  console.log('  ✓ Facilities: 8, Work Orders: 4, Maintenance Tasks: 4, Facility Assets: 5');
  console.log('  ✓ Visitors: 3, Appointments: 3');
  console.log('  ✓ Security incidents: 3, Emergency alerts: 2, Gate passes: 2, Access logs: 3');
  console.log('  ✓ Devices: 10, Access requests: 4');
  console.log('  ✓ Settings: 13, Custom Roles: 3, Webhook Endpoints: 2');

  // ══════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅  United Indian School — full seed complete!                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('✗ UIS seed failed:', err);
  process.exit(1);
});
