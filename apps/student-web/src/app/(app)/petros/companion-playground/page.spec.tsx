import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ cookie: '', cookies: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: () => ({ toString: () => mock.cookie }) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('NOT_FOUND'); }, redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } }));
vi.mock('@/features/petros-v2/playground/companion-playground', () => ({ CompanionPlayground: () => null }));
import Page from './page';
const owner = '00000000-0000-4000-8000-000000000001';
beforeEach(() => { mock.cookie = 'test-session=authorized'; vi.stubGlobal('fetch', vi.fn()); vi.stubEnv('PETROS_V2_COMPANION_PLAYGROUND_ENABLED', 'true'); vi.stubEnv('PETROS_V2_COMPANION_PLAYGROUND_TESTER_IDS', owner); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe('internal server route admission', () => {
  it('returns not-found without querying authentication when the flag or allowlist is absent', async () => {
    vi.stubEnv('PETROS_V2_COMPANION_PLAYGROUND_ENABLED', 'false');
    await expect(Page()).rejects.toThrow('NOT_FOUND'); expect(fetch).not.toHaveBeenCalled();
    vi.stubEnv('PETROS_V2_COMPANION_PLAYGROUND_ENABLED', 'true'); vi.stubEnv('PETROS_V2_COMPANION_PLAYGROUND_TESTER_IDS', '');
    await expect(Page()).rejects.toThrow('NOT_FOUND'); expect(fetch).not.toHaveBeenCalled();
  });
  it('requires cookie authentication and does not introduce a dev-header bypass', async () => {
    mock.cookie = ''; await expect(Page()).rejects.toThrow('REDIRECT:/login'); expect(fetch).not.toHaveBeenCalled();
  });
  it('admits the existing student permission and allowlist using metadata only', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ kind: 'institutional', studentId: owner, permissions: ['student.learn.use'] })));
    const element = await Page(); expect(element.props.ownerId).toBe(owner);
    expect(fetch).toHaveBeenCalledWith(expect.stringMatching(/\/v1\/student\/me$/), expect.objectContaining({ headers: { cookie: 'test-session=authorized' }, cache: 'no-store' }));
  });
  it.each([{ studentId: '00000000-0000-4000-8000-000000000099', permissions: ['student.learn.use'] }, { studentId: owner, permissions: [] }])('denies foreign or unauthorized metadata %j', async me => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ kind: 'institutional', ...me })));
    await expect(Page()).rejects.toThrow('NOT_FOUND');
  });
  it('fails closed on auth errors', async () => {
    vi.mocked(fetch).mockRejectedValue(new Error('Auth service unavailable')); await expect(Page()).rejects.toThrow('NOT_FOUND');
  });
});
