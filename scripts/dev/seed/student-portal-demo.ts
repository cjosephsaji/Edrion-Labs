import { and, eq, isNull } from 'drizzle-orm';
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

export async function seedStudentPortalDemo(
  ctx: DevSeedContext,
  inst: InstitutionSeedResult,
  academics: AcademicsSeedResult,
  people: PeopleSeedResult,
): Promise<void> {
  const { db } = ctx;
  const { institutionId, campusId } = inst;
  const { academicYearId, termId, classId, subjectIds } = academics;
  const primaryStudentId = people.studentIds[0];

  await db
    .update(s.academicTerms)
    .set({ isCurrent: true })
    .where(eq(s.academicTerms.id, termId));

  await db
    .insert(s.attendancePolicies)
    .values({
      institutionId,
      campusId: null,
      thresholdPct: '75',
      safeMarginPct: '5',
      parentVisibility: 'on',
    })
    .onConflictDoNothing();

  await seedAttendanceRollups(db, {
    institutionId,
    termId,
    studentId: primaryStudentId,
    subjectIds,
  });

  await seedHomework(db, {
    institutionId,
    campusId,
    academicYearId,
    termId,
    classId,
    teacherStaffId: people.teacherStaffId,
    subjectIds,
    studentIds: people.studentIds,
  });

  await seedAssignments(db, {
    institutionId,
    campusId,
    academicYearId,
    termId,
    classId,
    teacherStaffId: people.teacherStaffId,
    subjectIds,
    studentIds: people.studentIds,
  });

  await seedCurrentTimetable(db, {
    institutionId,
    campusId,
    academicYearId,
    termId,
    classId,
    teacherStaffId: people.teacherStaffId,
    classTeacherStaffId: people.classTeacherStaffId,
    subjectIds,
  });

  await seedCalendarAndExams(db, {
    institutionId,
    campusId,
    academicYearId,
    termId,
    classId,
    subjectIds,
  });

  await seedOnlineExam(db, {
    institutionId,
    campusId,
    academicYearId,
    termId,
    classId,
    studentId: primaryStudentId,
    subjectId: subjectIds.science,
  });

  await seedAdditionalResults(db, {
    institutionId,
    campusId,
    academicYearId,
    termId,
    classId,
    studentId: primaryStudentId,
    subjectIds,
  });

  await seedFeedAndStream(db, {
    institutionId,
    campusId,
    classId,
    studentId: primaryStudentId,
    teacherStaffId: people.teacherStaffId,
  });

  await seedCoursesAndMaterials(db, {
    institutionId,
    campusId,
    termId,
    classId,
    studentId: primaryStudentId,
    teacherStaffId: people.teacherStaffId,
    subjectIds,
  });

  await seedDocumentsAndReports(db, {
    institutionId,
    campusId,
    academicYearId,
    termId,
    studentId: primaryStudentId,
  });

  await seedStudentRequests(db, {
    institutionId,
    campusId,
    studentId: primaryStudentId,
  });

  await seedTransport(db, {
    institutionId,
    campusId,
    studentId: primaryStudentId,
  });

  await seedAnnouncements(db, { institutionId, campusId });
}

async function seedAttendanceRollups(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    termId: string;
    studentId: string;
    subjectIds: AcademicsSeedResult['subjectIds'];
  },
): Promise<void> {
  const rollupBase = {
    institutionId: input.institutionId,
    termId: input.termId,
    studentId: input.studentId,
    forecast: { branch: 'can_miss' as const, n: 2 },
    zone: 'safe' as const,
  };

  const rows = [
    { ...rollupBase, subjectId: null, attended: 14, conducted: 15, remaining: 5, pct: '93.33' },
    { ...rollupBase, subjectId: input.subjectIds.math, attended: 14, conducted: 15, remaining: 5, pct: '93.33' },
    { ...rollupBase, subjectId: input.subjectIds.english, attended: 13, conducted: 15, remaining: 5, pct: '86.67' },
    {
      ...rollupBase,
      subjectId: input.subjectIds.science,
      attended: 10,
      conducted: 15,
      remaining: 5,
      pct: '66.67',
      zone: 'warning' as const,
    },
  ];

  for (const row of rows) {
    const subjectCond = row.subjectId
      ? eq(s.attendanceRollups.subjectId, row.subjectId)
      : isNull(s.attendanceRollups.subjectId);
    const [existing] = await db
      .select({ id: s.attendanceRollups.id })
      .from(s.attendanceRollups)
      .where(
        and(
          eq(s.attendanceRollups.studentId, input.studentId),
          eq(s.attendanceRollups.termId, input.termId),
          subjectCond,
        ),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(s.attendanceRollups).values(row);
  }
}

async function seedHomework(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    termId: string;
    classId: string;
    teacherStaffId: string;
    subjectIds: AcademicsSeedResult['subjectIds'];
    studentIds: [string, string, string];
  },
): Promise<void> {
  const homeworkDefs = [
    {
      title: 'Algebra worksheet — linear equations',
      subjectId: input.subjectIds.math,
      dueAt: addDays(new Date(), 2),
      instructions: 'Complete exercises 1–12 from Chapter 4. Show all working.',
      questions: [
        { sequence: 1, promptText: 'Solve for x: 3x + 7 = 22', maxMarks: 5 },
        { sequence: 2, promptText: 'Graph y = 2x − 3 for x from −2 to 4.', maxMarks: 10 },
      ],
      submissionStatus: 'assigned' as const,
    },
    {
      title: 'Essay draft — character analysis',
      subjectId: input.subjectIds.english,
      dueAt: addDays(new Date(), 5),
      instructions: 'Write 400–500 words on the protagonist of your class novel.',
      questions: [{ sequence: 1, promptText: 'Upload your essay draft (PDF or DOCX).', maxMarks: 20 }],
      submissionStatus: 'in_progress' as const,
    },
    {
      title: 'Lab report — photosynthesis',
      subjectId: input.subjectIds.science,
      dueAt: addDays(new Date(), -3),
      instructions: 'Submit observations from the leaf starch test practical.',
      questions: [
        { sequence: 1, promptText: 'Describe your experimental setup.', maxMarks: 8 },
        { sequence: 2, promptText: 'Explain your results with a labelled diagram.', maxMarks: 12 },
      ],
      submissionStatus: 'returned' as const,
      totalMarks: 17,
      totalMax: 20,
      teacherNote: 'Good observations — expand the conclusion section.',
    },
  ];

  for (const def of homeworkDefs) {
    const [existing] = await db
      .select({ id: s.homework.id })
      .from(s.homework)
      .where(and(eq(s.homework.institutionId, input.institutionId), eq(s.homework.title, def.title)))
      .limit(1);

    let homeworkId = existing?.id;
    if (!homeworkId) {
      const [created] = await db
        .insert(s.homework)
        .values({
          institutionId: input.institutionId,
          campusId: input.campusId,
          classId: input.classId,
          academicYearId: input.academicYearId,
          termId: input.termId,
          subjectId: def.subjectId,
          teacherId: input.teacherStaffId,
          title: def.title,
          instructions: def.instructions,
          dueAt: def.dueAt,
          status: 'assigned',
          assignedAt: addDays(new Date(), -2),
          aiPolicy: 'off',
        })
        .returning({ id: s.homework.id });
      homeworkId = created?.id;
    }
    if (!homeworkId) continue;

    for (const q of def.questions) {
      const [qExisting] = await db
        .select({ id: s.homeworkQuestions.id })
        .from(s.homeworkQuestions)
        .where(
          and(eq(s.homeworkQuestions.homeworkId, homeworkId), eq(s.homeworkQuestions.sequence, q.sequence)),
        )
        .limit(1);
      if (!qExisting) {
        await db.insert(s.homeworkQuestions).values({ homeworkId, ...q });
      }
    }

    for (const studentId of input.studentIds) {
      const [sub] = await db
        .select({ id: s.homeworkSubmissions.id })
        .from(s.homeworkSubmissions)
        .where(
          and(eq(s.homeworkSubmissions.homeworkId, homeworkId), eq(s.homeworkSubmissions.studentId, studentId)),
        )
        .limit(1);
      if (sub) continue;

      const isPrimary = studentId === input.studentIds[0];
      await db.insert(s.homeworkSubmissions).values({
        homeworkId,
        studentId,
        status: isPrimary ? def.submissionStatus : 'assigned',
        submittedAt: def.submissionStatus === 'returned' ? addDays(new Date(), -1) : null,
        returnedAt: def.submissionStatus === 'returned' ? new Date() : null,
        totalMarks: isPrimary ? (def.totalMarks ?? null) : null,
        totalMax: isPrimary ? (def.totalMax ?? null) : null,
        teacherNote: isPrimary ? (def.teacherNote ?? null) : null,
      });
    }
  }
}

