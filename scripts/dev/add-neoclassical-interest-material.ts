import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { and, desc, eq, isNotNull, or } from 'drizzle-orm';
import { closeDatabase, createDatabase, schema as s } from '@edrion/database';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: join(repoRoot, '.env'), override: true });

const DEFAULT_STUDENT_IDENTIFIER = 'student@testacademy.edu';
const TITLE = 'Neo-classical Theory of Interest';
const STORED_FILENAME = 'Neo-classical Theory of Interest.pdf';
const PAGE_TEXT = [
  [
    'Neo-Classical Theory of Interest',
    'Also called the Loanable Fund Theory of Interest.',
  ].join('\n'),
  [
    'Loanable Fund Theory of Interest',
    'The loanable theory of interest was first given by Knut Wicksell and was later explained by Pigou and other economists.',
    'According to this theory, the rate of interest is determined by loanable funds.',
  ].join('\n'),
  [
    'What is a loanable fund?',
    'Loanable funds are considered in terms of demand for loanable funds and supply of loanable funds.',
    'Professor Robertson: Interest is the price which equates the demand for loanable funds with the supply of loanable funds.',
  ].join('\n'),
  [
    'Demand for Loanable Funds',
    'Investment (capital formation)',
    'Consumption or dissaving',
    'Hoarding',
    'Equation: DLF = I + C + H',
  ].join('\n'),
  [
    'Supply of Loanable Funds',
    'Saving',
    'Bank credit',
    'Dishoarding',
    'Disinvestment',
    'Equation: SLF = S + B + DH + DI',
  ].join('\n'),
  [
    'Determination of Equilibrium of Interest Rate',
    'The diagram places the interest rate on the vertical axis and the quantity of loanable funds on the horizontal axis.',
    'The upward-sloping supply of loanable funds and downward-sloping demand for loanable funds intersect at the equilibrium interest rate and equilibrium quantity of loanable funds.',
  ].join('\n'),
  [
    'Determination of Interest in Equation Form',
    'DLF = SLF',
    'I + C + H = S + B + DH + DI',
    '(I - DI) + (H - DH) = S + B + C',
    'Net investment + net hoarding = net saving + bank credit.',
  ].join('\n'),
  [
    'Criticism',
    'Full employment',
    'Indeterminate',
    'Impracticable',
  ].join('\n'),
  'Thank you.',
] as const;

const OCR_CONFIDENCE = ['0.928', '0.972', '0.985', '0.978', '0.973', '0.955', '0.973', '0.989', '0.999'] as const;

type Db = ReturnType<typeof createDatabase>;

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const argumentsAfterSeparator = process.argv.slice(2).filter((argument) => argument !== '--');
  const sourcePath = argumentsAfterSeparator[0];
  const studentIdentifier = argumentsAfterSeparator[1] ?? DEFAULT_STUDENT_IDENTIFIER;
  if (!sourcePath) throw new Error('Pass the Neo-classical theory PDF path as the first argument');

  const file = await readFile(sourcePath);
  if (file.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error('The supplied file is not a PDF');

  const db = createDatabase({ url: databaseUrl });
  try {
    const [student] = await db
      .select()
      .from(s.students)
      .where(or(eq(s.students.email, studentIdentifier), eq(s.students.admissionNo, studentIdentifier)))
      .limit(1);
    if (!student) throw new Error(`Student ${studentIdentifier} was not found`);

    const [activeEnrollment] = await db
      .select()
      .from(s.studentEnrollments)
      .where(and(eq(s.studentEnrollments.studentId, student.id), eq(s.studentEnrollments.status, 'active')))
      .limit(1);
    const classId = activeEnrollment?.classId ?? student.classId;
    if (!classId) throw new Error(`${studentIdentifier} is not assigned to a class`);

    const [classRow] = await db.select().from(s.classes).where(eq(s.classes.id, classId)).limit(1);
    if (!classRow) throw new Error('The student class was not found');

    const teacher = classRow.classTeacherId
      ? (await db.select().from(s.staff).where(eq(s.staff.id, classRow.classTeacherId)).limit(1))[0]
      : (await db.select().from(s.staff).where(eq(s.staff.institutionId, student.institutionId)).limit(1))[0];
    if (!teacher) throw new Error('No teacher is available for the student class');

    const object = await ensureStoredPdf(db, {
      institutionId: student.institutionId,
      ownerStaffUserId: teacher.institutionUserId,
      file,
      sourcePath,
    });
    const material = await ensureClassMaterial(db, {
      institutionId: student.institutionId,
      classId,
      teacherId: teacher.id,
      objectId: object.id,
    });
    const source = await ensurePetrosSource(db, {
      institutionId: student.institutionId,
      studentId: student.id,
      teacherId: teacher.id,
      objectId: object.id,
      materialId: material.id,
    });

    console.log(JSON.stringify({
      student: `${student.firstName} ${student.lastName}`,
      studentIdentifier,
      class: classRow.name,
      teacher: `${teacher.firstName} ${teacher.lastName}`,
      materialId: material.id,
      petrosSourceId: source.id,
      pages: PAGE_TEXT.length,
      storedFilename: object.filename,
      checksumSha256: object.checksumSha256,
    }, null, 2));
  } finally {
    await closeDatabase();
  }
}

