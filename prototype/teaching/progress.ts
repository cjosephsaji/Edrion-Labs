import type { Lesson } from './types';
const minimaxConcepts = [
  'Think about the opponent',
  'Understanding MAX',
  'Understanding MIN',
  'Build the game tree',
  'Choose the best guarantee',
  'Skip work safely',
  'Count the work saved',
  'Apply it independently',
];
export function conceptProgress(lesson: Lesson, questionIndex: number) {
  if (lesson.id === 'ai3') {
    const index = [0, 1, 2, 3, 3, 3, 4, 5, 5, 5, 6, 7][questionIndex] ?? 0;
    return {
      label: minimaxConcepts[index],
      index: index + 1,
      total: minimaxConcepts.length,
    };
  }
  const concepts = [...new Set(lesson.questions.map((q) => q.concept))];
  const label = lesson.questions[questionIndex]?.concept ?? concepts[0];
  return { label, index: concepts.indexOf(label!) + 1, total: concepts.length };
}
