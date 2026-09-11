import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { petrosMentorStateSchema, type PetrosMentorDecision } from '@edrion/schemas';
import { PetrosCompanionProvider, usePetrosPage } from './petros-companion-context';
import { PetrosAskButton } from './petros-ask-button';
import { PetrosMentor } from './petros-mentor';
import { PetrosNarratedText } from './petros-narrated-text';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  push: vi.fn(),
  explore: vi.fn(),
  close: vi.fn(),
  askLesson: vi.fn().mockResolvedValue(undefined),
  resumeLesson: vi.fn().mockResolvedValue(undefined),
  pathname: '/home',
}));
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => ({
    get: mocks.get,
    post: mocks.post,
    put: mocks.put,
    uploadPetrosMedia: vi.fn(),
  }),
  formatApiError: (error: Error) => error.message,
  newIdempotencyKey: () => '00000000-0000-4000-8000-000000000001',
}));
vi.mock('./petros-door-button', () => ({
  PetrosDoorButton: ({ label }: { label: string }) => <button>{label}</button>,
}));

const preferences = petrosMentorStateSchema.parse({}).preferences;
const decision: PetrosMentorDecision = {
  generatedAt: new Date().toISOString(),
  timeZone: 'Asia/Kolkata',
  proactiveAllowed: true,
  preferences,
  planInput: { minutes: 45, energy: 'normal', availability: [] },
  planConfirmed: false,
  status: 'ready',
  unavailable: [],
  message: 'Programming exam comes first. Within the next 24 hours.',
  mood: 'urgent',
  priorities: [
    {
      key: 'exam:1',
      kind: 'exam',
      title: 'Programming exam',
      reason: 'Tomorrow, before the assignment next week.',
      href: '/exams',
      entityType: 'exam_schedule',
      entityId: '1',
      deadlineAt: '2026-09-01T09:00:00Z',
      subject: 'Programming',
      minutes: 25,
      score: 950,
      urgency: 'high',
      factors: ['Within the next 24 hours'],
      previousDecision: null,
    },
  ],
  resources: [],
  plan: [],
  nextCheck: null,
  momentum: { completedToday: 0, practicedMinutesToday: 0, activeMinutes: 0, lastActivityAt: null },
  learning: null,
};

function companionTurn(blocks: unknown[]) {
  const now = new Date().toISOString();
  return {
    threadId: 'thread-1',
    studentMessage: {
      id: 'student-1', threadId: 'thread-1', role: 'student', blocks: [{ type: 'text', text: 'Where is the library?' }], route: '/home', surface: 'home', focusRef: null, createdAt: now,
    },
    reply: {
      id: 'petros-1', threadId: 'thread-1', role: 'petros', blocks, route: '/home', surface: 'home', focusRef: null, createdAt: now,
    },
  };
}

function LessonRegistration() {
  usePetrosPage({
    title: 'Module 1 Revision Entry Point',
    summary: 'Compare grid computing with cloud computing, then commit your own answer.',
    candidates: [],
    onAsk: mocks.askLesson,
    onResumeQuestion: mocks.resumeLesson,
  });
  return <section data-petros-target="lesson:current">Active teaching block</section>;
}

function TargetedLessonRegistration() {
  const blockId = '11111111-1111-4111-8111-111111111111';
  usePetrosPage({
    title: 'Targeted lesson',
    summary: 'Legacy fallback that should not be narrated.',
    narration: [
      {
        id: `${blockId}:first-layer`,
        blockId,
        targetKey: `${blockId}:first-layer-target`,
        label: 'first explanation',
        text: 'Alpha beta gamma delta epsilon zeta eta theta.',
      },
      {
        id: `${blockId}:key-idea`,
        blockId,
        targetKey: `${blockId}:key-idea-target`,
        label: 'key idea',
        text: 'This second segment is the key idea.',
      },
    ],
    candidates: [],
    onAsk: mocks.askLesson,
    onResumeQuestion: mocks.resumeLesson,
  });
  return (
    <section data-petros-target="lesson:current">
      <p data-petros-target={`${blockId}:first-layer-target`}>
        <PetrosNarratedText
          text="Alpha beta gamma delta epsilon zeta eta theta."
          targetKey={`${blockId}:first-layer-target`}
        />
      </p>
      <p data-petros-target={`${blockId}:key-idea-target`}>
        <PetrosNarratedText
          text="This second segment is the key idea."
          targetKey={`${blockId}:key-idea-target`}
        />
      </p>
    </section>
  );
}

