import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { and, eq } from 'drizzle-orm';
import { closeDatabase, createDatabase, schema as s } from '@edrion/database';
import { seedStudentPortalDemo } from './seed/student-portal-demo.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: join(repoRoot, '.env'), override: true });

const DAY = 86_400_000;
const addDays = (days: number) => new Date(Date.now() + days * DAY);

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  const db = createDatabase({ url });
  try {
    const [student] = await db
      .select()
      .from(s.students)
      .where(eq(s.students.admissionNo, 'TOCH-TEST-001'))
      .limit(1);
    if (!student) throw new Error('Test student TOCH-TEST-001 was not found');

    const [enrollment] = await db
      .select()
      .from(s.studentEnrollments)
      .where(
        and(
          eq(s.studentEnrollments.studentId, student.id),
          eq(s.studentEnrollments.status, 'active'),
        ),
      )
      .limit(1);
    if (!enrollment?.classId || !enrollment.academicYearId || !enrollment.termId) {
      throw new Error('Alex needs an active class, academic year, and semester enrollment');
    }

    const [classRow] = await db
      .select()
      .from(s.classes)
      .where(eq(s.classes.id, enrollment.classId))
      .limit(1);
    const [campus] = await db
      .select()
      .from(s.campuses)
      .where(eq(s.campuses.institutionId, student.institutionId))
      .limit(1);
    const [teacher] = await db
      .select()
      .from(s.staff)
      .where(eq(s.staff.institutionId, student.institutionId))
      .limit(1);
    if (!classRow || !campus || !teacher)
      throw new Error('Alex needs a class, campus, and teacher');

    await db
      .update(s.students)
      .set({ campusId: campus.id, classId: classRow.id })
      .where(eq(s.students.id, student.id));
    await db
      .update(s.classes)
      .set({ campusId: campus.id, classTeacherId: teacher.id })
      .where(eq(s.classes.id, classRow.id));

    const cloud = await ensureSubject(
      db,
      student.institutionId,
      campus.id,
      'CSE102',
      'Cloud Computing',
    );
    const ethics = await ensureSubject(
      db,
      student.institutionId,
      campus.id,
      'EHS101',
      'Environmental Health and Technology Ethics',
    );
    const ai = await ensureSubject(
      db,
      student.institutionId,
      campus.id,
      'AIML401',
      'Applied AI Systems',
    );

    for (const subjectId of [cloud, ethics, ai]) {
      await db
        .insert(s.classSubjectTeachers)
        .values({
          institutionId: student.institutionId,
          classId: classRow.id,
          subjectId,
          teacherId: teacher.id,
        })
        .onConflictDoNothing();
    }

    const [marker] = await db
      .select({ id: s.feedEvents.id })
      .from(s.feedEvents)
      .where(
        and(
          eq(s.feedEvents.studentId, student.id),
          eq(s.feedEvents.eventKey, 'toch-ai-teaching-demo-v1'),
        ),
      )
      .limit(1);

    const [seededHomework] = await db
      .select({ id: s.homework.id })
      .from(s.homework)
      .where(
        and(
          eq(s.homework.institutionId, student.institutionId),
          eq(s.homework.classId, classRow.id),
          eq(s.homework.title, 'Cloud architecture preparation — scalability and load balancing'),
        ),
      )
      .limit(1);

    if (!marker && !seededHomework) {
      await seedStudentPortalDemo(
        { db, logins: [] },
        {
          institutionId: student.institutionId,
          campusId: campus.id,
          publicId: 'TOCH-TEST',
        },
        {
          academicYearId: enrollment.academicYearId,
          termId: enrollment.termId,
          classId: classRow.id,
          subjectIds: { math: cloud, english: ethics, science: ai },
        },
        {
          teacherStaffId: teacher.id,
          classTeacherStaffId: teacher.id,
          studentIds: [student.id, student.id, student.id],
          parentId: student.id,
          classTeacherUserId: teacher.institutionUserId ?? student.institutionUserId ?? student.id,
        },
      );
    }

    await tailorHomework(db, student.institutionId, student.id);
    await tailorAssignments(db, student.institutionId, student.id);
    await tailorExams(db, student.institutionId, classRow.id);
    await tailorPortalContent(db, student.institutionId, student.id, classRow.id);
    await seedPlannerAndLearningHistory(db, student.institutionId, student.id);

    await db
      .insert(s.feedEvents)
      .values({
        institutionId: student.institutionId,
        campusId: campus.id,
        studentId: student.id,
        eventKey: 'toch-ai-teaching-demo-v1',
        type: 'nudge',
        sourceModule: 'petros',
        title: 'Personal learning context is ready',
        body: 'Petros can now use your deadlines, teacher feedback, attendance, results, and course coverage to guide study.',
        deepLink: '/petros',
        occurredAt: new Date(),
      })
      .onConflictDoNothing();

    // eslint-disable-next-line no-console
    console.log('✓ Enriched Alex Test Student with a complete AI-teaching demo scenario.');
  } finally {
    await closeDatabase();
  }
}

