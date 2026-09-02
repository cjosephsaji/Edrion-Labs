import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildPetrosSpeechTimeline, usePetrosVoice } from './use-petros-voice';

const mocks = vi.hoisted(() => ({ post: vi.fn(), upload: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => ({ post: mocks.post, uploadPetrosMedia: mocks.upload }),
  formatApiError: (error: Error) => error.message,
  newIdempotencyKey: () => 'test-key',
}));

class TestAudio {
  static latest: TestAudio;
  onplay: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  duration = 10;
  currentTime = 0;
  src: string;
  constructor(src: string) { this.src = src; TestAudio.latest = this; }
  play() { this.onplay?.(); return Promise.resolve(); }
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
    mocks.post.mockResolvedValue({ audio: { dataBase64: 'AA==', mimeType: 'audio/wav' } });
  });

  it('stops audio without a false playback error, even if stale events arrive', async () => {
    const { result } = renderHook(() => usePetrosVoice(vi.fn()));
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
    expect(mocks.post).toHaveBeenCalledWith('/student/petros/media/voice/process', { idempotencyKey: 'test-key', language: 'en' });
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
});
