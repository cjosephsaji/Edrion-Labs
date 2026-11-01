import { initialState } from './controller';
import type { ShowcaseState } from './types';
import { resolveLesson } from './lesson-registry';
import { validTopicLesson, validDiagram } from './topic-content';
import { validEvidence } from './learning-evidence';
import { assessmentQuestion } from './checkpoint';
export const SESSION_KEY = 'petros.learning.v3';
/** Tab-scoped showcase recovery. Uploaded source contents are never serialized. */
export function serializeSession(state: ShowcaseState) {
  return JSON.stringify({
    version: 4,
    state: {
      ...state,
      receipts: [],
      pendingRequest: null,
      modeSwitchInProgress: false,
      saveStatus: 'session',
    },
  });
}
export function restoreSession(raw: string | null): ShowcaseState | null {
  try {
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const s = saved.state as ShowcaseState;
    if (
      s?.topicLesson &&
      (!validTopicLesson(s.topicLesson) ||
        s.topicLesson.id !== s.lessonId ||
        s.visualState?.kind !== 'topic')
    )
      return null;
    const lesson = s ? resolveLesson(s) : undefined;
    if (
      saved.version !== 4 ||
      !lesson ||
      !validEvidence(s.evidence) ||
      !s.learning ||
      !['learn', 'apply', 'test'].includes(s.learning.stage) ||
      !['lesson', 'diagnostic', 'final'].includes(s.learning.activity) ||
      typeof s.learning.assisted !== 'boolean' ||
      typeof s.learning.fresh !== 'boolean' ||
      !Number.isInteger(s.learning.item) ||
      (s.phase !== 'recap' &&
        s.learning.stage === 'test' &&
        !assessmentQuestion(s, lesson)) ||
      !lesson.questions.some((q) => q.id === s.questionId) ||
      !['classic', 'world'].includes(s.mode) ||
      !s.visualState ||
      (s.visualState.kind === 'topic' &&
        (!s.topicLesson || !validDiagram(s.visualState))) ||
      (s.interruptionCheckpoint?.visual.kind === 'topic' && !validDiagram(s.interruptionCheckpoint.visual)) ||
      !s.teaching ||
      !Array.isArray(s.conversationHistory) ||
      !s.observations ||
      !s.completion
    )
      return null;
    // A network request cannot survive refresh. Resume from its saved instructional beat.
    return {
      ...initialState,
      ...s,
      receipts: [],
      pendingRequest: null,
      modeSwitchInProgress: false,
      saveStatus: 'session',
      teaching: s.interruptionCheckpoint
        ? { ...s.teaching, status: 'RESUMING' }
        : s.teaching,
    };
  } catch {
    return null;
  }
}
