import { describe, expect, it } from 'vitest';
import { evaluateInstitutionalQuality, INSTITUTIONAL_QUALITY_CASES } from './fixtures/institutional';

describe('Stage 5 quality rules over Stage 12 institutional boundaries', () => {
  it.each(INSTITUTIONAL_QUALITY_CASES)('$id is useful, bounded, privacy-safe and provider-neutral', (qualityCase) => {
    expect(evaluateInstitutionalQuality(qualityCase)).toEqual([]);
  });

  it('rejects empty refusal, ability/ranking tone, surveillance, and raw content', () => {
    const unsafe = {
      copy: 'Cannot help. This weak class is behind the rank; surveillance includes the raw session.',
      expected: ['approved path'],
      forbidden: ['raw session'],
    };
    expect(evaluateInstitutionalQuality(unsafe)).toEqual(expect.arrayContaining([
      'missing_required_boundary_language',
      'forbidden_privacy_or_tone_language',
      'dark_pattern_or_label',
    ]));
  });
});
