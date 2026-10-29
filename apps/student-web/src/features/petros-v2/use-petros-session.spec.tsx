import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn() }, refetch: vi.fn() }));
vi.mock('@/lib/api-client', () => ({
  useStudentApi: () => mocks.api,
  StudentApiError: class extends Error {},
}));
vi.mock('@/lib/hooks', () => ({
  useStudentMe: () => ({
    data: { institutionId: 'institution', studentId: 'student' },
    refetch: mocks.refetch,
  }),
}));
// This suite isolates request interleavings. Public schema validation is covered
// by the schema/API suites; no evaluation or rendering outcome is manufactured.
vi.mock('@edrion/schemas', async (original) => ({
  ...(await original<typeof import('@edrion/schemas')>()),
  m4SnapshotSchema: { parse: (value: unknown) => value },
}));
import { usePetrosSession } from './use-petros-session';
const snapshot = (revision = 1, draft = '') => ({
  id: 'session',
  revision,
  epoch: 0,
  draft,
  canvas: { revision },
  submission: null,
  status: 'active',
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.api.get.mockResolvedValue(snapshot());
});
describe('Acknowledged session draft and delayed response fencing', () => {
  it('coalesces simultaneous read-only refreshes without sharing a pre-commit read after a write', async () => {
    const { result } = renderHook(() => usePetrosSession('session'));
    await waitFor(() => expect(result.current.snapshot?.revision).toBe(1));
    let finish!: (value: unknown) => void;
    mocks.api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const count = mocks.api.get.mock.calls.length;
    let a!: Promise<unknown>, b!: Promise<unknown>;
    act(() => {
      a = result.current.refresh();
      b = result.current.refresh();
    });
    expect(mocks.api.get.mock.calls.length).toBe(count + 1);
    await act(async () => {
      finish(snapshot(2));
      await Promise.all([a, b]);
    });
    expect(result.current.snapshot?.revision).toBe(2);
  });
  it('uses the acknowledged save snapshot for pause and makes no redundant GET between the two writes', async () => {
    const { result } = renderHook(() => usePetrosSession('session'));
    await waitFor(() => expect(result.current.snapshot?.revision).toBe(1));
    act(() => result.current.changeDraft('my explanation'));
    mocks.api.post.mockResolvedValue({ status: 'committed' });
    mocks.api.get
      .mockResolvedValueOnce(snapshot(2, 'my explanation'))
      .mockResolvedValueOnce({ ...snapshot(3, 'my explanation'), status: 'paused' });
    const count = mocks.api.get.mock.calls.length;
    await act(async () => {
      await result.current.pause();
    });
    expect(mocks.api.get.mock.calls.length - count).toBe(2);
    expect(mocks.api.post.mock.calls.map((call) => call[1].type)).toEqual([
      'canvas_checkpoint',
      'pause',
    ]);
    expect(mocks.api.post.mock.calls[1]?.[1].expectedRevision).toBe(2);
    expect(result.current.draft).toBe('my explanation');
  });
  it('a delayed save cannot clear or replace a newer explanation draft', async () => {
    const { result } = renderHook(() => usePetrosSession('session'));
    await waitFor(() => expect(result.current.snapshot?.revision).toBe(1));
    act(() => result.current.changeDraft('first explanation'));
    let resolvePost!: (value: unknown) => void;
    mocks.api.post.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePost = resolve;
        }),
    );
    let saving!: Promise<unknown>;
    act(() => {
      saving = result.current.save();
    });
    act(() => result.current.changeDraft('newer explanation'));
    mocks.api.get.mockResolvedValue(snapshot(2, 'first explanation'));
    await act(async () => {
      resolvePost({ status: 'committed' });
      await saving;
    });
    expect(result.current.draft).toBe('newer explanation');
    expect(result.current.dirty).toBe(true);
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.draft).toBe('newer explanation');
    expect(mocks.api.post.mock.calls[0]?.[1]).toMatchObject({
      draft: 'first explanation',
      canvasRevision: 1,
    });
  });
  it('does not let an older refresh replace a newer acknowledged revision', async () => {
    const { result } = renderHook(() => usePetrosSession('session'));
    await waitFor(() => expect(result.current.snapshot?.revision).toBe(1));
    let resolveOld!: (value: unknown) => void;
    mocks.api.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve;
        }),
    );
    let old!: Promise<unknown>;
    act(() => {
      old = result.current.refresh();
    });
    mocks.api.get.mockResolvedValueOnce(snapshot(3, 'new acknowledged draft'));
    await act(async () => {
      await result.current.refresh(true);
    });
    await act(async () => {
      resolveOld(snapshot(2, 'older draft'));
      await old;
    });
    expect(result.current.snapshot?.revision).toBe(3);
    expect(result.current.draft).toBe('new acknowledged draft');
  });
  it('a follow-up save uses the current acknowledged revision after another canvas command', async () => {
    const { result } = renderHook(() => usePetrosSession('session'));
    await waitFor(() => expect(result.current.snapshot?.revision).toBe(1));
    const oldSave = result.current.save;
    mocks.api.get.mockResolvedValue(snapshot(4));
    await act(async () => {
      await result.current.refresh();
      result.current.changeDraft('saved explanation');
    });
    mocks.api.post.mockResolvedValue({ status: 'committed' });
    await act(async () => {
      await oldSave();
    });
    expect(mocks.api.post.mock.calls.at(-1)?.[1]).toMatchObject({
      expectedRevision: 4,
      canvasRevision: 4,
      draft: 'saved explanation',
    });
  });
});
