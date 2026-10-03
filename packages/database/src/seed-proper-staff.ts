import dotenv from 'dotenv';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '../../..', '.env') });

import { createDatabase, closeDatabase } from './client';
import * as s from './schema/index';
import { and, asc, eq } from 'drizzle-orm';

const DEV_PASSWORD_HASH = '$2a$10$ByZT0oBbpXQboXG7ZlkzbOWfBfx9uAwu6Zf0HAt/G3yIcji9Rh.WG';

const gwStaffData = [
  { employeeNo: 'T-001', firstName: 'Tina', lastName: 'Teacher', email: 'teacher@greenwood.edu', designation: 'Senior Teacher', deptName: 'Mathematics', roleKey: 'teacher' },
  { employeeNo: 'T-002', firstName: 'George', lastName: 'Gomez', email: 'g.gomez@greenwood.edu', designation: 'Mathematics Teacher', deptName: 'Science', roleKey: 'teacher' },
  { employeeNo: 'T-003', firstName: 'Hana', lastName: 'Khan', email: 'h.khan@greenwood.edu', designation: 'HOD Science', deptName: 'Science', roleKey: 'teacher' },
  { employeeNo: 'S-001', firstName: 'Hira', lastName: 'HR', email: 'hr@greenwood.edu', designation: 'HR Manager', deptName: 'Administration', roleKey: 'hr_manager' },
  { employeeNo: 'S-002', firstName: 'Ivan', lastName: 'IT', email: 'it@greenwood.edu', designation: 'IT Administrator', deptName: 'Computer Science', roleKey: 'it_staff' },
  { employeeNo: 'S-003', firstName: 'Rita', lastName: 'Reception', email: 'reception@greenwood.edu', designation: 'Front Office', deptName: 'Administration', roleKey: 'receptionist' },
  { employeeNo: 'S-004', firstName: 'Nadia', lastName: 'Nurse', email: 'nurse@greenwood.edu', designation: 'School Nurse', deptName: null, roleKey: 'school_nurse' },
  { employeeNo: 'S-005', firstName: 'Cory', lastName: 'Counselor', email: 'counselor@greenwood.edu', designation: 'Counselor', deptName: null, roleKey: 'counselor' },
  { employeeNo: 'S-006', firstName: 'Liam', lastName: 'Lab', email: 'lab@greenwood.edu', designation: 'Lab Technician', deptName: 'Science', roleKey: 'lab_staff' },
  { employeeNo: 'S-007', firstName: 'Mona', lastName: 'Maintenance', email: 'maintenance@greenwood.edu', designation: 'Maintenance Supervisor', deptName: null, roleKey: 'maintenance_staff' },
  { employeeNo: 'S-008', firstName: 'Sergio', lastName: 'Security', email: 'security@greenwood.edu', designation: 'Security Officer', deptName: null, roleKey: 'security_staff' },
  { employeeNo: 'S-009', firstName: 'Fred', lastName: 'Finance', email: 'finance@greenwood.edu', designation: 'Accountant', deptName: 'Administration', roleKey: 'finance_manager' },
];