function HomeworkRegistration() {
  usePetrosPage({
    title: 'Homework',
    candidates: [{
      ref: 'homework-1',
      entityType: 'homework',
      entityId: 'homework-1',
      title: 'Cloud homework',
      summary: 'Work through question one.',
      href: '/homework/homework-1',
    }],
  });
  return <PetrosAskButton candidateRef="homework-1" label="Cloud homework" />;
}

function mount(child?: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PetrosCompanionProvider>
        {child}
        <PetrosMentor
          studentId="student1"
          navigation={[
            { href: '/exams', label: 'Exams' },
            { href: '/materials', label: 'Library' },
            { href: '/progress', label: 'Progress' },
            { href: '/homework', label: 'Homework' },
          ]}
          onExplore={mocks.explore}
          onCloseExplore={mocks.close}
        />
      </PetrosCompanionProvider>
    </QueryClientProvider>,
  );
}

function characterButton() {
  return document.getElementById('petros-mentor-toggle') as HTMLButtonElement;
}

class MentorAudio {
  static latest: MentorAudio;
  onplay: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  src = '';
  currentTime = 0;
  duration = 10;
  constructor(src: string) { this.src = src; MentorAudio.latest = this; }
  play() { this.onplay?.(); return Promise.resolve(); }
  pause() {}
}