async function seedAssignments(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    termId: string;
    classId: string;
    teacherStaffId: string;
    subjectIds: AcademicsSeedResult['subjectIds'];
    studentIds: [string, string, string];
  },
): Promise<void> {
  const defs = [
    {
      title: 'Mathematics investigation — linear patterns',
      subjectId: input.subjectIds.math,
      dueDate: dateStr(addDays(new Date(), 3)),
      instructions: 'Create a one-page investigation showing how a number pattern becomes a linear equation.',
      maxPoints: 25,
      submissionStatus: 'assigned' as const,
      allowResubmission: true,
    },
    {
      title: 'English seminar response',
      subjectId: input.subjectIds.english,
      dueDate: dateStr(addDays(new Date(), 6)),
      instructions: 'Upload your response to the seminar prompt with one quoted example and one personal observation.',
      maxPoints: 20,
      submissionStatus: 'submitted' as const,
      submittedDate: dateStr(addDays(new Date(), -1)),
      versionNote: 'First complete draft uploaded for review.',
    },
    {
      title: 'Science concept map — ecosystems',
      subjectId: input.subjectIds.science,
      dueDate: dateStr(addDays(new Date(), -4)),
      instructions: 'Submit a concept map connecting producers, consumers, decomposers, and energy flow.',
      maxPoints: 30,
      submissionStatus: 'graded' as const,
      submittedDate: dateStr(addDays(new Date(), -5)),
      pointsAwarded: 26,
      feedback: 'Clear structure and strong examples. Add arrows for energy direction next time.',
      versionNote: 'Final concept map submitted.',
    },
  ];

  for (const def of defs) {
    const [existing] = await db
      .select({ id: s.assignments.id })
      .from(s.assignments)
      .where(and(eq(s.assignments.institutionId, input.institutionId), eq(s.assignments.title, def.title)))
      .limit(1);

    let assignmentId = existing?.id;
    if (!assignmentId) {
      const [created] = await db
        .insert(s.assignments)
        .values({
          institutionId: input.institutionId,
          campusId: input.campusId,
          academicYearId: input.academicYearId,
          termId: input.termId,
          classId: input.classId,
          subjectId: def.subjectId,
          teacherId: input.teacherStaffId,
          title: def.title,
          instructions: def.instructions,
          dueDate: def.dueDate,
          maxPoints: def.maxPoints,
          status: 'published',
          allowResubmission: def.allowResubmission ?? false,
          aiPolicy: 'allowed_with_citation',
          deliveryMode: 'file',
          audience: [{ kind: 'class', refId: input.classId }],
        })
        .returning({ id: s.assignments.id });
      assignmentId = created?.id;
    }
    if (!assignmentId) continue;

    for (const studentId of input.studentIds) {
      await db
        .insert(s.assignmentAssignees)
        .values({ assignmentId, studentId })
        .onConflictDoNothing();
    }

    const [submission] = await db
      .select({ id: s.assignmentSubmissions.id })
      .from(s.assignmentSubmissions)
      .where(
        and(
          eq(s.assignmentSubmissions.assignmentId, assignmentId),
          eq(s.assignmentSubmissions.studentId, input.studentIds[0]),
        ),
      )
      .limit(1);

    let submissionId = submission?.id;
    if (!submissionId) {
      const [created] = await db
        .insert(s.assignmentSubmissions)
        .values({
          institutionId: input.institutionId,
          assignmentId,
          studentId: input.studentIds[0],
          status: def.submissionStatus,
          submittedDate: def.submittedDate ?? null,
          pointsAwarded: def.pointsAwarded ?? null,
          feedback: def.feedback ?? null,
        })
        .returning({ id: s.assignmentSubmissions.id });
      submissionId = created?.id;
    }
    if (!submissionId || def.submissionStatus === 'assigned') continue;

    await db
      .insert(s.assignmentSubmissionVersions)
      .values({
        submissionId,
        versionNo: 1,
        fileObjectIds: [],
        note: def.versionNote ?? 'Submitted from demo seed.',
        submittedAt: addDays(new Date(), def.submissionStatus === 'graded' ? -5 : -1),
        late: false,
      })
      .onConflictDoNothing();
  }
}

