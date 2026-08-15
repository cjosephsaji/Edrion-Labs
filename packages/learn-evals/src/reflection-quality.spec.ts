import { describe, expect, it } from 'vitest';
import {
  evaluateReflectionQuality,
  REFLECTION_QUALITY_CASES,
} from './fixtures/reflection';

describe('Stage 5 quality rules over Stage 11 reflection surfaces', () => {
  it.each(REFLECTION_QUALITY_CASES)(
    '$id is honest, specific, uncertainty-aware, and free of dark patterns',
    (qualityCase) => {
      expect(evaluateReflectionQuality(qualityCase)).toEqual([]);
    },
  );

  it('rejects shame, competitive urgency, and unsupported ability labels', () => {
    const unsafe = {
      ...REFLECTION_QUALITY_CASES[1],
      copy: 'Hurry: everyone else is ahead because you have low ability.',
    };
    expect(evaluateReflectionQuality(unsafe as (typeof REFLECTION_QUALITY_CASES)[number])).toContain(
      'dark_pattern_copy',
    );
  });
});
