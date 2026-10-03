import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  adaptPetrosDiagram,
  PETROS_RENDER_SCHEMA_VERSION,
  PETROS_SESSION_STATE_VERSION,
  type PetrosLearningSessionDocument,
  type PetrosTeachingBlockContent,
} from '@edrion/schemas';
import { PetrosRepairSession } from './petros-repair-session';
import { visualDiagramFixture } from '../../../../../packages/schemas/src/__fixtures__/petros-visual';

const memory = vi.hoisted(() => ({
  document: null as PetrosLearningSessionDocument | null,
}));
const api = vi.hoisted(() => ({
  get: vi.fn(async (path: string): Promise<unknown> => path.endsWith('/visual') ? { status: 'disabled', reason: 'Disabled' } : path.includes('/document-questions') ? null : memory.document),
  post: vi.fn(async (_path: string, ..._args: unknown[]) => memory.document),
  put: vi.fn(async (path: string, body: { interactionState: Record<string, unknown> }) => {
    const blockId = path.split('/').at(-2)!;
    if (memory.document) {
      memory.document = {
        ...memory.document,
        blocks: memory.document.blocks.map((block) =>
          block.id === blockId ? { ...block, interactionState: body.interactionState } : block,
        ),
      };
    }
    return { ok: true };
  }),
}));

vi.mock('@/lib/api-client', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/api-client')>(),
  useStudentApi: () => api,
  formatApiError: (error: unknown) =>
    error instanceof Error ? error.message : 'Something went wrong.',
  newIdempotencyKey: () => '99999999-9999-4999-8999-999999999999',
}));

function storedDocument(): PetrosLearningSessionDocument {
  return {
    stateVersion: PETROS_SESSION_STATE_VERSION,
    id: '11111111-1111-4111-8111-111111111111',
    version: 0,
    status: 'active',
    sessionType: 'repair',
    topic: 'photosynthesis',
    currentGoal: 'Understand the relationship between light and stored chemical energy.',
    timeBudgetSeconds: 480,
    elapsedSeconds: 30,
    maxMoves: 4,
    checkpoints: [
      { id: 'checkpoint-1', label: 'Find the useful entry', status: 'current' },
      { id: 'checkpoint-2', label: 'Build the idea', status: 'pending' },
      { id: 'checkpoint-3', label: 'Bring it back', status: 'pending' },
      { id: 'checkpoint-4', label: 'Make it yours', status: 'pending' },
    ],
    currentCheckpointId: 'checkpoint-1',
    closeReason: null,
    sourceContext: { door: 'result_repair' },
    topicProfile: {
      profileId: '22222222-2222-4222-8222-222222222222',
      canonicalVersionId: '33333333-3333-4333-8333-333333333333',
      canonicalVersion: 1,
      resolution: 'canonical',
      overrideVersion: null,
      knowledgeTypes: ['conceptual', 'factual_memorisation'],
      representations: ['visual', 'sequential'],
      cacheKey: 'photosynthesis:generic:unspecified',
    },
    expectedMoveType: null,
    fallbackNotice: null,
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
    blocks: [
      {
        id: '55555555-5555-4555-8555-555555555555',
        sessionId: '11111111-1111-4111-8111-111111111111',
        decisionId: '44444444-4444-4444-8444-444444444444',
        sequence: 1,
        status: 'current',
        version: 0,
        content: {
          schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
          type: 'layered_explanation',
          title: 'Follow the energy change',
          firstLayer:
            'Photosynthesis stores incoming light energy in chemical bonds that can be used later by the organism.',
          deeperLayers: [
            {
              id: 'mechanism',
              label: 'Go one layer deeper',
              content:
                'The light-dependent reactions create energy carriers that support carbon fixation in the next part of the process.',
            },
          ],
          keyIdea: 'Track the form of energy before memorising the sequence of names.',
          sourceGrounding: [],
        },
        interactionState: { whyOpen: false, expandedLayerIds: [] },
        observedOutcome: null,
        questions: [
          {
            id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
            rootQuestionId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
            parentQuestionId: null,
            targetId: 'photosynthesis:verified-fixture',
            equivalenceKey: 'photosynthesis-verified-fixture',
            prompt: 'What relationship should be tracked?',
            responseType: 'short_answer',
            choices: null,
            purpose: 'recall',
            active: false,
            locked: true,
            hints: [],
            attempts: [
              {
                observationId: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb',
                questionId: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa',
                rawAnswer: 'Track how light energy becomes stored chemical energy.',
                confidence: 'think_so',
                correctness: 'correct',
                credit: 1,
                feedback: 'Correct. The relationship is secure.',
                why: ['The answer follows the changing form of energy.'],
                errorClass: '',
                submittedAt: '2026-08-08T08:00:30.000Z',
                ladderLevel: 0,
                supportKind: 'none',
                supportText: null,
                highValueMisconception: false,
                fragileSuccess: false,
                recovery: false,
              },
            ],
          },
        ],
        whyThis:
          'This topic is conceptual, so the first checkpoint needs a compact relationship before procedural practice.',
        correlationId: '77777777-7777-4777-8777-777777777777',
        delivery: 'ai',
        createdAt: '2026-08-08T08:00:00.000Z',
        completedAt: null,
      },
    ],
    createdAt: '2026-08-08T08:00:00.000Z',
    updatedAt: '2026-08-08T08:00:00.000Z',
  };
}