describe('embodied Petros portal agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: (key: string, value: string) => saved.set(key, value) });
    mocks.pathname = '/home';
    mocks.get.mockResolvedValue(structuredClone(decision));
    mocks.put.mockResolvedValue(structuredClone(decision));
    mocks.askLesson.mockResolvedValue({
      detourId: 'detour-1',
      question: 'Explain grid computing more simply',
      answer: 'Grid computing joins several computers so they can share one large job.',
      returnPlan: 'Return to the grid and cloud comparison.',
    });
    mocks.resumeLesson.mockResolvedValue(undefined);
    mocks.post.mockImplementation((path: string) => {
      if (path === '/student/petros/companion/speech') {
        return Promise.resolve({ audio: { dataBase64: 'AA==', mimeType: 'audio/mpeg' }, transcript: 'Hi' });
      }
      return Promise.resolve(structuredClone(decision));
    });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
    vi.stubGlobal('Audio', MentorAudio);
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('keeps the character in its own header slot and the composer outside the scrollable reply', async () => {
    mount();
    expect(await screen.findByText(decision.message)).toBeVisible();
    expect(screen.getByAltText('Petros, your animated learning buddy')).toHaveAttribute('src', expect.stringContaining('/petros/states/'));
    expect(screen.getByRole('button', { name: 'Take me there' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Start 25-minute session' })).toBeVisible();
    expect(screen.queryByRole('complementary', { name: /companion/i })).not.toBeInTheDocument();
    expect(characterButton().parentElement).toHaveAttribute('data-docked', 'true');
    expect(screen.getByLabelText('Petros reply')).not.toContainElement(screen.getByRole('textbox', { name: 'Talk to Petros' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand conversation' }));
    expect(screen.getByLabelText('Petros, your portal learning buddy')).toHaveAttribute('data-size', 'wide');
  });

  it('shows the active lesson silently and reads it only when requested', async () => {
    mocks.pathname = '/petros/session';
    mount(<LessonRegistration />);
    expect(characterButton().parentElement).not.toHaveAttribute('data-docked');
    fireEvent.click(characterButton());
    expect(await screen.findByText('Compare grid computing with cloud computing, then commit your own answer.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Take me there' })).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Read aloud' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/student/petros/companion/speech', expect.objectContaining({ text: expect.stringContaining('Compare grid computing'), voice: 'cedar' }), undefined, expect.any(AbortSignal)));
    await waitFor(() => expect(screen.getByLabelText('Petros, your portal learning buddy')).toHaveAttribute('data-mouth', 'open'));
    expect(document.querySelector('[data-synced="true"] [data-active="true"]')).toBeTruthy();
    act(() => MentorAudio.latest.onended?.());
    await waitFor(() => expect(screen.getByLabelText('Petros, your portal learning buddy')).toHaveAttribute('data-mouth', 'rest'));
  });

  it('narrates beside the lesson in listen-first mode and stops without opening chat', async () => {
    mocks.pathname = '/petros/session';
    mount(<TargetedLessonRegistration />);
    expect(characterButton().parentElement).not.toHaveAttribute('data-docked');
    act(() => window.dispatchEvent(new CustomEvent('petros:lesson-play')));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      '/student/petros/companion/speech',
      expect.objectContaining({ text: 'Alpha beta gamma delta epsilon zeta eta theta.' }),
      undefined, expect.any(AbortSignal),
    ));
    expect(screen.getByLabelText('Petros, your portal learning buddy')).toHaveAttribute('data-conversation', 'closed');
    expect(characterButton().parentElement).not.toHaveAttribute('data-docked');
    act(() => window.dispatchEvent(new CustomEvent('petros:lesson-stop')));
    await waitFor(() => expect(screen.getByLabelText('Petros, your portal learning buddy')).toHaveAttribute('data-mouth', 'rest'));
  });

  it('moves the undocked character between declared map targets without requesting audio', async () => {
    mocks.pathname = '/petros/session';
    mount(<><TargetedLessonRegistration /><svg><g data-testid="map-a" data-petros-target="map:a" /><g data-testid="map-b" data-petros-target="map:b" /></svg></>);
    const first = screen.getByTestId('map-a');
    const second = screen.getByTestId('map-b');
    for (const [element, left, top] of [[first, 250, 200], [second, 650, 400]] as const) {
      const rect = { left, top, right: left + 100, bottom: top + 60, width: 100, height: 60, x: left, y: top, toJSON: () => ({}) };
      element.getBoundingClientRect = () => rect;
      element.getClientRects = () => [rect] as unknown as DOMRectList;
    }
    act(() => window.dispatchEvent(new CustomEvent('petros:diagram-focus', { detail: { diagramId: 'map', step: 0, targetKey: 'map:a', text: 'Look at the first idea.' } })));
    await waitFor(() => expect(first).toHaveAttribute('data-petros-active', 'true'));
    const firstPosition = characterButton().parentElement!.getAttribute('style');
    expect(characterButton().parentElement).not.toHaveAttribute('data-docked');
    act(() => window.dispatchEvent(new CustomEvent('petros:diagram-focus', { detail: { diagramId: 'map', step: 1, targetKey: 'map:b', text: 'Now connect the second idea.' } })));
    await waitFor(() => expect(second).toHaveAttribute('data-petros-active', 'true'));
    expect(first).not.toHaveAttribute('data-petros-active');
    expect(characterButton().parentElement!.getAttribute('style')).not.toBe(firstPosition);
    expect(screen.getByLabelText('Petros, your portal learning buddy').getAttribute('data-pose')).toMatch(/^point-/);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('sends lesson questions to the active teaching session, not the portal planner', async () => {
    mocks.pathname = '/petros/session';
    mount(<LessonRegistration />);
    fireEvent.click(characterButton());
    fireEvent.change(await screen.findByRole('textbox', { name: 'Talk to Petros' }), { target: { value: 'Explain grid computing more simply' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));
    await waitFor(() => expect(mocks.askLesson).toHaveBeenCalledWith('Explain grid computing more simply'));
    expect(mocks.post).not.toHaveBeenCalled();
    expect(await screen.findByText('Grid computing joins several computers so they can share one large job.')).toBeVisible();
    expect(screen.getByText('Explain grid computing more simply')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Yes — resume the lesson' }));
    await waitFor(() => expect(mocks.resumeLesson).toHaveBeenCalledWith('detour-1'));
    expect(screen.queryByText('Grid computing joins several computers so they can share one large job.')).not.toBeInTheDocument();
  });

  it('pauses a targeted segment, keeps follow-ups on that pause, and resumes from its word', async () => {
    mocks.pathname = '/petros/session';
    mocks.askLesson
      .mockResolvedValueOnce({
        detourId: 'detour-1',
        question: 'What does delta mean?',
        answer: 'Delta is the fourth item in this example.',
        returnPlan: 'Return to the first explanation.',
      })
      .mockResolvedValueOnce({
        detourId: 'detour-2',
        question: 'And epsilon?',
        answer: 'Epsilon is the next item.',
        returnPlan: 'Return to the first explanation.',
      });
    mount(<TargetedLessonRegistration />);

    fireEvent.click(characterButton());
    fireEvent.click(await screen.findByRole('button', { name: 'Read aloud' }));
    expect(characterButton().parentElement).toHaveAttribute('data-docked', 'true');
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(
      '/student/petros/companion/speech',
      expect.objectContaining({ text: 'Alpha beta gamma delta epsilon zeta eta theta.' }),
      undefined,
      expect.any(AbortSignal),
    ));
    act(() => {
      MentorAudio.latest.currentTime = 5;
      MentorAudio.latest.ontimeupdate?.();
    });
    expect(document.querySelector(
      '[data-petros-target$="first-layer-target"] [data-petros-narrated-word][data-active="true"]',
    )).toBeTruthy();

    fireEvent.change(screen.getByRole('textbox', { name: 'Talk to Petros' }), { target: { value: 'What does delta mean?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));
    await waitFor(() => expect(mocks.askLesson).toHaveBeenCalledWith(
      'What does delta mean?',
      expect.objectContaining({
        blockId: '11111111-1111-4111-8111-111111111111',
        segmentId: '11111111-1111-4111-8111-111111111111:first-layer',
        targetKey: '11111111-1111-4111-8111-111111111111:first-layer-target',
        spokenText: 'Alpha beta gamma delta epsilon zeta eta theta.',
        wordIndex: expect.any(Number),
      }),
    ));
    expect(document.querySelector('[data-petros-narrated-word][data-active="true"]')).toBeNull();

    fireEvent.change(screen.getByRole('textbox', { name: 'Talk to Petros' }), { target: { value: 'And epsilon?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));
    await waitFor(() => expect(mocks.askLesson).toHaveBeenLastCalledWith(
      'And epsilon?',
      expect.objectContaining({ segmentId: '11111111-1111-4111-8111-111111111111:first-layer' }),
    ));

    fireEvent.click(screen.getByRole('button', { name: 'Yes — resume the lesson' }));
    await waitFor(() => expect(mocks.resumeLesson.mock.calls).toEqual([['detour-1'], ['detour-2']]));
    await waitFor(() => {
      const speechCalls = mocks.post.mock.calls.filter(([path]) => path === '/student/petros/companion/speech');
      expect(speechCalls.at(-1)?.[1]).toEqual(expect.objectContaining({
        text: expect.not.stringContaining('Alpha beta'),
      }));
    });
  });

  it('closes an active walkthrough and returns the character to idle', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Take me there' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Petros conversation' }));
    expect(screen.queryByLabelText('Petros speech')).not.toBeInTheDocument();
    expect(characterButton()).toHaveAttribute('aria-expanded', 'false');
    expect(mocks.close).toHaveBeenCalled();
  });

  it('stays closed when an in-flight conversation request later fails', async () => {
    let reject!: (reason: Error) => void;
    mocks.post.mockImplementation(() => new Promise((_, fail) => { reject = fail; }));
    mount();
    fireEvent.change(await screen.findByRole('textbox', { name: 'Talk to Petros' }), { target: { value: 'Help me plan' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Petros conversation' }));
    reject(new Error('Temporary network issue'));
    await waitFor(() => expect(screen.queryByLabelText('Petros speech')).not.toBeInTheDocument());
    fireEvent.click(characterButton());
    expect(await screen.findByText('Temporary network issue')).toBeVisible();
    expect(screen.getByRole('textbox', { name: 'Talk to Petros' })).toHaveValue('Help me plan');
  });

  it('keeps voice settings open and saves a chosen voice without auto-playing', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Settings' }));
    expect(screen.getByLabelText('Read replies aloud automatically')).not.toBeChecked();
    fireEvent.change(screen.getByLabelText('Speaking voice'), { target: { value: 'marin' } });
    fireEvent.change(screen.getByLabelText('I speak in'), { target: { value: 'ml' } });
    expect(screen.getByLabelText('Speaking voice')).toHaveValue('marin');
    expect(JSON.parse(localStorage.getItem('petros:voice:student1')!)).toEqual({ voice: 'marin', language: 'ml', autoRead: false });
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('uses the learner’s stated time instead of inventing a completion promise', async () => {
    mocks.post.mockResolvedValue({
      ...decision,
      planInput: { minutes: 20, energy: 'normal', availability: [] },
      planConfirmed: true,
      plan: [{ key: 'today:exam:1', priorityKey: 'exam:1', date: '2026-08-31', title: 'Programming exam', minutes: 20, kind: 'focus', href: '/exams' }],
    });
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'I only have 20 min' }));
    fireEvent.click(screen.getByRole('button', { name: 'Build a 20-minute route' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/student/petros/companion/mentor/plan', { minutes: 20, energy: 'normal', availability: [] }));
    expect(await screen.findByRole('status')).toHaveTextContent('Your 20-minute route is ready');
    expect(screen.getByText('Programming exam')).toBeVisible();
  });

  it('walks through Explore and then opens the requested portal page', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Take me there' }));
    expect(screen.getByText('Follow me. We start with Explore.')).toBeVisible();
    expect(screen.getByRole('region', { name: 'Petros speech' })).toHaveAttribute('data-guide-side');
    await waitFor(() => expect(mocks.explore).toHaveBeenCalledOnce(), { timeout: 1_500 });
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/exams'), { timeout: 2_000 });
  });

  it('takes the student to the item they explicitly selected instead of the global priority', async () => {
    mocks.pathname = '/homework';
    mount(<HomeworkRegistration />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ask Petros about Cloud homework' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Take me there' }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/homework/homework-1'), { timeout: 2_500 });
    expect(mocks.push).not.toHaveBeenCalledWith('/exams');
  });

  it('stays idle instead of interrupting while the student is typing', async () => {
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    try {
      mount();
      await screen.findByAltText('Petros, your animated learning buddy');
      await waitFor(() => expect(mocks.get).toHaveBeenCalled());
      expect(screen.queryByLabelText('Petros speech')).not.toBeInTheDocument();
    } finally {
      input.remove();
    }
  });

  it('sends natural language directly from the character and follows navigation replies', async () => {
    mocks.get.mockResolvedValue({ ...decision, priorities: [{ ...decision.priorities[0], urgency: 'normal', deadlineAt: null }] });
    mocks.post.mockImplementation((path: string) => {
      if (path === '/student/petros/companion/turns') return Promise.resolve(companionTurn([{ type: 'text', text: 'I got you.' }, { type: 'navigation', label: 'Open Library', href: '/materials' }]));
      if (path === '/student/petros/companion/speech') return Promise.resolve({ audio: { dataBase64: 'AA==', mimeType: 'audio/mpeg' }, transcript: 'I got you.' });
      return Promise.resolve(structuredClone(decision));
    });
    mount();
    fireEvent.click(characterButton());
    fireEvent.change(await screen.findByRole('textbox', { name: 'Talk to Petros' }), { target: { value: 'Where is the library?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));
    expect(await screen.findByText('I got you.')).toBeVisible();
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/student/petros/companion/turns', expect.objectContaining({ message: 'Where is the library?' })));
    await waitFor(() => expect(screen.getByText('Follow me. We start with Explore.')).toBeVisible());
  });

  it('keeps irreversible proposals behind an explicit confirmation', async () => {
    mocks.get.mockResolvedValue({ ...decision, priorities: [{ ...decision.priorities[0], urgency: 'normal', deadlineAt: null }] });
    mocks.post.mockImplementation((path: string) => {
      if (path === '/student/petros/companion/turns') return Promise.resolve(companionTurn([{ type: 'text', text: 'Review this first.' }, { type: 'action_proposal', proposalId: 'proposal-1', actionKey: 'planner.create', title: 'Create study blocks', preview: ['20 minutes today'], confirmationRequired: true }]));
      if (path === '/student/petros/companion/actions/proposal-1/decision') return Promise.resolve({ status: 'executed', actionKey: 'planner.create', message: 'Study block created.' });
      if (path === '/student/petros/companion/speech') return Promise.resolve({ audio: { dataBase64: 'AA==', mimeType: 'audio/mpeg' }, transcript: 'Review this first.' });
      return Promise.resolve(structuredClone(decision));
    });
    mount();
    fireEvent.click(characterButton());
    fireEvent.change(await screen.findByRole('textbox', { name: 'Talk to Petros' }), { target: { value: 'Plan my evening' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send to Petros' }));
    const confirm = await screen.findByRole('button', { name: 'Confirm' });
    expect(mocks.post).not.toHaveBeenCalledWith('/student/petros/companion/actions/proposal-1/decision', expect.anything());
    fireEvent.click(confirm);
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/student/petros/companion/actions/proposal-1/decision', expect.objectContaining({ decision: 'confirm' })));
  });

  it('saves postponement without pretending the task was submitted', async () => {
    mount();
    fireEvent.click(await screen.findByRole('button', { name: 'Later' }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith('/student/petros/companion/mentor/feedback', { key: 'exam:1', decision: 'postponed' }));
    expect(mocks.post.mock.calls.every(([path]) => !String(path).includes('/submissions'))).toBe(true);
  });

  it('honours pause while leaving voice and navigation available on demand', async () => {
    mocks.get.mockResolvedValue({ ...decision, preferences: { ...preferences, mutedUntil: new Date(Date.now() + 3_600_000).toISOString() } });
    mount();
    fireEvent.click(characterButton());
    expect(await screen.findByText('I’m taking a quiet moment. Your normal academic reminders still work.')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Talk to Petros' }).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Resume guidance' }));
    await waitFor(() => expect(mocks.put).toHaveBeenCalledWith('/student/petros/companion/mentor/preferences', expect.objectContaining({ mutedUntil: null })));
  });
});
