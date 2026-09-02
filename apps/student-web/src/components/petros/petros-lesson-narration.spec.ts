import { describe, expect, it } from 'vitest';
import type { PetrosSessionBlock } from '@edrion/schemas';
import { buildPetrosLessonNarration, petrosLessonTarget } from './petros-lesson-narration';

const BLOCK_ID = '11111111-1111-4111-8111-111111111111';

function layeredBlock(correct: boolean) {
  return {
    id: BLOCK_ID,
    interactionState: { expandedLayerIds: ['deeper'] },
    questions: [{
      id: '22222222-2222-4222-8222-222222222222',
      active: !correct,
      locked: correct,
      prompt: 'What is the learner-ready answer?',
      equivalenceKey: 'concept',
      attempts: correct ? [{ correctness: 'correct' }] : [],
    }],
    content: {
      type: 'layered_explanation',
      title: 'A layered idea',
      firstLayer: 'The first visible explanation.',
      deeperLayers: [{ id: 'deeper', label: 'Go deeper', content: 'The expanded deeper explanation.' }],
      keyIdea: 'The key idea to retain.',
      sourceGrounding: [],
    },
  } as unknown as PetrosSessionBlock;
}

describe('Petros lesson narration', () => {
  it('narrates the active question without leaking the locked explanation', () => {
    const segments = buildPetrosLessonNarration(layeredBlock(false));
    expect(segments.map((segment) => segment.text)).toEqual([
      'Let’s focus on A layered idea.',
      'What is the learner-ready answer?',
    ]);
    expect(segments[1]?.targetKey).toBe(
      petrosLessonTarget(BLOCK_ID, 'question:22222222-2222-4222-8222-222222222222'),
    );
  });

  it('teaches only visible layers after recovery and gives each one a stable target', () => {
    const segments = buildPetrosLessonNarration(layeredBlock(true));
    expect(segments.map((segment) => [segment.label, segment.text])).toEqual([
      ['lesson heading', 'Let’s focus on A layered idea.'],
      ['first explanation', 'The first visible explanation.'],
      ['Go deeper', 'The expanded deeper explanation.'],
      ['key idea', 'The key idea to retain.'],
    ]);
    expect(segments.map((segment) => segment.targetKey)).toContain(
      petrosLessonTarget(BLOCK_ID, 'layer:deeper'),
    );
  });
});