async function seedCurrentTimetable(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    termId: string;
    classId: string;
    teacherStaffId: string;
    classTeacherStaffId: string;
    subjectIds: AcademicsSeedResult['subjectIds'];
  },
): Promise<void> {
  const effectiveFrom = dateStr(addDays(new Date(), -30));
  const effectiveTo = dateStr(addDays(new Date(), 90));
  const slots = [
    { dayOfWeek: 1, startTime: '09:00', endTime: '09:45', subjectId: input.subjectIds.math, teacherId: input.teacherStaffId, label: 'Period 1', room: 'Room 9A' },
    { dayOfWeek: 1, startTime: '09:55', endTime: '10:40', subjectId: input.subjectIds.science, teacherId: input.classTeacherStaffId, label: 'Period 2', room: 'Lab 2' },
    { dayOfWeek: 1, startTime: '11:00', endTime: '11:45', subjectId: input.subjectIds.english, teacherId: input.teacherStaffId, label: 'Period 3', room: 'Room 9A' },
    { dayOfWeek: 2, startTime: '09:00', endTime: '09:45', subjectId: input.subjectIds.english, teacherId: input.teacherStaffId, label: 'Period 1', room: 'Room 9A' },
    { dayOfWeek: 2, startTime: '09:55', endTime: '10:40', subjectId: input.subjectIds.math, teacherId: input.teacherStaffId, label: 'Period 2', room: 'Room 9A' },
    { dayOfWeek: 2, startTime: '11:00', endTime: '11:45', subjectId: input.subjectIds.science, teacherId: input.classTeacherStaffId, label: 'Period 3', room: 'Lab 2' },
    { dayOfWeek: 3, startTime: '09:00', endTime: '09:45', subjectId: input.subjectIds.science, teacherId: input.classTeacherStaffId, label: 'Period 1', room: 'Lab 2' },
    { dayOfWeek: 3, startTime: '09:55', endTime: '10:40', subjectId: input.subjectIds.english, teacherId: input.teacherStaffId, label: 'Period 2', room: 'Room 9A' },
    { dayOfWeek: 3, startTime: '11:00', endTime: '11:45', subjectId: input.subjectIds.math, teacherId: input.teacherStaffId, label: 'Period 3', room: 'Room 9A' },
    { dayOfWeek: 4, startTime: '09:00', endTime: '09:45', subjectId: input.subjectIds.math, teacherId: input.teacherStaffId, label: 'Period 1', room: 'Room 9A' },
    { dayOfWeek: 4, startTime: '09:55', endTime: '10:40', subjectId: input.subjectIds.science, teacherId: input.classTeacherStaffId, label: 'Period 2', room: 'Lab 2' },
    { dayOfWeek: 4, startTime: '11:00', endTime: '11:45', subjectId: input.subjectIds.english, teacherId: input.teacherStaffId, label: 'Period 3', room: 'Room 9A' },
    { dayOfWeek: 5, startTime: '09:00', endTime: '09:45', subjectId: input.subjectIds.english, teacherId: input.teacherStaffId, label: 'Period 1', room: 'Room 9A' },
    { dayOfWeek: 5, startTime: '09:55', endTime: '10:40', subjectId: input.subjectIds.math, teacherId: input.teacherStaffId, label: 'Period 2', room: 'Room 9A' },
    { dayOfWeek: 5, startTime: '11:00', endTime: '11:45', subjectId: input.subjectIds.science, teacherId: input.classTeacherStaffId, label: 'Period 3', room: 'Lab 2' },
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
    if (existing) {
      await db
        .update(s.timetableSlots)
        .set({
          subjectId: slot.subjectId,
          teacherId: slot.teacherId,
          endTime: slot.endTime,
          label: slot.label,
          room: slot.room,
          effectiveFrom,
          effectiveTo,
        })
        .where(eq(s.timetableSlots.id, existing.id));
      continue;
    }
    await db.insert(s.timetableSlots).values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      academicYearId: input.academicYearId,
      termId: input.termId,
      classId: input.classId,
      subjectId: slot.subjectId,
      teacherId: slot.teacherId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      endTime: slot.endTime,
      label: slot.label,
      kind: 'teaching',
      room: slot.room,
      effectiveFrom,
      effectiveTo,
      version: 1,
    });
  }
}

async function seedCalendarAndExams(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    termId: string;
    classId: string;
    subjectIds: AcademicsSeedResult['subjectIds'];
  },
): Promise<void> {
  const [completedUnitTest] = await db
    .select({ id: s.exams.id })
    .from(s.exams)
    .where(
      and(
        eq(s.exams.institutionId, input.institutionId),
        eq(s.exams.name, 'Unit Test 1 — Mathematics'),
      ),
    )
    .limit(1);
  if (completedUnitTest) {
    await db
      .delete(s.examSchedules)
      .where(
        and(
          eq(s.examSchedules.examId, completedUnitTest.id),
          eq(s.examSchedules.classId, input.classId),
        ),
      );
  }

  const eventTypes = await db
    .select({ id: s.calendarEventTypes.id, key: s.calendarEventTypes.key })
    .from(s.calendarEventTypes)
    .where(eq(s.calendarEventTypes.institutionId, input.institutionId));
  const typeByKey = new Map(eventTypes.map((t) => [t.key, t.id]));

  const calendarDefs = [
    {
      referenceCode: 'GWD-EVT-PTM',
      type: 'ptm',
      title: 'Parent–Teacher Meeting',
      description: 'Grade 9 parents invited to Main Hall.',
      startsOn: dateStr(addDays(new Date(), 7)),
      startTime: '09:00',
      endTime: '13:00',
    },
    {
      referenceCode: 'GWD-EVT-SPORTS',
      type: 'activity',
      title: 'Annual Sports Day',
      description: 'Inter-house athletics on the main field.',
      startsOn: dateStr(addDays(new Date(), 14)),
      endTime: '16:00',
    },
    {
      referenceCode: 'GWD-EVT-MIDTERM',
      type: 'exam_period',
      title: 'Mid-term examinations',
      description: 'Written papers for Grade 9.',
      startsOn: dateStr(addDays(new Date(), 21)),
      endsOn: dateStr(addDays(new Date(), 25)),
    },
  ];

  for (const evt of calendarDefs) {
    const [existing] = await db
      .select({ id: s.calendarEvents.id })
      .from(s.calendarEvents)
      .where(
        and(eq(s.calendarEvents.institutionId, input.institutionId), eq(s.calendarEvents.title, evt.title)),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(s.calendarEvents).values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      eventTypeId: typeByKey.get(evt.type) ?? null,
      type: evt.type,
      title: evt.title,
      description: evt.description,
      startsOn: evt.startsOn,
      endsOn: evt.endsOn ?? evt.startsOn,
      startTime: evt.startTime ?? null,
      endTime: evt.endTime ?? null,
      status: 'published',
      audienceScope: 'institution',
    });
  }

  const [exam] = await db
    .select({ id: s.exams.id })
    .from(s.exams)
    .where(
      and(eq(s.exams.institutionId, input.institutionId), eq(s.exams.name, 'Mid-term Examination 2025–26')),
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
        name: 'Mid-term Examination 2025–26',
        examType: 'term',
        startDate: dateStr(addDays(new Date(), 21)),
        endDate: dateStr(addDays(new Date(), 25)),
        status: 'scheduled',
      })
      .returning({ id: s.exams.id });
    examId = created?.id;
  }
  if (!examId) return;

  const scheduleDefs = [
    {
      subjectId: input.subjectIds.math,
      examDate: dateStr(addDays(new Date(), 21)),
      startTime: '09:00',
      endTime: '12:00',
      room: 'Hall A',
    },
    {
      subjectId: input.subjectIds.english,
      examDate: dateStr(addDays(new Date(), 22)),
      startTime: '09:00',
      endTime: '12:00',
      room: 'Hall A',
    },
    {
      subjectId: input.subjectIds.science,
      examDate: dateStr(addDays(new Date(), 23)),
      startTime: '09:00',
      endTime: '11:30',
      room: 'Hall B',
    },
  ];

  for (const sched of scheduleDefs) {
    const [existing] = await db
      .select({ id: s.examSchedules.id })
      .from(s.examSchedules)
      .where(
        and(
          eq(s.examSchedules.examId, examId),
          eq(s.examSchedules.classId, input.classId),
          eq(s.examSchedules.subjectId, sched.subjectId),
        ),
      )
      .limit(1);
    if (existing) {
      await db
        .update(s.examSchedules)
        .set({ published: true, examDate: sched.examDate })
        .where(eq(s.examSchedules.id, existing.id));
      continue;
    }
    await db.insert(s.examSchedules).values({
      institutionId: input.institutionId,
      examId,
      classId: input.classId,
      subjectId: sched.subjectId,
      published: true,
      ...sched,
      maxMarks: 100,
      passMarks: 35,
    });
  }
}

