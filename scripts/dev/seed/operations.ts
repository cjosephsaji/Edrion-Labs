import { and, eq } from 'drizzle-orm';
import { schema as s } from '@edrion/database';
import type { DevSeedContext } from './_context.js';
import type { InstitutionSeedResult } from './institution.js';
import type { AcademicsSeedResult } from './academics.js';
import type { PeopleSeedResult } from './users.js';

function dateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

function weekdaysInRange(start: Date, count: number): Date[] {
  const out: Date[] = [];
  let cursor = new Date(start);
  while (out.length < count) {
    const dow = cursor.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(new Date(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}

export async function seedOperations(
  ctx: DevSeedContext,
  inst: InstitutionSeedResult,
  academics: AcademicsSeedResult,
  people: PeopleSeedResult,
): Promise<void> {
  const { db } = ctx;
  const { institutionId, campusId } = inst;
  const { academicYearId, termId, classId, subjectIds } = academics;

  await seedPublishedTimetableWeek(db, {
    institutionId,
    campusId,
    academicYearId,
    termId,
    classId,
    teacherStaffId: people.teacherStaffId,
    subjectIds,
  });

  await seedAttendanceWeeks(db, {
    institutionId,
    campusId,
    academicYearId,
    termId,
    classId,
    studentIds: people.studentIds,
    takenById: people.classTeacherStaffId,
  });

  await seedReleasedAssessment(db, {
    institutionId,
    campusId,
    academicYearId,
    termId,
    classId,
    studentIds: people.studentIds,
    subjectId: subjectIds.math,
  });

  await seedFeeDemand(db, {
    institutionId,
    campusId,
    academicYearId,
    studentId: people.studentIds[0],
  });

  await seedLibraryAndFlashcards(db, {
    institutionId,
    studentId: people.studentIds[0],
  });
}

async function seedPublishedTimetableWeek(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    termId: string;
    classId: string;
    teacherStaffId: string;
    subjectIds: AcademicsSeedResult['subjectIds'];
  },
): Promise<void> {
  const slots = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '09:45', subjectId: input.subjectIds.math, label: 'Period 1' },
    { dayOfWeek: 2, startTime: '09:00', endTime: '09:45', subjectId: input.subjectIds.english, label: 'Period 1' },
    { dayOfWeek: 3, startTime: '09:00', endTime: '09:45', subjectId: input.subjectIds.science, label: 'Period 1' },
    { dayOfWeek: 4, startTime: '09:00', endTime: '09:45', subjectId: input.subjectIds.math, label: 'Period 1' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '09:45', subjectId: input.subjectIds.english, label: 'Period 1' },
  ];

  for (const slot of slots) {
    const [existing] = await db
      .select({ id: s.timetableSlots.id })
      .from(s.timetableSlots)
      .where(
        and(
          eq(s.timetableSlots.classId, input.classId),
          eq(s.timetableSlots.dayOfWeek, slot.dayOfWeek),
          eq(s.timetableSlots.startTime, slot.startTime),
        ),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(s.timetableSlots).values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      academicYearId: input.academicYearId,
      termId: input.termId,
      classId: input.classId,
      subjectId: slot.subjectId,
      teacherId: input.teacherStaffId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: slot.label,
      kind: 'teaching',
      room: 'Room 9A',
      version: 1,
    });
  }
}

async function seedAttendanceWeeks(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    termId: string;
    classId: string;
    studentIds: [string, string, string];
    takenById: string;
  },
): Promise<void> {
  const start = addDays(new Date(), -21);
  const schoolDays = weekdaysInRange(start, 15);

  for (const day of schoolDays) {
    const d = dateStr(day);
    const [session] = await db
      .select({ id: s.attendanceSessions.id })
      .from(s.attendanceSessions)
      .where(
        and(
          eq(s.attendanceSessions.classId, input.classId),
          eq(s.attendanceSessions.date, d),
          eq(s.attendanceSessions.period, 'full_day'),
        ),
      )
      .limit(1);

    let sessionId = session?.id;
    if (!sessionId) {
      const [created] = await db
        .insert(s.attendanceSessions)
        .values({
          institutionId: input.institutionId,
          campusId: input.campusId,
          academicYearId: input.academicYearId,
          termId: input.termId,
          classId: input.classId,
          date: d,
          period: 'full_day',
          takenById: input.takenById,
          notes: 'Dev reset session',
        })
        .returning({ id: s.attendanceSessions.id });
      sessionId = created?.id;
    }
    if (!sessionId) continue;

    for (let i = 0; i < input.studentIds.length; i++) {
      const studentId = input.studentIds[i];
      const [rec] = await db
        .select({ id: s.attendanceRecords.id })
        .from(s.attendanceRecords)
        .where(
          and(
            eq(s.attendanceRecords.sessionId, sessionId),
            eq(s.attendanceRecords.studentId, studentId),
          ),
        )
        .limit(1);
      if (rec) continue;
      await db.insert(s.attendanceRecords).values({
        institutionId: input.institutionId,
        sessionId,
        studentId,
        status: i === 2 && schoolDays.indexOf(day) === 10 ? 'absent' : 'present',
      });
    }
  }
}