type Db = ReturnType<typeof createDatabase>;

async function ensureSubject(
  db: Db,
  institutionId: string,
  campusId: string,
  code: string,
  name: string,
) {
  const [existing] = await db
    .select({ id: s.subjects.id })
    .from(s.subjects)
    .where(and(eq(s.subjects.institutionId, institutionId), eq(s.subjects.code, code)))
    .limit(1);
  if (existing) {
    await db.update(s.subjects).set({ campusId, name }).where(eq(s.subjects.id, existing.id));
    return existing.id;
  }
  const [created] = await db
    .insert(s.subjects)
    .values({ institutionId, campusId, code, name })
    .returning({ id: s.subjects.id });
  if (!created) throw new Error(`Could not create ${code}`);
  return created.id;
}

async function tailorHomework(db: Db, institutionId: string, studentId: string) {
  const definitions = [
    {
      from: 'Algebra worksheet — linear equations',
      title: 'Cloud architecture preparation — scalability and load balancing',
      instructions:
        'Due in two days. Study stateless services, horizontal scaling, load balancing, health checks, and multi-zone failover. Submit a concise architecture explanation and diagram.',
      aiPolicy: 'allowed_with_citation',
      questions: [
        'Explain horizontal scaling and why server-side session state can become a bottleneck.',
        'Draw a fault-tolerant deployment across two availability zones and label the failure paths.',
      ],
    },
    {
      from: 'Essay draft — character analysis',
      title: 'Technical essay — responsible use of generative AI',
      instructions:
        'Write 900–1,100 words evaluating one educational use of generative AI. Include a clear argument, two credible sources, risks, safeguards, and a properly cited conclusion. AI may coach and critique, but must not write the final essay.',
      aiPolicy: 'allowed_with_citation',
      questions: [
        'Upload the essay draft with citations and a short disclosure describing any AI assistance used.',
      ],
    },
    {
      from: 'Lab report — photosynthesis',
      title: 'Kubernetes deployment lab report',
      instructions:
        'Document the container deployment, service exposure, readiness probe, autoscaling test, observed failure, and rollback procedure.',
      aiPolicy: 'allowed_with_citation',
      questions: [
        'Describe the cluster, deployment, service, and probe configuration used.',
        'Explain the failure observed during testing and justify the corrective action.',
      ],
      teacherNote:
        'Strong deployment evidence and clear screenshots. Expand the readiness-probe explanation and add the exact rollback command before resubmitting.',
    },
  ];

  for (const definition of definitions) {
    const [row] = await db
      .select({ id: s.homework.id })
      .from(s.homework)
      .where(
        and(eq(s.homework.institutionId, institutionId), eq(s.homework.title, definition.from)),
      )
      .limit(1);
    if (!row) continue;
    await db
      .update(s.homework)
      .set({
        title: definition.title,
        instructions: definition.instructions,
        aiPolicy: definition.aiPolicy,
      })
      .where(eq(s.homework.id, row.id));
    const questions = await db
      .select()
      .from(s.homeworkQuestions)
      .where(eq(s.homeworkQuestions.homeworkId, row.id));
    for (const question of questions) {
      const promptText = definition.questions[question.sequence - 1];
      if (promptText)
        await db
          .update(s.homeworkQuestions)
          .set({ promptText })
          .where(eq(s.homeworkQuestions.id, question.id));
    }
    if (definition.teacherNote) {
      await db
        .update(s.homeworkSubmissions)
        .set({ teacherNote: definition.teacherNote })
        .where(
          and(
            eq(s.homeworkSubmissions.homeworkId, row.id),
            eq(s.homeworkSubmissions.studentId, studentId),
          ),
        );
    }
  }
}