async function seedFeedAndStream(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    classId: string;
    studentId: string;
    teacherStaffId: string;
  },
): Promise<void> {
  const feedDefs = [
    {
      eventKey: 'gwd-marks-released',
      type: 'marks_released',
      sourceModule: 'grading',
      title: 'Unit Test marks released',
      body: 'Your Mathematics Unit Test 1 marks are now available in Results.',
      deepLink: '/results',
      daysAgo: 1,
    },
    {
      eventKey: 'gwd-homework-due',
      type: 'nudge',
      sourceModule: 'homework',
      title: 'Algebra worksheet due soon',
      body: 'Linear equations worksheet is due in 2 days.',
      deepLink: '/homework',
      daysAgo: 0,
    },
    {
      eventKey: 'gwd-fee-reminder',
      type: 'nudge',
      sourceModule: 'fees',
      title: 'Term fee payment pending',
      body: 'Your Term 1 tuition invoice is due in 14 days.',
      deepLink: '/fees',
      daysAgo: 0,
    },
    {
      eventKey: 'gwd-ptm-announce',
      type: 'announcement',
      sourceModule: 'calendar',
      title: 'PTM next week',
      body: 'Parent–Teacher Meeting is scheduled for next Saturday.',
      deepLink: '/calendar',
      daysAgo: 2,
    },
  ];

  for (const evt of feedDefs) {
    const [existing] = await db
      .select({ id: s.feedEvents.id })
      .from(s.feedEvents)
      .where(
        and(eq(s.feedEvents.studentId, input.studentId), eq(s.feedEvents.eventKey, evt.eventKey)),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(s.feedEvents).values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      studentId: input.studentId,
      eventKey: evt.eventKey,
      type: evt.type,
      sourceModule: evt.sourceModule,
      title: evt.title,
      body: evt.body,
      deepLink: evt.deepLink,
      occurredAt: addDays(new Date(), -evt.daysAgo),
    });
  }

  const streamDefs = [
    {
      kind: 'announcement',
      title: 'Welcome back to Term 1',
      body: 'Please check the timetable for any room changes this week.',
      requiresAck: true,
    },
    {
      kind: 'material',
      title: 'Chapter 4 notes uploaded',
      body: 'Linear equations summary PDF is available under Materials.',
      requiresAck: false,
    },
    {
      kind: 'reminder',
      title: 'Bring lab coat on Friday',
      body: 'Science practical session — safety gear required.',
      requiresAck: false,
    },
  ];

  for (const post of streamDefs) {
    const [existing] = await db
      .select({ id: s.classStreamPosts.id })
      .from(s.classStreamPosts)
      .where(
        and(
          eq(s.classStreamPosts.institutionId, input.institutionId),
          eq(s.classStreamPosts.title, post.title),
        ),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(s.classStreamPosts).values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      contextType: 'class',
      contextId: input.classId,
      kind: post.kind,
      title: post.title,
      body: post.body,
      postedBy: input.teacherStaffId,
      requiresAck: post.requiresAck,
      postedAt: addDays(new Date(), -1),
    });
  }
}

