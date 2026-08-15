import { describe, expect, it } from 'vitest';
import { estimateModalityCostMicros, prepareGeminiJsonSchema } from './petros-provider-adapters';

describe('Petros provider modality pricing', () => {
  it('meters Groq transcription by audio duration', () => {
    expect(estimateModalityCostMicros(
      { pricingUnit: 'audio_hour', priceMicrosPerHour: 40_000 },
      { audioSeconds: 7.304188 },
    )).toBe(81);
  });

  it('meters OpenAI speech synthesis by submitted characters', () => {
    expect(estimateModalityCostMicros(
      { pricingUnit: 'character', priceMicrosPerMillionCharacters: 15_000_000 },
      { characters: 800 },
    )).toBe(12_000);
  });

  it('does not invent a price when modality pricing is absent', () => {
    expect(estimateModalityCostMicros({}, { audioSeconds: 10 })).toBeUndefined();
  });

  it('selects the exact schema branch for specific teaching render functions', () => {
    const schema = {
      oneOf: [
        { type: 'object', properties: { type: { const: 'hook' }, prompt: { type: 'string' } }, required: ['type', 'prompt'] },
        { type: 'object', properties: { type: { const: 'story' }, setup: { type: 'string' } }, required: ['type', 'setup'] },
      ],
    };
    const prepared = prepareGeminiJsonSchema(schema, {
      functionKey: 'teaching.move.hook.render', input: [], responseFormat: 'json',
      maxOutputTokens: 500, temperature: 0, timeoutMs: 5_000, stream: false,
    }) as Record<string, unknown>;
    expect(prepared).toMatchObject({ properties: { type: { enum: ['hook'] } }, required: ['type', 'prompt'] });
    expect(prepared).not.toHaveProperty('oneOf');
  });

  it('removes Gemini compiler-heavy array bounds from teach-back analysis guidance', () => {
    const prepared = prepareGeminiJsonSchema({
      type: 'object',
      properties: { coverage: { type: 'array', minItems: 1, maxItems: 16, items: { type: 'string', format: 'uuid' } } },
      required: ['coverage'],
    }, {
      functionKey: 'teach_back.explanation.analyse', input: [], responseFormat: 'json',
      maxOutputTokens: 500, temperature: 0, timeoutMs: 5_000, stream: false,
    });
    expect(JSON.stringify(prepared)).not.toMatch(/minItems|maxItems|format/);
  });
});
