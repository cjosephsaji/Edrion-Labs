import type {
  Lesson,
  PracticeObservation,
  Question,
  ShowcaseState,
  TeachingCycle,
} from './types';
import { teachingPlan } from './curriculum';

export const initialCycle: TeachingCycle = {
  status: 'INTRODUCING',
  variant: 'primary',
  followup: false,
  practiceCount: 0,
};
export function currentQuestion(s: ShowcaseState, lesson: Lesson) {
  const base =
    lesson.questions.find((q) => q.id === s.questionId) ?? lesson.questions[0]!;
  return s.teaching.followup ? teachingPlan(s, lesson, base).followup : base;
}
export function observation(
  s: ShowcaseState,
  lesson: Lesson,
  q: Question,
): PracticeObservation {
  return (
    s.observations[q.id] ?? {
      questionId: q.id,
      lessonId: lesson.id,
      concept: q.concept,
      responses: [],
      assistance: [],
      explanationVariants: ['primary'],
      retries: 0,
      skipped: false,
      explicitContinuation: false,
      continuation: null,
    }
  );
}
export function checkpointVisual(
  s: ShowcaseState,
  lesson: Lesson,
  q: Question,
  stage: 'introduce' | 'demo' | 'check' | 'retry',
) {
  const plan = teachingPlan(s, lesson, q),
    i = lesson.questions.indexOf(q);
  let v = s.visualState;
  if (v.kind === 'tree') {
    const example =
      stage === 'demo' && !s.teaching.followup
        ? plan.demoExample
        : stage === 'check' && s.teaching.followup
          ? plan.followupExample
          : stage === 'retry'
            ? plan.retryExample
            : stage === 'check'
              ? plan.checkExample
              : undefined;
    v = {
      ...v,
      example: example
        ? { ...example, revealAnswer: stage !== 'check' }
        : undefined,
      transfer: i === 11 || (s.teaching.followup && [5, 6, 11].includes(i)),
      reveal:
        i < 1
          ? 0
          : i < 3
            ? 1
            : i === 3
              ? 1
              : i === 4
                ? 1
                : i === 5
                  ? 2
                  : i === 6
                    ? 3
                    : i >= 7
                      ? 3
                      : 1,
      selected: plan.target ?? '',
      pruneStep: i === 8 ? 3 : i === 9 ? 5 : i >= 10 && i < 11 ? 6 : 0,
    };
  }
  if (v.kind === 'tree' && v.transfer && stage !== 'retry')
    v = { ...v, reveal: 1 };
  if (v.kind === 'kb') {
    const facts =
      i === 0 || (i === 1 && stage === 'introduce')
        ? []
        : i >= 10
          ? ['Bird(Tweety)', 'Bird(Rio)']
          : ['Bird(Tweety)'];
    v = {
      ...v,
      facts: s.teaching.followup ? ['Bird(Tweety)', 'Bird(Rio)'] : facts,
      derived:
        i >= 5 || (i === 4 && stage === 'demo')
          ? ['HasWings(Tweety)', ...(i >= 10 ? ['HasWings(Rio)'] : [])]
          : [],
      query:
        i === 6 || i === 10
          ? 'CanFly(Tweety)'
          : i >= 5
            ? 'HasWings(Tweety)'
            : '',
      direction: i === 8 ? 'backward' : 'forward',
    };
    if (s.teaching.followup)
      v = {
        ...v,
        query: i === 6 || i === 10 ? 'CanFly(Rio)' : 'HasWings(Rio)',
        derived: ['HasWings(Rio)'],
      };
  }
  if (v.kind === 'hazards')
    v = {
      ...v,
      selected: plan.target ?? '',
      safer: stage === 'retry' || i === 6 || (i === 8 && stage === 'demo'),
    };
  if (v.kind === 'river')
    v = {
      ...v,
      selected: plan.target ?? '',
      controls:
        stage === 'retry'
          ? [plan.target ?? 'sewage']
          : stage === 'demo' && i === 2
            ? ['sewage']
            : i === 10
              ? ['sewage']
              : [],
    };
  if (v.kind === 'network')
    v = {
      ...v,
      input: stage === 'demo' && i === 3 ? 4 : 2,
      weight: i >= 6 ? 1.5 : 0.5,
      target: 3,
    };
  if (v.kind === 'network' && (s.teaching.followup || stage === 'retry'))
    v = {
      ...v,
      input: i === 6 ? 3 : i === 3 || i === 4 ? 4 : 2,
      weight: i >= 5 ? 1.5 : 0.5,
      target: i === 4 ? 5 : 3,
    };
  if (v.kind === 'clocks')
    v = { ...v, speed: i >= 4 ? 0.8 : 0.6, earthYears: 10 };
  if (v.kind === 'clocks' && (s.teaching.followup || stage === 'retry'))
    v = { ...v, speed: i === 2 ? 0.6 : 0.8, earthYears: i === 2 ? 10 : 5 };
  return { visualState: v, highlightTargetId: plan.target };
}
export function goToCheckpoint(
  s: ShowcaseState,
  lesson: Lesson,
  index: number,
  reviewed = false,
): ShowcaseState {
  const q = lesson.questions[index];
  if (!q || s.pendingRequest || s.interruptionCheckpoint) return s;
  const old = lesson.questions.find((q) => q.id === s.questionId);
  let observations = s.observations;
  if (reviewed && old && old.id !== q.id) {
    const record = observation(s, lesson, old);
    observations = {
      ...observations,
      [old.id]: {
        ...record,
        explicitContinuation: true,
        continuation: 'reviewed-navigation',
      },
    };
  }
  const updated = {
    ...s,
    observations,
    teaching: { ...initialCycle },
    questionId: q.id,
    sourcePages: q.pages,
    phase: 'introduce' as const,
    stepId: index,
    studentResponse: '',
    questionAttempt: 0,
    lastFeedback: '',
    permittedHintLevel: s.completion[q.id]?.help ?? 0,
    misconceptionCategory: null,
    paused: false,
    cue: null,
    sceneStation: lesson.id.startsWith('ehs')
      ? ('experiment' as const)
      : ('board' as const),
  };
  return { ...updated, ...checkpointVisual(updated, lesson, q, 'introduce') };
}
export function teachAction(
  s: ShowcaseState,
  lesson: Lesson,
  action:
    | 'demonstrate'
    | 'check'
    | 'answer'
    | 'simpler'
    | 'example'
    | 'practice'
    | 'repeat',
): ShowcaseState {
  if (
    s.pendingRequest ||
    s.teaching.status === 'INTERRUPTED' ||
    s.teaching.status === 'RESUMING'
  )
    return s;
  const q =
    lesson.questions.find((q) => q.id === s.questionId) ?? lesson.questions[0]!;
  const record = observation(s, lesson, q);
  const assistance = ['simpler', 'example', 'practice'].includes(action);
  const variant =
    action === 'simpler'
      ? 'simpler'
      : action === 'example' || action === 'practice'
        ? 'second-example'
        : s.teaching.variant;
  const status =
    action === 'demonstrate'
      ? 'DEMONSTRATING'
      : action === 'check'
        ? 'CHECKING_UNDERSTANDING'
        : action === 'answer'
          ? 'AWAITING_RESPONSE'
          : action === 'repeat'
            ? 'INTRODUCING'
            : 'RETEACHING';
  const next = {
    ...s,
    ...(action === 'answer' && s.teaching.followup
      ? { studentResponse: '' }
      : {}),
    teaching: {
      ...s.teaching,
      status,
      variant,
      followup: assistance || s.teaching.followup,
      practiceCount: s.teaching.practiceCount + (action === 'practice' ? 1 : 0),
    },
    observations: {
      ...s.observations,
      [q.id]: {
        ...record,
        assistance: assistance
          ? [...record.assistance, action]
          : record.assistance,
        explanationVariants: [
          ...new Set([...record.explanationVariants, variant]),
        ],
      },
    },
    ...(assistance
      ? {
          studentResponse: '',
          lastFeedback: '',
          permittedHintLevel: Math.max(1, s.permittedHintLevel),
        }
      : {}),
    cue: null,
  } as ShowcaseState;
  return {
    ...next,
    ...checkpointVisual(
      next,
      lesson,
      q,
      status === 'DEMONSTRATING'
        ? 'demo'
        : status === 'RETEACHING'
          ? 'retry'
          : status === 'INTRODUCING'
            ? 'introduce'
            : 'check',
    ),
  };
}
export function continueCheckpoint(
  s: ShowcaseState,
  lesson: Lesson,
  reason: 'validated' | 'self-reported' | 'skipped' = 'validated',
): ShowcaseState {
  if (s.paused || s.pendingRequest || s.interruptionCheckpoint) return s;
  const q =
    lesson.questions.find((q) => q.id === s.questionId) ?? lesson.questions[0]!;
  const record = observation(s, lesson, q),
    last = record.responses.at(-1);
  if (
    reason === 'validated' &&
    (s.teaching.status !== 'READY_TO_CONTINUE' ||
      last?.validation !== 'correct')
  )
    return s;
  const observations = {
    ...s.observations,
    [q.id]: {
      ...record,
      explicitContinuation: true,
      continuation: reason,
      skipped: reason === 'skipped' || record.skipped,
    },
  };
  const completion =
    reason === 'skipped' && !s.completion[q.id]
      ? {
          ...s.completion,
          [q.id]: {
            response: s.studentResponse,
            attempts: s.questionAttempt,
            help: s.permittedHintLevel,
            outcome: 'skipped' as const,
          },
        }
      : s.completion;
  const next = { ...s, observations, completion };
  const index = lesson.questions.indexOf(q);
  return index === lesson.questions.length - 1
    ? { ...next, phase: 'recap', sceneStation: 'desk', cue: null }
    : goToCheckpoint(next, lesson, index + 1);
}