async function seedAdditionalResults(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    termId: string;
    classId: string;
    studentId: string;
    subjectIds: AcademicsSeedResult['subjectIds'];
  },
): Promise<void> {
  const definitions = [
    {
      examName: 'Unit Test 1 — Science',
      assessmentName: 'Unit Test 1',
      subjectId: input.subjectIds.science,
      marksObtained: 84,
      letterGrade: 'A',
      remarks: null,
      daysAgo: 6,
    },
    {
      examName: 'Literature Response — English',
      assessmentName: 'Literature Response',
      subjectId: input.subjectIds.english,
      marksObtained: 91,
      letterGrade: 'A+',
      remarks: null,
      daysAgo: 4,
    },
    {
      examName: 'Petros Repair Check — Mathematics',
      assessmentName: 'Algebra checkpoint',
      subjectId: input.subjectIds.math,
      marksObtained: 41,
      letterGrade: 'D',
      remarks: 'Sign changes were inconsistent when moving terms across the equals sign.',
      daysAgo: 2,
    },
  ];

  for (const definition of definitions) {
    const [existingExam] = await db
      .select({ id: s.exams.id })
      .from(s.exams)
      .where(and(eq(s.exams.institutionId, input.institutionId), eq(s.exams.name, definition.examName)))
      .limit(1);

    let examId = existingExam?.id;
    if (!examId) {
      const examDate = dateStr(addDays(new Date(), -definition.daysAgo));
      const [createdExam] = await db
        .insert(s.exams)
        .values({
          institutionId: input.institutionId,
          campusId: input.campusId,
          academicYearId: input.academicYearId,
          termId: input.termId,
          name: definition.examName,
          examType: 'unit_test',
          startDate: examDate,
          endDate: examDate,
          status: 'completed',
        })
        .returning({ id: s.exams.id });
      examId = createdExam?.id;
    }
    if (!examId) continue;

    const [existingResult] = await db
      .select({ id: s.gradeEntries.id })
      .from(s.gradeEntries)
      .where(
        and(
          eq(s.gradeEntries.studentId, input.studentId),
          eq(s.gradeEntries.subjectId, definition.subjectId),
          eq(s.gradeEntries.examId, examId),
        ),
      )
      .limit(1);
    if (existingResult) continue;

    await db.insert(s.gradeEntries).values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      studentId: input.studentId,
      subjectId: definition.subjectId,
      examId,
      classId: input.classId,
      academicYearId: input.academicYearId,
      termId: input.termId,
      assessmentName: definition.assessmentName,
      marksObtained: definition.marksObtained,
      maxMarks: 100,
      letterGrade: definition.letterGrade,
      remarks: definition.remarks,
      published: true,
    });
  }
}

async function seedOnlineExam(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    termId: string;
    classId: string;
    studentId: string;
    subjectId: string;
  },
): Promise<void> {
  const examName = 'Online Comprehensive Practice Examination';
  const [existingExam] = await db
    .select({ id: s.exams.id })
    .from(s.exams)
    .where(and(eq(s.exams.institutionId, input.institutionId), eq(s.exams.name, examName)))
    .limit(1);

  let examId = existingExam?.id;
  if (examId) {
    await db
      .update(s.exams)
      .set({
        status: 'ongoing',
        durationMin: 45,
        startDate: dateStr(new Date()),
        endDate: dateStr(new Date()),
        description: 'A supervised online paper covering every supported answer format.',
      })
      .where(eq(s.exams.id, examId));
  } else {
    const [created] = await db
      .insert(s.exams)
      .values({
        institutionId: input.institutionId,
        campusId: input.campusId,
        academicYearId: input.academicYearId,
        termId: input.termId,
        name: examName,
        examType: 'mock',
        startDate: dateStr(new Date()),
        endDate: dateStr(new Date()),
        status: 'ongoing',
        durationMin: 45,
        description: 'A supervised online paper covering every supported answer format.',
      })
      .returning({ id: s.exams.id });
    examId = created?.id;
  }
  if (!examId) return;

  const [existingSchedule] = await db
    .select({ id: s.examSchedules.id })
    .from(s.examSchedules)
    .where(
      and(
        eq(s.examSchedules.examId, examId),
        eq(s.examSchedules.classId, input.classId),
        eq(s.examSchedules.subjectId, input.subjectId),
      ),
    )
    .limit(1);

  let scheduleId = existingSchedule?.id;
  const scheduleValues = {
    examDate: dateStr(new Date()),
    startTime: '00:01',
    endTime: '23:59',
    maxMarks: 30,
    passMarks: 12,
    room: 'Online examination room',
    hall: 'Online',
    seatInfo: 'Candidate: Aarav Sharma',
    syllabusNote: 'Read every question carefully. Answers save automatically. Submit before the timer reaches zero.',
    published: true,
  };
  if (scheduleId) {
    await db.update(s.examSchedules).set(scheduleValues).where(eq(s.examSchedules.id, scheduleId));
  } else {
    const [createdSchedule] = await db
      .insert(s.examSchedules)
      .values({
        institutionId: input.institutionId,
        examId,
        classId: input.classId,
        subjectId: input.subjectId,
        ...scheduleValues,
      })
      .returning({ id: s.examSchedules.id });
    scheduleId = createdSchedule?.id;
  }
  if (!scheduleId) return;

  // The all-types paper is reset on every dev seed so the primary demo student can
  // always exercise the complete start, autosave, resume, and submit lifecycle.
  await db
    .delete(s.examAttempts)
    .where(
      and(
        eq(s.examAttempts.examScheduleId, scheduleId),
        eq(s.examAttempts.studentId, input.studentId),
      ),
    );

  const assertionOptions = [
    { key: 'a', label: 'Both are true, and the Reason correctly explains the Assertion.' },
    { key: 'b', label: 'Both are true, but the Reason does not explain the Assertion.' },
    { key: 'c', label: 'The Assertion is true, but the Reason is false.' },
    { key: 'd', label: 'The Assertion is false, but the Reason is true.' },
  ];
  const questions = [
    {
      qtype: 'mcq_single', marks: 1,
      prompt: 'Which organelle is primarily responsible for photosynthesis?',
      options: [{ key: 'A', label: 'Mitochondrion' }, { key: 'B', label: 'Chloroplast' }, { key: 'C', label: 'Nucleus' }, { key: 'D', label: 'Ribosome' }],
      correctKey: 'B', markingNote: 'Chloroplast.', config: null,
    },
    {
      qtype: 'mcq_multi', marks: 2,
      prompt: 'Select every input required for photosynthesis.',
      options: [{ key: 'A', label: 'Carbon dioxide' }, { key: 'B', label: 'Oxygen' }, { key: 'C', label: 'Water' }, { key: 'D', label: 'Glucose' }],
      correctKey: 'A,C', markingNote: 'Carbon dioxide and water.', config: null,
    },
    {
      qtype: 'true_false', marks: 1,
      prompt: 'Photosynthesis converts light energy into chemical energy.',
      options: null, correctKey: 'true', markingNote: 'True.', config: null,
    },
    {
      qtype: 'assertion_reason', marks: 2,
      prompt: 'Choose the correct relationship between the Assertion and Reason.',
      options: assertionOptions, correctKey: 'a', markingNote: 'Both statements are true and causally linked.',
      config: { assertionReason: { assertion: 'Leaves are the main photosynthetic organs in most plants.', reason: 'Leaves contain chloroplast-rich mesophyll cells and expose a broad surface to light.' } },
    },
    {
      qtype: 'fill_blank', marks: 1,
      prompt: 'The green pigment that absorbs light energy is _____.',
      options: null, correctKey: 'chlorophyll', markingNote: 'chlorophyll',
      config: { fillBlank: { blanks: [{ key: 'blank-1', answers: ['chlorophyll'] }] } },
    },
    {
      qtype: 'numeric', marks: 2,
      prompt: 'A leaf produces 3 g of glucose per hour. How many grams are produced in 4 hours?',
      options: null, correctKey: '12', markingNote: '3 × 4 = 12 g.',
      config: { numeric: { tolerance: 0.01, unit: 'g' } },
    },
    {
      qtype: 'matching', marks: 3,
      prompt: 'Match each structure to its principal role.',
      options: null, correctKey: JSON.stringify({ L1: 'R2', L2: 'R3', L3: 'R1' }), markingNote: 'All three pairs must match.',
      config: { matching: { left: [{ key: 'L1', label: 'Stomata' }, { key: 'L2', label: 'Xylem' }, { key: 'L3', label: 'Chloroplast' }], right: [{ key: 'R1', label: 'Captures light energy' }, { key: 'R2', label: 'Gas exchange' }, { key: 'R3', label: 'Transports water' }], answerKey: { L1: 'R2', L2: 'R3', L3: 'R1' } } },
    },
    {
      qtype: 'short_answer', marks: 3,
      prompt: 'Why do plants kept in darkness eventually stop producing starch?',
      options: null, correctKey: null, markingNote: 'Explain that light is required for photosynthesis and glucose production.', config: null,
    },
    {
      qtype: 'long_answer', marks: 5,
      prompt: 'Explain the process of photosynthesis and discuss three factors that affect its rate.',
      options: null, correctKey: null, markingNote: 'Award for process, equation, and three limiting factors.', config: null,
    },
    {
      qtype: 'case_based', marks: 4,
      prompt: 'Read the investigation and answer both sub-questions.',
      options: null, correctKey: null, markingNote: 'Review the interpretation and experimental reasoning.',
      config: { caseBased: { passage: 'A student places identical pondweed samples at 10 cm, 20 cm, and 40 cm from a lamp. The bubbles counted per minute are 42, 25, and 11 respectively.', subQuestions: [{ id: 'case-1', qtype: 'mcq_single', prompt: 'Which sample had the highest photosynthesis rate?', marks: 1, options: [{ key: 'A', label: '10 cm' }, { key: 'B', label: '20 cm' }, { key: 'C', label: '40 cm' }, { key: 'D', label: 'All equal' }] }, { id: 'case-2', qtype: 'short_answer', prompt: 'Explain the pattern in the results and name one control variable.', marks: 3 }] } },
    },
    {
      qtype: 'file_upload', marks: 2,
      prompt: 'Attach a clearly labelled diagram of a chloroplast (PDF or image).',
      options: null, correctKey: null, markingNote: 'Teacher review required.',
      config: { fileUpload: { acceptMime: ['application/pdf', 'image/png', 'image/jpeg'], maxBytes: 10_000_000, maxFiles: 1 } },
    },
    {
      qtype: 'code', marks: 4,
      prompt: 'Write a function that returns glucose produced from rate and hours.',
      options: null, correctKey: null, markingNote: 'Review correctness, clarity, and edge cases.',
      config: { code: { languages: ['python', 'javascript'], starterCode: 'def glucose_produced(rate, hours):\n    # Write your solution\n    pass', referenceSolution: 'return rate * hours', allowRun: false } },
    },
  ];

  for (const [index, question] of questions.entries()) {
    const sequence = index + 1;
    const [existing] = await db
      .select({ id: s.examPaperQuestions.id })
      .from(s.examPaperQuestions)
      .where(
        and(
          eq(s.examPaperQuestions.examScheduleId, scheduleId),
          eq(s.examPaperQuestions.sequence, sequence),
        ),
      )
      .limit(1);
    const values = { ...question, sequence };
    if (existing) {
      await db.update(s.examPaperQuestions).set(values).where(eq(s.examPaperQuestions.id, existing.id));
    } else {
      await db.insert(s.examPaperQuestions).values({ examScheduleId: scheduleId, ...values });
    }
  }
}

