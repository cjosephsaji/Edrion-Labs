import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleShowcase } from '../teaching/server';
afterEach(() => vi.unstubAllEnvs());
function enable() {
  vi.stubEnv('PETROS_SHOWCASE_ENABLED', '1');
  vi.stubEnv('PETROS_SHOWCASE_LOCAL_ONLY', '1');
  vi.stubEnv('NODE_ENV', 'development');
}
const request = () =>
  new Request('http://127.0.0.1:3021/prototype/api/asset/classroom-shell.glb', {
    headers: { host: '127.0.0.1:3021' },
  });
describe('private runtime model delivery', () => {
  it('serves an actual GLB with private caching and safe MIME', async () => {
    enable();
    const r = await handleShowcase(request(), ['asset', 'classroom-shell.glb']);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('model/gltf-binary');
    expect(r.headers.get('cache-control')).toContain('private');
    expect(new TextDecoder().decode((await r.arrayBuffer()).slice(0, 4))).toBe(
      'glTF',
    );
  });
  it('never serves sources, metadata or traversal paths', async () => {
    enable();
    for (const path of [
      ['asset', '../source/classroom/classroom.blend'],
      ['asset', 'asset-register.json'],
      ['asset', 'classroom-shell.glb', '../source'],
      ['asset', 'AI_Module_3.pdf'],
    ])
      expect((await handleShowcase(request(), path)).status).toBe(404);
  });
  it('keeps models behind the showcase feature gate', async () => {
    enable();
    vi.stubEnv('PETROS_SHOWCASE_ENABLED', '0');
    expect(
      (await handleShowcase(request(), ['asset', 'classroom-shell.glb']))
        .status,
    ).toBe(404);
  });
  it('does not grant public-host access through the local shortcut', async () => {
    enable();
    const r = new Request(
      'http://public.example/prototype/api/asset/classroom-shell.glb',
      { headers: { host: 'public.example' } },
    );
    expect(
      (await handleShowcase(r, ['asset', 'classroom-shell.glb'])).status,
    ).toBe(404);
  });
});
