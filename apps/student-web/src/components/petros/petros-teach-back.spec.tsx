import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PetrosTeachBack } from './petros-teach-back';

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  get: vi.fn(),
  upload: vi.fn(),
  id: 0,
}));

vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => ({
    post: mocks.post,
    get: mocks.get,
    uploadPetrosMedia: mocks.upload,
  }),
  newIdempotencyKey: () => `00000000-0000-4000-8000-${String(++mocks.id).padStart(12, '0')}`,
  formatApiError: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

vi.mock('./petros-artifact-curation', () => ({
  PetrosArtifactCuration: () => <div>Editable artifact proposal</div>,
}));

const ids = {
  session: '11111111-1111-4111-8111-111111111111',
  learning: '22222222-2222-4222-8222-222222222222',
  segment: '33333333-3333-4333-8333-333333333333',
  bundle: '44444444-4444-4444-8444-444444444444',
};

function closedSession() {
  const evidence = {
    segmentId: ids.segment,
    excerpt: 'A battery creates a potential difference.',
  };
  return {
    stateVersion: 'petros.teach-back.state.v1',
    id: ids.session,
    learningSessionId: ids.learning,
    version: 2,
    status: 'closed',
    topic: 'electric current',
    scope: null,
    audience: { level: 'younger_student', label: 'a curious junior student' },
    mode: 'text',
    language: 'en',
    coverageChecklist: [
      {
        key: 'core',
        label: 'Explain the core idea',
        status: 'covered',
        evidence: [evidence],
      },
    ],
    segments: [
      {
        id: ids.segment,
        ordinal: 1,
        source: 'text',
        text: evidence.excerpt,
        corrected: false,
        transcriptionConfidence: null,
        responseToFollowUpId: null,
        analysis: {
          schemaVersion: 'petros.teach-back.analysis.v1',
          coverage: [
            {
              key: 'core',
              label: 'Explain the core idea',
              status: 'covered',
              evidence: [evidence],
            },
          ],
          claims: [{ claim: evidence.excerpt, status: 'supported', evidence }],
          examples: [],
          primaryGap: null,
          completeEnough: true,
          needsFollowUp: false,
          speechRecognitionUncertain: false,
          uncertaintyDisclosure: null,
        },
        createdAt: '2026-08-13T08:00:00.000Z',
        updatedAt: '2026-08-13T08:00:00.000Z',
      },
    ],
    followUps: [],
    progress: {
      movesUsed: 1,
      maxMoves: 8,
      elapsedSeconds: 90,
      timeBudgetSeconds: 720,
      openFollowUpId: null,
      currentGapType: 'none',
      probesOnCurrentGap: 0,
      helpUseCount: 0,
    },
    opening: 'Explain this to Petros as if teaching a junior.',
    verdict: {
      schemaVersion: 'petros.teach-back.verdict.v1',
      oneLine: 'The main idea is clear enough for a junior to follow.',
      clear: [
        {
          detail: 'You named the source of the potential difference.',
          evidence,
        },
      ],
      mostImportantGap: null,
      suggestedImprovement: 'Add one lamp example.',
      audienceFit: 'likely_helpful',
      audienceReason: 'The sequence uses plain language.',
      uncertaintyDisclosure: null,
      recapProposal: {
        kind: 'note',
        title: 'Current recap',
        body: evidence.excerpt,
      },
      officialAssessmentChanged: false,
    },
    artifactBundleId: ids.bundle,
    voice: {
      optional: true,
      productionDeviceQaPassed: false,
      textAlternativeAvailable: true,
      disclosure: 'Voice remains pre-release pending physical device QA.',
    },
    repeatedFromSessionId: null,
    createdAt: '2026-08-13T08:00:00.000Z',
    updatedAt: '2026-08-13T08:02:00.000Z',
  };
}

describe('Petros Teach-it-back surface', () => {
  beforeEach(() => {
    mocks.post.mockReset();
    mocks.get.mockReset();
    mocks.upload.mockReset();
    mocks.id = 0;
  });

  it('opens as a reversed, non-chat session with a complete text alternative and explicit voice gate', () => {
    render(<PetrosTeachBack />);
    expect(
      screen.getByRole('heading', {
        name: /Explain this to Petros as if teaching a junior/i,
      }),
    ).toBeVisible();
    expect(screen.getByLabelText('Text')).toBeChecked();
    fireEvent.click(screen.getByLabelText('Optional voice'));
    expect(
      screen.getByText(
        /physical microphone, headset, interruption, background-stop, pronunciation, and mixed-language device QA/i,
      ),
    ).toBeVisible();
  });

  it('starts through the dedicated finite session API', async () => {
    mocks.post.mockImplementation(() => new Promise(() => undefined));
    render(<PetrosTeachBack />);
    fireEvent.change(screen.getByLabelText('Topic'), {
      target: { value: 'electric current' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Teach-it-back' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith(
      '/student/petros/teach-it-back/sessions',
      expect.objectContaining({
        topic: 'electric current',
        mode: 'text',
        maxMoves: 8,
        timeBudgetSeconds: 720,
        repeatedFromSessionId: null,
      }),
    );
  });

  it('renders an evidence-linked nonnumeric verdict, explicit mark boundary, proposal, and voluntary repeat choice', async () => {
    mocks.post.mockResolvedValueOnce(closedSession());
    render(<PetrosTeachBack />);
    fireEvent.change(screen.getByLabelText('Topic'), {
      target: { value: 'electric current' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start Teach-it-back' }));
    expect(
      await screen.findByText('The main idea is clear enough for a junior to follow.'),
    ).toBeVisible();
    expect(screen.getByText('“A battery creates a potential difference.”')).toBeVisible();
    expect(screen.getByText(/Official marks changed:/)).toHaveTextContent('false');
    expect(screen.getByText('Editable artifact proposal')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Teach this topic again' })).toBeVisible();
    expect(screen.queryByText(/\b(?:score|grade|rating)\s+\d/i)).not.toBeInTheDocument();
  });
});
