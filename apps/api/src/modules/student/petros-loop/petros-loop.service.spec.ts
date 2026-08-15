import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import {
  PETROS_PLAN_FUNCTION_KEY,
  PETROS_PLAN_PROMPT_VERSION,
  PETROS_PLAN_SCHEMA_VERSION,
  PETROS_MOVE_RENDER_FUNCTION_KEYS,
  PETROS_RENDER_PROMPT_VERSION,
  PETROS_RENDER_SCHEMA_VERSION,
  PETROS_SESSION_STATE_VERSION,
  PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
  PETROS_LEARNER_SNAPSHOT_SCHEMA_VERSION,
  type PetrosLearningSessionDocument,
  type PetrosSessionState,
} from '@edrion/schemas';
import { STUDENT_PERMISSIONS_KEY } from '../core/student.decorators';
import type { InstitutionalStudentPrincipal } from '../student.types';
import { StudentPetrosLoopController } from './petros-loop.controller';
import { deterministicPlan, deterministicRender } from './petros-loop.policy';
import { PetrosLoopService } from './petros-loop.service';
import { stage4ProfileFixture } from './petros-stage4.fixture';

const INSTITUTION_ID = '33333333-3333-4333-8333-333333333333';
const STUDENT_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const DECISION_ID = '44444444-4444-4444-8444-444444444444';
const BLOCK_ID = '55555555-5555-4555-8555-555555555555';

const principal: InstitutionalStudentPrincipal = {
  kind: 'institutional',
  institutionId: INSTITUTION_ID,
  campusId: null,
  institutionUserId: '66666666-6666-4666-8666-666666666666',
  studentId: STUDENT_ID,
  email: 'learner@example.test',
  fullName: 'Learner',
  lastAuthAt: null,
  permissions: ['student.learn.use'],
};