async function tailorAssignments(db: Db, institutionId: string, studentId: string) {
  const definitions = [
    {
      from: 'Mathematics investigation — linear patterns',
      title: 'Distributed systems design — resilient student API',
      instructions:
        'Design a resilient API deployment. Include service boundaries, database strategy, caching, queueing, observability, failure handling, and a short trade-off analysis. Due in three days.',
    },
    {
      from: 'English seminar response',
      title: 'Technology ethics seminar response',
      instructions:
        'Respond to the seminar question: When should an AI system refuse to act? Use one real-world example, one ethical framework, and one counterargument.',
    },
    {
      from: 'Science concept map — ecosystems',
      title: 'Machine-learning pipeline concept map',
      instructions:
        'Map data collection, validation, feature engineering, training, evaluation, deployment, monitoring, drift detection, and retraining with directional relationships.',
      feedback:
        'Clear lifecycle and good deployment detail. Add a distinct validation set, label the leakage risk, and connect drift monitoring to the retraining trigger.',
    },
  ];

  for (const definition of definitions) {
    const [row] = await db
      .select({ id: s.assignments.id })
      .from(s.assignments)
      .where(
        and(
          eq(s.assignments.institutionId, institutionId),
          eq(s.assignments.title, definition.from),
        ),
      )
      .limit(1);
    if (!row) continue;
    await db
      .update(s.assignments)
      .set({
        title: definition.title,
        instructions: definition.instructions,
        aiPolicy: 'allowed_with_citation',
      })
      .where(eq(s.assignments.id, row.id));
    if (definition.feedback) {
      await db
        .update(s.assignmentSubmissions)
        .set({ feedback: definition.feedback })
        .where(
          and(
            eq(s.assignmentSubmissions.assignmentId, row.id),
            eq(s.assignmentSubmissions.studentId, studentId),
          ),
        );
    }
  }
}