async function seedCoursesAndMaterials(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    termId: string;
    classId: string;
    studentId: string;
    teacherStaffId: string;
    subjectIds: AcademicsSeedResult['subjectIds'];
  },
): Promise<void> {
  const objectId = await ensureStorageObject(db, {
    institutionId: input.institutionId,
    studentId: input.studentId,
    key: 'demo/materials/grade-9-learning-pack.pdf',
    filename: 'grade-9-learning-pack.pdf',
    mimeType: 'application/pdf',
  });

  const classMaterials = [
    { title: 'Linear equations worked examples', description: 'Teacher annotations for this week.', kindLabel: 'PDF', weekNo: 4 },
    { title: 'Photosynthesis lab safety sheet', description: 'Read before Friday practical.', kindLabel: 'Checklist', weekNo: 4 },
    { title: 'English seminar discussion prompts', description: 'Use these prompts to prepare your seminar response.', kindLabel: 'Notes', weekNo: 5 },
  ];
  for (const mat of classMaterials) {
    await seedMaterial(db, {
      institutionId: input.institutionId,
      contextType: 'class',
      contextId: input.classId,
      title: mat.title,
      description: mat.description,
      kindLabel: mat.kindLabel,
      objectId,
      weekNo: mat.weekNo,
      postedBy: input.teacherStaffId,
    });
  }

  const courseId = await upsertCourse(db, {
    institutionId: input.institutionId,
    campusId: input.campusId,
    termId: input.termId,
    code: 'FOUND9',
    name: 'Foundation Study Skills',
    teacherStaffId: input.teacherStaffId,
  });
  if (!courseId) return;

  await db
    .insert(s.courseEnrollments)
    .values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      courseId,
      studentId: input.studentId,
    })
    .onConflictDoNothing();

  const modules = [
    { weekNo: 1, title: 'Planning a study week', topics: ['Calendar habits', 'Task breakdown'], covered: true },
    { weekNo: 2, title: 'Revision loops', topics: ['Recall', 'Spacing', 'Error logs'], covered: true },
    { weekNo: 3, title: 'Exam readiness', topics: ['Mock timing', 'Post-paper review'], covered: false },
  ];
  for (const mod of modules) {
    await db
      .insert(s.courseSyllabusModules)
      .values({ courseId, ...mod, coveredAt: mod.covered ? addDays(new Date(), -7 + mod.weekNo) : null })
      .onConflictDoNothing();
  }

  await seedMaterial(db, {
    institutionId: input.institutionId,
    contextType: 'course',
    contextId: courseId,
    title: 'Weekly planner template',
    description: 'Reusable planning sheet for assignments, tests, and revision.',
    kindLabel: 'Template',
    objectId,
    weekNo: 1,
    postedBy: input.teacherStaffId,
  });

  await seedCourseAssignment(db, {
    institutionId: input.institutionId,
    campusId: input.campusId,
    termId: input.termId,
    classId: input.classId,
    courseId,
    subjectId: input.subjectIds.math,
    teacherStaffId: input.teacherStaffId,
  });
}