async function seedReleasedAssessment(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    termId: string;
    classId: string;
    studentIds: [string, string, string];
    subjectId: string;
  },
): Promise<void> {
  const [exam] = await db
    .select({ id: s.exams.id })
    .from(s.exams)
    .where(
      and(eq(s.exams.institutionId, input.institutionId), eq(s.exams.name, 'Unit Test 1 — Mathematics')),
    )
    .limit(1);

  let examId = exam?.id;
  if (!examId) {
    const [created] = await db
      .insert(s.exams)
      .values({
        institutionId: input.institutionId,
        campusId: input.campusId,
        academicYearId: input.academicYearId,
        termId: input.termId,
        name: 'Unit Test 1 — Mathematics',
        examType: 'unit_test',
        startDate: dateStr(addDays(new Date(), -7)),
        endDate: dateStr(addDays(new Date(), -7)),
        status: 'completed',
      })
      .returning({ id: s.exams.id });
    examId = created?.id;
  }
  if (!examId) return;

  const marks = [88, 76, 62];
  const entryIds: string[] = [];
  for (let i = 0; i < input.studentIds.length; i++) {
    const studentId = input.studentIds[i];
    const [existing] = await db
      .select({ id: s.gradeEntries.id })
      .from(s.gradeEntries)
      .where(
        and(
          eq(s.gradeEntries.studentId, studentId),
          eq(s.gradeEntries.subjectId, input.subjectId),
          eq(s.gradeEntries.examId, examId),
        ),
      )
      .limit(1);
    if (existing) {
      entryIds.push(existing.id);
      continue;
    }
    const [row] = await db
      .insert(s.gradeEntries)
      .values({
        institutionId: input.institutionId,
        campusId: input.campusId,
        studentId,
        subjectId: input.subjectId,
        examId,
        classId: input.classId,
        academicYearId: input.academicYearId,
        termId: input.termId,
        assessmentName: 'Unit Test 1',
        marksObtained: marks[i] ?? 70,
        maxMarks: 100,
        letterGrade: 'A',
        published: true,
      })
      .returning({ id: s.gradeEntries.id });
    if (row?.id) entryIds.push(row.id);
  }

  const [batch] = await db
    .select({ id: s.markReleaseBatches.id })
    .from(s.markReleaseBatches)
    .where(
      and(
        eq(s.markReleaseBatches.institutionId, input.institutionId),
        eq(s.markReleaseBatches.termId, input.termId),
      ),
    )
    .limit(1);
  if (!batch && entryIds.length) {
    await db.insert(s.markReleaseBatches).values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      termId: input.termId,
      subjectId: input.subjectId,
      scope: { classId: input.classId, assessment: 'Unit Test 1' },
      entryIds,
      status: 'released',
      releasedAt: new Date(),
    });
  }
}