async function tailorExams(db: Db, institutionId: string, classId: string) {
  const renames = [
    ['Mid-term Examination 2025–26', 'Semester 7 Mid-term Examination'],
    ['Unit Test 1 — Science', 'Applied AI Systems — Model Evaluation Test'],
    ['Literature Response — English', 'Technology Ethics — Seminar Assessment'],
    ['Petros Repair Check — Mathematics', 'Cloud Computing — Reliability Diagnostic'],
  ] as const;
  for (const [from, name] of renames) {
    await db
      .update(s.exams)
      .set({ name, termLabel: 'Semester 7' })
      .where(and(eq(s.exams.institutionId, institutionId), eq(s.exams.name, from)));
  }

  const [onlineExam] = await db
    .select({ id: s.exams.id })
    .from(s.exams)
    .where(
      and(
        eq(s.exams.institutionId, institutionId),
        eq(s.exams.name, 'Online Comprehensive Practice Examination'),
      ),
    )
    .limit(1);
  if (!onlineExam) return;
  await db
    .update(s.exams)
    .set({
      name: 'Applied AI and Cloud Practice Examination',
      termLabel: 'Semester 7',
      description:
        'A supervised mixed-format practice paper on applied AI, cloud architecture, and engineering judgement.',
    })
    .where(eq(s.exams.id, onlineExam.id));

  const [schedule] = await db
    .select({ id: s.examSchedules.id })
    .from(s.examSchedules)
    .where(and(eq(s.examSchedules.examId, onlineExam.id), eq(s.examSchedules.classId, classId)))
    .limit(1);
  if (!schedule) return;
  await db
    .update(s.examSchedules)
    .set({
      seatInfo: 'Candidate: Alex Test Student',
      syllabusNote:
        'Revise model evaluation, data leakage, scalable APIs, queues, caching, Kubernetes health checks, and responsible AI safeguards.',
    })
    .where(eq(s.examSchedules.id, schedule.id));

  const prompts = [
    'Which architectural property most directly enables safe horizontal scaling of an API?',
    'Select every item required for a standard supervised-learning training example.',
    'A model score measured only on its training data is a reliable estimate of real-world performance.',
    'Choose the correct relationship between the Assertion and Reason about retrieval-augmented generation.',
    'The container orchestration platform commonly abbreviated as K8s is _____.',
    'Three cloud instances run for four hours. How many instance-hours are consumed?',
    'Match each cloud component to its principal responsibility.',
    'Explain why data leakage can make validation results look unrealistically strong.',
    'Explain a retrieval-augmented generation pipeline and discuss three controls that improve answer reliability.',
    'Read the latency investigation and answer both engineering questions.',
    'Attach a clearly labelled resilient-cloud architecture diagram as a PDF or image.',
    'Write a function that calculates precision from true positives and false positives, safely handling a zero denominator.',
  ];
  const questions = await db
    .select()
    .from(s.examPaperQuestions)
    .where(eq(s.examPaperQuestions.examScheduleId, schedule.id));
  for (const question of questions) {
    const prompt = prompts[question.sequence - 1];
    if (prompt)
      await db
        .update(s.examPaperQuestions)
        .set({ prompt })
        .where(eq(s.examPaperQuestions.id, question.id));
  }
}