function documentWithCompletedBlock(
  status: 'active' | 'paused',
): PetrosLearningSessionDocument {
  const document = storedDocument();
  return {
    ...document,
    status,
    checkpoints: document.checkpoints.map((checkpoint, index) => ({
      ...checkpoint,
      status: index === 0 ? ('complete' as const) : index === 1 ? ('current' as const) : ('pending' as const),
    })),
    currentCheckpointId: 'checkpoint-2',
    blocks: document.blocks.map((block) => ({
      ...block,
      status: 'completed' as const,
      version: 1,
      completedAt: '2026-08-08T08:01:00.000Z',
    })),
  };
}

function documentWithNextBlock(): PetrosLearningSessionDocument {
  const document = documentWithCompletedBlock('active');
  const prior = document.blocks[0]!;
  return {
    ...document,
    blocks: [
      prior,
      {
        ...prior,
        id: '66666666-6666-4666-8666-666666666666',
        decisionId: '77777777-7777-4777-8777-777777777778',
        sequence: 2,
        status: 'current',
        version: 0,
        content: {
          ...prior.content,
          title: 'Build the idea with the next relationship',
        },
        interactionState: { expandedLayerIds: [] },
        completedAt: null,
      },
    ],
  };
}

const fiveStageLabels = [
  'Find the useful entry',
  'Build the idea',
  'Bring it back',
  'Make it yours',
  'Close it out',
] as const;

const fiveStageContent: PetrosTeachingBlockContent[] = [
  {
    schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
    type: 'hook',
    title: 'Find the useful starting point',
    prompt: 'What is the first useful relationship to notice in this topic?',
    reveal: 'Start from the relationship between the evidence and the controlling idea.',
    anchor: 'The authorized learning source',
  },
  {
    schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
    type: 'layered_explanation',
    title: 'Build the idea one layer at a time',
    firstLayer: 'The main idea connects the available evidence to the result you need to explain.',
    deeperLayers: [
      {
        id: 'mechanism',
        label: 'See the mechanism',
        content: 'The mechanism explains why that relationship produces the observed result.',
      },
    ],
    keyIdea: 'Keep the relationship and its mechanism together.',
    sourceGrounding: [],
  },
  {
    schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
    type: 'recall_check',
    title: 'Bring the idea back from memory',
    instructions: 'Recall the controlling relationship before looking back at the explanation.',
    questions: [
      {
        id: 'recall-1',
        prompt: 'What relationship controls the result?',
        responseType: 'short_answer',
      },
    ],
    answerContract: {
      completion: 'all_questions_answered',
      responseHandling: 'evaluate_stage_3',
    },
    feedback: {
      submittedMessage: 'Recall recorded.',
      stageBoundary: 'This brings the idea back before you apply it.',
    },
  },
  {
    schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
    type: 'synthesis',
    title: 'Make the idea yours',
    prompt: 'Write one specific sentence explaining the relationship in your own words.',
    tighteningGuidance: 'Name both the relationship and why it matters.',
    forwardLink: 'Your synthesis becomes the basis for the closing choice.',
  },
  {
    schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
    type: 'artifact_commit',
    title: 'Close it out deliberately',
    prompt: 'Choose what, if anything, should remain in your saved work.',
    proposals: [
      {
        id: 'note',
        kind: 'note',
        label: 'Session synthesis note',
        preview: 'The relationship explained in your own words.',
      },
    ],
    consentRequired: true,
  },
];

function fiveStageDocument(
  currentStage: number,
  currentCompleted = false,
  closed = false,
): PetrosLearningSessionDocument {
  const document = storedDocument();
  const blockIds = [
    '10000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000005',
  ];
  const decisionIds = [
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000004',
    '20000000-0000-4000-8000-000000000005',
  ];
  return {
    ...document,
    status: closed ? 'closed' : 'active',
    maxMoves: 5,
    checkpoints: fiveStageLabels.map((label, index) => ({
      id: `checkpoint-${index + 1}`,
      label,
      status:
        index < currentStage || (index === currentStage && currentCompleted)
          ? ('complete' as const)
          : index === currentStage || (currentCompleted && index === currentStage + 1)
            ? ('current' as const)
            : ('pending' as const),
    })),
    currentCheckpointId: `checkpoint-${Math.min(currentStage + (currentCompleted ? 2 : 1), 5)}`,
    closeReason: closed ? 'goal_met' : null,
    blocks: fiveStageContent.slice(0, currentStage + 1).map((content, index) => {
      const completed = index < currentStage || (index === currentStage && currentCompleted);
      const interactionState =
        content.type === 'hook'
          ? { revealed: completed }
          : content.type === 'layered_explanation'
            ? { expandedLayerIds: [] }
            : content.type === 'recall_check'
              ? { answers: {} }
              : content.type === 'synthesis'
                ? { response: completed ? 'The relationship connects the evidence to the result.' : '' }
                : { selectedProposalIds: [], artifactsDeclined: completed };
      return {
        ...document.blocks[0]!,
        id: blockIds[index]!,
        decisionId: decisionIds[index]!,
        sequence: index + 1,
        status: completed ? ('completed' as const) : ('current' as const),
        version: completed ? 1 : 0,
        content,
        interactionState,
        whyThis: `This is the ${fiveStageLabels[index]} stage.`,
        completedAt: completed ? '2026-08-08T08:01:00.000Z' : null,
      };
    }),
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  api.get.mockImplementation(async (path: string) => path.endsWith('/visual') ? { status: 'disabled', reason: 'Disabled' } : path.includes('/document-questions') ? null : memory.document);
  api.post.mockImplementation(async () => memory.document);
  sessionStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});