const uisStaffData = [
  { employeeNo: 'S-001', firstName: 'Anand', lastName: 'Sharma', email: 'principal@uis.edu.in', designation: 'Principal', deptCode: 'ADMIN', roleKey: 'principal' },
  { employeeNo: 'S-002', firstName: 'Rekha', lastName: 'Nambiar', email: 'viceprincipal@uis.edu.in', designation: 'Vice Principal', deptCode: 'ADMIN', roleKey: 'institution_admin' },
  { employeeNo: 'S-003', firstName: 'Geeta', lastName: 'Pillai', email: 'hr@uis.edu.in', designation: 'HR Manager', deptCode: 'ADMIN', roleKey: 'hr_manager' },
  { employeeNo: 'S-004', firstName: 'Rajan', lastName: 'Mathew', email: 'finance@uis.edu.in', designation: 'Finance Officer', deptCode: 'ADMIN', roleKey: 'finance_manager' },
  { employeeNo: 'S-005', firstName: 'Sujatha', lastName: 'Krishnan', email: 'accounts@uis.edu.in', designation: 'Accountant', deptCode: 'ADMIN', roleKey: 'finance_manager' },
  { employeeNo: 'S-006', firstName: 'Pradeep', lastName: 'George', email: 'it@uis.edu.in', designation: 'IT Administrator', deptCode: 'CS', roleKey: 'it_staff' },
  { employeeNo: 'S-007', firstName: 'Usha', lastName: 'Thomas', email: 'nurse@uis.edu.in', designation: 'School Nurse', deptCode: null, roleKey: 'school_nurse' },
  { employeeNo: 'S-008', firstName: 'Binu', lastName: 'Joseph', email: 'counselor@uis.edu.in', designation: 'Counselor', deptCode: null, roleKey: 'counselor' },
  { employeeNo: 'S-009', firstName: 'Harish', lastName: 'Menon', email: 'reception@uis.edu.in', designation: 'Front Office Executive', deptCode: 'ADMIN', roleKey: 'receptionist' },
  { employeeNo: 'S-010', firstName: 'Santhosh', lastName: 'Varma', email: 'lab@uis.edu.in', designation: 'Lab Technician', deptCode: 'SCI', roleKey: 'lab_staff' },
  { employeeNo: 'S-011', firstName: 'Murali', lastName: 'Krishnan', email: 'maintenance@uis.edu.in', designation: 'Maintenance Supervisor', deptCode: null, roleKey: 'maintenance_staff' },
  { employeeNo: 'S-012', firstName: 'Raju', lastName: 'Security', email: 'security@uis.edu.in', designation: 'Security Officer', deptCode: null, roleKey: 'security_staff' },
  { employeeNo: 'S-013', firstName: 'Dhanya', lastName: 'Suresh', email: 'librarian@uis.edu.in', designation: 'Librarian', deptCode: null, roleKey: 'lab_staff' },
  { employeeNo: 'S-014', firstName: 'Anitha', lastName: 'Rajan', email: 'transport@uis.edu.in', designation: 'Transport Coordinator', deptCode: null, roleKey: 'maintenance_staff' },
  { employeeNo: 'S-015', firstName: 'Vijay', lastName: 'Kumar', email: 'hostel@uis.edu.in', designation: 'Hostel Warden', deptCode: null, roleKey: 'maintenance_staff' },

  { employeeNo: 'T-001', firstName: 'Rajesh', lastName: 'Kumar', email: 'teacher@uis.edu.in', designation: 'Mathematics Teacher', deptCode: 'MATH', roleKey: 'teacher' },
  { employeeNo: 'T-002', firstName: 'Priya', lastName: 'Sharma', email: 'p.sharma@uis.edu.in', designation: 'Science Teacher', deptCode: 'SCI', roleKey: 'teacher' },
  { employeeNo: 'T-003', firstName: 'Anjali', lastName: 'Singh', email: 'a.singh@uis.edu.in', designation: 'English Teacher', deptCode: 'ENG', roleKey: 'teacher' },
  { employeeNo: 'T-004', firstName: 'Mohan', lastName: 'Rao', email: 'm.rao@uis.edu.in', designation: 'Social Studies Teacher', deptCode: 'SOC', roleKey: 'teacher' },
  { employeeNo: 'T-005', firstName: 'Sunita', lastName: 'Verma', email: 's.verma@uis.edu.in', designation: 'Hindi Teacher', deptCode: null, roleKey: 'teacher' },
  { employeeNo: 'T-006', firstName: 'Arun', lastName: 'Nair', email: 'a.nair@uis.edu.in', designation: 'Computer Science Teacher', deptCode: 'CS', roleKey: 'teacher' },
  { employeeNo: 'T-007', firstName: 'Kavitha', lastName: 'Menon', email: 'k.menon@uis.edu.in', designation: 'Physics Teacher', deptCode: 'SCI', roleKey: 'teacher' },
  { employeeNo: 'T-008', firstName: 'Suresh', lastName: 'Pillai', email: 's.pillai@uis.edu.in', designation: 'Mathematics Teacher', deptCode: 'MATH', roleKey: 'teacher' },
  { employeeNo: 'T-009', firstName: 'Deepa', lastName: 'Krishnan', email: 'd.krishnan@uis.edu.in', designation: 'Chemistry Teacher', deptCode: 'SCI', roleKey: 'teacher' },
  { employeeNo: 'T-010', firstName: 'Ramesh', lastName: 'Iyer', email: 'r.iyer@uis.edu.in', designation: 'Biology Teacher', deptCode: 'SCI', roleKey: 'teacher' },
  { employeeNo: 'T-011', firstName: 'Lakshmi', lastName: 'Patel', email: 'l.patel@uis.edu.in', designation: 'English Teacher', deptCode: 'ENG', roleKey: 'teacher' },
  { employeeNo: 'T-012', firstName: 'Vinod', lastName: 'Gupta', email: 'v.gupta@uis.edu.in', designation: 'Physical Education Teacher', deptCode: 'PE', roleKey: 'teacher' },
  { employeeNo: 'T-013', firstName: 'Meena', lastName: 'Joshi', email: 'm.joshi@uis.edu.in', designation: 'Art Teacher', deptCode: 'ART', roleKey: 'teacher' },
  { employeeNo: 'T-014', firstName: 'Prakash', lastName: 'Tiwari', email: 'p.tiwari@uis.edu.in', designation: 'History Teacher', deptCode: 'SOC', roleKey: 'teacher' },
  { employeeNo: 'T-015', firstName: 'Sarala', lastName: 'Desai', email: 's.desai@uis.edu.in', designation: 'Grade 1 Class Teacher', deptCode: null, roleKey: 'teacher' },

  { employeeNo: 'T-016', firstName: 'Dr. Sreela', lastName: 'Sreedhar', email: 's.sreedhar@uis.edu.in', designation: 'Guest Lecturer', deptCode: null, roleKey: 'teacher' },
  { employeeNo: 'T-017', firstName: 'Dr. Vasudev', lastName: 'R', email: 'v.r@uis.edu.in', designation: 'Guest Lecturer', deptCode: null, roleKey: 'teacher' },
  { employeeNo: 'T-018', firstName: 'Mangala', lastName: 'Devi K.T', email: 'm.devi@uis.edu.in', designation: 'Guest Lecturer', deptCode: null, roleKey: 'teacher' },
  { employeeNo: 'T-019', firstName: 'Tara debug2-1783275238', lastName: 'Teach', email: 'tara-debug2-1783275238@smoke.test', designation: 'Smoke Test Teacher', deptCode: null, roleKey: 'teacher' },
];

