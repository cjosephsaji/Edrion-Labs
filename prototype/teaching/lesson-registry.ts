import { lessons } from '../lessons';
import type { ShowcaseState } from './types';

/** Generated lessons belong to this tab, never to the shared source-module registry. */
export function resolveLesson(
  state: Pick<ShowcaseState, 'lessonId' | 'topicLesson'>,
) {
  return state.topicLesson?.id === state.lessonId
    ? state.topicLesson
    : lessons.find((lesson) => lesson.id === state.lessonId);
}
