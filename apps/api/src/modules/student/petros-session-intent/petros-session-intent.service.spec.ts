import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { PetrosSessionIntentService } from './petros-session-intent.service';

const INSTITUTION_ID = '11111111-1111-4111-8111-111111111111';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE_ID = '33333333-3333-4333-8333-333333333333';
const OBJECT_ID = '99999999-9999-4999-8999-999999999999';
const PAGE_ID = '44444444-4444-4444-8444-444444444444';
const PATH_ID = '55555555-5555-4555-8555-555555555555';
const TOPIC_ID = '66666666-6666-4666-8666-666666666666';

const principal: InstitutionalStudentPrincipal = {
  kind: 'institutional', institutionId: INSTITUTION_ID, campusId: null,
  institutionUserId: '77777777-7777-4777-8777-777777777777', studentId: STUDENT_ID,
  email: 'learner@example.test', fullName: 'Learner', lastAuthAt: null,
  permissions: ['student.learn.use', 'student.exams.view'],
};

function harness(overrides: Record<string, unknown> = {}) {
  let savedRow: any;
  let savedOutline: any;
  const repo: any = {
    findIntentByKey: vi.fn(async (_scope: unknown, key: string) =>
      savedRow?.idempotencyKey === key ? savedRow : undefined),
    preferences: vi.fn().mockResolvedValue({ language: 'en', reducedMotion: false, textSize: 'M' }),
    createIntent: vi.fn(async (values: any) => {
      savedRow = { ...values, createdAt: new Date('2026-08-12T08:00:00.000Z'), updatedAt: new Date('2026-08-12T08:00:00.000Z'), startedAt: null, invalidatedAt: null, sessionId: null };
      return savedRow;
    }),
    recordEvent: vi.fn().mockResolvedValue({ id: 'event' }),
    recordFailureEvent: vi.fn().mockResolvedValue({ id: 'failure-event' }),
    findIntent: vi.fn(async () => savedRow),
    studentClassId: vi.fn().mockResolvedValue(null),
    assistantContext: vi.fn().mockResolvedValue({
      student: { name: 'Learner', className: 'Class A' },
      assignments: [], homework: [], results: [], attendance: [], exams: [], courses: [], planner: [], learnerEvidence: [], classNotices: [],
    }),
    markStarted: vi.fn(async (_scope: unknown, _id: string, sessionId: string) => {
      savedRow = { ...savedRow, status: 'started', sessionId, startedAt: new Date('2026-08-12T08:01:00.000Z') };
      return savedRow;
    }),
    invalidate: vi.fn(),
    resultSource: vi.fn(), examSource: vi.fn(), assignmentSource: vi.fn(), documentSource: vi.fn(), pathSource: vi.fn(), reflectionSource: vi.fn(),
    findDocumentOutline: vi.fn(async () => savedOutline),
    saveDocumentOutline: vi.fn(async (value: any) => {
      savedOutline = { ...value, id: crypto.randomUUID() };
      return savedOutline;
    }),
    documentSchedule: vi.fn().mockResolvedValue(null),
    listUploadedDocuments: vi.fn().mockResolvedValue([]), currentPath: vi.fn().mockResolvedValue(null),
    dashboard: vi.fn(),
    markReflectionRecommendationStarted: vi.fn(),
    ...overrides,
  };
  const loop: any = {
    create: vi.fn().mockResolvedValue({ id: '88888888-8888-4888-8888-888888888888' }),
    document: vi.fn().mockResolvedValue({ id: '88888888-8888-4888-8888-888888888888' }),
  };
  const audit: any = { logAudit: vi.fn() };
  const gateway: any = {
    execute: vi.fn(async (request: any) => {
      const payload = JSON.parse(request.input[0].text);
      return {
        content: payload.sessionRecommended
          ? {
              mode: 'session_offer',
              answer: 'Here is a personalized first step before we continue.',
              contextLabel: 'Student portal',
              offer: { description: 'Continue in a focused session.', approximateMinutes: 15, sourceId: payload.sessionSourceId },
            }
          : { mode: 'quick_answer', answer: 'This is a generated grounded answer.', contextLabel: 'Student portal', offer: null },
      };
    }),
  };
  return {
    service: new PetrosSessionIntentService(repo, loop, gateway, { PETROS_AI_MODE: 'live' } as never, audit),
    repo,
    loop,
    gateway,
    row: () => savedRow,
  };
}