function makeHarness(
  options: { outage?: boolean; commandState?: 'started' | 'completed' | 'in_flight' } = {},
) {
  const now = new Date('2026-08-08T08:00:00.000Z');
  const publishedProfile = stage4ProfileFixture('photosynthesis', INSTITUTION_ID);
  const session = {
    id: SESSION_ID,
    institutionId: INSTITUTION_ID,
    studentId: STUDENT_ID,
    clientRequestId: '77777777-7777-4777-8777-777777777777',
    stateVersion: PETROS_SESSION_STATE_VERSION,
    sessionType: 'repair',
    status: 'active',
    topic: 'photosynthesis',
    currentGoal: 'Understand the core relationship in photosynthesis.',
    timeBudgetSeconds: 480,
    elapsedSeconds: 10,
    activeSince: null,
    maxMoves: 4,
    checkpoints: [0, 1, 2, 3].map((index) => ({
      id: `checkpoint-${index + 1}`,
      label: `Checkpoint ${index + 1}`,
      status: index === 0 ? ('current' as const) : ('pending' as const),
    })),
    currentCheckpointId: 'checkpoint-1',
    learnerContext: {},
    topicContext: {},
    topicProfileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    topicProfileVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    resolvedTopicProfile: publishedProfile,
    sourceContext: null,
    topicProfile: {
      profileId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      canonicalVersionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      canonicalVersion: 1,
      resolution: 'canonical' as const,
      overrideVersion: null,
      knowledgeTypes: ['conceptual'],
      representations: ['visual'],
      cacheKey: 'fixture:photosynthesis',
    },
    promptVersion: PETROS_PLAN_PROMPT_VERSION,
    outputSchemaVersion: PETROS_PLAN_SCHEMA_VERSION,
    planningStartedAt: null,
    closeReason: null,
    closedAt: null,
    version: 0,
    createdAt: now,
    updatedAt: now,
  };
  const decisions: Array<Record<string, any>> = [];
  const blocks: Array<Record<string, any>> = [];
  const questionSpecs: Array<Record<string, any>> = [];
  const completedDocument: PetrosLearningSessionDocument = {
    stateVersion: PETROS_SESSION_STATE_VERSION,
    id: SESSION_ID,
    version: 0,
    status: 'active',
    sessionType: 'repair',
    topic: session.topic,
    currentGoal: session.currentGoal,
    timeBudgetSeconds: 480,
    elapsedSeconds: 10,
    maxMoves: 4,
    checkpoints: session.checkpoints,
    currentCheckpointId: 'checkpoint-1',
    closeReason: null,
    sourceContext: null,
    topicProfile: session.topicProfile,
    blocks: [],
    expectedMoveType: null,
    fallbackNotice: null,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    detours: [],
    observationSummary: {
      answered: 0,
      correct: 0,
      incorrect: 0,
      partial: 0,
      highValueMisconceptions: 0,
      fragileSuccesses: 0,
      openDetours: 0,
      activeStruggleLevel: 0,
      activeWrongAttemptCount: 0,
    },
  };
  const repo = {
    findSession: vi.fn(async (scope: { institutionId: string; studentId: string }) =>
      scope.institutionId === session.institutionId && scope.studentId === session.studentId
        ? session
        : undefined,
    ),
    attachResolvedTopicProfile: vi.fn(async (_scope, _sessionId, values) => {
      Object.assign(session, values);
      return session;
    }),
    listDecisions: vi.fn(async () => decisions),
    listBlocks: vi.fn(async () => blocks),
    listQuestionSpecs: vi.fn(async () => questionSpecs),
    listObservations: vi.fn(async () => []),
    listEvaluations: vi.fn(async () => []),
    listStretches: vi.fn(async () => []),
    listDetours: vi.fn(async () => []),
    findCurrentBlock: vi.fn(async () => blocks.find((block) => block.status === 'current')),
    beginCommand: vi.fn(async () =>
      options.commandState === 'completed'
        ? { state: 'completed', row: { id: 'command' }, response: completedDocument }
        : options.commandState === 'in_flight'
          ? { state: 'in_flight', row: { id: 'command' } }
          : { state: 'started', row: { id: 'command' } },
    ),
    acquirePlanning: vi.fn(async () => session),
    releasePlanning: vi.fn(async () => undefined),
    findPendingDecision: vi.fn(async () => undefined),
    insertDecision: vi.fn(async (values: Record<string, unknown>) => {
      const row = { ...values, id: DECISION_ID, createdAt: now, updatedAt: now };
      decisions.push(row);
      return row;
    }),
    insertRenderedBlock: vi.fn(
      async (
        decisionId: string,
        values: Record<string, unknown>,
        route: Record<string, unknown>,
        questions: Array<Record<string, unknown>> = [],
      ) => {
        const row = {
          ...values,
          id: BLOCK_ID,
          version: 0,
          createdAt: now,
          updatedAt: now,
          completedAt: null,
        };
        blocks.push(row);
        questionSpecs.push(...questions);
        const decision = decisions.find((candidate) => candidate.id === decisionId)!;
        decision.status = 'rendered';
        decision.resultingBlockId = BLOCK_ID;
        decision.renderRequestId = route.renderRequestId ?? null;
        decision.routeReference = route.routeReference ?? null;
        return row;
      },
    ),
    recordEvent: vi.fn(async () => ({})),
    recordObservation: vi.fn(async () => ({})),
    finishCommand: vi.fn(async () => undefined),
    failCommand: vi.fn(async () => undefined),
    setSessionStatus: vi.fn(async (_scope, _id, patch: Record<string, unknown>) => {
      Object.assign(session, patch, { updatedAt: now });
      return session;
    }),
    findBlock: vi.fn(async (_scope, _sessionId, blockId: string) =>
      blocks.find((block) => block.id === blockId),
    ),
    findQuestionSpec: vi.fn(async (_scope, _sessionId, _blockId, questionId: string) =>
      questionSpecs.find((question) => question.id === questionId),
    ),
    updateBlockInteraction: vi.fn(),
    completeBlock: vi.fn(),
    commitAnswer: vi.fn(async () => ({ state: 'committed' as const })),
    recordHint: vi.fn(async () => blocks[0]),
    createDetour: vi.fn(async () => session),
    activateDetours: vi.fn(async () => []),
    rejoinDecisionDetours: vi.fn(async () => []),
    listDecisionDiagnostics: vi.fn(),
    listObservationDiagnostics: vi.fn(),
    recordDoorLifecycle: vi.fn(async () => undefined),
    completePathItemFromEvidence: vi.fn(async () => undefined),
  };

  const explicitState: PetrosSessionState = {
    stateVersion: PETROS_SESSION_STATE_VERSION,
    sessionId: SESSION_ID,
    studentId: STUDENT_ID,
    institutionId: INSTITUTION_ID,
    sessionType: 'repair' as const,
    topic: session.topic,
    currentGoal: session.currentGoal,
    time: { budgetSeconds: 480, elapsedSeconds: 10, remainingSeconds: 470 },
    moves: { maximum: 4, used: 0, remaining: 4 },
    checkpointPlan: session.checkpoints,
    currentCheckpointId: 'checkpoint-1',
    priorMoves: [],
    learnerContext: {},
    topicContext: {},
    resolvedTopicProfile: session.resolvedTopicProfile,
    sourceContext: null,
    observations: {
      recent: [],
      summarizedOutcomes: {
        answered: 0,
        correct: 0,
        incorrect: 0,
        partial: 0,
        highValueMisconceptions: 0,
        fragileSuccesses: 0,
        openDetours: 0,
        activeStruggleLevel: 0,
        activeWrongAttemptCount: 0,
      },
    },
    promptVersion: PETROS_PLAN_PROMPT_VERSION,
    outputSchemaVersion: PETROS_PLAN_SCHEMA_VERSION,
  };
  const plan = deterministicPlan(explicitState);
  const render = deterministicRender(plan, explicitState);
  const execute = vi.fn(
    async (request: { context: { functionKey: string; requestId: string } }) => {
      if (options.outage) throw new Error('provider unavailable');
      return {
        kind: 'json' as const,
        content: request.context.functionKey === PETROS_PLAN_FUNCTION_KEY ? plan : render,
        inputTokens: 20,
        outputTokens: 30,
        cachedTokens: 0,
        requestId: request.context.requestId,
        providerKey: 'private-provider',
        modelKey: 'private-model',
        fallbackTier: 0,
        cached: false,
        functionKey: request.context.functionKey,
        promptVersion:
          request.context.functionKey === PETROS_PLAN_FUNCTION_KEY
            ? PETROS_PLAN_PROMPT_VERSION
            : PETROS_RENDER_PROMPT_VERSION,
        schemaVersion:
          request.context.functionKey === PETROS_PLAN_FUNCTION_KEY
            ? PETROS_PLAN_SCHEMA_VERSION
            : PETROS_RENDER_SCHEMA_VERSION,
      };
    },
  );
  const audit = { logAudit: vi.fn(async () => undefined) };
  const topicProfiles = { resolveForSession: vi.fn(async () => publishedProfile) };
  const learnerModels = {
    snapshot: vi.fn(async () => ({
      schemaVersion: PETROS_LEARNER_SNAPSHOT_SCHEMA_VERSION,
      algorithmVersion: PETROS_LEARNER_MODEL_ALGORITHM_VERSION,
      generatedAt: now.toISOString(),
      topicId: 'photosynthesis',
      neutral: true,
      stale: false,
      mastery: [],
      moveOutcomes: [],
      preference: {
        pace: 'neutral',
        depth: 'neutral',
        observed: { skips: 0, expands: 0, reads: 0, responses: 0, meanResponseTimeMs: 0 },
        evidenceCount: 0,
        confidenceBasisPoints: 0,
        minimumEvidenceMet: false,
      },
      sessionOverride: null,
      errors: [],
      calibration: {
        buckets: ['sure', 'think_so', 'guessing'].flatMap((confidence) =>
          ['correct', 'partial', 'wrong'].map((outcome) => ({ confidence, outcome, count: 0 })),
        ),
        scoreBasisPoints: 5_000,
        uncertaintyBasisPoints: 10_000,
        fragileConfidence: false,
        evidenceCount: 0,
      },
      causalFactors: [],
      evidenceEventIds: [],
    })),
    recordPlanSnapshot: vi.fn(async () => undefined),
    ingest: vi.fn(async () => ({ accepted: true, duplicate: false })),
  };
  const service = new PetrosLoopService(
    repo as never,
    { execute } as never,
    topicProfiles as never,
    learnerModels as never,
    audit as never,
  );
  return {
    service,
    repo,
    execute,
    topicProfiles,
    learnerModels,
    session,
    decisions,
    blocks,
    questionSpecs,
    completedDocument,
  };
}

