import { afterEach, expect, it, vi } from 'vitest';
import { initialProject, projectScript, findPart } from '../core/maker-project';
import { planMaker, makerAvailable } from '../server/maker-planner';
import { handleV2 } from '../server/handler';
const provider = vi.hoisted(() => vi.fn());
vi.mock('../server/provider-adapter', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  structured: provider,
}));
afterEach(() => {
  vi.unstubAllEnvs();
  provider.mockReset();
});
it('validates a generated assembly before returning it as a proposal', async () => {
  const p = initialProject();
  provider.mockResolvedValue({
    script: projectScript(p).replace('size 110 12 85', 'size 160 12 85'),
    summary: 'Widen the base',
    explanation: 'More material at the base.',
    question: 'Does this change total mass?',
  });
  const result = await planMaker({
    project: p,
    prompt: 'Make the base 160 mm wide.',
    selected: 'base',
  });
  expect(result.source).toBe('ai');
  expect(findPart(result.project, 'base').size[0]).toBe(160);
  expect(findPart(p, 'base').size[0]).toBe(110);
  provider.mockResolvedValue({
    script: 'box part size -2 4 4',
    summary: 'bad',
    explanation: 'bad',
    question: 'bad',
  });
  await expect(
    planMaker({ project: p, prompt: 'Edit this', selected: null }),
  ).rejects.toThrow();
});
it('rejects invalid requests before model inference', async () => {
  await expect(
    planMaker({ project: initialProject(), prompt: 'x'.repeat(1801) }),
  ).rejects.toThrow();
  await expect(planMaker({ project: {}, prompt: 'build' })).rejects.toThrow();
  expect(provider).not.toHaveBeenCalled();
});
it('reports missing configuration honestly and retains authentication and origin checks', async () => {
  vi.stubEnv('OPENAI_API_KEY', 'sk-test-not-a-real-key');
  vi.stubEnv('PETROS_V2_MAKER_AI', '');
  expect(makerAvailable()).toBe(false);
  vi.stubEnv('PETROS_V2_MAKER_AI', '0');
  expect(makerAvailable()).toBe(false);
  vi.stubEnv('PETROS_V2_MAKER_AI', '1');
  expect(makerAvailable()).toBe(true);
  vi.stubEnv('OPENAI_API_KEY', '');
  expect(makerAvailable()).toBe(false);
  const request = () =>
    new Request('https://petros.test/prototype/api/maker', {
      method: 'POST',
      headers: { host: 'petros.test', origin: 'https://petros.test' },
      body: '{}',
    });
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('PETROS_V2_ACCESS_SECRET', 'a'.repeat(32));
  expect((await handleV2(request(), ['maker'])).status).toBe(401);
  expect((await handleV2(request(), ['maker'], 'signed-user')).status).toBe(
    503,
  );
  expect(
    (
      await handleV2(
        new Request('https://petros.test/prototype/api/maker', {
          method: 'POST',
          headers: { host: 'petros.test', origin: 'https://foreign.test' },
          body: '{}',
        }),
        ['maker'],
        'signed-user',
      )
    ).status,
  ).toBe(403);
  expect(provider).not.toHaveBeenCalled();
});