describe('Petros Stage 2 student document', () => {
  it('keeps a compact source label without injecting its excerpt into the lesson', async () => {
    memory.document = {
      ...storedDocument(),
      sourceContext: {
        door: 'uploaded_document',
        label: 'Biology notes',
        citations: [{
          label: 'Chapter 3',
          page: 12,
          section: 'Energy transfer',
          excerpt: 'Light energy is converted into chemical energy during photosynthesis.',
        }],
      },
    };
    render(
      <PetrosRepairSession
        topic="photosynthesis"
        source="material"
        sessionId={memory.document.id}
      />,
    );

    expect(await screen.findByText('Source checked')).toBeVisible();
    expect(screen.getByText(/Chapter 3 · p\. 12 · Energy transfer/)).toBeVisible();
    expect(screen.queryByLabelText(
      'Light energy is converted into chemical energy during photosynthesis.',
    )).not.toBeInTheDocument();
    expect(screen.queryByText(
      'Light energy is converted into chemical energy during photosynthesis.',
    )).not.toBeInTheDocument();
  });

  it('does not dump fragmented multi-slide extraction into the lesson', async () => {
    const fragmented = 'Slide 1 MODULE 3 Slide 2 Major hazards of construction Falls Electrocution Being struck by falling objects Slide 3 Major hazards Slide 4 Fall Protection Slide 5 Conditions that required use of fall protection';
    memory.document = {
      ...storedDocument(),
      sourceContext: {
        door: 'uploaded_document',
        label: 'Construction notes',
        citations: [{ label: 'Module 3', page: 1, section: null, excerpt: fragmented }],
      },
    };
    render(
      <PetrosRepairSession
        topic="construction hazards"
        source="material"
        sessionId={memory.document.id}
      />,
    );

    expect(await screen.findByText('Module 3 · p. 1')).toBeVisible();
    expect(screen.queryByLabelText(fragmented)).not.toBeInTheDocument();
    expect(screen.queryByText(/Slide 1 MODULE 3 Slide 2/)).not.toBeInTheDocument();
  });

  it('shows the exact stable visibility disclosure and offers an editable handoff only at the exhausted struggle level', async () => {
    memory.document = {
      ...storedDocument(),
      sourceContext: { door: 'result_repair', classId: '88888888-8888-4888-8888-888888888888', subjectId: '99999999-9999-4999-8999-999999999999' },
      observationSummary: { ...storedDocument().observationSummary, activeStruggleLevel: 4, activeWrongAttemptCount: 3 },
      institutionalPolicy: {
        snapshotId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        stableForSession: true,
        midSessionPolicyChangesDeferred: true,
        voiceRequired: false,
        handoffEnabled: true,
        handoffOfferAfterFailedRepairCount: 3,
        disclosure: {
          policyVersionIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'], stableForSession: true,
          homeworkRule: 'Related active homework uses hints, setup and feedback instead of a final answer.',
          syllabusRule: 'Approved syllabus only.',
          visibleToTeacher: ['concept_and_goal', 'teacher_handoff'],
          visibleToParent: ['session_metadata'],
          teacherPurpose: 'Support the student after an offered handoff.', parentPurpose: 'Share limited progress.',
          teacherRetentionDays: 90, parentRetentionDays: 30,
          excludedByPlatform: ['provider or model identity', 'hidden chain-of-thought', 'unsaved artifact drafts'],
          plainLanguage: ['Approved syllabus only.', 'Related active homework uses hints, setup and feedback instead of a final answer.', 'Teachers may see concept_and_goal and teacher_handoff.', 'Parents may see session_metadata.', 'A policy change applies next session.'],
        },
      },
    };
    render(<PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />);
    expect(await screen.findByRole('region', { name: 'Petros institution policy disclosure' })).toBeVisible();
    expect(screen.getByText(/approved by your institution/i)).toBeVisible();
    fireEvent.click(screen.getByText('Who can see information from this session?'));
    expect(screen.getByText(/topic and learning goal/i)).toBeVisible();
    expect(screen.getByText(/basic session details such as the date and duration/i)).toBeVisible();
    expect(screen.getByText(/Voice is optional/i)).toBeVisible();
    expect(screen.getByRole('button', { name: /preview teacher handoff/i })).toBeVisible();
  });

  it('exposes accessible progress and Why-this controls', async () => {
    memory.document = storedDocument();
    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Follow the energy change' }),
    ).toBeInTheDocument();
    const progress = screen.getByRole('progressbar');
    expect(progress).toHaveAttribute('aria-valuemax', '4');
    expect(progress).toHaveAttribute('aria-valuenow', '0');
    const why = screen.getByRole('button', { name: 'Why this step?' });
    expect(why).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(why);
    expect(why).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/topic is conceptual/i)).toBeVisible();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
  });

  it('resumes and prepares the next block when a paused session has no current action', async () => {
    const paused = documentWithCompletedBlock('paused');
    const resumed = { ...paused, status: 'active' as const };
    const continued = documentWithNextBlock();
    memory.document = paused;
    api.post.mockResolvedValueOnce(resumed).mockResolvedValueOnce(continued);

    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={paused.id} />,
    );
    const resume = await screen.findByRole('button', { name: 'Resume and continue' });
    fireEvent.click(resume);

    expect(
      await screen.findByRole('heading', { name: 'Build the idea with the next relationship' }),
    ).toBeVisible();
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/\/resume$/),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/continue$/),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('repairs an active session gap after refresh by preparing the next block', async () => {
    memory.document = documentWithCompletedBlock('active');
    const continued = documentWithNextBlock();
    api.post.mockResolvedValueOnce(continued);

    render(
      <PetrosRepairSession
        topic="photosynthesis"
        source="result"
        sessionId={memory.document.id}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: 'Build the idea with the next relationship' }),
    ).toBeVisible();
    expect(api.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/continue$/),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('shows the real decision reason and renders a requested simpler explanation without advancing the checkpoint', async () => {
    memory.document = storedDocument();
    const original = memory.document.blocks[0]!;
    const originalContent = original.content;
    if (originalContent.type !== 'layered_explanation')
      throw new Error('Expected the fixture to begin with a layered explanation.');
    const realReason =
      'The authorized source begins with a naming distinction, so this question checks that exact entry point before moving into the mechanism.';
    original.whyThis = realReason;
    const queued: PetrosLearningSessionDocument = {
      ...memory.document,
      blocks: [
        {
          ...original,
          status: 'completed',
          version: 1,
          interactionState: { ...original.interactionState, requestedAction: 'simpler' },
        },
      ],
    };
    const replacement: PetrosLearningSessionDocument = {
      ...queued,
      blocks: [
        ...queued.blocks,
        {
          ...original,
          id: '88888888-8888-4888-8888-888888888888',
          decisionId: '99999999-9999-4999-8999-999999999998',
          sequence: 2,
          status: 'current',
          version: 0,
          content: {
            ...originalContent,
            title: 'The same idea in plain language',
            firstLayer: 'Light goes in, and the plant keeps that energy in a form it can use later.',
          },
          interactionState: { expandedLayerIds: [] },
          whyThis: 'You asked for plainer language, so this replacement holds the same checkpoint.',
        },
      ],
    };
    api.post.mockResolvedValueOnce(queued).mockResolvedValueOnce(replacement);

    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );
    await screen.findByRole('heading', { name: 'Follow the energy change' });
    fireEvent.click(screen.getByRole('button', { name: 'Why this step?' }));
    expect(screen.getByText(realReason)).toBeVisible();
    expect(screen.queryByText(/topic is conceptual, so/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Explain simpler' }));
    await waitFor(() =>
      expect(api.post).toHaveBeenNthCalledWith(
        1,
        expect.stringMatching(/\/blocks\/.*\/reexplain$/),
        expect.objectContaining({
          level: 'simpler',
          expectedBlockVersion: 0,
          interactionState: expect.objectContaining({ whyOpen: true }),
        }),
      ),
    );
    expect(await screen.findByRole('heading', { name: 'The same idea in plain language' })).toBeVisible();
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/continue$/),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
      undefined,
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
  });

  it('saves a visible teaching block as a real note and confirms the completed action', async () => {
    memory.document = storedDocument();
    api.post.mockResolvedValueOnce({ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' } as never);

    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Save to notes' }));

    expect(await screen.findByText('Saved to Notes')).toBeVisible();
    expect(api.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/student\/petros\/artifacts\/sessions\/.*\/blocks\/.*/i),
      expect.objectContaining({
        idempotencyKey: expect.any(String),
        content: expect.objectContaining({
          kind: 'note',
          title: 'Follow the energy change',
          body: expect.stringMatching(/chemical bonds/i),
        }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Saved to notes' })).toBeDisabled();
  });

  it('opens an editable flashcard sheet and saves the reviewed front and back', async () => {
    memory.document = storedDocument();
    api.post.mockResolvedValueOnce({ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' } as never);

    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Make a flashcard' }));
    const front = screen.getByRole('textbox', { name: 'Front' });
    const back = screen.getByRole('textbox', { name: 'Back' });
    fireEvent.change(front, { target: { value: 'Where does photosynthesis keep incoming energy?' } });
    fireEvent.change(back, { target: { value: 'In chemical bonds that the organism can use later.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add flashcard' }));

    expect(await screen.findByText('Flashcard added to your Petros deck')).toBeVisible();
    expect(api.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/student\/petros\/artifacts\/sessions\/.*\/blocks\/.*/i),
      expect.objectContaining({
        content: expect.objectContaining({
          kind: 'flashcard',
          front: 'Where does photosynthesis keep incoming energy?',
          back: 'In chemical bonds that the organism can use later.',
        }),
      }),
    );
    expect(screen.getByRole('button', { name: 'Flashcard added' })).toBeDisabled();
  });

  it('resumes a paused session and requests the explanation from one clear action', async () => {
    const paused: PetrosLearningSessionDocument = {
      ...storedDocument(),
      status: 'paused',
      blocks: storedDocument().blocks.map((block) => ({
        ...block,
        status: 'completed' as const,
        version: 1,
      })),
    };
    const resumed = { ...paused, status: 'active' as const };
    memory.document = paused;
    api.post.mockResolvedValueOnce(resumed).mockResolvedValueOnce(resumed).mockResolvedValueOnce(resumed);

    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={paused.id} />,
    );
    const action = await screen.findByRole('button', { name: 'Resume & explain simpler' });
    expect(action).toBeEnabled();
    fireEvent.click(action);

    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(3));
    expect(api.post).toHaveBeenNthCalledWith(
      1,
      expect.stringMatching(/\/resume$/),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
    );
    expect(api.post).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(/\/blocks\/.*\/reexplain$/),
      expect.objectContaining({ level: 'simpler', expectedBlockVersion: 1 }),
    );
    expect(api.post).toHaveBeenNthCalledWith(
      3,
      expect.stringMatching(/\/continue$/),
      expect.objectContaining({ idempotencyKey: expect.any(String) }),
      undefined,
      expect.any(AbortSignal),
    );
  });

  it('keeps stale personalization safe without exposing internal model status', async () => {
    memory.document = {
      ...storedDocument(),
      personalization: {
        status: 'stale_fallback',
        reasons: ['The learner-model summaries are older than the safe-use threshold.'],
        sessionOverride: null,
      },
    };

    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );

    expect(await screen.findByRole('heading', { name: 'Follow the energy change' })).toBeVisible();
    expect(screen.queryByText('Using a safe topic-first route')).not.toBeInTheDocument();
    expect(screen.queryByText(/learning model is being refreshed/i)).not.toBeInTheDocument();
  });

  it('keeps the saved document readable when the browser goes offline', async () => {
    Object.defineProperty(window.navigator, 'onLine', {
      configurable: true,
      value: false,
    });
    memory.document = storedDocument();

    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );

    expect(await screen.findByText('You are offline')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Follow the energy change' })).toBeVisible();
    expect(screen.getByText(/everything already shown remains readable/i)).toBeVisible();
  });

  it('announces a slow next-move request without discarding the current document', async () => {
    vi.useFakeTimers();
    memory.document = { ...storedDocument(), blocks: [] };
    let finishRequest!: (value: PetrosLearningSessionDocument) => void;
    api.post.mockImplementationOnce(
      () =>
        new Promise<PetrosLearningSessionDocument>((resolve) => {
          finishRequest = resolve;
        }),
    );

    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByText('Choosing the next helpful step')).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_100);
    });
    expect(screen.getByText(/this is taking longer than usual/i)).toBeVisible();
    expect(screen.getByText(/current document is safe/i)).toBeVisible();

    await act(async () => {
      finishRequest(memory.document!);
      await vi.advanceTimersByTimeAsync(0);
    });
  });

  it('persists layer and Why-this state across an unmount/refresh resume', async () => {
    memory.document = storedDocument();
    const first = render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );
    await screen.findByRole('heading', { name: 'Follow the energy change' });
    fireEvent.click(screen.getByRole('button', { name: 'Why this step?' }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Go one layer deeper' }));
    expect(screen.getByText('Predict before Petros reveals')).toBeVisible();
    fireEvent.change(screen.getByRole('textbox', { name: /what do you think/i }), {
      target: { value: 'Light reactions prepare the energy carriers used next.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /lock in my prediction/i }));
    await waitFor(() => expect(screen.getByLabelText(/light-dependent reactions/i)).toBeVisible());
    await waitFor(() => expect(api.put.mock.calls.length).toBeGreaterThanOrEqual(3));
    first.unmount();

    render(
      <PetrosRepairSession
        topic="photosynthesis"
        source="result"
        sessionId={memory.document!.id}
      />,
    );
    expect(await screen.findByText(/topic is conceptual/i)).toBeVisible();
    expect(screen.getByLabelText(/light-dependent reactions/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Why this step?' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('Petros Stage 3 observation UI', () => {
  it('shows a legacy explanation immediately instead of manufacturing a test question', async () => {
    const legacy = storedDocument();
    legacy.blocks[0]!.questions = [];
    const repaired: PetrosLearningSessionDocument = {
      ...legacy,
      blocks: legacy.blocks.map((block) => ({
        ...block,
        questions: [
          {
            id: 'abababab-abab-4bab-8bab-abababababab',
            rootQuestionId: 'abababab-abab-4bab-8bab-abababababab',
            parentQuestionId: null,
            targetId: 'photosynthesis:relationship',
            equivalenceKey: 'photosynthesis:relationship',
            prompt: 'How does light energy become useful to the organism?',
            responseType: 'short_answer' as const,
            choices: null,
            purpose: 'recall' as const,
            active: true,
            locked: false,
            hints: [],
            attempts: [],
          },
        ],
      })),
    };
    memory.document = legacy;
    api.post.mockImplementation(async (path: string) => {
      if (path.endsWith('/question')) {
        memory.document = repaired;
        return repaired;
      }
      return memory.document;
    });

    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={legacy.id} />,
    );

    expect(await screen.findByRole('heading', { name: 'Follow the energy change' })).toBeVisible();
    expect(screen.queryByRole('textbox', { name: 'Your answer' })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalledWith(
      expect.stringMatching(/\/blocks\/[^/]+\/question$/),
      expect.anything(),
    );
    expect(screen.getByRole('button', { name: 'I have the key idea' })).toBeVisible();
  });

  it('requires an explicit confidence choice, locks the card, and announces feedback accessibly', async () => {
    memory.document = storedDocument();
    memory.document.blocks[0]!.questions = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        rootQuestionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        parentQuestionId: null,
        targetId: 'photosynthesis:guess',
        equivalenceKey: 'photosynthesis-energy',
        prompt: 'What happens to light energy during photosynthesis?',
        responseType: 'single_choice',
        choices: [
          { id: 'stored', label: 'It is stored as chemical energy.' },
          { id: 'lost', label: 'It disappears.' },
        ],
        purpose: 'guess_first',
        active: true,
        locked: false,
        hints: [],
        attempts: [],
      },
    ];
    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );
    expect(await screen.findByText('Quick check')).toBeVisible();
    const confidence = screen.getByRole('radiogroup', {
      name: 'How confident are you?',
    });
    expect(confidence.querySelector('[aria-checked="true"]')).toBeNull();
    const commit = screen.getByRole('button', { name: 'Check answer' });
    expect(commit).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'It is stored as chemical energy.' }));
    expect(commit).toBeDisabled();
    fireEvent.click(screen.getByRole('radio', { name: 'Think so' }));
    expect(commit).toBeEnabled();
    fireEvent.click(commit);
    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith(
        expect.stringMatching(/\/answers$/),
        expect.objectContaining({
          answer: 'stored',
          confidence: 'think_so',
          expectedBlockVersion: 0,
        }),
      ),
    );
  });

  it('renders worked-solution and reworded-success states as part of the document, not a chat', async () => {
    memory.document = storedDocument();
    const block = memory.document.blocks[0]!;
    block.questions = [
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        rootQuestionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        parentQuestionId: '99999999-9999-4999-8999-999999999999',
        targetId: 'photosynthesis:guess',
        equivalenceKey: 'photosynthesis-energy',
        prompt: 'Third committed attempt',
        responseType: 'short_answer',
        choices: null,
        purpose: 'equivalent_retry',
        active: false,
        locked: true,
        hints: [],
        attempts: [
          {
            observationId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            questionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            rawAnswer: 'It vanishes',
            confidence: 'sure',
            correctness: 'incorrect',
            credit: 0,
            feedback: 'Not yet. Track the form of energy.',
            why: ['The response loses the energy instead of tracking its changed form.'],
            errorClass: 'concept_gap',
            submittedAt: '2026-08-08T08:02:00.000Z',
            ladderLevel: 3,
            supportKind: 'worked_solution',
            supportText:
              'Light energy is converted and stored in chemical bonds; it does not vanish.',
            highValueMisconception: true,
            fragileSuccess: false,
            recovery: false,
          },
        ],
      },
      {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        rootQuestionId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        parentQuestionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        targetId: 'photosynthesis:guess',
        equivalenceKey: 'photosynthesis-energy',
        prompt: 'Where is the incoming energy held after the process?',
        responseType: 'short_answer',
        choices: null,
        purpose: 'reworded_success',
        active: true,
        locked: false,
        hints: [],
        attempts: [],
      },
    ];
    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );
    fireEvent.click(await screen.findByText('Previous attempt'));
    expect(
      await screen.findByText('Full worked solution · now earn the reworded success'),
    ).toBeVisible();
    expect(screen.getByText('One more try')).toBeVisible();
    expect(screen.queryByText(/teaching stays covered/i)).not.toBeInTheDocument();
    expect(screen.getByText(/confident miss is worth slowing down/i)).toBeVisible();
  });

  it('renders document citation and missing-evidence disclosures in the existing lesson detour', async () => {
    memory.document = storedDocument();
    const answer = "I could not find a matching passage in this lesson's selected source pages. Searched physical PDF pages 2; 1 other pages were not searched. Text matches do not establish complete coverage.";
    memory.document.detours = [{
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      observationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      question: 'What is elasticity?', status: 'active', action: 'answer_now',
      acknowledgement: answer, routeChange: 'Paused at the current explanation.',
      returnPlan: 'Return to the same point after confirmation.', changedDecisionId: null,
      createdAt: '2026-09-17T00:00:00.000Z', rejoinedAt: null,
    }];
    render(<PetrosRepairSession topic="cloud" source="document" sessionId={memory.document.id} />);
    expect(await screen.findByText(answer)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Petros paused to answer you' })).toBeVisible();
    expect(screen.getByText(/Return to the same point after confirmation/)).toBeVisible();
    expect(screen.getByText(answer).closest('section')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders structured detours without a duplicate lesson composer', async () => {
    memory.document = storedDocument();
    memory.document = {
      ...memory.document,
      version: 1,
      detours: [
        {
          id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          observationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
          question: 'Why is oxygen released?',
          status: 'pending' as const,
          action: 'pending' as const,
          acknowledgement: null,
          routeChange: null,
          returnPlan: null,
          changedDecisionId: null,
          createdAt: '2026-08-08T08:03:00.000Z',
          rejoinedAt: null,
        },
      ],
    };
    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Question added to the next PLAN',
      }),
    ).toBeVisible();
    expect(screen.getByText('Why is oxygen released?')).toBeVisible();
    expect(screen.queryByText('Ask Petros something else')).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Question for the Petros teaching loop' })).not.toBeInTheDocument();
  });
});

