import { describe, expect, it } from 'vitest';
import { INTEGRALS_PRESENTATION } from './integrals-teaching-studio';
import { resolveTeachingPresentation } from './presentation-adapter';

describe('teaching presentation adapter', () => {
  it('keeps valid presentation data with declared targets', () => {
    const targets = new Set(INTEGRALS_PRESENTATION.beats.flatMap((beat) => beat.targetId ? [beat.targetId] : []));
    expect(resolveTeachingPresentation({
      candidate: INTEGRALS_PRESENTATION,
      unitId: INTEGRALS_PRESENTATION.unitId,
      title: INTEGRALS_PRESENTATION.title,
      explanation: 'Fallback',
      declaredTargets: targets,
    }).id).toBe(INTEGRALS_PRESENTATION.id);
  });

  it('docks safely when generated data names an unavailable target', () => {
    const result = resolveTeachingPresentation({
      candidate: { ...INTEGRALS_PRESENTATION, beats: [{ ...INTEGRALS_PRESENTATION.beats[0], targetId: 'body > script' }] },
      unitId: INTEGRALS_PRESENTATION.unitId,
      title: INTEGRALS_PRESENTATION.title,
      explanation: 'Use only visible lesson content.',
      declaredTargets: new Set(),
    });
    expect(result.beats[0]?.targetId).toBeNull();
    expect(result.beats[0]?.narration).toBe('Use only visible lesson content.');
  });
});
