import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PetrosTeachingPresentation } from '@edrion/schemas';
import { useTeachingPlayback } from './use-teaching-playback';

const presentation: PetrosTeachingPresentation = { schemaVersion: 'petros.presentation.v1', id: 'fixture', unitId: 'unit', title: 'Public fixture', objective: 'Notice the movement.', beats: [{ id: 'beat', narration: 'Notice the movement.', targetId: null, reveals: [], gesture: 'speak', advancement: 'student_continue', audioSrc: '/petros/audio/fixture.wav' }] };
class Player {
  static latest: Player;
  src: string; currentTime = 0;
  onplaying: (() => void) | null = null; onwaiting: (() => void) | null = null; onstalled: (() => void) | null = null;
  onended: (() => void) | null = null; onerror: (() => void) | null = null; onpause: (() => void) | null = null;
  play = vi.fn(() => Promise.resolve()); pause = vi.fn();
  constructor(src: string) { this.src = new URL(src, window.location.href).href; Player.latest = this; }
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('V1 studio playback presentation signal', () => {
  it('speaks only after actual audio playing, closes during stalls/pause and fences old events on interruption', () => {
    vi.stubGlobal('Audio', Player);
    const { result } = renderHook(() => useTeachingPlayback(presentation));
    act(() => result.current.play()); const player = Player.latest;
    expect(result.current.status).toBe('playing'); expect(result.current.speaking).toBe(false);
    act(() => player.onplaying?.()); expect(result.current.speaking).toBe(true);
    act(() => player.onwaiting?.()); expect(result.current.speaking).toBe(false);
    act(() => player.onplaying?.()); expect(result.current.speaking).toBe(true);
    const oldPlaying = player.onplaying, oldError = player.onerror;
    act(() => result.current.pause()); act(() => { oldPlaying?.(); oldError?.(); });
    expect(result.current.speaking).toBe(false); expect(result.current.status).toBe('paused');
    act(() => result.current.play()); act(() => Player.latest.onplaying?.());
    act(() => result.current.interrupt()); act(() => oldPlaying?.());
    expect(result.current.speaking).toBe(false); expect(result.current.status).toBe('interrupted');
    expect(result.current.index).toBe(0); expect(player.pause).toHaveBeenCalled();
  });
  it('uses actual device utterance events, clears paused device state, and keeps quiet mode still', () => {
    const synth = { speak: vi.fn<(utterance: SpeechSynthesisUtterance) => void>(), cancel: vi.fn(), resume: vi.fn(), pause: vi.fn() };
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
    const deviceBeat = { ...presentation.beats[0]! }; delete deviceBeat.audioSrc;
    const devicePresentation = { ...presentation, beats: [deviceBeat] };
    const { result } = renderHook(() => useTeachingPlayback(devicePresentation));
    act(() => result.current.play()); const utterance = synth.speak.mock.calls[0]![0] as SpeechSynthesisUtterance;
    expect(result.current.speaking).toBe(false); expect(synth.cancel).toHaveBeenCalled(); expect(synth.resume).toHaveBeenCalled();
    act(() => utterance.onstart?.(new Event('start') as SpeechSynthesisEvent)); expect(result.current.speaking).toBe(true);
    act(() => result.current.pause()); act(() => utterance.onstart?.(new Event('start') as SpeechSynthesisEvent));
    expect(result.current.speaking).toBe(false);
    act(() => result.current.setMode('quiet')); act(() => result.current.play());
    expect(synth.speak).toHaveBeenCalledTimes(1); expect(result.current.speaking).toBe(false);
  });
});