async function tailorPortalContent(
  db: Db,
  institutionId: string,
  studentId: string,
  classId: string,
) {
  const feedEntries = [
    [
      'toch-cloud-diagnostic',
      'marks_released',
      'grading',
      'Cloud reliability diagnostic released',
      'Your diagnostic shows a gap around quorum, replication, and failover reasoning.',
      '/results',
      -1,
    ],
    [
      'toch-cloud-homework-due',
      'nudge',
      'homework',
      'Cloud architecture preparation due soon',
      'Your scalability and load-balancing preparation is due in two days.',
      '/homework',
      0,
    ],
    [
      'toch-mentoring-review',
      'announcement',
      'calendar',
      'Semester mentoring review next week',
      'Your faculty mentoring review is scheduled for next week.',
      '/calendar',
      -2,
    ],
  ] as const;
  for (const [eventKey, type, sourceModule, title, body, deepLink, days] of feedEntries) {
    await db
      .insert(s.feedEvents)
      .values({
        institutionId,
        studentId,
        eventKey,
        type,
        sourceModule,
        title,
        body,
        deepLink,
        occurredAt: addDays(days),
      })
      .onConflictDoNothing();
  }

  const streamUpdates = [
    [
      'Welcome back to Term 1',
      'Semester 7 learning plan published',
      'Review the timetable, upcoming assessments, and AI-use rules before beginning this week.',
    ],
    [
      'Chapter 4 notes uploaded',
      'Cloud reliability notes uploaded',
      'Worked examples on load balancing, replication, quorum, and failover are available under Materials.',
    ],
    [
      'Bring lab coat on Friday',
      'Bring laptop for Friday deployment lab',
      'Docker, kubectl, and the course repository must be ready before the practical.',
    ],
  ] as const;
  for (const [from, title, body] of streamUpdates) {
    await db
      .update(s.classStreamPosts)
      .set({ title, body })
      .where(
        and(
          eq(s.classStreamPosts.institutionId, institutionId),
          eq(s.classStreamPosts.contextId, classId),
          eq(s.classStreamPosts.title, from),
        ),
      );
  }

  const materialUpdates = [
    [
      'Linear equations worked examples',
      'Cloud reliability worked examples',
      'Teacher annotations on load balancing, replication, and failure recovery.',
    ],
    [
      'Photosynthesis lab safety sheet',
      'Kubernetes deployment checklist',
      'Read before Friday practical; includes environment checks and rollback steps.',
    ],
    [
      'English seminar discussion prompts',
      'Responsible AI seminar prompts',
      'Use these prompts to prepare the ethics response and counterargument.',
    ],
  ] as const;
  for (const [from, title, description] of materialUpdates) {
    await db
      .update(s.classMaterials)
      .set({ title, description })
      .where(
        and(
          eq(s.classMaterials.institutionId, institutionId),
          eq(s.classMaterials.contextId, classId),
          eq(s.classMaterials.title, from),
        ),
      );
  }

  const [reportCard] = await db
    .select({ id: s.reportCards.id })
    .from(s.reportCards)
    .where(eq(s.reportCards.studentId, studentId))
    .limit(1);
  if (reportCard) {
    for (const [from, subjectLabel, component] of [
      ['Mathematics', 'Cloud Computing', 'Cloud architecture diagnostic'],
      ['English', 'Technology Ethics', 'Responsible AI seminar'],
      ['Science', 'Applied AI Systems', 'Model evaluation practical'],
    ] as const) {
      await db
        .update(s.reportCardEntries)
        .set({ subjectLabel, component })
        .where(
          and(
            eq(s.reportCardEntries.reportCardId, reportCard.id),
            eq(s.reportCardEntries.subjectLabel, from),
          ),
        );
    }
  }

  const [course] = await db
    .select({ id: s.courses.id })
    .from(s.courses)
    .where(and(eq(s.courses.institutionId, institutionId), eq(s.courses.code, 'FOUND9')))
    .limit(1);
  if (course) {
    await db
      .update(s.courses)
      .set({
        code: 'AIENG401',
        name: 'AI-Assisted Engineering Study Studio',
        credits: 2,
        officeHours: 'Wednesday 15:00–16:00',
      })
      .where(eq(s.courses.id, course.id));
    const moduleTitles = [
      'Planning a technical study sprint',
      'Retrieval, practice, and error logs',
      'Exam readiness and responsible AI use',
    ];
    for (let index = 0; index < moduleTitles.length; index += 1) {
      await db
        .update(s.courseSyllabusModules)
        .set({ title: moduleTitles[index]! })
        .where(
          and(
            eq(s.courseSyllabusModules.courseId, course.id),
            eq(s.courseSyllabusModules.weekNo, index + 1),
          ),
        );
    }
  }
}