async function ensureStoredPdf(db: Db, input: {
  institutionId: string;
  ownerStaffUserId: string | null;
  file: Buffer;
  sourcePath: string;
}) {
  const [existing] = await db
    .select()
    .from(s.storageObjects)
    .where(and(
      eq(s.storageObjects.institutionId, input.institutionId),
      eq(s.storageObjects.kind, 'class_material'),
      eq(s.storageObjects.filename, STORED_FILENAME),
    ))
    .limit(1);
  const storageKey = existing?.storageKey
    ?? `inst/${input.institutionId}/staff/${input.ownerStaffUserId ?? 'teacher'}/${randomUUID()}.pdf`;
  const configuredRoot = process.env.STUDENT_STORAGE_DIR || './var/student-storage';
  const storageRoot = isAbsolute(configuredRoot)
    ? configuredRoot
    : join(repoRoot, 'apps/api', configuredRoot.replace(/^\.\//, ''));
  const targetPath = join(storageRoot, storageKey);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, input.file);

  const checksumSha256 = createHash('sha256').update(input.file).digest('hex');
  const values = {
    ownerStaffUserId: input.ownerStaffUserId,
    storageKey,
    mimeType: 'application/pdf',
    sizeBytes: input.file.length,
    checksumSha256,
    processingStatus: 'ready',
    processingError: null,
    derived: {
      pageCount: PAGE_TEXT.length,
      extractedForPetros: true,
      extractionMethod: 'ocr_verified',
      sourceName: basename(input.sourcePath),
    },
    updatedAt: new Date(),
  };
  if (existing) {
    const [updated] = await db.update(s.storageObjects).set(values).where(eq(s.storageObjects.id, existing.id)).returning();
    return updated!;
  }
  const [created] = await db.insert(s.storageObjects).values({
    institutionId: input.institutionId,
    kind: 'class_material',
    driver: 'local',
    filename: STORED_FILENAME,
    ...values,
  }).returning();
  if (!created) throw new Error('Could not store the PDF');
  return created;
}

async function ensureClassMaterial(db: Db, input: {
  institutionId: string;
  classId: string;
  teacherId: string;
  objectId: string;
}) {
  const [latestScheduledMaterial] = await db
    .select({ weekNo: s.classMaterials.weekNo })
    .from(s.classMaterials)
    .where(and(
      eq(s.classMaterials.institutionId, input.institutionId),
      eq(s.classMaterials.contextType, 'class'),
      eq(s.classMaterials.contextId, input.classId),
      isNotNull(s.classMaterials.weekNo),
    ))
    .orderBy(desc(s.classMaterials.weekNo))
    .limit(1);
  const [existing] = await db
    .select()
    .from(s.classMaterials)
    .where(and(eq(s.classMaterials.institutionId, input.institutionId), eq(s.classMaterials.title, TITLE)))
    .limit(1);
  const values = {
    contextType: 'class',
    contextId: input.classId,
    description: 'Nine-page introduction to the loanable-funds theory: demand, supply, equilibrium determination, equation form, and criticisms. OCR text is ready for Petros teaching and quizzes.',
    kindLabel: 'PDF',
    objectId: input.objectId,
    weekNo: latestScheduledMaterial?.weekNo ?? null,
    postedBy: input.teacherId,
    updatedAt: new Date(),
  };
  if (existing) {
    const [updated] = await db.update(s.classMaterials).set(values).where(eq(s.classMaterials.id, existing.id)).returning();
    return updated!;
  }
  const [created] = await db.insert(s.classMaterials).values({
    institutionId: input.institutionId,
    title: TITLE,
    ...values,
  }).returning();
  if (!created) throw new Error('Could not create the class material');
  return created;
}

async function ensurePetrosSource(db: Db, input: {
  institutionId: string;
  studentId: string;
  teacherId: string;
  objectId: string;
  materialId: string;
}) {
  const [existing] = await db
    .select()
    .from(s.knowledgeItems)
    .where(and(eq(s.knowledgeItems.studentId, input.studentId), eq(s.knowledgeItems.title, TITLE)))
    .limit(1);
  const shared = {
    institutionId: input.institutionId,
    studentId: input.studentId,
    kind: 'pdf',
    objectIds: [input.objectId],
    origin: {
      source: 'teacher_class_material',
      classMaterialId: input.materialId,
      teacherStaffId: input.teacherId,
      extractionMethod: 'ocr_verified',
    },
    pageCount: PAGE_TEXT.length,
    pagesDone: PAGE_TEXT.length,
    extractedTextReady: true,
    indexReady: true,
    aiRead: true,
    status: 'ready',
    ingestStage: 'finalizing',
    errorMessage: null,
    ingestErrorDetail: null,
    version: (existing?.version ?? 0) + 1,
    updatedAt: new Date(),
  };
  let item = existing;
  if (existing) {
    [item] = await db.update(s.knowledgeItems).set(shared).where(eq(s.knowledgeItems.id, existing.id)).returning();
  } else {
    [item] = await db.insert(s.knowledgeItems).values({ title: TITLE, ...shared }).returning();
  }
  if (!item) throw new Error('Could not prepare the PDF for Petros');

  for (let pageIndex = 0; pageIndex < PAGE_TEXT.length; pageIndex += 1) {
    await db.insert(s.knowledgeItemPages).values({
      itemId: item.id,
      pageIndex,
      objectId: input.objectId,
      text: PAGE_TEXT[pageIndex]!,
      ocrConfidence: OCR_CONFIDENCE[pageIndex],
      needsConfirm: false,
      confirmedAt: new Date(),
    }).onConflictDoUpdate({
      target: [s.knowledgeItemPages.itemId, s.knowledgeItemPages.pageIndex],
      set: {
        objectId: input.objectId,
        text: PAGE_TEXT[pageIndex]!,
        ocrConfidence: OCR_CONFIDENCE[pageIndex],
        needsConfirm: false,
        confirmedAt: new Date(),
        updatedAt: new Date(),
      },
    });
  }
  return item;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
