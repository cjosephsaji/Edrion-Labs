import { alphaBeta, minimax, TREE } from './algorithms';
import type { Lesson, ShowcaseState, VisualState } from './types';
/** V2's requested ordering differs from the original Classic example. Keep that choice in shared state. */
export const WORLD_TREE = [
  [3, 5],
  [2, 9],
  [4, 1],
] as const;
export function activeTree(v: VisualState): readonly (readonly number[])[] {
  return v.kind === 'tree' && v.transfer
    ? [
        [4, 7],
        [3, 8],
        [2, 6],
      ]
    : v.kind === 'tree' && v.treeOrder === 'v2'
      ? WORLD_TREE
      : TREE;
}
export function lessonForState(
  lesson: Lesson | undefined,
  state: ShowcaseState,
): Lesson | undefined {
  if (
    !lesson ||
    lesson.id !== 'ai3' ||
    state.visualState.kind !== 'tree' ||
    state.visualState.treeOrder !== 'v2'
  )
    return lesson;
  const pass = alphaBeta(WORLD_TREE),
    mm = minimax(WORLD_TREE);
  return {
    ...lesson,
    questions: lesson.questions.map((q) => {
      if (q.id === 'AI3-Q07')
        return {
          ...q,
          correct: ['ABC'[mm.best]!],
          explanation: `A guarantees ${mm.children[0]}; B guarantees ${mm.children[1]}; C guarantees ${mm.children[2]}. MAX selects ${'ABC'[mm.best]}.`,
        };
      if (q.id === 'AI3-Q10')
        return {
          ...q,
          task: 'A set α = 3. C’s first leaf is 4. Must we examine its remaining 1?',
          options: ['Yes', 'No'],
          correct: ['Yes'],
          type: 'choice' as const,
          explanation:
            'Yes. After 4, beta is 4, greater than alpha 3. We must examine 1; the remaining leaf cannot yet be pruned.',
          hints: [
            'Compare beta 4 with alpha 3. Is beta ≤ alpha?',
            'Beta is still 4 > 3, so visit the remaining 1.',
          ] as [string, string],
        };
      if (q.id === 'AI3-Q11')
        return {
          ...q,
          correct: [String(pass.visited)],
          explanation: `A examines 3 and 5; B examines 2 and skips 9; C examines 4 and 1. ${pass.visited} examined, ${pass.skipped} skipped.`,
          hints: [
            'Count examined leaves, excluding the skipped 9.',
            `${pass.visited} leaves are examined and ${pass.skipped} skipped.`,
          ] as [string, string],
        };
      return q;
    }),
  };
}
