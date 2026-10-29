import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { m4SnapshotSchema, type M4Snapshot } from '@edrion/schemas';
import { useStudioExperience } from './use-studio-experience';
import { readStudioPreferences, studioPreferenceKey } from './studio-preferences';

const id = '10000000-0000-4000-8000-000000000001';
function snapshot(): M4Snapshot {
  return m4SnapshotSchema.parse({
    engine: 'v2',
    id,
    status: 'active',
    stage: 'delivering',
    revision: 1,
    epoch: 0,
    lesson: {
      title: 'Reviewed lesson',
      subject: 'A subject',
      objective: { id, version: 1, label: 'Read the source' },
      explanation: 'A reviewed statement.\n\nAnother reviewed statement.',
      citation: 'Reviewed source',
      references: [
        {
          sourceId: id,
          sourceRevisionId: id,
          sourceHash: 'a'.repeat(64),
          representationHash: 'b'.repeat(64),
          unitId: id,
          unitHash: 'c'.repeat(64),
          locator: { kind: 'synthetic', section: 'source', span: { start: 0, end: 20 } },
          semanticId: null,
        },
      ],
      limitations: [],
    },
    task: null,
    draft: '',
    canvas: null,
    checkpointId: null,
    submission: null,
    evaluation: null,
    actions: ['next', 'ask'],
    progress: {
      contentViewed: false,
      responsesCommitted: 0,
      responsesEvaluated: 0,
      criteriaObserved: 0,
      mastery: false,
    },
    message: 'Saved.',
  });
}
let media: MediaQueryList;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  media = {
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;
  vi.stubGlobal('matchMedia', () => media);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('Studio return, accessibility and presentation lifecycle', () => {
  it('introduces a fresh public source on the existing clock and never autoplays a saved checkpoint', () => {
    vi.useFakeTimers();
    const s = snapshot();
    const first = renderHook(() => useStudioExperience(s, false));
    expect(first.result.current.state?.status).toBe('playing');
    expect(first.result.current.cue?.mode).toBe('teaching');
    first.unmount();
    const restored = renderHook(() => useStudioExperience(s, false));
    expect(restored.result.current.state?.status).not.toBe('playing');
    expect(restored.result.current.state?.canvas.elements).toHaveLength(1);
  });
  it('keeps the fresh introduction still when device reduced motion is requested', () => {
    Object.defineProperty(media, 'matches', { value: true });
    const { result } = renderHook(() => useStudioExperience(snapshot(), false));
    expect(result.current.state?.status).not.toBe('playing');
    expect(result.current.state?.canvas.elements).toHaveLength(1);
  });
  it('restores the selected source panel as well as the revealed excerpt count', () => {
    vi.useFakeTimers();
    const s = snapshot();
    const first = renderHook(() => useStudioExperience(s, false));
    act(() => {
      first.result.current.controller!.pause();
      first.result.current.controller!.step();
      first.result.current.controller!.step();
      first.result.current.controller!.select('excerpt-0');
    });
    first.unmount();
    const restored = renderHook(() => useStudioExperience(s, false));
    expect(restored.result.current.state?.canvas.elements).toHaveLength(2);
    expect(restored.result.current.state?.selectedId).toBe('excerpt-0');
    expect(restored.result.current.state?.status).not.toBe('playing');
  });
  it('restores only validated display preferences and survives a remount', () => {
    const s = snapshot();
    const first = renderHook(() => useStudioExperience(s, false));
    act(() => {
      first.result.current.setHidden(true);
      first.result.current.setTextOnly(true);
      first.result.current.setCompact(true);
    });
    first.unmount();
    const next = renderHook(() => useStudioExperience(s, false));
    expect(next.result.current.hidden).toBe(true);
    expect(next.result.current.textOnly).toBe(true);
    expect(next.result.current.compact).toBe(true);
    expect(Object.keys(JSON.parse(localStorage.getItem(studioPreferenceKey)!)).sort()).toEqual([
      'compact',
      'hidden',
      'reducedMotion',
      'textOnly',
    ]);
  });
  it('does not let a stored or manual preference override system reduced motion', () => {
    Object.defineProperty(media, 'matches', { value: true });
    const { result } = renderHook(() => useStudioExperience(snapshot(), false));
    act(() => result.current.setReducedMotion(false));
    expect(result.current.reducedMotion).toBe(true);
    expect(result.current.systemReducedMotion).toBe(true);
  });
  it('falls back safely for unavailable storage without losing controls', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw Error('Denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw Error('Denied');
    });
    const { result } = renderHook(() => useStudioExperience(snapshot(), false));
    act(() => result.current.setHidden(true));
    expect(result.current.hidden).toBe(true);
    expect(result.current.controller).not.toBeNull();
  });
  it('rejects corrupt, array and truthy nonboolean preference values', () => {
    for (const raw of ['{', '[]', '{"hidden":"yes","textOnly":1}', 'null']) {
      expect(readStudioPreferences(raw)).toEqual({
        compact: false,
        hidden: false,
        reducedMotion: false,
        textOnly: false,
      });
    }
  });
  it('interrupts an old playing timeline when the server epoch changes', () => {
    vi.useFakeTimers();
    const s = snapshot();
    const { result, rerender } = renderHook(({ value }) => useStudioExperience(value, false), {
      initialProps: { value: s },
    });
    act(() => result.current.controller!.play());
    rerender({ value: { ...s, epoch: 1 } });
    const before = result.current.state;
    act(() => vi.advanceTimersByTime(30000));
    expect(result.current.state).toBe(before);
    expect(result.current.state?.status).toBe('interrupted');
    expect(result.current.cue?.gesture).toBe('neutral');
  });
  it('stops presentation work while the page is hidden', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useStudioExperience(snapshot(), false));
    act(() => result.current.controller!.play());
    act(() => {
      vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const before = result.current.state;
    act(() => vi.advanceTimersByTime(30000));
    expect(result.current.state).toBe(before);
    expect(result.current.pageHidden).toBe(true);
  });
  it('uses an honest empty-content fallback instead of constructing an invalid timeline', () => {
    const s = snapshot();
    s.lesson!.explanation = ' ';
    const { result } = renderHook(() => useStudioExperience(s, false));
    expect(result.current.controller).toBeNull();
    expect(result.current.cue).toBeNull();
  });
  it('falls back to text when an authorized publication exceeds the smaller renderer budget', () => {
    const s = snapshot();
    s.lesson!.explanation = '"'.repeat(12000);
    s.lesson!.excerpts = Array.from({ length: 16 }, () => ({
      text: '"'.repeat(2000),
      reference: s.lesson!.references[0]!,
    }));
    const { result } = renderHook(() => useStudioExperience(s, false));
    expect(result.current.controller).toBeNull();
    expect(s.lesson!.explanation).toHaveLength(12000);
  });
});
