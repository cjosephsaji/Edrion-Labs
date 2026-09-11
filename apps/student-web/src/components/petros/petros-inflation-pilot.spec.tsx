import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PETROS_INFLATION_PILOT,
  PETROS_PILOT_SCENES,
  petrosPilotSceneProgressSchema,
  type PetrosLearningSessionDocument,
} from '@edrion/schemas';
import { PetrosInflationPilot } from './petros-inflation-pilot';

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  speak: vi.fn(),
  stop: vi.fn(),
  cancel: vi.fn(),
}));
const api = { get: mocks.get, post: mocks.post };
vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => api,
  newIdempotencyKey: () => crypto.randomUUID(),
  formatApiError: (e: Error) => e.message,
  StudentApiError: class extends Error {
    status = 409;
  },
}));
vi.mock('./use-petros-voice', () => ({
  usePetrosVoice: () => ({
    speak: mocks.speak,
    stopSpeaking: mocks.stop,
    cancelListening: mocks.cancel,
    startListening: vi.fn(),
    stopListening: vi.fn(),
    speaking: false,
    preparing: false,
    error: '',
    listening: false,
  }),
}));
vi.mock('next/image', () => ({
  default: ({
    priority: _priority,
    ...props
  }: React.ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    <img {...props} />
  ),
}));

let document: Pick<
  PetrosLearningSessionDocument,
  'id' | 'version' | 'status' | 'pilot'
>;
beforeEach(() => {
  vi.clearAllMocks();
  document = {
    id: '11111111-1111-4111-8111-111111111111',
    version: 0,
    status: 'active',
    pilot: {
      experience: PETROS_INFLATION_PILOT,
      scene: 0,
      unlocked: 0,
      mode: 'text',
      finished: false,
      commands: [],
      scenes: Object.fromEntries(
        PETROS_PILOT_SCENES.map((scene) => [
          scene.id,
          petrosPilotSceneProgressSchema.parse({}),
        ]),
      ),
    },
  };
  mocks.get.mockImplementation(async () => structuredClone(document));
  mocks.post.mockImplementation(
    async (path: string, action: Record<string, unknown>) => {
      const pilot = document.pilot!;
      const progress = pilot.scenes[PETROS_PILOT_SCENES[pilot.scene]!.id]!;
      if (action.action === 'save') {
        progress.draft = action.draft as string;
        progress.value = action.value as number;
      }
      if (action.action === 'mode')
        pilot.mode = action.mode as 'text' | 'voice';
      if (action.action === 'advance') {
        progress.outcome = 'unresolved';
        pilot.scene++;
        pilot.unlocked = pilot.scene;
      }
      if (action.action === 'answer') {
        progress.outcome = 'unresolved';
        progress.attempts.push({
          answer: action.answer as string,
          correctness: 'incorrect',
          feedback: 'Look beyond a single price.',
          hint: 'Think about the general level.',
          supported: false,
          at: new Date().toISOString(),
        });
      }
      if (path.endsWith('/pause')) document.status = 'paused';
      if (path.endsWith('/resume')) document.status = 'active';
      document.version++;
      return structuredClone(document);
    },
  );
});

