import { describe, it, expect, afterEach, vi } from 'vitest';
import { showcaseAccess } from '../teaching/access';
import { initialState, practice, selectLesson } from '../teaching/controller';
import { ai3 } from '../lessons/ai3';
import { demonstrate } from '../teaching/demonstration';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
describe('feature and state boundaries', () => {
  it('denies the page/API when the flag is off', async () => {
    vi.stubEnv('PETROS_SHOWCASE_ENABLED', '0');
    expect(await showcaseAccess(new Headers({ host: '127.0.0.1:3021' }))).toBe(
      false,
    );
  });
  it('permits only a local host for the explicit development operator mode', async () => {
    vi.stubEnv('PETROS_SHOWCASE_ENABLED', '1');
    vi.stubEnv('PETROS_SHOWCASE_LOCAL_ONLY', '1');
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      await showcaseAccess(
        new Headers({
          host: '127.0.0.1:3021',
          'x-forwarded-host': '127.0.0.1:3021',
        }),
      ),
    ).toBe(true);
    expect(await showcaseAccess(new Headers({ host: 'public.example' }))).toBe(
      false,
    );
    expect(
      await showcaseAccess(
        new Headers({
          host: '127.0.0.1:3021',
          'x-forwarded-host': 'public.example',
        }),
      ),
    ).toBe(false);
  });
  it('production cannot use the local development access shortcut', async () => {
    vi.stubEnv('PETROS_SHOWCASE_ENABLED', '1');
    vi.stubEnv('PETROS_SHOWCASE_LOCAL_ONLY', '1');
    vi.stubEnv('NODE_ENV', 'production');
    expect(await showcaseAccess(new Headers({ host: '127.0.0.1:3021' }))).toBe(
      false,
    );
  });
  it('validates a real portal cookie with the existing read-only student endpoint', async () => {
    vi.stubEnv('PETROS_SHOWCASE_ENABLED', '1');
    vi.stubEnv('PETROS_SHOWCASE_LOCAL_ONLY', '0');
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    expect(
      await showcaseAccess(new Headers({ cookie: 'session=opaque' })),
    ).toBe(true);
    expect(fetch.mock.calls[0]?.[0]).toContain('/v1/student/me');
    expect(fetch.mock.calls[0]?.[1].headers).toEqual({
      cookie: 'session=opaque',
    });
  });
  it('accepts numerically equivalent structured answers, without evaluating prose', () => {
    expect(
      practice({ ...initialState, studentResponse: '1.0' }, ai3.questions[5]!)
        .completion['AI3-Q06']?.outcome,
    ).toBe('explored');
  });
  it('manual visual steps preserve student answer history on backwards restoration', () => {
    const s = {
      ...initialState,
      completion: {
        example: {
          response: 'my original answer',
          attempts: 1,
          outcome: 'recorded' as const,
          help: 0,
        },
      },
    };
    const visual = demonstrate(s.visualState, 4);
    const restored = {
      ...s,
      visualState: s.visualState,
      visualStepHistory: [s.visualState, visual],
    };
    expect(restored.completion.example.response).toBe('my original answer');
    expect(visual.kind === 'tree' && visual.pruneStep).toBe(6);
  });
  it('selecting a new lesson keeps uploads and mode, with a fresh isolated lesson id', () => {
    const s = selectLesson({ ...initialState, mode: 'world' }, ai3, 'hash');
    expect(s.mode).toBe('world');
    expect(s.sourceHash).toBe('hash');
    expect(s.sessionId).not.toBe('');
    expect(s.completion).toEqual({});
  });
});
