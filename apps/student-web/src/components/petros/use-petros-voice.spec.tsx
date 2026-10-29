import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPetrosSpeechTimeline, usePetrosVoice } from './use-petros-voice';

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/api-client', () => { const api = { get: mocks.get, post: mocks.post, uploadPetrosMedia: mocks.upload }; return {
  useStudentApi: () => api,
  formatApiError: (error: Error) => error.message,
  newIdempotencyKey: () => 'test-key',
}; });

class TestAudio {
  static latest: TestAudio;
  onplaying: (() => void) | null = null;
  onpause: (() => void) | null = null;
  onwaiting: (() => void) | null = null;
  onstalled: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  duration = 10;
  currentTime = 0;
  src: string;
  constructor(src: string) { this.src = src; TestAudio.latest = this; }
  play() { this.onplaying?.(); return Promise.resolve(); }
  pause() { this.onerror?.(); }
}

class TestRecorder {
  static isTypeSupported = () => true;
  state = 'inactive';
  mimeType = 'audio/webm';
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  start() { this.state = 'recording'; }
  stop() {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['test audio'], { type: 'audio/webm' }) });
    this.onstop?.();
  }
}

describe('Petros voice lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('Audio', TestAudio);
    vi.stubGlobal('MediaRecorder', TestRecorder);
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: vi.fn() }] }) } });
    mocks.get.mockResolvedValue({ state: 'ready', voices: ['cedar','marin','onyx'], modelKey: 'gpt-4o-mini-tts', providerKey: 'fixture' });
    mocks.post.mockImplementation(async (_path, body) => ({ audio: { dataBase64: 'AA==', mimeType: 'audio/wav' }, requestedVoice: body.voice, effective: { voice: body.voice, modelKey: 'gpt-4o-mini-tts', providerKey: 'fixture', routeId: 'fixture-route' }, fallback: { voice: false, route: false } }));
  });

  it('stops audio without a false playback error, even if stale events arrive', async () => {
    const { result } = renderHook(() => usePetrosVoice(vi.fn()));
    await waitFor(() => expect(result.current.canSpeak).toBe(true));
    await act(() => result.current.speak('A calm reply.'));
    expect(result.current.speaking).toBe(true);
    const staleError = TestAudio.latest.onerror;
    act(() => result.current.stopSpeaking());
    act(() => staleError?.());
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBe('');
    expect(TestAudio.latest.onerror).toBeNull();
  });

  it('starts and stops the observable speech clock with the real audio lifecycle', async () => {
    const ended = vi.fn();
    const { result } = renderHook(() => usePetrosVoice(vi.fn()));
    await waitFor(() => expect(result.current.canSpeak).toBe(true));
    await act(() => result.current.speak('First line. Second line now.', { onEnded: ended }));
    expect(result.current.phase).toBe('speaking');
    expect(result.current.activeWordIndex).toBe(0);
    act(() => {
      TestAudio.latest.currentTime = 7;
      TestAudio.latest.ontimeupdate?.();
    });
    expect(result.current.speechProgress).toBeCloseTo(0.7);
    expect(result.current.activeWordIndex).toBeGreaterThan(0);
    expect(result.current.activeLineIndex).toBe(1);
    act(() => TestAudio.latest.onended?.());
    expect(result.current.phase).toBe('idle');
    expect(result.current.speechProgress).toBe(1);
    expect(ended).toHaveBeenCalledOnce();
  });

  it('creates stable word and sentence-line timings', () => {
    const words = buildPetrosSpeechTimeline('Cement binds materials. Concrete also contains aggregate.');
    expect(words.map((word) => word.text)).toEqual(['Cement', 'binds', 'materials.', 'Concrete', 'also', 'contains', 'aggregate.']);
    expect(words[0]).toMatchObject({ lineIndex: 0, start: 0 });
    expect(words[3]?.lineIndex).toBe(1);
    expect(words.at(-1)?.end).toBeCloseTo(1);
  });

  it('cancels speech that is still being prepared', async () => {
    let resolve!: (value: unknown) => void;
    mocks.post.mockImplementation(() => new Promise((done) => { resolve = done; }));
    const { result } = renderHook(() => usePetrosVoice(vi.fn()));
    await waitFor(() => expect(result.current.canSpeak).toBe(true));
    let pending!: Promise<void>;
    act(() => { pending = result.current.speak('Pending audio.'); });
    expect(result.current.preparing).toBe(true);
    const signal = mocks.post.mock.calls[0]![3] as AbortSignal;
    act(() => result.current.stopSpeaking());
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve({ audio: { dataBase64: 'AA==', mimeType: 'audio/wav' } }); await pending; });
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('uses the chosen language and returns an editable transcript without posting a conversation turn', async () => {
    mocks.post.mockImplementation((path: string) => Promise.resolve(path.endsWith('/intents')
      ? { media: { id: 'voice' }, upload: { url: '/upload' } }
      : { media: { id: 'voice' }, transcription: { text: 'Hi, how are you?' } }));
    mocks.upload.mockResolvedValue({ id: 'voice' });
    const onTranscript = vi.fn();
    const { result } = renderHook(() => usePetrosVoice(onTranscript, { language: 'en' }));
    await act(() => result.current.startListening());
    expect(result.current.listening).toBe(true);
    act(() => result.current.stopListening());
    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('Hi, how are you?'));
    expect(mocks.post).toHaveBeenCalledWith('/student/petros/media/voice/process', { idempotencyKey: 'test-key', language: 'en' }, undefined, expect.any(AbortSignal));
    expect(mocks.post.mock.calls.some(([path]) => path.includes('/companion/turns'))).toBe(false);
  });

  it('discards a recording when the conversation closes', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => usePetrosVoice(onTranscript));
    await act(() => result.current.startListening());
    act(() => result.current.cancelListening());
    expect(result.current.phase).toBe('idle');
    expect(mocks.post).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('blocks a stale Cedar preference on a legacy route without submitting synthesis', async () => {
    mocks.get.mockResolvedValue({ state: 'ready', voices: ['onyx','nova'], modelKey: 'tts-1', providerKey: 'fixture' });
    const { result } = renderHook(() => usePetrosVoice(vi.fn(), { voice: 'cedar' }));
    await waitFor(() => expect(result.current.voiceOptions?.state).toBe('ready'));
    await act(() => result.current.speak('Public test.'));
    expect(result.current.error).toContain('Select a supported voice'); expect(mocks.post).not.toHaveBeenCalled();
  });
  it('fences a late synthesis when the selected voice changes', async () => {
    let resolve!: (value: unknown) => void;
    mocks.post.mockImplementation(() => new Promise(done => { resolve = done; }));
    const { result, rerender } = renderHook(({ voice }) => usePetrosVoice(vi.fn(), { voice }), { initialProps: { voice: 'cedar' } });
    await waitFor(() => expect(result.current.canSpeak).toBe(true));
    let pending!: Promise<void>; act(() => { pending = result.current.speak('Public test.'); });
    const signal = mocks.post.mock.calls[0]![3] as AbortSignal;
    rerender({ voice: 'marin' }); expect(signal.aborted).toBe(true);
    await act(async () => { resolve({ audio: { dataBase64: 'AA==', mimeType: 'audio/wav' } }); await pending; });
    expect(result.current.speaking).toBe(false); expect(result.current.receipt).toBeNull();
  });
  it('rejects a receipt for another effective voice before browser playback', async () => {
    mocks.post.mockResolvedValue({ audio: { dataBase64: 'AA==', mimeType: 'audio/wav' }, requestedVoice: 'cedar',
      effective: { voice: 'onyx', modelKey: 'tts-1', providerKey: 'fixture', routeId: 'r' }, fallback: { voice: true, route: false } });
    const { result } = renderHook(() => usePetrosVoice(vi.fn()));
    await waitFor(() => expect(result.current.canSpeak).toBe(true));
    await act(() => result.current.speak('Public test.'));
    expect(result.current.error).toContain('does not match'); expect(result.current.speaking).toBe(false);
  });
  it('stops speaking on media pause/stall and resumes only on playing', async () => {
    const { result } = renderHook(() => usePetrosVoice(vi.fn()));
    await waitFor(() => expect(result.current.canSpeak).toBe(true)); await act(() => result.current.speak('Public test.'));
    const player = TestAudio.latest;
    act(() => player.onwaiting?.()); expect(result.current.speaking).toBe(false);
    act(() => player.onplaying?.()); expect(result.current.speaking).toBe(true);
    act(() => player.onpause?.()); expect(result.current.speaking).toBe(false);
    act(() => result.current.stopSpeaking()); expect(player.onplaying).toBeNull(); expect(player.onwaiting).toBeNull();
  });
  it('aborts in-flight STT before upload and ignores its late result', async () => {
    let resolve!: (value: unknown) => void;
    mocks.post.mockImplementation(() => new Promise(done => { resolve = done; }));
    const onTranscript = vi.fn(); const { result } = renderHook(() => usePetrosVoice(onTranscript));
    await act(() => result.current.startListening()); act(() => result.current.stopListening());
    await waitFor(() => expect(mocks.post).toHaveBeenCalledOnce());
    const signal = mocks.post.mock.calls[0]![3] as AbortSignal;
    act(() => result.current.cancelListening()); expect(signal.aborted).toBe(true);
    await act(async () => resolve({ media: { id: 'old' }, upload: { url: '/old-upload' } }));
    expect(mocks.upload).not.toHaveBeenCalled(); expect(onTranscript).not.toHaveBeenCalled(); expect(result.current.phase).toBe('idle');
  });
});
