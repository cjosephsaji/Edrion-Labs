import { describe, expect, it } from 'vitest';
import { parseStructuredResponse, validatePetrosResponse } from './petros-response-validator';

describe('Petros structured response validation', () => {
  const schema = {
    type: 'object',
    required: ['blockType', 'content'],
    properties: {
      blockType: { type: 'string', enum: ['explanation', 'question'] },
      content: { type: 'object', required: ['title'], properties: { title: { type: 'string' } } },
    },
  };

  it('parses fenced JSON without accepting malformed output', () => {
    expect(parseStructuredResponse('```json\n{"blockType":"question","content":{"title":"Try first"}}\n```')).toEqual({
      blockType: 'question',
      content: { title: 'Try first' },
    });
    expect(() => parseStructuredResponse('{not json}')).toThrow();
  });

  it('reports missing and invalid fields', () => {
    expect(validatePetrosResponse({ blockType: 'video', content: {} }, schema)).toEqual([
      '$.blockType is not an allowed value',
      '$.content.title is required',
    ]);
    expect(validatePetrosResponse({ blockType: 'explanation', content: { title: 'Why it works' } }, schema)).toEqual([]);
  });

  it('validates dynamic record values through additionalProperties schemas', () => {
    const recordSchema = { type: 'object', additionalProperties: { type: 'number', minimum: 0, maximum: 1 } };
    expect(validatePetrosResponse({ hook: 0.7 }, recordSchema)).toEqual([]);
    expect(validatePetrosResponse({ hook: 70 }, recordSchema)).toContain('$.hook is above the maximum');
  });

  it('validates UUID and date-time formats used by Petros contracts', () => {
    expect(validatePetrosResponse('not-a-uuid', { type: 'string', format: 'uuid' })).toContain('$ must be a UUID');
    expect(validatePetrosResponse('2026-08-09T12:00:00.000Z', { type: 'string', format: 'date-time' })).toEqual([]);
  });
});