function input(door: string, extra: Record<string, unknown> = {}) {
  return { door, sourceId: SOURCE_ID, idempotencyKey: crypto.randomUUID(), timeBudgetSeconds: 900, language: 'en', accessibility: [], ...extra } as any;
}

describe('Petros Stage 8 session intent resolver', () => {
  it('resolves an authorized published result into a flat practical Repair intent without inventing question evidence', async () => {
    const { service } = harness({ resultSource: vi.fn().mockResolvedValue({
      id: SOURCE_ID, subjectId: TOPIC_ID, subjectName: 'Physics', assessmentName: 'Unit test', examName: 'Term test',
      marksObtained: 31, maxMarks: 80, letterGrade: 'C', remarks: null, version: 2, updatedAt: new Date('2026-08-12T07:00:00.000Z'),
    }) });
    const intent = await service.resolve(principal, input('result_repair'));
    expect(intent).toMatchObject({ door: 'result_repair', sessionType: 'repair', emotionalRegister: 'flat_practical' });
    expect(intent.scope.summary).toContain('31/80');
    expect(intent.scope.knownFailureDetails.join(' ')).toContain('Question-level evidence is not published');
    expect(intent.policyDisclosures.join(' ')).toContain('cannot change marks');
  });

  it('resolves a current exam date and syllabus into a calm Revise intent', async () => {
    const examSource = vi.fn().mockResolvedValue({
      id: SOURCE_ID, examId: PATH_ID, examName: 'Finals', examStatus: 'scheduled', subjectId: TOPIC_ID,
      subjectName: 'Chemistry', examDate: '2099-09-20', startTime: '09:30', syllabusNote: 'Equilibrium and acids',
      scheduleVersion: 3, examVersion: 4, updatedAt: new Date(),
    });
    const { service } = harness({ examSource });
    const intent = await service.resolve(principal, input('upcoming_exam'));
    expect(intent.sessionType).toBe('revise');
    expect(intent.time.examDate).toContain('2099-09-20');
    expect(intent.scope.curriculum).toEqual(['Equilibrium and acids']);
    expect(intent.registerFactors.join(' ')).not.toMatch(/urgent|hurry/i);
  });

  it('resolves only an authoritative assigned assignment into guided-homework context', async () => {
    const assignmentSource = vi.fn().mockResolvedValue({
      assignment: {
        id: SOURCE_ID, institutionId: INSTITUTION_ID, campusId: null, classId: PATH_ID,
        subjectId: TOPIC_ID, title: 'Quadratic practice', instructions: 'Show your setup.',
        dueDate: '2099-09-20', aiPolicy: 'hints_only', status: 'published', version: 3,
        createdAt: new Date('2026-08-12T07:00:00.000Z'), updatedAt: new Date('2026-08-12T08:00:00.000Z'),
      },
      submission: { status: 'assigned', version: 1 },
      subjectName: 'Mathematics',
    });
    const { service } = harness({ assignmentSource });
    const intent = await service.resolve(principal, input('active_homework'));
    expect(intent).toMatchObject({
      door: 'active_homework',
      sessionType: 'repair',
      homeworkContext: { assignmentId: SOURCE_ID, classId: PATH_ID, subjectId: TOPIC_ID, relationBasisPoints: 10_000, status: 'assigned' },
    });
    expect(intent.policyDisclosures.join(' ')).toMatch(/hints.*final answer/i);
  });

  it('requires completed extraction and produces exact authorized page citations', async () => {
    const ready = {
      item: { objectIds: [OBJECT_ID], origin: {}, id: SOURCE_ID, title: 'Biology notes', kind: 'pdf', pageCount: 8, extractedTextReady: true, indexReady: true, status: 'ready', pagesDone: 8, version: 5 },
      pages: [{ id: PAGE_ID, itemId: SOURCE_ID, objectId: OBJECT_ID, needsConfirm: false, ocrConfidence: null, confirmedAt: null, pageIndex: 6, text: 'Chlorophyll absorbs light energy for the light-dependent reactions.', updatedAt: new Date('2026-08-12T06:00:00.000Z') }],
    };
    const { service } = harness({ documentSource: vi.fn().mockResolvedValue(ready) });
    const intent = await service.resolve(principal, input('uploaded_document', { page: 7, section: 'Light reactions' }));
    expect(intent.citations[0]).toMatchObject({ page: 7, section: 'Light reactions', sourceId: SOURCE_ID });
    expect(intent.citations[0]?.excerpt).toContain('Chlorophyll');

    const pending = harness({ documentSource: vi.fn().mockResolvedValue({ ...ready, item: { ...ready.item, status: 'reading', extractedTextReady: false } }) });
    await expect(pending.service.resolve(principal, input('uploaded_document', { page: 7 }))).rejects.toMatchObject({ status: 409 });
    expect(pending.repo.recordFailureEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'failure',
      reasonCode: 'PETROS_DOCUMENT_EXTRACTION_PENDING',
    }));
  });

  it('uses explicit revision questions from an uploaded document as the teaching curriculum', async () => {
    const ready = {
      item: { objectIds: [OBJECT_ID], origin: {}, id: SOURCE_ID, title: 'Module 1 revision', kind: 'pdf', pageCount: 1, extractedTextReady: true, indexReady: true, status: 'ready', pagesDone: 1, version: 1 },
      pages: [{ id: PAGE_ID, itemId: SOURCE_ID, objectId: OBJECT_ID, needsConfirm: false, ocrConfidence: null, confirmedAt: null, pageIndex: 0, text: 'MODULE 1 REVISION QUESTIONS\n1. Why is grid computing considered the predecessor of cloud computing? Explain.\n2. How does IaaS divide responsibility?', updatedAt: new Date('2026-08-12T06:00:00.000Z') }],
    };
    const { service } = harness({ documentSource: vi.fn().mockResolvedValue(ready) });

    const intent = await service.resolve(principal, input('uploaded_document', { page: 1 }));

    expect(intent.scope.curriculum).toEqual([
      'Why is grid computing considered the predecessor of cloud computing?',
      'How does IaaS divide responsibility?',
    ]);
  });

  it('caches a versioned document outline, surfaces the teacher schedule, and starts only the selected topic', async () => {
    const pages = [
      { id: PAGE_ID, itemId: SOURCE_ID, objectId: OBJECT_ID, needsConfirm: false, ocrConfidence: null, confirmedAt: null, pageIndex: 0, text: 'MODULE I CLOUD BASICS\nCloud computing pools shared resources.', updatedAt: new Date('2026-08-12T06:00:00.000Z') },
      { id: PATH_ID, itemId: SOURCE_ID, objectId: OBJECT_ID, needsConfirm: false, ocrConfidence: null, confirmedAt: null, pageIndex: 1, text: 'MODULE II SERVICE MODELS\nIaaS changes the responsibility boundary.', updatedAt: new Date('2026-08-12T06:10:00.000Z') },
    ];
    const ready = {
      item: { objectIds: [OBJECT_ID], id: SOURCE_ID, title: 'Cloud revision', kind: 'pdf', pageCount: 2, extractedTextReady: true, indexReady: true, status: 'ready', pagesDone: 2, version: 4, origin: { classMaterialId: TOPIC_ID } },
      pages,
      allPages: pages,
    };
    const documentSource = vi.fn().mockResolvedValue(ready);
    const { service, repo, loop } = harness({
      documentSource,
      documentSchedule: vi.fn().mockResolvedValue({ kind: 'exam', title: 'Cloud final', at: '2099-09-20T09:30:00.000Z', subjectName: 'Cloud Computing' }),
    });

    const first = await service.resolve(principal, input('uploaded_document'));
    expect(first.planning).toMatchObject({
      outlineStatus: 'generated',
      suggestedPriority: 'exam_prep',
      deadline: { title: 'Cloud final', source: 'teacher_schedule' },
    });
    expect(first.planning?.topics).toHaveLength(2);
    expect(repo.saveDocumentOutline).toHaveBeenCalledTimes(1);

    const second = await service.resolve(principal, input('uploaded_document'));
    expect(second.planning?.outlineStatus).toBe('cached');
    expect(repo.saveDocumentOutline).toHaveBeenCalledTimes(1);

    const selected = first.planning!.topics[1]!;
    await service.start(principal, first.id, {
      idempotencyKey: crypto.randomUUID(),
      plan: {
        topicId: selected.id,
        priority: 'quick_review',
        timeBudgetSeconds: 600,
        existingDoubt: 'Why does responsibility shift?',
      },
    });
    expect(loop.create).toHaveBeenCalledWith(principal, expect.objectContaining({
      topic: selected.title,
      timeBudgetSeconds: 600,
      learnerContext: expect.objectContaining({
        teachingPriority: 'quick_review',
        existingDoubt: 'Why does responsibility shift?',
      }),
      sourceContext: expect.objectContaining({
        citations: [expect.objectContaining({ section: selected.title })],
      }),
    }));
  });

  it('resolves only the next evidence-gated path item and does not complete it on preview', async () => {
    const pathSource = vi.fn().mockResolvedValue({
      path: { id: PATH_ID, title: 'Mechanics path', subjectLabel: 'Physics', version: 2 },
      item: { id: SOURCE_ID, pathId: PATH_ID, topicId: TOPIC_ID, sequence: 2, whyHere: 'Builds on vectors', status: 'current', version: 1 },
      topic: { id: TOPIC_ID, title: 'Newton laws' },
      previous: [{ title: 'Vectors', status: 'completed' }],
    });
    const { service, repo } = harness({ pathSource });
    const intent = await service.resolve(principal, input('learning_path'));
    expect(intent.scope.learningPathPosition).toMatchObject({ itemId: SOURCE_ID, sequence: 2, prerequisites: ['Vectors'] });
    expect(repo).not.toHaveProperty('completePathItemFromEvidence');
  });

  it('resolves an owner-scoped reflection recommendation through the shared Stage 8 intent contract', async () => {
    const reflectionSource = vi.fn().mockResolvedValue({
      recommendation: {
        id: SOURCE_ID,
        actionLabel: 'Repair vectors',
        title: 'Vectors',
        whyThis: 'Vectors is a prerequisite and current evidence is fragile.',
        sessionType: 'repair',
        reasons: [{ label: 'This prerequisite affects two current topics.' }],
        sourceFingerprint: 'vectors:repair:prerequisite_gap',
      },
      snapshot: { algorithmVersion: 'petros.reflection.stage11.v1' },
    });
    const { service, repo } = harness({ reflectionSource });
    const intent = await service.resolve(principal, input('reflection_action'));
    expect(reflectionSource).toHaveBeenCalledWith(
      { institutionId: INSTITUTION_ID, studentId: STUDENT_ID },
      SOURCE_ID,
    );
    expect(intent).toMatchObject({
      door: 'reflection_action',
      sessionType: 'repair',
      returnDestination: { href: '/progress', label: 'Learning progress' },
    });
    expect(intent.scope.knownFailureDetails).toEqual(['This prerequisite affects two current topics.']);
    expect(intent.policyDisclosures.join(' ')).toMatch(/not a hidden ability score/i);
    await service.start(principal, intent.id, { idempotencyKey: crypto.randomUUID() });
    expect(repo.markReflectionRecommendationStarted).toHaveBeenCalledWith(
      { institutionId: INSTITUTION_ID, studentId: STUDENT_ID },
      SOURCE_ID,
      intent.id,
    );
  });

  it('keeps a small assistant question inline and makes a deep handoff an explicit offer', async () => {
    const { service, loop, repo, gateway } = harness();
    const quick = await service.assistant(principal, {
      question: 'What is this?',
      route: '/home',
      selectedCard: { title: 'Technical essay', description: 'Due tomorrow', href: '/assignments' },
      idempotencyKey: crypto.randomUUID(),
    });
    expect(quick.mode).toBe('quick_answer');
    const payload = JSON.parse(gateway.execute.mock.calls[0]![0].input[0].text);
    expect(payload.selectedCard).toEqual({ title: 'Technical essay', description: 'Due tomorrow', href: '/assignments' });
    expect(gateway.execute.mock.calls[0]![0].system).toContain('answer about selectedCard');
    const deep = await service.assistant(principal, { question: 'Explain step-by-step why this result needs a different method', route: '/results', idempotencyKey: crypto.randomUUID() });
    expect(deep.mode).toBe('session_offer');
    expect(deep.offer).not.toBeNull();
    expect(loop.create).not.toHaveBeenCalled();
    expect(repo.recordEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'assistant_offered' }));
  });

  it('uses grounded deterministic demo text without contacting an AI provider', async () => {
    const base = harness({
      assistantContext: vi.fn().mockResolvedValue({
        student: { name: 'Alex', className: 'Class A' },
        assignments: [{ title: 'Cloud design', dueDate: '2026-08-20', status: 'assigned', teacherFeedback: null }],
        homework: [], results: [], attendance: [], exams: [], courses: [], planner: [], learnerEvidence: [], classNotices: [],
      }),
    });
    const demoService = new PetrosSessionIntentService(
      base.repo,
      base.loop,
      base.gateway,
      { PETROS_AI_MODE: 'demo' } as never,
      { logAudit: vi.fn() } as never,
    );
    const result = await demoService.assistant(principal, {
      question: 'What should I focus on today?',
      route: '/home',
      idempotencyKey: crypto.randomUUID(),
    });
    expect(result.answer).toContain('Demo mode');
    expect(result.answer).toContain('Cloud design');
    expect(base.gateway.execute).not.toHaveBeenCalled();
  });

  it('transfers the authorized visible subject and version into an assistant handoff', async () => {
    const resultSource = vi.fn().mockResolvedValue({
      id: SOURCE_ID, subjectId: TOPIC_ID, subjectName: 'Mathematics', assessmentName: 'Unit test', examName: 'Term test',
      marksObtained: 41, maxMarks: 100, letterGrade: 'C', remarks: 'Show the operation used.', version: 2,
      updatedAt: new Date('2026-08-12T07:00:00.000Z'),
    });
    const { service } = harness({ resultSource });
    const intent = await service.resolve(principal, input('assistant_handoff', {
      question: 'Explain this result step by step.',
      route: '/results',
    }));
    expect(intent.targetConcepts).toEqual(['Mathematics']);
    expect(intent.scope.curriculum).toEqual(['Mathematics']);
    expect(intent.citations[0]?.label).toContain('Mathematics');
    expect(resultSource).toHaveBeenCalled();
  });

  it('returns the same not-found boundary for missing or unauthorized source records', async () => {
    const { service, repo } = harness({ resultSource: vi.fn().mockResolvedValue(undefined) });
    await expect(service.resolve(principal, input('result_repair'))).rejects.toMatchObject({ status: 404 });
    expect(repo.recordFailureEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'failure',
      reasonCode: 'PETROS_INTENT_SOURCE_NOT_FOUND',
    }));
  });

  it('reuses an idempotent preview and creates only one shared-engine session on repeated starts', async () => {
    const resultSource = vi.fn().mockResolvedValue({
      id: SOURCE_ID, subjectId: TOPIC_ID, subjectName: 'Physics', assessmentName: 'Unit test', examName: 'Term test',
      marksObtained: 31, maxMarks: 80, letterGrade: 'C', remarks: null, version: 2, updatedAt: new Date('2026-08-12T07:00:00.000Z'),
    });
    const { service, repo, loop } = harness({ resultSource });
    const request = input('result_repair');
    const first = await service.resolve(principal, request);
    const second = await service.resolve(principal, request);
    expect(second.id).toBe(first.id);
    expect(resultSource).toHaveBeenCalledTimes(1);

    await service.start(principal, first.id, { idempotencyKey: crypto.randomUUID() });
    await service.start(principal, first.id, { idempotencyKey: crypto.randomUUID() });
    expect(loop.create).toHaveBeenCalledTimes(1);
    expect(loop.document).toHaveBeenCalledTimes(1);
    expect(repo.recordEvent.mock.calls.filter(([event]: any[]) => event.type === 'start')).toHaveLength(1);
  });

  it('invalidates a preview when its authorized source changes before start', async () => {
    const source = {
      id: SOURCE_ID, subjectId: TOPIC_ID, subjectName: 'Physics', assessmentName: 'Unit test', examName: 'Term test',
      marksObtained: 31, maxMarks: 80, letterGrade: 'C', remarks: null, version: 2, updatedAt: new Date('2026-08-12T07:00:00.000Z'),
    };
    const resultSource = vi.fn().mockResolvedValueOnce(source).mockResolvedValueOnce({ ...source, marksObtained: 42, version: 3 });
    const { service, repo, loop } = harness({ resultSource });
    const resolved = await service.resolve(principal, input('result_repair'));
    await expect(service.start(principal, resolved.id, { idempotencyKey: crypto.randomUUID() })).rejects.toMatchObject({ status: 409 });
    expect(repo.invalidate).toHaveBeenCalledWith(expect.anything(), resolved.id, 'invalidated');
    expect(repo.recordFailureEvent).toHaveBeenCalledWith(expect.objectContaining({
      intentId: resolved.id,
      reasonCode: 'PETROS_INTENT_STALE',
    }));
    expect(loop.create).not.toHaveBeenCalled();
  });
});
