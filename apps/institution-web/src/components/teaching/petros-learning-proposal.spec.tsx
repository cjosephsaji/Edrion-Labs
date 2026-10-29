import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  PetrosLearningProposal,
  lessonError,
  lessonPrimaryStatus,
  type ProposalView,
} from './petros-learning-proposal';
import { sourceLocation } from './petros-lesson-presentation';
import type { M3Proposal } from '@edrion/schemas';
const client = { get: vi.fn(), post: vi.fn() };
vi.mock('@/lib/portal-client', () => ({ usePortalClient: () => client }));
const scope = { mode: 'institution' };
vi.mock('@/lib/scope', () => ({ useScope: () => ({ scope }) }));
let p: M3Proposal, qualified: boolean;
const assignment = {
  classId: '',
  subjectId: '',
  className: 'Isolated class',
  subjectName: 'Cloud Computing',
  contextIds: [],
} as never;
const response = (): ProposalView => ({
  proposal: structuredClone(p),
  review: {},
  reviewEligibility: {
    items: qualified
      ? [
          {
            id: 'a29c6fa4-4f6a-4a10-a2e4-8b4142140189',
            version: 3,
            subjectKey: p.subjectId,
            status: 'active',
          },
        ]
      : [],
    reason: 'No current qualified reviewer authority.',
  },
  instrumentFamilies: qualified
    ? [
        {
          id: p.taskCandidates[1]!.id,
          version: 2,
          status: 'qualified_review_required',
        },
      ]
    : [],
  readiness: {
    eligible: false,
    blockers: ['TEACHING_SCOPE_REVIEW_REQUIRED'],
    verification: 'Practice available; verification pending.',
    studentPublication: 'blocked',
    studentPublicationBlockers: ['QUALIFIED_INSTRUMENT_REQUIRED'],
  },
});
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState(null, '', '/');
  qualified = false;
  p = JSON.parse(
    readFileSync(
      resolve(
        process.cwd(),
        '../../docs/verification/petros-v2/m3-evidence/two-subject-proposals.json',
      ),
      'utf8',
    ),
  ).cloud;
  client.get.mockImplementation(async (path: string) =>
    path.endsWith('/sources')
      ? {
          items: [
            {
              revisionId: p.source.revisionId,
              title: 'Actual cloud PPTX',
              format: 'pptx',
              proposalId: null,
              coverage: p.source.coverage,
            },
          ],
        }
      : path.includes('/evidence/')
        ? {
            id: p.source.references[0]!.unitId,
            kind: 'table',
            text: p.objectives[0]!.support[0]!.quote,
            locator: p.source.references[0]!.locator,
            contentHash: p.source.references[0]!.unitHash,
            uncertainties: [],
          }
        : path.includes('/verification/')
          ? {
              family: { id: p.taskCandidates[1]!.id, version: 2 },
              origin: 'engineering_private_outline',
              classification: 'Private draft',
              panels: [
                {
                  label: 'Qualified content',
                  content: 'PRIVATE_UI_REVIEW_SENTINEL',
                },
              ],
            }
          : response(),
  );
  client.post.mockImplementation(
    async (
      _path: string,
      _scope: unknown,
      body: {
        change?: { kind: string; wording?: string; objectiveId?: string };
      },
    ) => {
      if (body.change) {
        p = structuredClone(p);
        p.version++;
        if (body.change.wording)
          p.objectives.find((o) => o.id === body.change?.objectiveId)!.wording =
            body.change.wording;
        if (body.change.kind === 'submit_review') p.state = 'under_review';
      }
      return response();
    },
  );
});
afterEach(cleanup);
async function open() {
  const result = render(<PetrosLearningProposal assignment={assignment} />);
  await screen.findByText('Actual cloud PPTX');
  fireEvent.change(screen.getByLabelText('Teaching material'), {
    target: { value: p.source.revisionId },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Prepare document outline' }),
  );
  await screen.findByText("Here's what your students will learn");
  return result;
}
function more(i = 1) {
  fireEvent.click(screen.getByLabelText(`More actions for objective ${i}`));
}
function preview() {
  fireEvent.click(screen.getByRole('button', { name: 'Preview lesson' }));
}
function submitStep() {
  preview();
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue to submission' }),
  );
}
describe('M3 guided teacher journey', () => {
  it('recovers a failed source read without claiming no documents exist', async () => {
    client.get.mockRejectedValueOnce(
      new Error('temporary source read failure'),
    );
    render(<PetrosLearningProposal assignment={assignment} />);
    await screen.findByText('Teaching material could not be loaded');
    expect(screen.queryByText('No teaching material available')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await screen.findByLabelText('Teaching material');
    expect(client.post).not.toHaveBeenCalled();
  });

  it('starts with a labelled document and one primary action', async () => {
    render(<PetrosLearningProposal assignment={assignment} />);
    await screen.findByLabelText('Teaching material');
    expect(
      screen.getByRole('button', { name: 'Prepare document outline' }),
    ).toBeDisabled();
    expect(screen.queryByText('Qualified reviewer decisions')).toBeNull();
  });
  it('labels test data honestly and separates review dimensions', async () => {
    await open();
    expect(
      screen.getByText('Sample lesson — prepared from test data'),
    ).toBeTruthy();
    submitStep();
    fireEvent.click(screen.getByRole('button', { name: 'See what’s needed' }));
    expect(screen.getByText('Assessment verification')).toBeTruthy();
    expect(screen.getByText('Student availability')).toBeTruthy();
    expect(screen.queryByText('M4_ADMISSION_NOT_IMPLEMENTED')).toBeNull();
  });
  it('loads actual evidence from a contextual action', async () => {
    await open();
    more();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Inspect source' })[0]!,
    );
    await screen.findByText('Supporting source material');
    expect(
      client.get.mock.calls.some(([path]) => path.includes('/evidence/')),
    ).toBe(true);
  });
  it('focuses editing and submits the exact expected version', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Edit objective 1' }));
    const input = screen.getByLabelText('Objective wording');
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.change(input, {
      target: {
        value: 'Classify responsibilities and justify the source boundary.',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText(
      'Classify responsibilities and justify the source boundary.',
    );
    expect(client.post.mock.calls.at(-1)?.[2].expectedVersion).toBe(1);
  });
  it('preserves local wording through stale save and explicit comparison', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Edit objective 1' }));
    fireEvent.change(screen.getByLabelText('Objective wording'), {
      target: { value: 'My unsaved teacher wording' },
    });
    p = structuredClone(p);
    p.version = 2;
    p.objectives[0]!.wording = 'Another teacher’s latest wording';
    client.post.mockRejectedValueOnce(new Error('M3_REVISION_CONFLICT'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('This lesson was updated');
    expect(screen.getByLabelText('Objective wording')).toHaveValue(
      'My unsaved teacher wording',
    );
    expect(screen.queryByText('M3_REVISION_CONFLICT')).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Review latest changes' }),
    );
    await screen.findByText('Another teacher’s latest wording');
    expect(
      within(screen.getByRole('dialog')).getByText(
        'My unsaved teacher wording',
      ),
    ).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Continue with my wording' }),
    );
    expect(screen.getByLabelText('Objective wording')).toHaveValue(
      'My unsaved teacher wording',
    );
    expect(client.post.mock.calls).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('My unsaved teacher wording');
    expect(client.post.mock.calls.at(-1)?.[2].expectedVersion).toBe(2);
  });
  it('does not restore an objective removed by another editor', async () => {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Edit objective 1' }));
    p = structuredClone(p);
    p.version++;
    p.objectives.shift();
    client.post.mockRejectedValueOnce(new Error('M3_REVISION_CONFLICT'));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await screen.findByText('This lesson was updated');
    fireEvent.click(
      screen.getByRole('button', { name: 'Review latest changes' }),
    );
    await screen.findByText(/This objective was removed/);
    expect(
      screen.getByRole('button', { name: 'Continue with my wording' }),
    ).toBeDisabled();
  });
  it('renders read-only public activity without answer submission', async () => {
    await open();
    preview();
    expect(screen.getByLabelText('Read-only activity preview')).toBeTruthy();
    const canvas = screen.getByLabelText('Read-only activity preview');
    const title = within(canvas).getByRole('heading', { level: 4 });
    expect(within(title.parentElement!).getByText('Read only')).toBeTruthy();
    expect(
      within(canvas).getByText(/Responses cannot be entered or submitted/),
    ).toBeTruthy();
    expect(within(canvas).queryByRole('textbox')).toBeNull();
    expect(screen.getByText(/Read-only task layout/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Submit answer/ })).toBeNull();
    expect(document.body.innerHTML).not.toContain('PRIVATE_UI_REVIEW_SENTINEL');
  });
  it('reorders stable objective IDs accessibly', async () => {
    await open();
    more(2);
    fireEvent.click(screen.getAllByRole('button', { name: 'Move up' })[1]!);
    await waitFor(() =>
      expect(client.post.mock.calls.at(-1)?.[2].change.kind).toBe('reorder'),
    );
    expect(client.post.mock.calls.at(-1)?.[2].change.objectiveIds).toHaveLength(
      p.objectives.length,
    );
  });
  it('acceptance remains an explicit draft action', async () => {
    await open();
    more();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'Keep this objective' })[0]!,
    );
    await screen.findByText(
      'Objective kept in this draft. Academic approval is still required.',
    );
    expect(client.post.mock.calls.at(-1)?.[2].change.kind).toBe(
      'accept_objective',
    );
  });
  it('retains activity selection and rejection', async () => {
    await open();
    preview();
    fireEvent.click(screen.getByRole('button', { name: 'Change activity' }));
    fireEvent.change(screen.getByLabelText('Lesson activity'), {
      target: {
        value: p.activities.filter(
          (a) => a.objectiveId === p.objectives[0]!.id,
        )[1]!.id,
      },
    });
    await waitFor(() =>
      expect(client.post.mock.calls.at(-1)?.[2].change.kind).toBe(
        'select_activity',
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Reject selected activity' }),
    );
    await waitFor(() =>
      expect(client.post.mock.calls.at(-1)?.[2].change.kind).toBe(
        'reject_activity',
      ),
    );
  });
  it('submits through existing review operation without release', async () => {
    await open();
    submitStep();
    fireEvent.click(screen.getByRole('button', { name: 'Submit for review' }));
    await waitFor(() =>
      expect(screen.getByLabelText('Lesson status')).toHaveTextContent(
        'Submitted for review',
      ),
    );
    expect(client.post.mock.calls.at(-1)?.[2].change.kind).toBe(
      'submit_review',
    );
    expect(
      client.post.mock.calls.some(([path]) => path.endsWith('/release')),
    ).toBe(false);
  });
  it('opens a linked objective and keeps activity navigation in the URL', async () => {
    window.history.replaceState(
      null,
      '',
      '/?objective=2#petros-lessons-preview',
    );
    client.get.mockImplementation(async (path: string) =>
      path.endsWith('/sources')
        ? {
            items: [
              {
                revisionId: p.source.revisionId,
                title: 'Actual cloud PPTX',
                proposalId: p.id,
              },
            ],
          }
        : response(),
    );
    render(<PetrosLearningProposal assignment={assignment} />);
    await screen.findByText('Objective 2 of 2');
    fireEvent.click(screen.getByRole('button', { name: 'Previous activity' }));
    expect(new URLSearchParams(window.location.search).get('objective')).toBe(
      '1',
    );
  });
  it('follows same-page step links while protecting unsaved wording', async () => {
    await open();
    window.history.replaceState(null, '', '#petros-lessons-preview');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByLabelText('Read-only activity preview')).toBeTruthy();
    window.history.replaceState(null, '', '#petros-lessons-review');
    fireEvent(window, new HashChangeEvent('hashchange'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit objective 1' }));
    fireEvent.change(screen.getByLabelText('Objective wording'), { target: { value: 'My unsaved wording' } });
    window.history.replaceState(null, '', '#petros-lessons-preview');
    fireEvent(window, new HashChangeEvent('hashchange'));
    expect(screen.getByLabelText('Objective wording')).toHaveValue('My unsaved wording');
    expect(screen.queryByLabelText('Read-only activity preview')).toBeNull();
  });
  it('shows requested corrections even when the immutable proposal remains under review', async () => {
    p.state = 'under_review';
    const view = response();
    view.review.activities = { status: 'revision_requested' };
    client.post.mockResolvedValue(view);
    await open();
    submitStep();
    expect(screen.getByLabelText('Lesson status')).toHaveTextContent(
      'Changes requested',
    );
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'Review the requested corrections',
    );
    expect(
      screen.getByText(/A reviewer has requested corrections/),
    ).toBeTruthy();
    expect(screen.queryByText('What happens next')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Changes requested' }),
    ).toBeDisabled();
  });
  it('does not invite saving or submitting a withdrawn lesson', async () => {
    p.state = 'withdrawn';
    client.post.mockResolvedValue(response());
    await open();
    submitStep();
    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent(
      'This lesson has been withdrawn',
    );
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Lesson withdrawn' }),
    ).toBeDisabled();
    expect(screen.queryByText('Before you submit')).toBeNull();
  });
  it('hides private tooling and never requests private content for teachers', async () => {
    const result = await open();
    result.rerender(
      <PetrosLearningProposal assignment={assignment} mode="reviews" />,
    );
    expect(screen.getByText('Qualified review access required')).toBeTruthy();
    expect(
      screen.queryByRole('button', { name: 'Inspect private review draft' }),
    ).toBeNull();
    expect(
      client.get.mock.calls.some(([path]) => path.includes('/verification/')),
    ).toBe(false);
  });
  it('pins qualified decisions to private family version and explicit non-equivalence', async () => {
    qualified = true;
    const result = await open();
    result.rerender(
      <PetrosLearningProposal assignment={assignment} mode="reviews" />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Inspect private review draft' }),
    );
    await screen.findByText('Qualified content');
    fireEvent.click(screen.getByText('Qualified content'));
    expect(screen.getByText('PRIVATE_UI_REVIEW_SENTINEL')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Approve this instrument' }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Review reason'), {
      target: { value: 'Independent synthetic review.' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve this instrument' }),
    );
    await waitFor(() =>
      expect(client.post.mock.calls.at(-1)?.[2]).toMatchObject({
        dimension: 'assessment_instrument',
        taskFamilyId: p.taskCandidates[1]!.id,
        taskFamilyVersion: 2,
        nonEquivalenceDecision: 'distinct',
      }),
    );
    result.rerender(<PetrosLearningProposal assignment={assignment} />);
    await waitFor(() =>
      expect(screen.queryByText('PRIVATE_UI_REVIEW_SENTINEL')).toBeNull(),
    );
  });
  it('retains claim editing on the correction route', async () => {
    await open();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check lesson claims' }),
    );
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getAllByRole('button', { name: 'Edit claim' })[0]!,
    );
    fireEvent.change(screen.getByLabelText('Claim wording'), {
      target: { value: 'Supported claim correction' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save claim' }));
    await waitFor(() =>
      expect(client.post.mock.calls.at(-1)?.[2].change.kind).toBe('claim'),
    );
  });
  it('keeps concept definitions out of the main objective screen', async () => {
    await open();
    expect(screen.queryByText(p.concepts[0]!.definition)).toBeNull();
    fireEvent.click(
      screen.getByRole('button', { name: 'Concepts & connections' }),
    );
    expect(screen.getByRole('dialog').textContent).toContain(
      p.concepts[0]!.definition,
    );
  });
  it('uses friendly errors without exception names', () => {
    expect(
      lessonError({ status: 403, message: 'M3_REVIEW_QUALIFICATION_REQUIRED' }),
    ).toMatch(/permission/);
    expect(lessonError(new Error('M3_RELEASE_BLOCKED'))).toMatch(
      /cannot be made available/,
    );
    expect(lessonError({ status: 422 })).toMatch(/changes are still here/);
    expect(lessonError({ status: 503 })).toMatch(/Automatic lesson generation/);
  });
  it('formats native locations without AST identifiers', () => {
    expect(sourceLocation({ kind: 'pdf', page: 2 })).toBe('Page 2');
    expect(sourceLocation({ kind: 'slide', slide: 3 })).toMatch(/Slide 3/);
    expect(
      sourceLocation({ kind: 'docx', section: 0, paragraphOrdinal: 2 }),
    ).toMatch(/Word document/);
  });
});

describe('authoritative lesson lifecycle labels',()=>{
  it.each([['draft','Draft saved'],['needs_source_review','Needs your attention'],['under_review','Submitted for review'],['revision_requested','Changes requested'],['withdrawn','Lesson withdrawn']] as const)('projects %s without exposing a revision number',(state,label)=>{
    const view=response();view.proposal.state=state;
    expect(lessonPrimaryStatus(view)).toBe(label);
  });
  it('requires current teaching approval and drops revoked or stale approval',()=>{
    const view=response();view.proposal.state='under_review';
    view.review.teaching_scope={status:'approved'};expect(lessonPrimaryStatus(view)).toBe('Teaching approved');
    for(const status of ['stale','authority_revoked_or_expired']) {view.review.teaching_scope={status};expect(lessonPrimaryStatus(view)).toBe('Submitted for review');}
    view.review.activities={status:'revision_requested'};expect(lessonPrimaryStatus(view)).toBe('Changes requested');
  });
});
