import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PresentationController } from '../presentation-controller';
import { TEACHING_FIXTURES } from '../playground/teaching-fixtures';
import { VoicePreview } from './voice-preview';
import type {
  VoicePreviewSample,
  VoicePreviewStatus,
} from './voice-preview-types';

const mocks = vi.hoisted(() => ({
  api: { get: vi.fn(), post: vi.fn() },
  prepare: vi.fn(),
}));
vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => mocks.api,
  formatApiError: (error: Error) => error.message,
}));
vi.mock('./voice-preview-audio', () => ({
  prepareVoicePreviewRecording: (...args: unknown[]) => mocks.prepare(...args),
}));
const text =
  'The vertical change is six. The horizontal change is three. Their ratio is two.';
const tts = {
  routeId: 'tts',
  providerKey: 'openai',
  modelKey: 'tts-1',
  voices: ['onyx', 'nova'],
  format: 'audio/wav' as const,
  estimatedCostMicros: 7500,
  priceUnit: 'character' as const,
  priceMicrosPerUnit: 15000000,
  minimumBillableSeconds: 0,
  timing: 'none' as const,
};
const stt = {
  ...tts,
  routeId: 'stt',
  providerKey: 'groq',
  modelKey: 'whisper-large-v3-turbo',
  voices: [],
  format: null,
  priceUnit: 'audio_hour' as const,
  timing: 'input_segments' as const,
};
const ready: VoicePreviewStatus = {
  state: 'ready',
  reason: 'Mocked isolated route, no provider.',
  tts: [tts],
  stt: [stt],
  limits: {
    maxTextCharacters: 500,
    maxAudioBytes: 330000,
    maxRecordingSeconds: 10,
  },
  maximumTotalCostMicros: 750000,
  reservedCostPerCallMicros: 50000,
  privacy: { transient: true, providerRetention: 'Public tests only.' },
};
const sample: VoicePreviewSample = {
  requestedVoice: 'onyx', fallback: { voice: false, route: false },
  effective: {
    routeId: 'tts',
    providerKey: 'openai',
    modelKey: 'tts-1',
    voice: 'onyx',
  },
  audio: { dataBase64: 'AAAA', mimeType: 'audio/wav' },
  transcript: text,
  estimatedCostMicros: 1200,
  actualCostMicros: null,
  metering: 'Mock estimate',
  responseTimeMs: 20,
};
class Player extends EventTarget {
  currentTime = 0;
  duration = 5;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  removeAttribute = vi.fn();
  load = vi.fn();
  canPlayType = () => 'probably';
  emit(name: string) {
    this.dispatchEvent(new Event(name));
  }
}
class Recorder {
  static latest: Recorder;
  static empty = false;
  static isTypeSupported = () => true;
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor() {
    Recorder.latest = this;
  }
  start() {
    this.state = 'recording';
  }
  stop() {
    this.state = 'inactive';
    if (!Recorder.empty)
      this.ondataavailable?.({
        data: new Blob(['audio'], { type: 'audio/webm' }),
      });
    this.onstop?.();
  }
}
function setup(props: Partial<Parameters<typeof VoicePreview>[0]> = {}) {
  const controller = new PresentationController(TEACHING_FIXTURES[1]!.timeline),
    players: Player[] = [];
  controller.configureNarration([], () => {
    const player = new Player();
    players.push(player);
    return player as unknown as HTMLAudioElement;
  });
  const onTranscript = vi.fn(),
    onRecordingChange = vi.fn();
  const result = render(
    <VoicePreview
      controller={controller}
      onTranscript={onTranscript}
      onRecordingChange={onRecordingChange}
      {...props}
    />,
  );
  return { controller, players, onTranscript, onRecordingChange, ...result };
}
async function open() {
  const details = document.querySelector(
    '[data-voice-preview]',
  ) as HTMLDetailsElement;
  act(() => {
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
  await waitFor(() => expect(mocks.api.get).toHaveBeenCalledOnce());
  await screen.findByText(
    /Authorized isolated preview|Paid audition approval required/,
  );
}
async function generate() {
  const check = screen.getByLabelText(
    /This is public test text/,
  ) as HTMLInputElement;
  await act(async () => {
    if (!check.checked) fireEvent.click(check);
    fireEvent.click(screen.getByRole('button', { name: 'Generate and play new speech' }));
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  Recorder.empty = false;
  vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi
        .fn()
        .mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }),
    },
  });
  mocks.api.get.mockResolvedValue(ready);
  mocks.api.post.mockResolvedValue(sample);
  mocks.prepare.mockResolvedValue({
    dataBase64: 'AAAA',
    mimeType: 'audio/wav',
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('internal voice audition UI with zero-cost transports', () => {
  it('does not inspect or dispatch when collapsed and displays the honest default approval gate', async () => {
    const s = setup();
    expect(mocks.api.get).not.toHaveBeenCalled();
    expect(mocks.api.post).not.toHaveBeenCalled();
    mocks.api.get.mockResolvedValue({
      ...ready,
      state: 'authorization_required',
      reason: 'Separate approval required.',
      tts: [],
      stt: [],
    });
    await open();
    expect(
      screen.getByRole('button', { name: 'Generate and play new speech' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Start recording' }),
    ).toBeDisabled();
    expect(mocks.api.post).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    act(() => s.controller.dispose());
  });
  it('shows only server-qualified voices and uses real playback events, stop and cached replay', async () => {
    const s = setup();
    await open();
    expect(screen.getByLabelText('Supported voice')).toHaveValue('onyx');
    expect(
      screen.queryByRole('option', { name: /cedar|marin/i }),
    ).not.toBeInTheDocument();
    await generate();
    await waitFor(() => expect(s.players).toHaveLength(1));
    expect(s.controller.getSnapshot().speech.phase).toBe('loading');
    act(() => s.players[0]!.emit('playing'));
    expect(screen.getByText('Speech preview is playing.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Stop / cancel' }));
    expect(s.players[0]!.pause).toHaveBeenCalled();
    expect(s.controller.getSnapshot().speech.preview).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: /Replay previously generated sample 1/ }));
    expect(s.players).toHaveLength(2);
    expect(mocks.api.post).toHaveBeenCalledOnce();
    act(() => s.controller.dispose());
  });
  it('fences stale generation when a lesson continues and when the panel unmounts', async () => {
    let resolve!: (value: VoicePreviewSample) => void;
    mocks.api.post.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const s = setup();
    await open();
    await generate();
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledOnce());
    const signal = mocks.api.post.mock.calls[0]![3] as AbortSignal;
    act(() => s.controller.play());
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(sample));
    expect(s.players).toHaveLength(0);
    act(() => s.controller.pause());
    await generate();
    await waitFor(() => expect(mocks.api.post).toHaveBeenCalledTimes(2));
    const last = mocks.api.post.mock.calls[1]![3] as AbortSignal;
    s.unmount();
    expect(last.aborted).toBe(true);
    await act(async () => resolve(sample));
    expect(s.players).toHaveLength(0);
    act(() => s.controller.dispose());
  });
  it('rejects effective voice substitution instead of playing a mislabeled sample', async () => {
    mocks.api.post.mockResolvedValue({
      ...sample,
      effective: { ...sample.effective, voice: 'nova' },
    });
    const s = setup();
    await open();
    await generate();
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'effective route differs',
    );
    expect(s.players).toHaveLength(0);
    act(() => s.controller.dispose());
  });
  it('keeps permission explicit and reports denial without claiming active listening', async () => {
    vi.mocked(navigator.mediaDevices.getUserMedia).mockRejectedValue(
      new DOMException('No', 'NotAllowedError'),
    );
    const s = setup();
    await open();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByLabelText(/I consent to a public test recording/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await screen.findByRole('alert');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'permission was denied',
    );
    expect(
      s.onRecordingChange.mock.calls.some(([active]) => active === true),
    ).toBe(false);
    expect(mocks.api.post).not.toHaveBeenCalled();
    act(() => s.controller.dispose());
  });
  it('copies the public fixture reply for an explicit speech audition without dispatching automatically', async () => {
    const s = setup({ publicReply: 'This public fixture explains the slope.' });
    await open();
    fireEvent.click(screen.getByLabelText(/This is public test text/));
    fireEvent.click(screen.getByRole('button', { name: 'Use current fixture reply as test text' }));
    expect(screen.getByLabelText(/Public test text ·/)).toHaveValue('This public fixture explains the slope.');
    expect(screen.getByLabelText(/This is public test text/)).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Generate and play new speech' })).toBeDisabled();
    expect(mocks.api.post).not.toHaveBeenCalled();
    act(() => s.controller.dispose());
  });
  it('stops capture, exposes a correctable transcript and only copies reviewed text into the fixture', async () => {
    mocks.api.post.mockResolvedValue({
      ...sample,
      effective: {
        routeId: 'stt',
        providerKey: 'groq',
        modelKey: 'whisper-large-v3-turbo',
        voice: null,
      },
      transcript: 'Slope is tree.',
    });
    const s = setup();
    await open();
    fireEvent.click(
      screen.getByLabelText(/I consent to a public test recording/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Stop and transcribe' });
    expect(s.onRecordingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop and transcribe' }),
    );
    const editor = await screen.findByLabelText(
      'Correct recognized transcript',
    );
    expect(s.onRecordingChange).toHaveBeenLastCalledWith(false);
    expect(s.onTranscript).not.toHaveBeenCalled();
    fireEvent.change(editor, { target: { value: '' } });
    expect(
      screen.getByLabelText('Correct recognized transcript'),
    ).toBeInTheDocument();
    fireEvent.change(editor, { target: { value: 'Slope is three.' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Use as fixture question' }),
    );
    expect(s.onTranscript).toHaveBeenCalledWith('Slope is three.');
    expect(mocks.api.post.mock.calls[0]![1]).toEqual({
      routeId: 'stt',
      audio: { dataBase64: 'AAAA', mimeType: 'audio/wav' },
      consent: true,
    });
    act(() => s.controller.dispose());
  });
  it('rejects empty audio without sending it and cancels microphone permission received after a typed interruption', async () => {
    mocks.prepare.mockRejectedValue(new Error('The recording is empty.'));
    Recorder.empty = true;
    const s = setup();
    await open();
    fireEvent.click(
      screen.getByLabelText(/I consent to a public test recording/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    await screen.findByRole('button', { name: 'Stop and transcribe' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Stop and transcribe' }),
    );
    await screen.findByRole('alert');
    expect(mocks.api.post).not.toHaveBeenCalled();
    let resolve!: (value: MediaStream) => void;
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Start recording' }));
    act(() => s.controller.interrupt());
    const stop = vi.fn();
    await act(async () =>
      resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream),
    );
    expect(stop).toHaveBeenCalled();
    expect(
      screen.queryByRole('button', { name: 'Stop and transcribe' }),
    ).not.toBeInTheDocument();
    act(() => s.controller.dispose());
  });
  it('stops an active sample when assessment-safe preview becomes enabled', async () => {
    const s = setup();
    await open();
    await generate();
    await waitFor(() => expect(s.players).toHaveLength(1));
    act(() => s.players[0]!.emit('playing'));
    s.rerender(
      <VoicePreview
        controller={s.controller}
        onTranscript={s.onTranscript}
        disabled
      />,
    );
    expect(s.players[0]!.pause).toHaveBeenCalled();
    expect(s.controller.getSnapshot().speech.phase).toBe('text');
    act(() => s.controller.dispose());
  });
});


describe('route status cancellation and response validation', () => {
  it('bounds a stalled status request and ignores its late response', async () => {
    vi.useFakeTimers(); let resolve!: (value: VoicePreviewStatus) => void;
    mocks.api.get.mockImplementation(() => new Promise(done => { resolve = done; }));
    const s = setup(); const details = document.querySelector('[data-voice-preview]') as HTMLDetailsElement;
    act(() => { details.open = true; details.dispatchEvent(new Event('toggle')); });
    const signal = mocks.api.get.mock.calls[0]![1] as AbortSignal;
    // An AbortSignal-aware fetch rejects when aborted, as the real API client does.
    signal.addEventListener('abort', () => resolve(undefined as never));
    await act(async () => { vi.advanceTimersByTime(8000); });
    expect(signal.aborted).toBe(true);
    expect(screen.getByRole('alert')).toHaveTextContent('timed out');
    await act(async () => resolve(ready));
    expect(screen.queryByText(/Authorized isolated preview/)).not.toBeInTheDocument();
    expect(mocks.api.post).not.toHaveBeenCalled(); act(() => s.controller.dispose());
  });
  it('reports an incompatible 200 response instead of inventing ready routes', async () => {
    mocks.api.get.mockResolvedValue('<html>Wrong API</html>'); const s = setup();
    const details = document.querySelector('[data-voice-preview]') as HTMLDetailsElement;
    act(() => { details.open = true; details.dispatchEvent(new Event('toggle')); });
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid status response');
    expect(mocks.api.post).not.toHaveBeenCalled(); act(() => s.controller.dispose());
  });
});
