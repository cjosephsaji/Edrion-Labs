import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { closeDatabase, createDatabase, schema as s } from '@edrion/database';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: join(repoRoot, '.env'), override: true });

const TITLE = 'CST 423 Cloud Computing — Module 1 Revision Questions';
const QUESTIONS = [
  'Why is grid computing considered the predecessor of cloud computing? Explain.',
  'Differentiate the cloud deployment models with suitable examples.',
  'Explain the NIST Cloud Computing Reference Architecture with a suitable diagram.',
  'Outline the basic components of an IaaS-based cloud solution.',
  'Outline the NIST cloud computing model with a suitable diagram.',
  'Outline the interactions between the actors in the NIST model with a suitable diagram.',
  'Compare cluster, grid, and cloud computing models.',
  'Explain Platform as a Service (PaaS) as a ready-to-use environment.',
  'Explain how IaaS gives cloud consumers a high level of control and responsibility.',
  'Summarize the benefits and challenges of cloud computing.',
];
const EXTRACTED_TEXT = [
  'Toc H Institute of Science & Technology, Arakkunnam',
  'Computer Science & Engineering · Semester VII',
  'CST 423 Cloud Computing · Revision Questions · Module 1',
  ...QUESTIONS.map((question, index) => `${index + 1}. ${question}`),
].join('\n');

const addDays = (days: number) => new Date(Date.now() + days * 86_400_000);

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is not set');

  const sourcePath = process.argv[2] || process.env.MOD1_REVISION_DOCX;
  if (!sourcePath) throw new Error('Pass the Mod 1 revision.docx path as the first argument');
  const file = await readFile(sourcePath);
  const db = createDatabase({ url: databaseUrl });

  try {
    const [student] = await db
      .select()
      .from(s.students)
      .where(eq(s.students.admissionNo, 'TOCH-TEST-001'))
      .limit(1);
    if (!student) throw new Error('Alex Test Student (TOCH-TEST-001) was not found');

    const [enrollment] = await db
      .select()
      .from(s.studentEnrollments)
      .where(and(eq(s.studentEnrollments.studentId, student.id), eq(s.studentEnrollments.status, 'active')))
      .limit(1);
    if (!enrollment?.classId) throw new Error('Alex does not have an active class enrollment');

    const [classRow] = await db.select().from(s.classes).where(eq(s.classes.id, enrollment.classId)).limit(1);
    if (!classRow) throw new Error('Alex’s class was not found');

    const teacher = classRow.classTeacherId
      ? (await db.select().from(s.staff).where(eq(s.staff.id, classRow.classTeacherId)).limit(1))[0]
      : (await db.select().from(s.staff).where(eq(s.staff.institutionId, student.institutionId)).limit(1))[0];
    if (!teacher) throw new Error('No teacher is available for Alex’s class');

    const subject = await ensureSubject(db, student.institutionId, student.campusId, 'CST423', 'Cloud Computing');
    await db.insert(s.classSubjectTeachers).values({
      institutionId: student.institutionId,
      classId: classRow.id,
      subjectId: subject.id,
      teacherId: teacher.id,
    }).onConflictDoNothing();

    const object = await ensureStoredDocument(db, {
      institutionId: student.institutionId,
      ownerStaffUserId: teacher.institutionUserId,
      file,
      sourcePath,
    });

    const material = await ensureMaterial(db, {
      institutionId: student.institutionId,
      classId: classRow.id,
      teacherId: teacher.id,
      objectId: object.id,
    });
    const homework = await ensureHomework(db, {
      institutionId: student.institutionId,
      campusId: student.campusId,
      classId: classRow.id,
      subjectId: subject.id,
      teacherId: teacher.id,
      studentId: student.id,
      institutionUserId: teacher.institutionUserId,
    });
    const knowledgeItem = await ensurePetrosSource(db, {
      institutionId: student.institutionId,
      studentId: student.id,
      objectId: object.id,
      materialId: material.id,
      homeworkId: homework.id,
      teacherId: teacher.id,
    });

    const streamValues = {
      campusId: student.campusId,
      kind: 'pinned_next',
      title: 'Module 1 Cloud Computing revision assigned',
      body: `Study the teacher-uploaded “${TITLE}” sheet and prepare all 10 questions by ${homework.dueAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}. Petros can explain, quiz, compare models, and review your answers from the assigned page.`,
      topicKey: 'cst423-module-1-revision',
      requiresAck: true,
      postedBy: teacher.id,
      updatedAt: new Date(),
    };
    const [streamPost] = await db.select({ id: s.classStreamPosts.id }).from(s.classStreamPosts)
      .where(and(eq(s.classStreamPosts.institutionId, student.institutionId), eq(s.classStreamPosts.contextType, 'class'), eq(s.classStreamPosts.contextId, classRow.id), eq(s.classStreamPosts.topicKey, 'cst423-module-1-revision')))
      .limit(1);
    if (streamPost) {
      await db.update(s.classStreamPosts).set(streamValues).where(eq(s.classStreamPosts.id, streamPost.id));
    } else {
      await db.insert(s.classStreamPosts).values({
        institutionId: student.institutionId,
        contextType: 'class',
        contextId: classRow.id,
        ...streamValues,
      });
    }

    await db.insert(s.userObligations).values({
      institutionId: student.institutionId,
      studentId: student.id,
      source: 'plan_engine',
      kind: 'review',
      title: 'Study CST 423 Module 1 revision questions',
      dueAt: homework.dueAt,
      deepLink: '/materials',
      status: 'pending',
      idempotencyKey: 'alex-cst423-module1-revision',
    }).onConflictDoNothing();

    const [planner] = await db.select({ id: s.studentPlannerItems.id }).from(s.studentPlannerItems)
      .where(and(eq(s.studentPlannerItems.studentId, student.id), eq(s.studentPlannerItems.topicKey, 'cst423-module1-revision')))
      .limit(1);
    if (!planner) {
      await db.insert(s.studentPlannerItems).values({
        studentId: student.id,
        title: 'Review all 10 CST 423 Module 1 questions',
        onDate: homework.dueAt.toISOString().slice(0, 10),
        kind: 'revision',
        topicKey: 'cst423-module1-revision',
      });
    }

    await db.insert(s.feedEvents).values({
      institutionId: student.institutionId,
      campusId: student.campusId,
      studentId: student.id,
      eventKey: 'alex-cst423-module1-revision-assigned',
      type: 'announcement',
      sourceModule: 'materials',
      title: 'New Cloud Computing revision sheet',
      body: 'Your teacher assigned the Module 1 revision questions. Open Study materials and use “Teach me this page” to learn with Petros.',
      deepLink: '/materials',
      occurredAt: new Date(),
    }).onConflictDoNothing();

    console.log(JSON.stringify({
      student: `${student.firstName} ${student.lastName}`,
      teacher: `${teacher.firstName} ${teacher.lastName}`,
      class: classRow.name,
      subject: `${subject.code} ${subject.name}`,
      materialId: material.id,
      homeworkId: homework.id,
      petrosSourceId: knowledgeItem.id,
      dueAt: homework.dueAt.toISOString(),
      questions: QUESTIONS.length,
    }, null, 2));
  } finally {
    await closeDatabase();
  }
}