async function seedFeeDemand(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    studentId: string;
  },
): Promise<void> {
  const invoiceNo = 'GWD-FEE-001';
  const [existing] = await db
    .select({ id: s.feeInvoices.id })
    .from(s.feeInvoices)
    .where(
      and(eq(s.feeInvoices.institutionId, input.institutionId), eq(s.feeInvoices.invoiceNo, invoiceNo)),
    )
    .limit(1);

  let invoiceId = existing?.id;
  if (!invoiceId) {
    const [fs] = await db
      .insert(s.feeStructures)
      .values({
        institutionId: input.institutionId,
        campusId: input.campusId,
        name: 'Term 1 Tuition',
        feeType: 'tuition',
        academicYearId: input.academicYearId,
        amount: 250_000,
        frequency: 'term',
        status: 'active',
      })
      .returning({ id: s.feeStructures.id });

    const [inv] = await db
      .insert(s.feeInvoices)
      .values({
        institutionId: input.institutionId,
        campusId: input.campusId,
        studentId: input.studentId,
        academicYearId: input.academicYearId,
        feeStructureId: fs?.id,
        invoiceNo,
        amount: 250_000,
        amountPaid: 0,
        status: 'pending',
        issueDate: dateStr(new Date()),
        dueDate: dateStr(addDays(new Date(), 14)),
        notes: 'Dev reset fee demand',
      })
      .returning({ id: s.feeInvoices.id });
    invoiceId = inv?.id;
  }
  if (!invoiceId) return;

  const lineItems = [
    { label: 'Tuition — Term 1', category: 'tuition', amountMinor: 200_000 },
    { label: 'Lab fee', category: 'lab', amountMinor: 30_000 },
    { label: 'Activity fund', category: 'other', amountMinor: 20_000 },
  ];
  for (const item of lineItems) {
    const [row] = await db
      .select({ id: s.feeInvoiceItems.id })
      .from(s.feeInvoiceItems)
      .where(and(eq(s.feeInvoiceItems.invoiceId, invoiceId), eq(s.feeInvoiceItems.label, item.label)))
      .limit(1);
    if (row) continue;
    await db.insert(s.feeInvoiceItems).values({
      institutionId: input.institutionId,
      invoiceId,
      studentId: input.studentId,
      kind: 'charge',
      category: item.category,
      label: item.label,
      amountMinor: item.amountMinor,
    });
  }
}

async function seedLibraryAndFlashcards(
  db: DevSeedContext['db'],
  input: { institutionId: string; studentId: string },
): Promise<void> {
  const materials = [
    { title: 'NCERT Mathematics — Grade 9', kind: 'pdf', fixture: 'pending' as const },
    { title: 'Mathematics Method Notes', kind: 'notes', fixture: 'ready_math' as const },
    { title: 'Science Fundamentals Notes', kind: 'notes', fixture: 'ready' as const },
    { title: 'English Grammar Workbook', kind: 'pdf', fixture: 'neutral' as const },
  ];

  const itemIds: string[] = [];
  for (const mat of materials) {
    const [existing] = await db
      .select({ id: s.knowledgeItems.id })
      .from(s.knowledgeItems)
      .where(
        and(
          eq(s.knowledgeItems.studentId, input.studentId),
          eq(s.knowledgeItems.title, mat.title),
        ),
      )
      .limit(1);
    if (existing) {
      itemIds.push(existing.id);
      await applyPetrosDocumentFixture(db, {
        institutionId: input.institutionId,
        studentId: input.studentId,
        itemId: existing.id,
        title: mat.title,
        fixture: mat.fixture,
      });
      continue;
    }
    const [row] = await db
      .insert(s.knowledgeItems)
      .values({
        institutionId: input.institutionId,
        studentId: input.studentId,
        kind: mat.kind,
        title: mat.title,
        status: 'ready',
      })
      .returning({ id: s.knowledgeItems.id });
    if (row?.id) itemIds.push(row.id);
    if (row?.id) {
      await applyPetrosDocumentFixture(db, {
        institutionId: input.institutionId,
        studentId: input.studentId,
        itemId: row.id,
        title: mat.title,
        fixture: mat.fixture,
      });
    }
  }

  const [deckExisting] = await db
    .select({ id: s.flashcardDecks.id })
    .from(s.flashcardDecks)
    .where(
      and(eq(s.flashcardDecks.studentId, input.studentId), eq(s.flashcardDecks.title, 'Grade 9 — Revision')),
    )
    .limit(1);

  let deckId = deckExisting?.id;
  if (!deckId) {
    const [deck] = await db
      .insert(s.flashcardDecks)
      .values({
        institutionId: input.institutionId,
        studentId: input.studentId,
        itemId: itemIds[0],
        title: 'Grade 9 — Revision',
        fromLabel: 'dev-reset',
      })
      .returning({ id: s.flashcardDecks.id });
    deckId = deck?.id;
  }
  if (!deckId) return;

  const dueOffsets = [0, 2, 5];
  const cards = [
    { sequence: 1, prompt: 'What is (a+b)²?', answer: 'a² + 2ab + b²' },
    { sequence: 2, prompt: 'Define photosynthesis.', answer: 'Plants convert light to chemical energy.' },
    { sequence: 3, prompt: 'Past tense of "go"?', answer: 'went' },
  ];

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const [existing] = await db
      .select({ id: s.flashcards.id })
      .from(s.flashcards)
      .where(and(eq(s.flashcards.deckId, deckId), eq(s.flashcards.sequence, card.sequence)))
      .limit(1);
    if (existing) continue;
    await db.insert(s.flashcards).values({
      deckId,
      sequence: card.sequence,
      prompt: card.prompt,
      answer: card.answer,
      nextDueAt: addDays(new Date(), dueOffsets[i] ?? 0),
    });
  }
}

