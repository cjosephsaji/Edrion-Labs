import type { Lesson, ShowcaseState, Patch } from './types';
import { practice, yieldCue } from './controller';
import {
  continueCheckpoint,
  currentQuestion,
  goToCheckpoint,
  teachAction,
} from './checkpoint';

/** Both renderers dispatch these exact checkpoint commands. No elapsed-time command exists. */
export function useLessonController(
  state: ShowcaseState,
  lesson: Lesson,
  patch: Patch,
) {
  const base =
    lesson.questions.find((q) => q.id === state.questionId) ??
    lesson.questions[0]!;
  const q = currentQuestion(state, lesson),
    qi = lesson.questions.indexOf(base);
  const completed =
    state.teaching.status === 'READY_TO_CONTINUE'
      ? state.completion[base.id]
      : undefined;
  const answerChanged =
    !!completed && state.studentResponse.trim() !== completed.response;
  function question(index: number) {
    patch((current) => goToCheckpoint(current, lesson, index, true));
  }
  function next(
    reason: 'validated' | 'self-reported' | 'skipped' = 'validated',
  ) {
    patch((current) => continueCheckpoint(current, lesson, reason));
  }
  function choose(value: string) {
    if (
      state.paused ||
      state.pendingRequest ||
      state.teaching.status !== 'AWAITING_RESPONSE' ||
      q.type === 'text' ||
      q.type === 'number' ||
      !q.options.includes(value)
    )
      return;
    patch((current) => {
      const values = current.studentResponse
        ? current.studentResponse.split('|')
        : [];
      return {
        ...current,
        studentResponse:
          q.type === 'multi'
            ? (values.includes(value)
                ? values.filter((v) => v !== value)
                : [...values, value]
              ).join('|')
            : value,
        cue: yieldCue(current.cue),
        lastFeedback: '',
      };
    });
  }
  function step(direction: number) {
    if (direction < 0) question(Math.max(0, qi - 1));
    else
      patch((current) =>
        teachAction(
          current,
          lesson,
          direction === 0 ? 'repeat' : 'demonstrate',
        ),
      );
  }
  function check() {
    patch((current) =>
      current.paused ||
      current.pendingRequest ||
      current.teaching.status !== 'AWAITING_RESPONSE'
        ? current
        : practice(current, base),
    );
  }
  function teach(action: Parameters<typeof teachAction>[2]) {
    patch((current) => teachAction(current, lesson, action));
  }
  return {
    q,
    base,
    qi,
    completed,
    answerChanged,
    question,
    next,
    choose,
    step,
    check,
    teach,
  };
}