describe('Petros Stage 4 typed move UI', () => {
  it('consumes the enabled validated adapter beside the existing teaching diagram', async () => {
    memory.document = storedDocument();
    const block = memory.document.blocks[0]!;
    block.content = visualDiagramFixture();
    block.questions = [];
    const snapshot = adaptPetrosDiagram(block.content, block.id);
    api.get.mockImplementation(async path => path.endsWith('/visual')
      ? { status: 'available', snapshot }
      : path.includes('/document-questions') ? null : memory.document);
    render(<PetrosRepairSession topic="synthetic" source="result" sessionId={memory.document.id} />);
    fireEvent.click(await screen.findByText('Explore the original representation'));
    expect(screen.getByRole('checkbox', { name: 'Show relationships' })).toBeVisible();
    expect(screen.getByRole('img', { name: 'Structure' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Explain diagram' })).toBeVisible();
    expect(api.get).toHaveBeenCalledWith(`/student/petros/sessions/${memory.document.id}/blocks/${block.id}/visual`, expect.any(AbortSignal));
  });

  it('preserves editable diagram labels, expanded state, and the nonvisual description', async () => {
    memory.document = storedDocument();
    memory.document.blocks[0]!.content = {
      schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
      type: 'diagram',
      title: 'See the photosynthesis pathway',
      diagramType: 'flowchart',
      nodes: [
        { id: 'light', label: 'Light', description: 'Incoming light energy' },
        {
          id: 'glucose',
          label: 'Glucose',
          description: 'Stored chemical energy',
        },
      ],
      edges: [
        {
          from: 'light',
          to: 'glucose',
          label: 'is stored through the process',
        },
      ],
      altText: 'Light energy is transformed and stored as chemical energy in glucose.',
      editable: true,
      fallbackText: 'Light → photosynthesis → chemical energy in glucose',
    };
    memory.document.blocks[0]!.interactionState = {
      diagramNodeLabels: {},
      diagramExpanded: false,
    };
    const first = render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );

    const narrated = vi.fn();
    window.addEventListener('petros:diagram-step', narrated);
    fireEvent.click(await screen.findByRole('button', { name: 'Explain diagram' }));
    await waitFor(() => expect(narrated).toHaveBeenCalledOnce());
    const firstStep = (narrated.mock.calls[0]![0] as CustomEvent<{
      diagramId: string;
      step: number;
    }>).detail;
    expect(document.querySelector('[data-petros-target$="node:light"]')).toHaveAttribute('data-active', 'true');
    fireEvent(window, new CustomEvent('petros:diagram-advance', { detail: firstStep }));
    expect(await screen.findByText(/light is stored through the process glucose/i)).toBeVisible();
    expect(document.querySelector('[data-petros-target$="edge:0"]')).toHaveAttribute('data-active', 'true');
    await waitFor(() => expect(narrated).toHaveBeenCalledTimes(2));
    const pausedStep = (narrated.mock.calls[1]![0] as CustomEvent<{
      diagramId: string;
      step: number;
    }>).detail;
    fireEvent(window, new CustomEvent('petros:diagram-stop', { detail: pausedStep }));
    fireEvent(window, new CustomEvent('petros:diagram-resume', { detail: pausedStep }));
    await waitFor(() => expect(narrated).toHaveBeenCalledTimes(3));
    expect(document.querySelector('[data-petros-target$="node:glucose"]')).toHaveAttribute('data-active', 'true');
    window.removeEventListener('petros:diagram-step', narrated);

    const light = screen.getByRole('textbox', { name: 'Edit Light' });
    fireEvent.change(light, { target: { value: 'Sunlight' } });
    await waitFor(() => expect(api.put).toHaveBeenCalled(), { timeout: 1_500 });
    fireEvent.click(screen.getByRole('button', { name: /open diagram larger/i }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByText('Nonvisual description'));
    expect(screen.getByText(/transformed and stored as chemical energy/i)).toBeVisible();
    first.unmount();

    render(
      <PetrosRepairSession
        topic="photosynthesis"
        source="result"
        sessionId={memory.document!.id}
      />,
    );
    expect(await screen.findByDisplayValue('Sunlight')).toBeVisible();
    expect(screen.getByRole('button', { name: /fit diagram to block/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('lets students explore connections in any order and save reasoning without a guessing gate', async () => {
    memory.document = storedDocument();
    memory.document.blocks[0]!.content = {
      schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
      type: 'diagram',
      title: 'Build the energy concept map',
      diagramType: 'concept_map',
      nodes: [
        { id: 'light', label: 'Light', description: 'Incoming energy' },
        { id: 'glucose', label: 'Glucose', description: 'Stored chemical energy' },
        { id: 'growth', label: 'Growth', description: 'Energy used by the organism' },
      ],
      edges: [
        { from: 'light', to: 'glucose', label: 'is stored as' },
        { from: 'glucose', to: 'growth', label: 'can support' },
      ],
      altText: 'Light becomes stored chemical energy that can support growth.',
      editable: true,
      fallbackText: 'Light → glucose → growth',
    };
    memory.document.blocks[0]!.interactionState = {
      diagramNodeLabels: {},
      diagramExpanded: false,
      diagramBuildEdgeCount: 0,
      diagramBuilt: false,
    };

    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );

    expect(await screen.findByText('Explore the connections')).toBeVisible();
    expect(screen.getByRole('button', { name: /save map reflections and continue/i })).toBeEnabled();
    expect(screen.queryByText('Which relationship belongs next?')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Compare with the lesson' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /glucose.*growth/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Help me understand this connection' }));
    expect(screen.getByText('Glucose can support Growth')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Revisit this connection' }));
    expect(await screen.findByText('1 / 2 reflected on · self-review')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /light.*glucose/i }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Your explanation of this connection' }), { target: { value: 'Light energy is stored in glucose during photosynthesis.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Compare with the lesson' }));
    fireEvent.click(screen.getByRole('button', { name: 'I can explain the link' }));
    expect(await screen.findByText('2 / 2 reflected on · self-review')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: /glucose.*growth/i }));
    expect(screen.getByRole('button', { name: 'Revisit this connection' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Walk me through the map' })).toBeVisible();
  });

  it('persists an explicit learner-owned artifact choice', async () => {
    memory.document = storedDocument();
    memory.document.blocks[0]!.content = {
      schemaVersion: PETROS_RENDER_SCHEMA_VERSION,
      type: 'artifact_commit',
      title: 'Choose what remains yours',
      prompt: 'Nothing is saved without your explicit choice.',
      proposals: [
        {
          id: 'diagram',
          kind: 'diagram',
          label: 'Photosynthesis structure',
          preview: 'The editable structure from this session.',
        },
      ],
      consentRequired: true,
    };
    memory.document.blocks[0]!.interactionState = {
      selectedProposalIds: [],
      artifactsDeclined: false,
    };
    const first = render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );

    const proposal = await screen.findByRole('checkbox', {
      name: /photosynthesis structure/i,
    });
    expect(proposal).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(proposal);
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(proposal).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('button', { name: 'Confirm this artifact choice' })).toBeEnabled();
    first.unmount();

    render(
      <PetrosRepairSession
        topic="photosynthesis"
        source="result"
        sessionId={memory.document!.id}
      />,
    );
    expect(
      await screen.findByRole('checkbox', {
        name: /photosynthesis structure/i,
      }),
    ).toHaveAttribute('aria-checked', 'true');
  });
});

describe('Petros five-part session progression', () => {
  it('provides a working completion action for every checkpoint and closes only after step five', async () => {
    let stage = 0;
    memory.document = fiveStageDocument(stage);
    api.post.mockImplementation(async (path: string) => {
      if (path.endsWith('/complete')) {
        const result = fiveStageDocument(stage, true, stage === 4);
        memory.document = result;
        return result;
      }
      if (path.endsWith('/continue')) {
        stage += 1;
        const result = fiveStageDocument(stage);
        memory.document = result;
        return result;
      }
      return memory.document;
    });

    render(
      <PetrosRepairSession
        topic="five-stage topic"
        source="result"
        sessionId={memory.document.id}
      />,
    );

    expect(await screen.findByText(/Step 1 of 5 · Find the useful entry/)).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuemax', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Show the connection' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Keep going' }));

    expect(
      await screen.findByRole('heading', { name: 'Build the idea one layer at a time' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'I have the key idea' }));

    expect(
      await screen.findByRole('heading', { name: 'Bring the idea back from memory' }),
    ).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Complete this check' }));

    expect(await screen.findByRole('heading', { name: 'Make the idea yours' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Finish the session' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save verified response and continue' }));

    expect(await screen.findByRole('heading', { name: 'Close it out deliberately' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Save nothing from these proposals' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm this artifact choice' }));

    expect(await screen.findByRole('heading', { name: 'Session saved.' })).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '5');
    expect(screen.getByText(/close the notes/i)).toBeVisible();
    for (let recall = 0; recall < 3; recall += 1) {
      const answer = await screen.findByRole('textbox', { name: 'Your final recall answer' });
      fireEvent.change(answer, { target: { value: 'The relationship links the evidence to the result.' } });
      fireEvent.click(screen.getByRole('button', { name: /compare with the source/i }));
      expect(await screen.findByText(/grounded in/i)).toBeVisible();
      fireEvent.click(screen.getByRole('button', { name: 'Got it' }));
    }
    expect(await screen.findByText('Here’s what to build on.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Copy my win' })).toBeVisible();
    expect(api.post.mock.calls.filter(([path]) => String(path).endsWith('/complete'))).toHaveLength(5);
    expect(api.post.mock.calls.filter(([path]) => String(path).endsWith('/continue'))).toHaveLength(4);
  });
});


describe('durable document-question recovery in the real session component', () => {
  const executionId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const key = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const pending = () => ({ schemaVersion: 'petros.document-question-execution.v1', id: executionId,
    sessionId: memory.document!.id, idempotencyKey: key, state: 'queued', version: 1, attempts: 0,
    processingEnabled: true, retryable: false, errorCode: null, result: null });

  it('ignores a late older status response after a newer execution revision is displayed', async () => {
    memory.document = { ...storedDocument(), sourceContext: { door: 'uploaded_document', label: 'Synthetic PDF' } };
    api.get.mockImplementation(async path => path.includes('/document-questions') ? pending() : memory.document);
    render(<PetrosRepairSession topic="photosynthesis" source="document" sessionId={memory.document.id} />);
    await screen.findByText('Your question is queued.');
    let older!: (value: unknown) => void;
    let newer!: (value: unknown) => void;
    api.get.mockImplementationOnce(() => new Promise(resolve => { older = resolve; }));
    api.get.mockImplementationOnce(() => new Promise(resolve => { newer = resolve; }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh question status' }));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh question status' }));
    await act(async () => newer({ ...pending(), state: 'running', version: 2, attempts: 1 }));
    await screen.findByText('Preparing your answer from the selected source pages.');
    await act(async () => older(pending()));
    expect(screen.queryByText('Your question is queued.')).not.toBeInTheDocument();
    expect(screen.getByText('Preparing your answer from the selected source pages.')).toBeVisible();
  });

  it('recovers queued work after reload and retains keyboard focus after cancellation', async () => {
    memory.document = { ...storedDocument(), sourceContext: { door: 'uploaded_document', label: 'Synthetic PDF' } };
    let row = pending();
    sessionStorage.setItem(`petros-document-question:${memory.document.id}`, key);
    api.get.mockImplementation(async path => path.includes('/document-questions') ? row : memory.document);
    api.post.mockImplementation(async (_path, body) => {
      expect(body).toEqual({ version: 1, action: 'cancel' });
      row = { ...row, state: 'cancelled', version: 2 };
      return row as never;
    });
    render(<PetrosRepairSession topic="photosynthesis" source="document" sessionId={memory.document.id} />);
    const cancel = await screen.findByRole('button', { name: 'Cancel question' });
    expect(api.get).toHaveBeenCalledWith(`/student/petros/sessions/${memory.document.id}/document-questions/${key}`, undefined, {
      'x-petros-knowledge-policy': 'petros.knowledge-policy.v1',
    });
    cancel.focus(); fireEvent.click(cancel);
    expect(await screen.findByText('Question cancelled.')).toBeVisible();
    await waitFor(() => expect(screen.getByRole('region', { name: 'Document question status' })).toHaveFocus());
    expect(sessionStorage.getItem(`petros-document-question:${memory.document.id}`)).toBeNull();
  });

  it('reconciles an uncertain retry response and exposes disabled processing', async () => {
    memory.document = { ...storedDocument(), sourceContext: { door: 'uploaded_document', label: 'Synthetic PDF' } };
    let row = { ...pending(), state: 'failed', version: 4, attempts: 1, retryable: true };
    api.get.mockImplementation(async path => path.includes('/document-questions') ? row : memory.document);
    api.post.mockImplementation(async (_path, body) => {
      expect(body).toEqual({ version: 4, action: 'retry' });
      row = { ...row, state: 'queued', version: 5, retryable: false, processingEnabled: false };
      throw new Error('Synthetic lost retry response');
    });
    render(<PetrosRepairSession topic="photosynthesis" source="document" sessionId={memory.document.id} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry question' }));
    expect(await screen.findByText('Question processing is currently disabled. You can cancel queued work.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Cancel question' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Retry question' })).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });
});
