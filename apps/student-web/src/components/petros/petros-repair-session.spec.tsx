import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PETROS_RENDER_SCHEMA_VERSION,
  PETROS_SESSION_STATE_VERSION,
  type PetrosLearningSessionDocument,
} from '@edrion/schemas';
import { PetrosRepairSession } from './petros-repair-session';

const memory = vi.hoisted(() => ({
  document: null as PetrosLearningSessionDocument | null,
}));
const api = vi.hoisted(() => ({
  get: vi.fn(async () => memory.document),
  post: vi.fn(async () => memory.document),
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

vi.mock('@/lib/api-client', () => ({
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
        questions: [],
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

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  sessionStorage.clear();
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value: true,
  });
});

describe('Petros Stage 2 student document', () => {
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

  it('keeps stale personalization explicit and safe', async () => {
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

    expect(await screen.findByText('Using a safe topic-first route')).toBeVisible();
    expect(screen.getByText(/learning model is being refreshed/i)).toBeVisible();
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
    await waitFor(() => expect(screen.getByText(/light-dependent reactions/i)).toBeVisible());
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));
    first.unmount();

    render(
      <PetrosRepairSession
        topic="photosynthesis"
        source="result"
        sessionId={memory.document!.id}
      />,
    );
    expect(await screen.findByText(/topic is conceptual/i)).toBeVisible();
    expect(screen.getByText(/light-dependent reactions/i)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Why this step?' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});

describe('Petros Stage 3 observation UI', () => {
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
    expect(await screen.findByText('Guess first')).toBeVisible();
    const confidence = screen.getByRole('radiogroup', {
      name: 'How confident are you?',
    });
    expect(confidence.querySelector('[aria-checked="true"]')).toBeNull();
    const commit = screen.getByRole('button', { name: 'Commit answer' });
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
    expect(
      await screen.findByText('Full worked solution · now earn the reworded success'),
    ).toBeVisible();
    expect(screen.getByText('Earned-success attempt')).toBeVisible();
    expect(screen.getByText(/teaching stays covered/i)).toBeVisible();
    expect(screen.getByText(/confident miss is worth slowing down/i)).toBeVisible();
  });

  it('submits composer text into PLAN and renders a structured route indicator', async () => {
    memory.document = storedDocument();
    const redirected = {
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
    api.post.mockResolvedValueOnce(redirected);
    render(
      <PetrosRepairSession topic="photosynthesis" source="result" sessionId={memory.document.id} />,
    );
    const composer = await screen.findByRole('textbox', {
      name: 'Question for the Petros teaching loop',
    });
    fireEvent.change(composer, {
      target: { value: 'Why is oxygen released?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send into the plan' }));
    expect(
      await screen.findByRole('heading', {
        name: 'Question added to the next PLAN',
      }),
    ).toBeVisible();
    expect(screen.getByText('Why is oxygen released?')).toBeVisible();
    expect(api.post).toHaveBeenCalledWith(
      expect.stringMatching(/\/questions$/),
      expect.objectContaining({ expectedSessionVersion: 0 }),
    );
  });
});

describe('Petros Stage 4 typed move UI', () => {
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

    const light = await screen.findByRole('textbox', { name: 'Edit Light' });
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