async function seedPlannerAndLearningHistory(db: Db, institutionId: string, studentId: string) {
  const obligations = [
    {
      key: 'alex-cloud-prep',
      kind: 'homework',
      obligationKind: 'study_block',
      title: 'Finish cloud architecture preparation',
      dueAt: addDays(2),
      deepLink: '/homework',
    },
    {
      key: 'alex-ethics-essay',
      kind: 'assignment',
      obligationKind: 'study_block',
      title: 'Draft responsible generative AI essay',
      dueAt: addDays(5),
      deepLink: '/assignments',
    },
    {
      key: 'alex-ai-revision',
      kind: 'revision',
      obligationKind: 'review',
      title: 'Revise model evaluation and data leakage',
      dueAt: addDays(1),
      deepLink: '/courses',
    },
    {
      key: 'alex-midterm-plan',
      kind: 'exam',
      obligationKind: 'mock',
      title: 'Prepare Semester 7 mid-term revision plan',
      dueAt: addDays(7),
      deepLink: '/calendar',
    },
  ];
  for (const item of obligations) {
    await db
      .insert(s.userObligations)
      .values({
        institutionId,
        studentId,
        source: 'plan_engine',
        kind: item.obligationKind,
        title: item.title,
        dueAt: item.dueAt,
        deepLink: item.deepLink,
        status: 'pending',
        idempotencyKey: item.key,
      })
      .onConflictDoNothing();
    const [plannerItem] = await db
      .select({ id: s.studentPlannerItems.id })
      .from(s.studentPlannerItems)
      .where(
        and(
          eq(s.studentPlannerItems.studentId, studentId),
          eq(s.studentPlannerItems.topicKey, item.key),
        ),
      )
      .limit(1);
    if (!plannerItem) {
      await db.insert(s.studentPlannerItems).values({
        studentId,
        title: item.title,
        onDate: item.dueAt.toISOString().slice(0, 10),
        kind: item.kind,
        topicKey: item.key,
      });
    }
  }

  const evidence = [
    {
      id: 'alex-cloud-quorum-1',
      concept: 'distributed-systems-quorum',
      outcome: 'wrong',
      credit: 1800,
      error: 'concept_gap',
    },
    {
      id: 'alex-cloud-quorum-2',
      concept: 'distributed-systems-quorum',
      outcome: 'partial',
      credit: 5200,
      error: 'procedural_method',
    },
    {
      id: 'alex-cloud-quorum-3',
      concept: 'distributed-systems-quorum',
      outcome: 'correct',
      credit: 8200,
      error: 'none',
    },
    {
      id: 'alex-data-leakage-1',
      concept: 'machine-learning-data-leakage',
      outcome: 'wrong',
      credit: 1500,
      error: 'prerequisite_gap',
    },
    {
      id: 'alex-architecture-visual-1',
      concept: 'cloud-failure-domains',
      outcome: 'correct',
      credit: 9200,
      error: 'none',
    },
  ] as const;
  for (const [index, row] of evidence.entries()) {
    await db
      .insert(s.petrosLearnerEvidenceEvents)
      .values({
        institutionId,
        studentId,
        source: 'authorized_import',
        sourceEventId: row.id,
        sourceRecordId: 'alex-ai-teaching-demo-v1',
        topicId: row.concept,
        conceptId: row.concept,
        prerequisiteConceptIds: row.concept.includes('leakage')
          ? ['train-validation-test-split']
          : [],
        evidenceKind: 'application',
        outcome: row.outcome,
        creditBasisPoints: row.credit,
        moveType: index === 4 ? 'diagram' : 'worked_example',
        profileDimension: index === 4 ? 'representation:visual' : 'method-choice',
        preEvidenceBasisPoints: 4000,
        postEvidenceBasisPoints: row.credit,
        responseTimeMs: 9000 + index * 1000,
        hintCount: row.outcome === 'correct' ? 0 : 1,
        confidenceBefore: 'think_so',
        confidenceAfter: row.outcome === 'correct' ? 'sure' : 'think_so',
        errorCategory: row.error,
        errorConfidenceBasisPoints: 9000,
        occurredAt: addDays(-5 + index),
        algorithmVersion: 'petros.learner-model.stage6.v1',
        schemaVersion: 'petros.learner-evidence.v1',
        environment: 'production',
        synthetic: false,
        evaluatorVersion: 'alex-ai-teaching-demo-v1',
        metadata: { fixture: 'alex_test_student', purpose: 'ai_teaching_demo' },
      })
      .onConflictDoNothing();
  }
}

main().catch((error) => {
  console.error(
    '✗ Test-student enrichment failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
});
