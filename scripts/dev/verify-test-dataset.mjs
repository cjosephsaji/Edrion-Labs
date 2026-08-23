/**
 * Verifies the test dataset seeded by scripts/dev/seed-test-dataset.ts is visible and
 * mutually consistent across every admin page that reads part of it.
 *
 * Hits the same API endpoints the institution-web pages call, as the test admin, and
 * cross-checks that ids/names/counts agree between pages.
 *
 *   node scripts/dev/verify-test-dataset.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: join(repoRoot, '.env'), override: true });

const BASE = process.env.API_BASE_URL ?? 'http://localhost:3007';
const ADMIN = 'admin@testacademy.edu';
const STUDENT = 'student@testacademy.edu';
const TEACHER = 'teacher@testacademy.edu';

const CLASS_NAME = 'Test Class BSc CS Year 1 - Section A';
const SUBJECT_CODES = ['TEST-MATH-101', 'TEST-PHY-101', 'TEST-CS-101'];

let pass = 0;
const failures = [];

function check(page, label, ok, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  PASS  ${page.padEnd(28)} ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(`${page}: ${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${page.padEnd(28)} ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function get(path, who = ADMIN, header = 'x-institution-user-email') {
  const res = await fetch(`${BASE}/v1${path}`, { headers: { [header]: who } });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  if (!res.ok) {
    const msg = typeof body === 'object' ? JSON.stringify(body).slice(0, 200) : String(body).slice(0, 200);
    throw new Error(`GET ${path} → ${res.status} ${msg}`);
  }
  return body;
}

/** Endpoints differ between {items,total}, bare arrays and {data}. Normalise. */
function items(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data)) return body.data;
  if (Array.isArray(body?.rows)) return body.rows;
  return [];
}

const PAGE = 'page=1&pageSize=100';