async function applyPetrosDocumentFixture(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    studentId: string;
    itemId: string;
    title: string;
    fixture: 'ready' | 'ready_math' | 'pending' | 'neutral';
  },
): Promise<void> {
  if (input.fixture === 'neutral') return;
  if (input.fixture === 'pending') {
    await db
      .update(s.knowledgeItems)
      .set({
        status: 'reading',
        pageCount: 12,
        pagesDone: 4,
        extractedTextReady: false,
        indexReady: false,
        ingestStage: 'extracting',
        version: 2,
      })
      .where(eq(s.knowledgeItems.id, input.itemId));
    return;
  }

  const mathematics = input.fixture === 'ready_math';
  const storageKey = mathematics
    ? 'seed/petros-stage8/mathematics-method-notes.pdf'
    : 'seed/petros-stage8/science-fundamentals-notes.pdf';
  const [stored] = await db
    .select({ id: s.storageObjects.id })
    .from(s.storageObjects)
    .where(and(eq(s.storageObjects.institutionId, input.institutionId), eq(s.storageObjects.storageKey, storageKey)))
    .limit(1);
  let objectId = stored?.id;
  if (!objectId) {
    const [created] = await db
      .insert(s.storageObjects)
      .values({
        institutionId: input.institutionId,
        ownerStudentId: input.studentId,
        kind: 'petros-stage8-fixture',
        driver: 'local',
        storageKey,
        filename: mathematics ? 'mathematics-method-notes.pdf' : 'science-fundamentals-notes.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 16_384,
        processingStatus: 'ready',
      })
      .returning({ id: s.storageObjects.id });
    objectId = created?.id;
  }
  if (!objectId) throw new Error('Failed to create the Stage 8 document fixture object.');

  await db
    .update(s.knowledgeItems)
    .set({
      status: 'ready',
      pageCount: 3,
      pagesDone: 3,
      extractedTextReady: true,
      indexReady: true,
      aiRead: true,
      objectIds: [objectId],
      ingestStage: 'finalizing',
      version: 2,
    })
    .where(eq(s.knowledgeItems.id, input.itemId));

  const pages = mathematics
    ? [
        'For a linear equation, preserve equality by applying the same reversible operation to both sides.',
        'Choose the smallest operation that isolates the unknown. Check the result by substituting it into the original equation.',
        'In an exam-shaped answer, state the operation, show the transformed equation, and finish with a substitution check.',
      ]
    : [
        'Photosynthesis stores light energy as chemical energy. Chlorophyll absorbs light most strongly in the blue and red regions.',
        'In the light-dependent reactions, water is split and oxygen is released. ATP and NADPH carry energy to the next stage.',
        'The Calvin cycle uses carbon dioxide, ATP, and NADPH to build carbohydrate molecules. It does not directly require light.',
      ];
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const [existing] = await db
      .select({ id: s.knowledgeItemPages.id })
      .from(s.knowledgeItemPages)
      .where(and(eq(s.knowledgeItemPages.itemId, input.itemId), eq(s.knowledgeItemPages.pageIndex, pageIndex)))
      .limit(1);
    if (existing) {
      await db
        .update(s.knowledgeItemPages)
        .set({ objectId, text: pages[pageIndex]!, updatedAt: new Date() })
        .where(eq(s.knowledgeItemPages.id, existing.id));
    } else {
      await db.insert(s.knowledgeItemPages).values({
        itemId: input.itemId,
        pageIndex,
        objectId,
        text: pages[pageIndex]!,
      });
    }
  }
}