describe('Petros interactive inflation stage', () => {
  it('reuses the request identity after an uncertain response', async () => {
    document.pilot!.scenes.basket!.draft = 'no';
    mocks.post.mockRejectedValueOnce(new Error('Connection interrupted.'));
    render(<PetrosInflationPilot sessionId={document.id} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check my thinking' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Connection interrupted',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check my thinking' }));
    await screen.findByText('Look beyond a single price.');
    expect(mocks.post.mock.calls[1]![1].idempotencyKey).toBe(
      mocks.post.mock.calls[0]![1].idempotencyKey,
    );
  });

  it('restores a closed notebook without presenting unresolved ideas as successes', async () => {
    document.status = 'closed';
    document.pilot!.finished = true;
    document.pilot!.scenes.basket!.outcome = 'unresolved';
    render(<PetrosInflationPilot sessionId={document.id} />);
    expect(
      await screen.findByRole('heading', {
        name: 'You’ve explored the story behind prices.',
      }),
    ).toBeVisible();
    expect(screen.getAllByText('Revisit this idea')).toHaveLength(6);
    expect(
      screen.queryByRole('button', { name: 'Notebook' }),
    ).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it('offers an explicit voice or text choice before creating a lesson', () => {
    render(<PetrosInflationPilot />);
    expect(
      screen.getByRole('button', { name: 'Teach with voice' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Learn with text' }),
    ).toBeEnabled();
    expect(mocks.post).not.toHaveBeenCalled();
    expect(mocks.speak).not.toHaveBeenCalled();
  });
  it('restores a saved explanation and keeps it when checking fails', async () => {
    document.pilot!.scene = 1;
    document.pilot!.unlocked = 1;
    document.pilot!.scenes.definition!.draft = 'My salary buys less.';
    mocks.post.mockRejectedValue(
      new Error('Checking is temporarily unavailable.'),
    );
    render(<PetrosInflationPilot sessionId={document.id} />);
    expect(
      await screen.findByRole('textbox', { name: 'Your explanation' }),
    ).toHaveValue('My salary buys less.');
    fireEvent.click(screen.getByRole('button', { name: 'Check my thinking' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'temporarily unavailable',
    );
    expect(
      screen.getByRole('textbox', { name: 'Your explanation' }),
    ).toHaveValue('My salary buys less.');
    expect(
      screen.queryByText('You’ve got this connection.'),
    ).not.toBeInTheDocument();
  });
  it('saves the chosen answer before evaluating and shows corrective feedback', async () => {
    render(<PetrosInflationPilot sessionId={document.id} />);
    fireEvent.click(
      await screen.findByRole('radio', {
        name: 'Yes — any price increase is inflation',
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Check my thinking' }));
    expect(
      await screen.findByText('Look beyond a single price.'),
    ).toBeVisible();
    expect(mocks.post.mock.calls.map((call) => call[1].action)).toEqual([
      'save',
      'answer',
    ]);
    expect(mocks.post.mock.calls[1]![1].expectedVersion).toBe(1);
    expect(
      screen.getByRole('button', { name: 'Move on and revisit' }),
    ).toBeEnabled();
  });
  it('advances only by an explicit skip and makes the next scene visible', async () => {
    render(<PetrosInflationPilot sessionId={document.id} />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Move on and revisit' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Look at the whole basket.' }),
    ).toBeVisible();
    expect(mocks.post.mock.calls[0]![1]).toMatchObject({
      action: 'advance',
      skip: true,
    });
    expect(
      screen.getByText(/0 independent · 0 with support · 1 to revisit/),
    ).toBeVisible();
  });
  it('pauses narration and disables assessment until resume', async () => {
    render(<PetrosInflationPilot sessionId={document.id} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    expect(await screen.findByText('Take your time.')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Check my thinking' }),
    ).toBeDisabled();
    expect(mocks.stop).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Resume lesson' }));
    await waitFor(() =>
      expect(screen.queryByText('Take your time.')).not.toBeInTheDocument(),
    );
  });
  it('keeps the answer when opening and closing a question interruption', async () => {
    document.pilot!.scene = 1;
    document.pilot!.unlocked = 1;
    render(<PetrosInflationPilot sessionId={document.id} />);
    fireEvent.change(
      await screen.findByRole('textbox', { name: 'Your explanation' }),
      { target: { value: 'Fixed money buys fewer things.' } },
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask Petros' }));
    expect(
      screen.getByRole('heading', { name: 'What would you like to untangle?' }),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', { name: 'Return to this idea' }),
    );
    expect(
      screen.getByRole('textbox', { name: 'Your explanation' }),
    ).toHaveValue('Fixed money buys fewer things.');
  });
});
