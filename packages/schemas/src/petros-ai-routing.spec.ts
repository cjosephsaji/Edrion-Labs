import { describe, expect, it } from 'vitest';
import { PETROS_FUNCTION_CATALOG, upsertPetrosProviderSchema } from './petros-ai-routing';

const provider = {
  displayName: 'GroqCloud',
  adapterType: 'openai_compatible' as const,
  baseUrl: 'https://api.groq.com/openai/v1',
  enabled: true,
  paused: false,
  priority: 20,
  capabilities: ['text' as const],
  metadata: {},
  reason: 'Configure provider',
};

describe('upsertPetrosProviderSchema', () => {
  it('accepts a public provider identifier', () => {
    expect(upsertPetrosProviderSchema.safeParse({ ...provider, key: 'groq' }).success).toBe(true);
  });

  it.each(['gsk_example-secret', 'sk-example-secret', 'AIzaExampleSecret', 'aq.example-secret'])(
    'rejects a credential-like provider identifier: %s',
    (key) => {
      const result = upsertPetrosProviderSchema.safeParse({ ...provider, key });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some((issue) => issue.message.includes('secret'))).toBe(true);
      }
    },
  );
});

describe('PETROS_FUNCTION_CATALOG', () => {
  it('registers the generic document lesson generator with a routed JSON contract', () => {
    expect(PETROS_FUNCTION_CATALOG).toContainEqual(expect.objectContaining({
      key: 'document.teaching.plan',
      responseFormat: 'json',
      routeTemplateKey: 'assistant.context.answer',
    }));
  });
});