async function seedInstitutionStaff(
  db: any,
  institution: any,
  campus: any,
  staffData: any[],
  useDeptCode: boolean
) {
  console.log(`→ Seeding staff for ${institution.displayName}...`);

  // Query departments for this institution
  const depts = await db
    .select()
    .from(s.departments)
    .where(eq(s.departments.institutionId, institution.id));
  const deptByCode = new Map(depts.map((d: any) => [d.code, d.id]));
  const deptByName = new Map(depts.map((d: any) => [d.name.toLowerCase(), d.id]));

  for (const st of staffData) {
    const email = st.email.toLowerCase();

    // 1. Find or create institution user
    const [portalUser] = await db
      .select({ id: s.institutionUsers.id })
      .from(s.institutionUsers)
      .where(
        and(
          eq(s.institutionUsers.institutionId, institution.id),
          eq(s.institutionUsers.email, email)
        )
      )
      .limit(1);

    let portalUserId = portalUser?.id;
    if (!portalUserId) {
      const [created] = await db
        .insert(s.institutionUsers)
        .values({
          institutionId: institution.id,
          email,
          fullName: `${st.firstName} ${st.lastName}`,
          status: 'active',
          passwordHash: DEV_PASSWORD_HASH,
          activatedAt: new Date(),
        })
        .returning({ id: s.institutionUsers.id });
      portalUserId = created.id;
      console.log(`  + Created login for ${email}`);
    } else {
      // Ensure existing user is active and has a password
      await db
        .update(s.institutionUsers)
        .set({
          status: 'active',
          passwordHash: DEV_PASSWORD_HASH,
          activatedAt: new Date(),
        })
        .where(eq(s.institutionUsers.id, portalUserId));
    }

    // 2. Assign role in institution_user_roles
    await db
      .insert(s.institutionUserRoles)
      .values({
        institutionUserId: portalUserId,
        roleKey: st.roleKey,
      })
      .onConflictDoNothing();

    // 3. Grant campus access
    await db
      .insert(s.campusUserAccess)
      .values({
        institutionUserId: portalUserId,
        campusId: campus.id,
        accessLevel: 'manage',
      })
      .onConflictDoNothing();

    // 4. Resolve department
    let departmentId = null;
    if (useDeptCode && st.deptCode) {
      departmentId = deptByCode.get(st.deptCode) ?? null;
    } else if (!useDeptCode && st.deptName) {
      departmentId = deptByName.get(st.deptName.toLowerCase()) ?? null;
    }

    // 5. Find or create staff record
    const [existingStaff] = await db
      .select({ id: s.staff.id })
      .from(s.staff)
      .where(
        and(
          eq(s.staff.institutionId, institution.id),
          eq(s.staff.employeeNo, st.employeeNo)
        )
      )
      .limit(1);

    if (!existingStaff) {
      await db.insert(s.staff).values({
        institutionId: institution.id,
        campusId: campus.id,
        employeeNo: st.employeeNo,
        firstName: st.firstName,
        lastName: st.lastName,
        email,
        phone: '9876540000',
        designation: st.designation,
        departmentId,
        employmentType: 'full_time',
        status: 'active',
        joinDate: '2022-06-01',
        institutionUserId: portalUserId,
      });
      console.log(`  + Created staff: ${st.firstName} ${st.lastName}`);
    } else {
      await db
        .update(s.staff)
        .set({
          institutionUserId: portalUserId,
          email,
          designation: st.designation,
          departmentId,
        })
        .where(eq(s.staff.id, existingStaff.id));
    }
  }
}

async function main() {
  const db = createDatabase();

  // Find United Indian School
  const [uis] = await db
    .select()
    .from(s.institutions)
    .where(eq(s.institutions.displayName, 'United Indian School'))
    .limit(1);

  if (uis) {
    const [campus] = await db
      .select()
      .from(s.campuses)
      .where(eq(s.campuses.institutionId, uis.id))
      .orderBy(asc(s.campuses.code))
      .limit(1);

    if (campus) {
      // Seed Greenwood staff under United Indian School
      await seedInstitutionStaff(db, uis, campus, gwStaffData, false);
      // Seed UIS staff under United Indian School
      await seedInstitutionStaff(db, uis, campus, uisStaffData, true);
    }
  }

  console.log('✓ Seeding proper staff logins complete!');
  await closeDatabase();
}

main().catch((err) => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