async function seedDocumentsAndReports(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    academicYearId: string;
    termId: string;
    studentId: string;
  },
): Promise<void> {
  const reportObjectId = await ensureStorageObject(db, {
    institutionId: input.institutionId,
    studentId: input.studentId,
    key: 'demo/documents/term-1-progress-report.pdf',
    filename: 'term-1-progress-report.pdf',
    mimeType: 'application/pdf',
  });

  const docs = [
    { type: 'report_card', title: 'Term 1 Progress Report', fileRef: 'demo/documents/term-1-progress-report.pdf', issuedAt: addDays(new Date(), -10) },
    { type: 'id_card', title: 'Student ID Card 2026', fileRef: 'demo/documents/student-id-card.pdf', issuedAt: addDays(new Date(), -24) },
    { type: 'certificate', title: 'Science Fair Participation Certificate', fileRef: 'demo/documents/science-fair-certificate.pdf', issuedAt: addDays(new Date(), -36) },
  ];
  for (const doc of docs) {
    const [existing] = await db
      .select({ id: s.studentDocuments.id })
      .from(s.studentDocuments)
      .where(and(eq(s.studentDocuments.studentId, input.studentId), eq(s.studentDocuments.title, doc.title)))
      .limit(1);
    if (existing) continue;
    await db.insert(s.studentDocuments).values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      studentId: input.studentId,
      type: doc.type,
      title: doc.title,
      fileRef: doc.fileRef,
      contentType: 'application/pdf',
      issuedAt: doc.issuedAt,
      published: true,
    });
  }

  const [existingCard] = await db
    .select({ id: s.reportCards.id })
    .from(s.reportCards)
    .where(and(eq(s.reportCards.studentId, input.studentId), eq(s.reportCards.termLabel, 'Term 1 Progress Review')))
    .limit(1);

  let cardId = existingCard?.id;
  if (!cardId) {
    const [created] = await db
      .insert(s.reportCards)
      .values({
        institutionId: input.institutionId,
        campusId: input.campusId,
        studentId: input.studentId,
        academicYearId: input.academicYearId,
        termId: input.termId,
        termLabel: 'Term 1 Progress Review',
        kind: 'structured',
        pdfObjectId: reportObjectId,
        gpa: '3.62',
        status: 'published',
        publishedAt: addDays(new Date(), -9),
      })
      .returning({ id: s.reportCards.id });
    cardId = created?.id;
  }
  if (!cardId) return;

  const entries = [
    { subjectLabel: 'Mathematics', component: 'Unit Test 1', marks: 88, maxMarks: 100, gradeLetter: 'A', sequence: 1 },
    { subjectLabel: 'English', component: 'Seminar response', marks: 81, maxMarks: 100, gradeLetter: 'A-', sequence: 2 },
    { subjectLabel: 'Science', component: 'Lab practical', marks: 84, maxMarks: 100, gradeLetter: 'A-', sequence: 3 },
  ];
  for (const entry of entries) {
    const [existing] = await db
      .select({ id: s.reportCardEntries.id })
      .from(s.reportCardEntries)
      .where(and(eq(s.reportCardEntries.reportCardId, cardId), eq(s.reportCardEntries.subjectLabel, entry.subjectLabel)))
      .limit(1);
    if (existing) continue;
    await db.insert(s.reportCardEntries).values({ reportCardId: cardId, ...entry, remarks: 'On track for the next review.' });
  }
}

async function seedStudentRequests(
  db: DevSeedContext['db'],
  input: { institutionId: string; campusId: string; studentId: string },
): Promise<void> {
  const now = new Date();
  const requests = [
    {
      type: 'leave_request',
      humanCode: 'LV-A2B3',
      payload: {
        start_date: dateStr(addDays(now, 8)),
        end_date: dateStr(addDays(now, 8)),
        scope: 'full_day',
        reason: 'family',
        reason_text: 'Family function out of town.',
        notify_sessions: [],
      },
      payloadSchemaVersion: 1,
      status: 'submitted',
      assignedRole: 'teacher',
      submittedAt: addDays(now, -1),
      summaryEvent: 'submitted',
    },
    {
      type: 'helpdesk_ticket',
      humanCode: 'HD-C4D5',
      payload: {
        topic: 'it',
        summary: 'Student portal login works slowly on lab Wi-Fi',
        details: 'Pages take more than a minute to load when using the second-floor computer lab.',
      },
      payloadSchemaVersion: 1,
      status: 'in_review',
      assignedRole: 'helpdesk',
      submittedAt: addDays(now, -3),
      summaryEvent: 'claimed',
    },
  ];

  for (const req of requests) {
    const [existing] = await db
      .select({ id: s.studentRequests.id })
      .from(s.studentRequests)
      .where(and(eq(s.studentRequests.institutionId, input.institutionId), eq(s.studentRequests.humanCode, req.humanCode)))
      .limit(1);
    if (existing) continue;
    const [created] = await db
      .insert(s.studentRequests)
      .values({
        institutionId: input.institutionId,
        campusId: input.campusId,
        studentId: input.studentId,
        type: req.type,
        payload: req.payload,
        payloadSchemaVersion: req.payloadSchemaVersion,
        status: req.status,
        humanCode: req.humanCode,
        assignedRole: req.assignedRole,
        submittedAt: req.submittedAt,
        slaDueAt: addDays(now, 3),
      })
      .returning({ id: s.studentRequests.id });
    if (!created?.id) continue;
    await db.insert(s.studentRequestEvents).values([
      {
        requestId: created.id,
        institutionId: input.institutionId,
        seq: 1,
        eventType: 'created',
        actorKind: 'student',
        actorRole: 'student',
        createdAt: req.submittedAt,
      },
      {
        requestId: created.id,
        institutionId: input.institutionId,
        seq: 2,
        eventType: req.summaryEvent,
        actorKind: req.summaryEvent === 'claimed' ? 'staff' : 'student',
        actorRole: req.summaryEvent === 'claimed' ? req.assignedRole : 'student',
        createdAt: addDays(req.submittedAt, 1),
      },
    ]);
  }
}