describe('PetrosLoopService coordination', () => {
  it('calls PLAN and RENDER separately and creates one traceable block', async () => {
    const harness = makeHarness();
    const result = await harness.service.continue(
      principal,
      SESSION_ID,
      '88888888-8888-4888-8888-888888888888',
    );
    expect(harness.execute.mock.calls.map(([request]) => request.context.functionKey)).toEqual([
      PETROS_PLAN_FUNCTION_KEY,
      PETROS_MOVE_RENDER_FUNCTION_KEYS[result.blocks[0]!.content.type],
    ]);
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]).toMatchObject({
      correlationId: harness.decisions[0]!.correlationId,
      delivery: 'ai',
    });
    expect(harness.decisions[0]!.planRequestId).toBeTruthy();
    expect(harness.decisions[0]!.renderRequestId).toBeTruthy();
  });

  it('uses a provider-neutral deterministic block when every AI route is unavailable', async () => {
    const harness = makeHarness({ outage: true });
    const result = await harness.service.continue(
      principal,
      SESSION_ID,
      '99999999-9999-4999-8999-999999999999',
    );
    expect(harness.execute).toHaveBeenCalledTimes(2);
    expect(result.blocks[0]?.delivery).toBe('deterministic_fallback');
    expect(result.fallbackNotice).toMatch(/built-in teaching step/i);
    expect(JSON.stringify(result)).not.toMatch(
      /provider unavailable|private-provider|private-model/i,
    );
  });

  it('returns a completed idempotent response without another AI call', async () => {
    const harness = makeHarness({ commandState: 'completed' });
    const result = await harness.service.continue(
      principal,
      SESSION_ID,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    );
    expect(result).toEqual(harness.completedDocument);
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it('rejects duplicate in-flight planning without revealing internal state', async () => {
    const harness = makeHarness({ commandState: 'in_flight' });
    await expect(
      harness.service.continue(principal, SESSION_ID, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
    ).rejects.toMatchObject({ response: { code: 'PETROS_CONTINUE_IN_FLIGHT' } });
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it('enforces student/institution ownership and reloads persisted state in a fresh service instance', async () => {
    const harness = makeHarness();
    const otherInstitution = {
      ...principal,
      institutionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    };
    const otherStudent = {
      ...principal,
      studentId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    };
    await expect(harness.service.document(otherInstitution, SESSION_ID)).rejects.toMatchObject({
      response: { code: 'PETROS_SESSION_NOT_FOUND' },
    });
    await expect(harness.service.document(otherStudent, SESSION_ID)).rejects.toMatchObject({
      response: { code: 'PETROS_SESSION_NOT_FOUND' },
    });
    const restarted = new PetrosLoopService(
      harness.repo as never,
      { execute: harness.execute } as never,
      { resolveForSession: vi.fn() } as never,
      harness.learnerModels as never,
      { logAudit: vi.fn() } as never,
    );
    const restored = await restarted.document(principal, SESSION_ID);
    expect(restored.id).toBe(SESSION_ID);
    expect(restored.checkpoints).toEqual(harness.session.checkpoints);
  });

  it('lazily upgrades a persisted Stage 2/3 session with a real published profile', async () => {
    const harness = makeHarness();
    harness.session.resolvedTopicProfile = {} as typeof harness.session.resolvedTopicProfile;
    harness.session.stateVersion = 'petros.session-state.v2';

    const restored = await harness.service.document(principal, SESSION_ID);

    expect(harness.topicProfiles.resolveForSession).toHaveBeenCalledWith({
      institutionId: INSTITUTION_ID,
      topic: 'photosynthesis',
      profileContext: {},
    });
    expect(harness.repo.attachResolvedTopicProfile).toHaveBeenCalled();
    expect(restored.topicProfile.canonicalVersion).toBe(1);
  });

  it('pauses, resumes, and deliberately closes a persisted session', async () => {
    const harness = makeHarness();
    expect(
      (await harness.service.pause(principal, SESSION_ID, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'))
        .status,
    ).toBe('paused');
    expect(
      (await harness.service.resume(principal, SESSION_ID, 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'))
        .status,
    ).toBe('active');
    const closed = await harness.service.close(principal, SESSION_ID, {
      idempotencyKey: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      reason: 'student_stopped',
    });
    expect(closed).toMatchObject({ status: 'closed', closeReason: 'student_stopped' });
  });

  it('declares the student.learn.use permission at the controller boundary', () => {
    expect(Reflect.getMetadata(STUDENT_PERMISSIONS_KEY, StudentPetrosLoopController)).toContain(
      'student.learn.use',
    );
  });

  it('submits answer and confidence atomically while objective evaluation avoids an AI call', async () => {
    const harness = makeHarness();
    const document = await harness.service.continue(
      principal,
      SESSION_ID,
      '10101010-1010-4010-8010-101010101010',
    );
    const question = harness.questionSpecs[0]!;
    Object.assign(question, {
      evaluationMode: 'deterministic',
      responseType: 'short_text',
      acceptableAnswers: ['energy'],
      correctChoiceId: null,
    });
    harness.execute.mockClear();
    await harness.service.submitAnswer(principal, SESSION_ID, document.blocks[0]!.id, {
      idempotencyKey: '20202020-2020-4020-8020-202020202020',
      questionId: question.id,
      answer: 'energy',
      confidence: 'think_so',
      expectedBlockVersion: 0,
      responseTimeMs: 1200,
    });
    expect(harness.execute).not.toHaveBeenCalled();
    expect(harness.repo.commitAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        observation: expect.objectContaining({
          rawAnswer: 'energy',
          confidence: 'think_so',
          type: 'answer_submitted',
        }),
        confidenceObservation: expect.objectContaining({
          confidence: 'think_so',
          type: 'confidence_selected',
        }),
        evaluation: expect.objectContaining({
          evaluator: 'deterministic',
          correctness: 'correct',
          fragileSuccess: true,
        }),
      }),
    );
  });

  it('returns an answer command idempotently without evaluating or advancing twice', async () => {
    const harness = makeHarness();
    const document = await harness.service.continue(
      principal,
      SESSION_ID,
      '30303030-3030-4030-8030-303030303030',
    );
    harness.repo.beginCommand.mockResolvedValueOnce({
      state: 'completed',
      row: { id: 'command' },
      response: document,
    });
    harness.execute.mockClear();
    await harness.service.submitAnswer(principal, SESSION_ID, document.blocks[0]!.id, {
      idempotencyKey: '40404040-4040-4040-8040-404040404040',
      questionId: harness.questionSpecs[0]!.id,
      answer: 'attempt',
      confidence: 'guessing',
      expectedBlockVersion: 0,
    });
    expect(harness.repo.commitAnswer).not.toHaveBeenCalled();
    expect(harness.execute).not.toHaveBeenCalled();
  });

  it('rejects a stale concurrent answer before evaluation can advance the ladder', async () => {
    const harness = makeHarness();
    const document = await harness.service.continue(
      principal,
      SESSION_ID,
      '50505050-5050-4050-8050-505050505050',
    );
    harness.execute.mockClear();
    await expect(
      harness.service.submitAnswer(principal, SESSION_ID, document.blocks[0]!.id, {
        idempotencyKey: '60606060-6060-4060-8060-606060606060',
        questionId: harness.questionSpecs[0]!.id,
        answer: 'attempt',
        confidence: 'sure',
        expectedBlockVersion: 99,
      }),
    ).rejects.toMatchObject({ response: { code: 'PETROS_BLOCK_STALE' } });
    expect(harness.execute).not.toHaveBeenCalled();
    expect(harness.repo.commitAnswer).not.toHaveBeenCalled();
  });

  it('falls back safely on malformed evaluator output without counting a conceptual failure', async () => {
    const harness = makeHarness();
    const document = await harness.service.continue(
      principal,
      SESSION_ID,
      '70707070-7070-4070-8070-707070707070',
    );
    harness.execute.mockClear();
    await harness.service.submitAnswer(principal, SESSION_ID, document.blocks[0]!.id, {
      idempotencyKey: '80808080-8080-4080-8080-808080808080',
      questionId: harness.questionSpecs[0]!.id,
      answer: 'a meaningful attempt',
      confidence: 'guessing',
      expectedBlockVersion: 0,
    });
    expect(harness.execute).toHaveBeenCalledTimes(1);
    expect(harness.repo.commitAnswer).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluation: expect.objectContaining({ evaluator: 'safe_fallback', correctness: 'partial' }),
        ladder: expect.objectContaining({ countedWrong: false, wrongAttemptCount: 0 }),
      }),
    );
  });

  it('rejoins an active composer detour only after its changed block is completed', async () => {
    const harness = makeHarness({ outage: true });
    const document = await harness.service.continue(
      principal,
      SESSION_ID,
      '90909090-9090-4090-8090-909090909090',
    );
    const block = harness.blocks[0]!;
    const question = harness.questionSpecs[0]!;
    question.active = false;
    harness.repo.listStretches.mockResolvedValue([
      { equivalenceKey: question.equivalenceKey, status: 'recovered' },
    ] as never);
    harness.repo.completeBlock.mockImplementation(async () => {
      Object.assign(block, { status: 'completed', version: 1, completedAt: new Date() });
      return block;
    });

    await harness.service.complete(principal, SESSION_ID, block.id, {
      idempotencyKey: '91919191-9191-4191-8191-919191919191',
      blockType: document.blocks[0]!.content.type,
      expectedBlockVersion: 0,
      interactionState: {},
      observedOutcome: { completed: true },
    });

    expect(harness.repo.rejoinDecisionDetours).toHaveBeenCalledWith(
      { institutionId: INSTITUTION_ID, studentId: STUDENT_ID },
      SESSION_ID,
      block.decisionId,
    );
    expect(harness.learnerModels.ingest).toHaveBeenCalledWith(
      { institutionId: INSTITUTION_ID, studentId: STUDENT_ID },
      expect.objectContaining({
        sourceEventId: `block-completed:${block.id}`,
        evidenceKind: 'engagement',
        metadata: expect.objectContaining({ action: 'read' }),
      }),
    );
  });
});
