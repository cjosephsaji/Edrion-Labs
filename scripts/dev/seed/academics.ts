import { and, eq } from 'drizzle-orm';
import { schema as s } from '@edrion/database';
import type { DevSeedContext } from './_context.js';
import type { InstitutionSeedResult } from './institution.js';
import type { PeopleSeedResult } from './users.js';

export interface AcademicsSeedResult {
  academicYearId: string;
  termId: string;
  classId: string;
  subjectIds: { math: string; english: string; science: string };
}

export async function seedAcademics(
  ctx: DevSeedContext,
  inst: InstitutionSeedResult,
  people: PeopleSeedResult,
): Promise<AcademicsSeedResult> {
  const { db } = ctx;
  const { institutionId, campusId } = inst;
  const yearStart = '2025-06-01';
  const yearEnd = '2026-03-31';

  const academicYearId = await upsertAcademicYear(db, institutionId, campusId, {
    name: '2025–2026',
    startDate: yearStart,
    endDate: yearEnd,
  });

  const termId = await upsertTerm(db, institutionId, campusId, academicYearId, {
    name: 'Term 1',
    startDate: '2025-06-01',
    endDate: '2025-09-30',
    sequence: 1,
  });

  const gradeLevelId = await upsertGradeLevel(db, institutionId, campusId, {
    name: 'Grade 9',
    level: 9,
  });

  const classId = await upsertClass(db, institutionId, campusId, {
    name: 'Grade 9 – A',
    section: 'A',
    academicYearId,
    termId,
    gradeLevelId,
    classTeacherId: people.classTeacherStaffId,
  });

  for (const studentId of people.studentIds) {
    await db
      .update(s.students)
      .set({ classId, gradeLevelId })
      .where(eq(s.students.id, studentId));
  }

  const math = await upsertSubject(db, institutionId, campusId, {
    code: 'MATH9',
    name: 'Mathematics',
  });
  const english = await upsertSubject(db, institutionId, campusId, {
    code: 'ENG9',
    name: 'English',
  });
  const science = await upsertSubject(db, institutionId, campusId, {
    code: 'SCI9',
    name: 'Science',
  });

  await upsertCst(db, institutionId, classId, math, people.teacherStaffId);
  await upsertCst(db, institutionId, classId, english, people.teacherStaffId);
  await upsertCst(db, institutionId, classId, science, people.classTeacherStaffId);

  return {
    academicYearId,
    termId,
    classId,
    subjectIds: { math, english, science },
  };
}

async function upsertAcademicYear(
  db: DevSeedContext['db'],
  institutionId: string,
  campusId: string,
  row: { name: string; startDate: string; endDate: string },
): Promise<string> {
  const [existing] = await db
    .select({ id: s.academicYears.id })
    .from(s.academicYears)
    .where(and(eq(s.academicYears.institutionId, institutionId), eq(s.academicYears.name, row.name)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(s.academicYears)
    .values({
      institutionId,
      campusId,
      ...row,
      isCurrent: true,
      status: 'active',
    })
    .returning({ id: s.academicYears.id });
  if (!created?.id) throw new Error('Failed to seed academic year');
  return created.id;
}

async function upsertTerm(
  db: DevSeedContext['db'],
  institutionId: string,
  campusId: string,
  academicYearId: string,
  row: { name: string; startDate: string; endDate: string; sequence: number },
): Promise<string> {
  const [existing] = await db
    .select({ id: s.academicTerms.id })
    .from(s.academicTerms)
    .where(
      and(
        eq(s.academicTerms.institutionId, institutionId),
        eq(s.academicTerms.academicYearId, academicYearId),
        eq(s.academicTerms.name, row.name),
      ),
    )
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(s.academicTerms)
    .values({ institutionId, campusId, academicYearId, ...row, status: 'active' })
    .returning({ id: s.academicTerms.id });
  if (!created?.id) throw new Error('Failed to seed academic term');
  return created.id;
}

async function upsertGradeLevel(
  db: DevSeedContext['db'],
  institutionId: string,
  campusId: string,
  row: { name: string; level: number },
): Promise<string> {
  const [existing] = await db
    .select({ id: s.gradeLevels.id })
    .from(s.gradeLevels)
    .where(and(eq(s.gradeLevels.institutionId, institutionId), eq(s.gradeLevels.level, row.level)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(s.gradeLevels)
    .values({ institutionId, campusId, ...row })
    .returning({ id: s.gradeLevels.id });
  if (!created?.id) throw new Error('Failed to seed grade level');
  return created.id;
}

async function upsertClass(
  db: DevSeedContext['db'],
  institutionId: string,
  campusId: string,
  row: {
    name: string;
    section: string;
    academicYearId: string;
    termId: string;
    gradeLevelId: string;
    classTeacherId: string;
  },
): Promise<string> {
  const [existing] = await db
    .select({ id: s.classes.id })
    .from(s.classes)
    .where(and(eq(s.classes.institutionId, institutionId), eq(s.classes.name, row.name)))
    .limit(1);
  if (existing) {
    await db
      .update(s.classes)
      .set({ classTeacherId: row.classTeacherId })
      .where(eq(s.classes.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(s.classes)
    .values({
      institutionId,
      campusId,
      ...row,
    })
    .returning({ id: s.classes.id });
  if (!created?.id) throw new Error('Failed to seed class');
  return created.id;
}

async function upsertSubject(
  db: DevSeedContext['db'],
  institutionId: string,
  campusId: string,
  row: { code: string; name: string },
): Promise<string> {
  const [existing] = await db
    .select({ id: s.subjects.id })
    .from(s.subjects)
    .where(and(eq(s.subjects.institutionId, institutionId), eq(s.subjects.code, row.code)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(s.subjects)
    .values({ institutionId, campusId, ...row })
    .returning({ id: s.subjects.id });
  if (!created?.id) throw new Error(`Failed to seed subject ${row.code}`);
  return created.id;
}

async function upsertCst(
  db: DevSeedContext['db'],
  institutionId: string,
  classId: string,
  subjectId: string,
  teacherId: string,
): Promise<void> {
  const [existing] = await db
    .select({ id: s.classSubjectTeachers.id })
    .from(s.classSubjectTeachers)
    .where(
      and(
        eq(s.classSubjectTeachers.institutionId, institutionId),
        eq(s.classSubjectTeachers.classId, classId),
        eq(s.classSubjectTeachers.subjectId, subjectId),
      ),
    )
    .limit(1);
  if (existing) return;
  await db.insert(s.classSubjectTeachers).values({
    institutionId,
    classId,
    subjectId,
    teacherId,
  });
}