async function seedTransport(
  db: DevSeedContext['db'],
  input: { institutionId: string; campusId: string; studentId: string },
): Promise<void> {
  const [route] = await db
    .select({ id: s.transportRoutes.id })
    .from(s.transportRoutes)
    .where(
      and(eq(s.transportRoutes.institutionId, input.institutionId), eq(s.transportRoutes.code, 'GWD-RT-01')),
    )
    .limit(1);

  let routeId = route?.id;
  if (!routeId) {
    const [created] = await db
      .insert(s.transportRoutes)
      .values({
        institutionId: input.institutionId,
        campusId: input.campusId,
        name: 'North Campus Route',
        code: 'GWD-RT-01',
        description: 'Downtown – Main Campus',
        fare: 120_000,
        status: 'active',
      })
      .returning({ id: s.transportRoutes.id });
    routeId = created?.id;

    await db.insert(s.transportVehicles).values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      registrationNo: 'KL-07-GW-1001',
      model: 'Tata Starbus 45-Seater',
      capacity: 45,
      routeId,
      driverName: 'Rajesh Kumar',
      driverPhone: '+919800011001',
      status: 'active',
    });
  }
  if (!routeId) return;

  const [assignment] = await db
    .select({ id: s.transportAssignments.id })
    .from(s.transportAssignments)
    .where(
      and(
        eq(s.transportAssignments.studentId, input.studentId),
        eq(s.transportAssignments.routeId, routeId),
      ),
    )
    .limit(1);
  if (assignment) return;

  await db.insert(s.transportAssignments).values({
    institutionId: input.institutionId,
    routeId,
    studentId: input.studentId,
    stopName: 'City Centre Stop',
    pickupTime: '07:15',
    dropTime: '14:45',
    status: 'active',
  });
}

async function seedAnnouncements(
  db: DevSeedContext['db'],
  input: { institutionId: string; campusId: string },
): Promise<void> {
  const defs = [
    {
      referenceCode: 'GWD-ANN-SPORTS',
      title: 'Sports Day registrations open',
      body: 'Sign up for track and field events by Friday. See your class teacher for events list.',
      audience: 'students',
      category: 'events',
    },
    {
      referenceCode: 'GWD-ANN-LIBRARY',
      title: 'Library extended hours',
      body: 'The library will stay open until 6 PM during exam week.',
      audience: 'all',
      category: 'general',
    },
  ];

  for (const ann of defs) {
    const [existing] = await db
      .select({ id: s.announcements.id })
      .from(s.announcements)
      .where(
        and(
          eq(s.announcements.institutionId, input.institutionId),
          eq(s.announcements.referenceCode, ann.referenceCode),
        ),
      )
      .limit(1);
    if (existing) continue;
    await db.insert(s.announcements).values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      title: ann.title,
      body: ann.body,
      referenceCode: ann.referenceCode,
      audience: ann.audience,
      category: ann.category,
      status: 'published',
      publishedAt: new Date(),
      pinned: ann.referenceCode === 'GWD-ANN-SPORTS',
    });
  }
}

async function ensureStorageObject(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    studentId: string;
    key: string;
    filename: string;
    mimeType: string;
  },
): Promise<string> {
  const [existing] = await db
    .select({ id: s.storageObjects.id })
    .from(s.storageObjects)
    .where(and(eq(s.storageObjects.institutionId, input.institutionId), eq(s.storageObjects.storageKey, input.key)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(s.storageObjects)
    .values({
      institutionId: input.institutionId,
      ownerStudentId: input.studentId,
      kind: 'demo',
      driver: 'local',
      storageKey: input.key,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: 48_000,
      processingStatus: 'ready',
    })
    .returning({ id: s.storageObjects.id });
  if (!created?.id) throw new Error(`Failed to seed storage object ${input.key}`);
  return created.id;
}

async function seedMaterial(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    contextType: string;
    contextId: string;
    title: string;
    description: string;
    kindLabel: string;
    objectId: string;
    weekNo: number;
    postedBy: string;
  },
): Promise<void> {
  const [existing] = await db
    .select({ id: s.classMaterials.id })
    .from(s.classMaterials)
    .where(
      and(
        eq(s.classMaterials.institutionId, input.institutionId),
        eq(s.classMaterials.contextType, input.contextType),
        eq(s.classMaterials.contextId, input.contextId),
        eq(s.classMaterials.title, input.title),
      ),
    )
    .limit(1);
  if (existing) return;
  await db.insert(s.classMaterials).values(input);
}

async function upsertCourse(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    termId: string;
    code: string;
    name: string;
    teacherStaffId: string;
  },
): Promise<string | null> {
  const [existing] = await db
    .select({ id: s.courses.id })
    .from(s.courses)
    .where(and(eq(s.courses.institutionId, input.institutionId), eq(s.courses.code, input.code)))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(s.courses)
    .values({
      institutionId: input.institutionId,
      campusId: input.campusId,
      termId: input.termId,
      code: input.code,
      name: input.name,
      credits: 2,
      professorTeacherId: input.teacherStaffId,
      officeHours: 'Tue 14:00-15:00, Staff Room 2',
      gradingScheme: [
        { component: 'Participation', weightPct: 20 },
        { component: 'Planner portfolio', weightPct: 40 },
        { component: 'Reflection', weightPct: 40 },
      ],
      attendanceRequiredPct: 75,
      status: 'active',
    })
    .returning({ id: s.courses.id });
  return created?.id ?? null;
}

async function seedCourseAssignment(
  db: DevSeedContext['db'],
  input: {
    institutionId: string;
    campusId: string;
    termId: string;
    classId: string;
    courseId: string;
    subjectId: string;
    teacherStaffId: string;
  },
): Promise<void> {
  const title = 'Study Skills portfolio check-in';
  const [existing] = await db
    .select({ id: s.assignments.id })
    .from(s.assignments)
    .where(and(eq(s.assignments.institutionId, input.institutionId), eq(s.assignments.title, title)))
    .limit(1);
  if (existing) return;
  await db.insert(s.assignments).values({
    institutionId: input.institutionId,
    campusId: input.campusId,
    termId: input.termId,
    classId: input.classId,
    courseId: input.courseId,
    subjectId: input.subjectId,
    teacherId: input.teacherStaffId,
    title,
    instructions: 'Upload your weekly planner and a short reflection on what changed after reviewing it.',
    dueDate: dateStr(addDays(new Date(), 10)),
    maxPoints: 15,
    status: 'published',
    deliveryMode: 'file',
    audience: [{ kind: 'course', refId: input.courseId }],
  });
}
