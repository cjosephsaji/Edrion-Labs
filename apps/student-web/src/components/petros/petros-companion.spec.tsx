import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PetrosAskButton } from './petros-ask-button';
import { PetrosCompanionProvider, usePetrosPage } from './petros-companion-context';
import { PetrosCompanionPanel } from './petros-companion-panel';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  push: vi.fn(),
  pathname: '/assignments',
  id: 0,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => mocks.pathname,
}));

vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => ({ get: mocks.get, post: mocks.post }),
  newIdempotencyKey: () => `00000000-0000-4000-8000-${String(++mocks.id).padStart(12, '0')}`,
  formatApiError: (error: unknown) => (error instanceof Error ? error.message : 'Request failed'),
}));

const CANDIDATES = [
  { ref: 'a1', entityType: 'assignment' as const, entityId: 'id-1', title: 'First card', summary: 'due Monday' },
  { ref: 'a2', entityType: 'assignment' as const, entityId: 'id-2', title: 'Second card', summary: 'due Tuesday' },
  { ref: 'a3', entityType: 'assignment' as const, entityId: 'id-3', title: 'Third card', summary: 'due Friday' },
];

function reply(blocks: unknown[], threadId = 'thread-1', studentText = 'question') {
  mocks.id += 1;
  return {
    schemaVersion: 'petros.companion.v1',
    threadId,
    studentMessage: {
      id: `s${mocks.id}`,
      threadId,
      role: 'student',
      blocks: [{ type: 'text', text: studentText }],
      route: '/assignments',
      surface: 'assignments',
      focusRef: null,
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    reply: {
      id: `p${mocks.id}`,
      threadId,
      role: 'petros',
      blocks,
      route: '/assignments',
      surface: 'assignments',
      focusRef: null,
      createdAt: '2026-01-01T00:00:01.000Z',
    },
    replayed: false,
  };
}

function Screen({ candidates = CANDIDATES }: { candidates?: typeof CANDIDATES }) {
  usePetrosPage({ title: 'Assignments', candidates });
  return (
    <>
      {candidates.map((candidate) => (
        <div key={candidate.ref}>
          <span>{candidate.title}</span>
          <PetrosAskButton candidateRef={candidate.ref} label={candidate.title} />
        </div>
      ))}
    </>
  );
}

function mount(ui: React.ReactNode = <Screen />) {
  return render(
    <PetrosCompanionProvider>
      {ui}
      <PetrosCompanionPanel studentName="Aarav Sharma" />
    </PetrosCompanionProvider>,
  );
}

describe('Petros companion', () => {
  beforeEach(() => {
    mocks.get.mockReset().mockResolvedValue({ thread: null });
    mocks.post.mockReset();
    mocks.push.mockReset();
    mocks.pathname = '/assignments';
    mocks.id = 0;
  });

  it('sends the item the student picked, not the first one on the page', async () => {
    mocks.post.mockResolvedValueOnce(reply([{ type: 'text', text: 'That one is due Friday.' }]));
    mount();

    fireEvent.click(screen.getByRole('button', { name: 'Ask Petros about Third card' }));
    expect(await screen.findByText('Third card', { selector: 'strong' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Message Petros'), { target: { value: 'When is this due?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post.mock.calls[0]?.[1]).toMatchObject({
      focusRef: 'a3',
      route: '/assignments',
      surface: 'assignments',
    });
    // Every visible item travels with the turn, so the API can resolve any of them.
    expect(mocks.post.mock.calls[0]?.[1].visibleCandidates).toHaveLength(3);
  });

  it('shows the student their own message while Petros is still thinking', async () => {
    let release: (value: unknown) => void = () => {};
    mocks.post.mockReturnValueOnce(new Promise((resolve) => { release = resolve; }));
    mount();

    fireEvent.click(screen.getByRole('button', { name: 'Open Petros' }));
    fireEvent.change(screen.getByLabelText('Message Petros'), { target: { value: 'Why is this due Friday?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));

    // Echoed locally before the server has answered: the student must never watch their
    // own words disappear for the length of a turn.
    expect(await screen.findByText('Why is this due Friday?')).toBeInTheDocument();
    expect(screen.getByText(/Petros is thinking/)).toBeInTheDocument();

    release(
      reply(
        [{ type: 'text', text: 'Because your teacher set it for Friday.' }],
        'thread-1',
        'Why is this due Friday?',
      ),
    );
    expect(await screen.findByText('Because your teacher set it for Friday.')).toBeInTheDocument();
    // Exactly one copy once the server's own message arrives.
    expect(screen.getAllByText('Why is this due Friday?')).toHaveLength(1);
  });

  it('puts the message back in the composer when the turn fails', async () => {
    mocks.post.mockRejectedValueOnce(new Error('Network down'));
    mount();

    fireEvent.click(screen.getByRole('button', { name: 'Open Petros' }));
    fireEvent.change(screen.getByLabelText('Message Petros'), { target: { value: 'Plan my week' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(screen.getByLabelText('Message Petros')).toHaveValue('Plan my week');
  });

  it('keeps one thread across turns and route changes', async () => {
    mocks.post
      .mockResolvedValueOnce(reply([{ type: 'text', text: 'First answer.' }]))
      .mockResolvedValueOnce(reply([{ type: 'text', text: 'Second answer.' }]));
    const view = mount();

    fireEvent.click(screen.getByRole('button', { name: 'Ask Petros about Second card' }));
    fireEvent.change(screen.getByLabelText('Message Petros'), { target: { value: 'What is this?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));
    expect(await screen.findByText('First answer.')).toBeInTheDocument();

    mocks.pathname = '/calendar';
    view.rerender(
      <PetrosCompanionProvider>
        <PetrosCompanionPanel studentName="Aarav Sharma" />
      </PetrosCompanionProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Petros' }));
    fireEvent.change(screen.getByLabelText('Message Petros'), { target: { value: 'And why does it matter?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[1]?.[1]).toMatchObject({ route: '/calendar', surface: 'calendar' });
  });

  it('drops a selection when the item leaves the page', async () => {
    mocks.post.mockResolvedValue(reply([{ type: 'text', text: 'ok' }]));
    const view = mount();

    fireEvent.click(screen.getByRole('button', { name: 'Ask Petros about Third card' }));
    expect(await screen.findByText('Third card', { selector: 'strong' })).toBeInTheDocument();

    // A filter change removes the selected card from the list.
    view.rerender(
      <PetrosCompanionProvider>
        <Screen candidates={CANDIDATES.slice(0, 2)} />
        <PetrosCompanionPanel studentName="Aarav Sharma" />
      </PetrosCompanionProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open Petros' }));
    expect(await screen.findByText('Use “Ask Petros” on any card to pin it here')).toBeInTheDocument();
  });

  it('never acts on a proposal until the student confirms it', async () => {
    mocks.post.mockResolvedValueOnce(
      reply([
        { type: 'text', text: 'I can add that block.' },
        {
          type: 'action_proposal',
          proposalId: '11111111-1111-4111-8111-111111111111',
          actionKey: 'planner.create',
          title: 'Add a study block',
          preview: ['Maths revision — Tue 20 Aug 17:00 for 30 min'],
          confirmationRequired: true,
          status: 'proposed',
        },
      ]),
    );
    mount();

    fireEvent.click(screen.getByRole('button', { name: 'Open Petros' }));
    fireEvent.change(screen.getByLabelText('Message Petros'), { target: { value: 'Plan 30 minutes tomorrow' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));

    expect(await screen.findByText('Add a study block')).toBeInTheDocument();
    expect(screen.getByText('Maths revision — Tue 20 Aug 17:00 for 30 min')).toBeInTheDocument();
    // One call so far: the turn. Nothing has been executed.
    expect(mocks.post).toHaveBeenCalledTimes(1);

    mocks.post.mockResolvedValueOnce({
      proposalId: '11111111-1111-4111-8111-111111111111',
      actionKey: 'planner.create',
      status: 'executed',
      href: '/calendar',
      message: 'Added that block to your calendar.',
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(2));
    expect(mocks.post.mock.calls[1]?.[0]).toBe(
      '/student/petros/companion/actions/11111111-1111-4111-8111-111111111111/decision',
    );
    expect(mocks.post.mock.calls[1]?.[1]).toMatchObject({ decision: 'confirm' });
    expect(await screen.findByText('Added that block to your calendar.')).toBeInTheDocument();
    expect(mocks.push).toHaveBeenCalledWith('/calendar');
  });

  it('declining a proposal changes nothing', async () => {
    mocks.post.mockResolvedValueOnce(
      reply([
        {
          type: 'action_proposal',
          proposalId: '22222222-2222-4222-8222-222222222222',
          actionKey: 'planner.create',
          title: 'Add a study block',
          preview: ['Maths revision'],
          confirmationRequired: true,
          status: 'proposed',
        },
      ]),
    );
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Open Petros' }));
    fireEvent.change(screen.getByLabelText('Message Petros'), { target: { value: 'Plan something' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));
    expect(await screen.findByText('Add a study block')).toBeInTheDocument();

    mocks.post.mockResolvedValueOnce({
      proposalId: '22222222-2222-4222-8222-222222222222',
      actionKey: 'planner.create',
      status: 'declined',
      href: null,
      message: 'Left it as it was.',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));

    expect(await screen.findByText('Left it as it was.')).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('says plainly when it cannot read the screen', async () => {
    mocks.pathname = '/fees';
    mount(<></>);
    fireEvent.click(screen.getByRole('button', { name: 'Open Petros' }));
    expect(
      await screen.findByText('I stay out of fees and payments. Your institution office handles those.'),
    ).toBeInTheDocument();
    // No "Ask Petros" affordance is offered on a screen Petros cannot read.
    expect(screen.queryByRole('button', { name: /Ask Petros about/ })).toBeNull();
  });

  it('is not mounted at all during an exam attempt', () => {
    mocks.pathname = '/exams/abc/attempt';
    mount(<></>);
    expect(screen.queryByRole('button', { name: 'Open Petros' })).toBeNull();
  });
});