type Db = ReturnType<typeof createDatabase>;

async function ensureSubject(db: Db, institutionId: string, campusId: string | null, code: string, name: string) {
  const [existing] = await db.select().from(s.subjects)
    .where(and(eq(s.subjects.institutionId, institutionId), eq(s.subjects.code, code)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(s.subjects).values({ institutionId, campusId, code, name }).returning();
  if (!created) throw new Error('Could not create the Cloud Computing subject');
  return created;
}

async function ensureStoredDocument(db: Db, input: {
  institutionId: string;
  ownerStaffUserId: string | null;
  file: Buffer;
  sourcePath: string;
}) {
  const [existing] = await db.select().from(s.storageObjects)
    .where(and(eq(s.storageObjects.institutionId, input.institutionId), eq(s.storageObjects.kind, 'class_material'), eq(s.storageObjects.filename, 'Mod 1 revision.docx')))
    .limit(1);
  const storageKey = existing?.storageKey ?? `inst/${input.institutionId}/staff/${input.ownerStaffUserId ?? 'teacher'}/${randomUUID()}.bin`;
  const configuredRoot = process.env.STUDENT_STORAGE_DIR || './var/student-storage';
  const storageRoot = isAbsolute(configuredRoot) ? configuredRoot : join(repoRoot, 'apps/api', configuredRoot.replace(/^\.\//, ''));
  const targetPath = join(storageRoot, storageKey);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, input.file);
  const checksumSha256 = createHash('sha256').update(input.file).digest('hex');

  if (existing) {
    const [updated] = await db.update(s.storageObjects).set({
      ownerStaffUserId: input.ownerStaffUserId,
      storageKey,
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: input.file.length,
      checksumSha256,
      processingStatus: 'ready',
      processingError: null,
      derived: { pageCount: 1, extractedForPetros: true, sourceName: input.sourcePath.split('/').pop() },
      updatedAt: new Date(),
    }).where(eq(s.storageObjects.id, existing.id)).returning();
    return updated!;
  }

  const [created] = await db.insert(s.storageObjects).values({
    institutionId: input.institutionId,
    ownerStaffUserId: input.ownerStaffUserId,
    kind: 'class_material',
    driver: 'local',
    storageKey,
    filename: 'Mod 1 revision.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: input.file.length,
    checksumSha256,
    processingStatus: 'ready',
    derived: { pageCount: 1, extractedForPetros: true, sourceName: input.sourcePath.split('/').pop() },
  }).returning();
  if (!created) throw new Error('Could not store the revision document');
  return created;
}

async function ensureMaterial(db: Db, input: { institutionId: string; classId: string; teacherId: string; objectId: string }) {
  const [existing] = await db.select().from(s.classMaterials)
    .where(and(eq(s.classMaterials.institutionId, input.institutionId), eq(s.classMaterials.contextType, 'class'), eq(s.classMaterials.contextId, input.classId), eq(s.classMaterials.title, TITLE)))
    .limit(1);
  const values = {
    description: 'Teacher-assigned Semester VII revision sheet covering grid, cluster, cloud deployment models, NIST architecture and actors, IaaS, PaaS, benefits, and challenges. Petros teaching is available from the extracted page.',
    kindLabel: 'DOCX',
    objectId: input.objectId,
    weekNo: 1,
    postedBy: input.teacherId,
    updatedAt: new Date(),
  };
  if (existing) {
    const [updated] = await db.update(s.classMaterials).set(values).where(eq(s.classMaterials.id, existing.id)).returning();
    return updated!;
  }
  const [created] = await db.insert(s.classMaterials).values({
    institutionId: input.institutionId,
    contextType: 'class',
    contextId: input.classId,
    title: TITLE,
    ...values,
  }).returning();
  if (!created) throw new Error('Could not create the class material');
  return created;
}

async function ensureHomework(db: Db, input: {
  institutionId: string;
  campusId: string | null;
  classId: string;
  subjectId: string;
  teacherId: string;
  studentId: string;
  institutionUserId: string | null;
}) {
  const [existing] = await db.select().from(s.homework)
    .where(and(eq(s.homework.institutionId, input.institutionId), eq(s.homework.classId, input.classId), eq(s.homework.title, TITLE)))
    .limit(1);
  const dueAt = existing?.dueAt && existing.dueAt.getTime() > Date.now() ? existing.dueAt : addDays(4);
  const shared = {
    campusId: input.campusId,
    subjectId: input.subjectId,
    teacherId: input.teacherId,
    instructions: 'Study the attached Module 1 revision sheet. Prepare a concise answer outline for every question, practise the comparison and NIST diagrams, and use Petros to explain, quiz, give hints, or review your own answer. Petros should not replace your final response.',
    dueAt,
    aiPolicy: 'hints_only',
    status: 'assigned',
    assignedAt: existing?.assignedAt ?? new Date(),
    updatedBy: input.institutionUserId,
    updatedAt: new Date(),
  };
  let homework = existing;
  if (existing) {
    [homework] = await db.update(s.homework).set(shared).where(eq(s.homework.id, existing.id)).returning();
  } else {
    [homework] = await db.insert(s.homework).values({
      institutionId: input.institutionId,
      classId: input.classId,
      title: TITLE,
      createdBy: input.institutionUserId,
      ...shared,
    }).returning();
  }
  if (!homework) throw new Error('Could not create the revision homework');

  for (let index = 0; index < QUESTIONS.length; index += 1) {
    await db.insert(s.homeworkQuestions).values({
      homeworkId: homework.id,
      sequence: index + 1,
      promptText: QUESTIONS[index]!,
      maxMarks: 10,
    }).onConflictDoUpdate({
      target: [s.homeworkQuestions.homeworkId, s.homeworkQuestions.sequence],
      set: { promptText: QUESTIONS[index]!, maxMarks: 10 },
    });
  }
  await db.insert(s.homeworkAssignees).values({ homeworkId: homework.id, studentId: input.studentId }).onConflictDoNothing();
  await db.insert(s.homeworkSubmissions).values({ homeworkId: homework.id, studentId: input.studentId, status: 'assigned' }).onConflictDoNothing();
  return homework;
}

async function ensurePetrosSource(db: Db, input: {
  institutionId: string;
  studentId: string;
  objectId: string;
  materialId: string;
  homeworkId: string;
  teacherId: string;
}) {
  const [existing] = await db.select().from(s.knowledgeItems)
    .where(and(eq(s.knowledgeItems.studentId, input.studentId), eq(s.knowledgeItems.title, TITLE)))
    .limit(1);
  const origin = {
    source: 'teacher_class_material',
    classMaterialId: input.materialId,
    homeworkId: input.homeworkId,
    teacherStaffId: input.teacherId,
    assigned: true,
  };
  const shared = {
    institutionId: input.institutionId,
    studentId: input.studentId,
    kind: 'docx',
    objectIds: [input.objectId],
    origin,
    pageCount: 1,
    pagesDone: 1,
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
  if (!item) throw new Error('Could not prepare the document for Petros');

  await db.insert(s.knowledgeItemPages).values({
    itemId: item.id,
    pageIndex: 0,
    objectId: input.objectId,
    text: EXTRACTED_TEXT,
    needsConfirm: false,
    confirmedAt: new Date(),
  }).onConflictDoUpdate({
    target: [s.knowledgeItemPages.itemId, s.knowledgeItemPages.pageIndex],
    set: { objectId: input.objectId, text: EXTRACTED_TEXT, needsConfirm: false, confirmedAt: new Date(), updatedAt: new Date() },
  });
  return item;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