async function main() {
  console.log(`\nVerifying test dataset against ${BASE}\n`);

  // --- identity / scope ------------------------------------------------------
  const me = await get('/portal/me');
  check('me (session)', 'admin resolves to Test Academy', me.institutionName === 'Test Academy', me.institutionName);

  // --- Campuses page ---------------------------------------------------------
  const campuses = items(await get(`/portal/campuses?${PAGE}`));
  const campus = campuses.find((c) => c.code === 'TEST-MAIN');
  check('/campuses', 'Test Main Campus listed', Boolean(campus), campus?.name);

  // --- Academics ▸ Years -----------------------------------------------------
  const years = items(await get(`/portal/academics/academic-years?${PAGE}`));
  const year = years.find((y) => y.name === 'Test Year 2026-2027');
  check('/academics/years', 'Test Year 2026-2027 listed & current', Boolean(year) && year.isCurrent === true);

  // --- Academics ▸ Terms (semesters) ----------------------------------------
  const terms = items(await get(`/portal/academics/academic-terms?${PAGE}`));
  const sem1 = terms.find((t) => t.name === 'Test Semester 1');
  const sem2 = terms.find((t) => t.name === 'Test Semester 2');
  check('/academics/terms', 'both semesters listed', Boolean(sem1 && sem2));
  check('/academics/terms', 'Semester 1 is kind=semester, seq 1, current',
    sem1?.kind === 'semester' && sem1?.sequence === 1 && sem1?.isCurrent === true);
  check('/academics/terms', 'semesters linked to the test year', sem1?.academicYearId === year?.id && sem2?.academicYearId === year?.id);

  // --- Academics ▸ Departments (programmes) ---------------------------------
  const departments = items(await get(`/portal/academics/departments?${PAGE}`));
  const programme = departments.find((d) => d.code === 'TEST-BSCCS');
  check('/academics/departments', 'Test Programme listed', Boolean(programme), programme?.name);
  check('/academics/departments', 'term system = semester', programme?.termSystem === 'semester');

  // --- Academics ▸ Grades ----------------------------------------------------
  const grades = items(await get(`/portal/academics/grade-levels?${PAGE}`));
  const grade = grades.find((g) => g.name === 'Test Year 1');
  check('/academics/grades', 'Test Year 1 listed', Boolean(grade));
  check('/academics/grades', 'grade level linked to programme', grade?.departmentId === programme?.id);

  // --- programme ▸ year link -------------------------------------------------
  const levels = items(await get(`/portal/academics/department-grade-levels?${PAGE}`));
  const level = levels.find((l) => l.departmentId === programme?.id && l.gradeLevelId === grade?.id);
  check('/academics (prog. levels)', 'programme year 1 link exists', Boolean(level));

  // --- Academics ▸ Subjects --------------------------------------------------
  const subjects = items(await get(`/portal/academics/subjects?${PAGE}`));
  const testSubjects = subjects.filter((s) => SUBJECT_CODES.includes(s.code));
  check('/academics/subjects', 'all 3 test subjects listed', testSubjects.length === 3,
    testSubjects.map((s) => s.code).join(', '));
  check('/academics/subjects', 'subjects linked to programme',
    testSubjects.every((s) => s.departmentId === programme?.id));

  // --- curriculum (programme subjects) --------------------------------------
  const progSubjects = items(await get(`/portal/academics/programme-subjects?programmeLevelId=${level?.id}&${PAGE}`));
  check('/academics (curriculum)', '3 subjects mapped to semester 1',
    progSubjects.filter((p) => p.semesterSequence === 1).length === 3);

  // --- Academics ▸ Programme structure --------------------------------------
  const structure = await get('/portal/academics/programme-structure');
  const node = (Array.isArray(structure) ? structure : items(structure)).find((d) => d.code === 'TEST-BSCCS');
  const structLevel = node?.levels?.[0];
  const structTerm = structLevel?.terms?.find((t) => t.name === 'Test Semester 1');
  check('/academics/programme-structure', 'programme → year → semester tree renders',
    Boolean(node && structLevel && structTerm));
  check('/academics/programme-structure', 'semester 1 shows 3 curriculum subjects',
    structTerm?.subjects?.length === 3);
  check('/academics/programme-structure', 'semester 1 shows the section with 1 student & 3 subjects',
    structTerm?.sections?.length === 1 &&
      structTerm.sections[0].studentCount === 1 &&
      structTerm.sections[0].subjectCount === 3,
    structTerm?.sections?.[0] &&
      `students=${structTerm.sections[0].studentCount} subjects=${structTerm.sections[0].subjectCount}`);

  // --- Academics ▸ Classes ---------------------------------------------------
  const classes = items(await get(`/portal/academics/classes?${PAGE}`));
  const cls = classes.find((c) => c.name === CLASS_NAME);
  check('/academics/classes', 'test class listed', Boolean(cls));
  check('/academics/classes', 'class row shows year, semester, programme, teacher',
    cls?.academicYearName === 'Test Year 2026-2027' &&
      cls?.termName === 'Test Semester 1' &&
      cls?.departmentName === 'Test Programme: BSc Computer Science' &&
      cls?.classTeacherName?.includes('Test Teacher'),
    `${cls?.academicYearName} / ${cls?.termName} / ${cls?.classTeacherName}`);
  check('/academics/classes', 'class shows 1 student & 3 subjects',
    cls?.studentCount === 1 && cls?.subjectCount === 3,
    `students=${cls?.studentCount} subjects=${cls?.subjectCount}`);

  const roster = items(await get(`/portal/academics/classes/${cls.id}/roster`));
  check('/academics/classes (roster)', 'Test Student on the roster',
    roster.length === 1 && roster[0].admissionNo === 'TEST-STU-0001',
    roster[0] && `${roster[0].firstName} ${roster[0].lastName}`);

  const classSubjects = items(await get(`/portal/academics/classes/${cls.id}/subjects`));
  const teacherStaffId = classSubjects[0]?.teacherId;
  check('/academics/classes (subjects)', 'all 3 subjects taught by Test Teacher',
    classSubjects.length === 3 && classSubjects.every((cs) => (cs.teacherName ?? '').includes('Test Teacher')),
    classSubjects.map((cs) => cs.subjectCode ?? cs.code).join(', '));

  const curriculum = items(await get(`/portal/academics/classes/${cls.id}/curriculum`));
  check('/academics/classes (curriculum)', 'class resolves its 3 curriculum subjects', curriculum.length === 3);

  // --- Courses page ----------------------------------------------------------
  const courses = items(await get(`/portal/courses?${PAGE}`));
  const testCourses = courses.filter((c) => SUBJECT_CODES.includes(c.code));
  check('/courses', 'all 3 test courses listed', testCourses.length === 3,
    testCourses.map((c) => c.code).join(', '));
  check('/courses', 'courses bound to Semester 1 and Test Teacher',
    testCourses.every((c) => c.termId === sem1?.id && c.professorTeacherId));

  // --- Timetable page --------------------------------------------------------
  const timetable = items(await get(`/portal/timetable?classId=${cls.id}&${PAGE}`));
  const teaching = timetable.filter((t) => t.kind === 'teaching');
  check('/timetable', '35 weekly slots for the class', timetable.length === 35, `${timetable.length} slots`);
  check('/timetable', '25 teaching slots, all with subject + teacher + room',
    teaching.length === 25 && teaching.every((t) => t.subjectId && t.teacherId && t.room === 'Test Room 101'));
  check('/timetable', 'break + lunch present each day',
    timetable.filter((t) => t.kind === 'break').length === 5 &&
      timetable.filter((t) => t.kind === 'lunch').length === 5);
  const ttSubjectIds = new Set(teaching.map((t) => t.subjectId));
  check('/timetable', 'only the 3 class subjects are scheduled',
    ttSubjectIds.size === 3 && [...ttSubjectIds].every((id) => testSubjects.some((s) => s.id === id)));
  const perSubject = {};
  for (const t of teaching) perSubject[t.subjectId] = (perSubject[t.subjectId] ?? 0) + 1;
  check('/timetable', 'weekly periods match each subject quota',
    testSubjects.every((s) => perSubject[s.id] === s.weeklyPeriods),
    testSubjects.map((s) => `${s.code}=${perSubject[s.id]}/${s.weeklyPeriods}`).join(' '));

  // Monday agenda — the "day" view the live-changes panel reads.
  // The resolver emits teaching periods only (break/lunch are excluded by design).
  const monday = await get(`/portal/timetable/day?classId=${cls.id}&date=2026-08-17`);
  const mondayPeriods = monday.occurrences ?? [];
  check('/timetable (day view)', 'a Monday inside the semester resolves 5 teaching periods',
    mondayPeriods.length === 5, `${mondayPeriods.length} periods`);
  // Note: the portal's buildResolveInput passes subjectName/teacherName as null, so the
  // resolver falls back to the slot label and "Unassigned" for DISPLAY. The ids it returns are
  // the real ones, so that is what consistency is asserted on here.
  const subjectIdsById = new Set(testSubjects.map((x) => x.id));
  check('/timetable (day view)', 'every Monday period resolves to a test subject + the test teacher',
    mondayPeriods.length > 0 &&
      mondayPeriods.every((o) => subjectIdsById.has(o.subject?.id) && o.teacher?.id === teacherStaffId),
    `${mondayPeriods.length} periods, all linked`);

  // --- Students page ---------------------------------------------------------
  const students = items(await get(`/portal/people/students?${PAGE}`));
  const student = students.find((s) => s.admissionNo === 'TEST-STU-0001');
  check('/students', 'Test Student listed', Boolean(student));
  check('/students', 'student row shows the test class', (student?.className ?? '') === CLASS_NAME,
    student?.className);

  const profile = await get(`/portal/students/${student.id}/profile`);
  const overview = profile.overview ?? {};
  check('/students/[id]', 'profile shows the same class, year and campus',
    overview.className === CLASS_NAME &&
      overview.gradeName === 'Test Year 1' &&
      overview.campusName === 'Test Main Campus',
    `${overview.className} / ${overview.gradeName} / ${overview.campusName}`);

  // --- Staff page ------------------------------------------------------------
  const staff = items(await get(`/portal/people/staff?${PAGE}`));
  const teacher = staff.find((s) => s.employeeNo === 'TEST-EMP-0001');
  check('/staff', 'Test Teacher listed', Boolean(teacher), teacher && `${teacher.firstName} ${teacher.lastName}`);
  check('/staff', 'teacher linked to the programme/department', teacher?.departmentId === programme?.id);

  const teachingOptions = items(await get('/portal/people/staff/teaching-options'));
  check('/staff (teaching options)', 'Test Teacher offered as a class/subject teacher',
    teachingOptions.some((t) => t.id === teacher?.id));

  // --- Users page ------------------------------------------------------------
  const users = items(await get(`/portal/users?${PAGE}`));
  const byEmail = Object.fromEntries(users.map((u) => [u.email, u]));
  check('/users', 'all 3 test logins active',
    [ADMIN, TEACHER, STUDENT].every((e) => byEmail[e]?.status === 'active'),
    [ADMIN, TEACHER, STUDENT].map((e) => `${e}=${byEmail[e]?.status}`).join(' '));

  // --- Directory pickers (used by assignments, messaging, attendance…) -------
  const dirStudents = items(await get('/portal/directory/students-basic'));
  const dirStaff = items(await get('/portal/directory/staff-basic'));
  check('/directory pickers', 'student + teacher appear in directory pickers',
    dirStudents.some((s) => s.id === student.id) && dirStaff.some((s) => s.id === teacher.id));

  // --- Year/term scoped filters (the academic-context switcher) -------------
  const scopedStudents = items(
    await get(`/portal/people/students?${PAGE}&academicYearId=${year.id}&termId=${sem1.id}`),
  );
  check('/students (year+sem filter)', 'student survives the year+semester filter',
    scopedStudents.some((s) => s.id === student.id));
  const scopedStaff = items(
    await get(`/portal/people/staff?${PAGE}&academicYearId=${year.id}&termId=${sem1.id}`),
  );
  check('/staff (year+sem filter)', 'teacher survives the year+semester filter',
    scopedStaff.some((s) => s.id === teacher.id));
  const scopedClasses = items(
    await get(`/portal/academics/classes?${PAGE}&academicYearId=${year.id}&termId=${sem1.id}`),
  );
  check('/academics/classes (filter)', 'class survives the year+semester filter',
    scopedClasses.some((c) => c.id === cls.id));

  // --- Student portal (the seeded student's own view) ------------------------
  const studentMe = await get('/student/me', STUDENT, 'x-student-email');
  check('student portal /me', 'student session resolves', Boolean(studentMe));
  const studentTimetable = await get('/student/timetable?from=2026-08-17&to=2026-08-21', STUDENT, 'x-student-email');
  const studentSlots = studentTimetable.occurrences ?? items(studentTimetable.slots ?? studentTimetable);
  check('student portal timetable', 'student sees the class timetable', studentSlots.length > 0,
    `${studentSlots.length} slots`);
  const studentCourses = items(await get('/student/courses', STUDENT, 'x-student-email'));
  check('student portal courses', 'student sees the 3 enrolled courses', studentCourses.length === 3,
    studentCourses.map((c) => c.code).join(', '));

  // --- summary ---------------------------------------------------------------
  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log('\nAll admin pages show the same linked dataset.\n');
}

main().catch((err) => {
  console.error(`\nverify failed: ${err.message}\n`);
  process.exit(1);
});
