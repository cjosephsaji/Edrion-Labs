import { teachingPlan } from './curriculum';
import { checkpointVisual, initialCycle, observation } from './checkpoint';
import { lessonForState } from './tree-variant';
import { lessons } from '../lessons';
import type { ShowcaseState, Lesson, VisualState, Question } from './types';
export const initialState: ShowcaseState = {
  teaching: { ...initialCycle },
  observations: {},
  sessionId: '',
  mode: 'classic',
  inputOrigin: 'seeded_pdf',
  sourceId: null,
  sourceHash: null,
  sourcePages: [],
  moduleId: null,
  lessonId: null,
  phase: 'welcome',
  stepId: 0,
  highlightTargetId: null,
  sceneStation: 'desk',
  visualState: {
    kind: 'tree',
    reveal: 0,
    pruneStep: 0,
    allLeaves: false,
    selected: '',
    transfer: false,
  },
  visualStepHistory: [],
  questionId: null,
  questionAttempt: 0,
  studentResponse: '',
  completion: {},
  lastFeedback: '',
  misconceptionCategory: null,
  permittedHintLevel: 0,
  conversationHistory: [],
  pendingRequest: null,
  interruptionCheckpoint: null,
  welcomeCueShown: false,
  speechState: 'captions',
  saveStatus: 'memory-only',
  modeSwitchInProgress: false,
  paused: false,
  askDraft: '',
  receipts: [],
  cue: null,
};
export function lessonVisual(id: string): VisualState {
  if (id === 'ai4')
    return {
      kind: 'kb',
      facts: ['Bird(Tweety)'],
      derived: [],
      query: '',
      direction: 'forward',
    };
  if (id === 'ehs3')
    return { kind: 'hazards', selected: '', inspected: [], safer: false };
  if (id === 'ehs5') return { kind: 'river', selected: '', controls: [] };
  if (id === 'open-ai')
    return { kind: 'network', input: 2, weight: 0.5, target: 3 };
  if (id === 'time') return { kind: 'clocks', speed: 0.6, earthYears: 10 };
  return { ...initialState.visualState };
}
export function selectLesson(
  s: ShowcaseState,
  lesson: Lesson,
  hash: string | null,
): ShowcaseState {
  return {
    ...initialState,
    sessionId: crypto.randomUUID(),
    mode: s.mode,
    receipts: s.receipts,
    lessonId: lesson.id,
    moduleId: lesson.module,
    sourceId: lesson.filename ?? null,
    sourceHash: hash,
    inputOrigin: lesson.general
      ? 'curated_open_topic'
      : s.receipts.some((r) => r.recognized === lesson.id)
        ? 'uploaded_pdf'
        : 'seeded_pdf',
    sourcePages: lesson.questions[0]!.pages,
    questionId: lesson.questions[0]!.id,
    visualState: lessonVisual(lesson.id),
    cue: null,
  };
}
export function practice(s: ShowcaseState, q: Question): ShowcaseState {
  const actualLesson = lessons.find((l) => l.id === s.lessonId);
  q =
    lessonForState(actualLesson, s)?.questions.find(
      (item) => item.id === q.id,
    ) ?? q;
  const response = s.studentResponse.trim();
  if (!response)
    return {
      ...s,
      lastFeedback: 'Make a selection or enter your response first.',
    };
  const attempt = s.questionAttempt + 1;
  const base = lessonForState(actualLesson, s);
  const original =
    base?.questions.find((item) => item.id === s.questionId) ?? q;
  if (base && s.teaching.followup) q = teachingPlan(s, base, original).followup;
  const validOption =
    q.type === 'multi'
      ? response.split('|').every((value) => q.options.includes(value))
      : q.options.includes(response);
  const accepted =
    q.type === 'text'
      ? false
      : q.type === 'multi'
        ? JSON.stringify(response.split('|').sort()) ===
          JSON.stringify([...q.correct].sort())
        : q.type === 'number'
          ? Number.isFinite(Number(response)) &&
            q.correct.some((value) => Number(value) === Number(response))
          : q.correct.includes(response);
  const partial =
    q.type === 'multi' &&
    !accepted &&
    response.split('|').some((value) => q.correct.includes(value));
  const unclear =
    q.type !== 'text' &&
    (q.type === 'number' ? !Number.isFinite(Number(response)) : !validOption);
  const validation =
    q.type === 'text'
      ? 'unverified'
      : accepted
        ? 'correct'
        : unclear
          ? 'unclear'
          : partial
            ? 'partial'
            : 'incorrect';
  const help = Math.max(
    s.permittedHintLevel,
    s.completion[original.id]?.help ?? 0,
  );
  const completion = { ...s.completion };
  if (accepted || q.type === 'text')
    completion[original.id] = {
      response,
      attempts: attempt,
      outcome: q.type === 'text' ? 'recorded' : 'explored',
      help,
    };
  const plan = base ? teachingPlan(s, base, original) : null;
  const minMistake = original.id === 'AI3-Q03' && validation === 'incorrect';
  const misconception =
    validation === 'incorrect'
      ? original.id === 'AI4-Q07' && response === 'Definitely false'
        ? 'unknown-as-false'
        : original.id === 'AI4-Q03' && response === 'Facts'
          ? 'rule-as-individual-fact'
          : original.id === 'AI3-Q07' && response === 'B'
            ? 'large-leaf-as-guarantee'
            : minMistake
              ? 'MIN-maximizes-MAX-score'
              : q.misconception
      : partial
        ? 'incomplete-selection'
        : null;
  const feedback =
    q.type === 'text'
      ? 'Recorded — not automatically evaluated. Which part of the visible rule supports your explanation? You can compare it with an example or explicitly continue with understanding unverified.'
      : accepted
        ? `Practice feedback · ${q.explanation}`
        : unclear
          ? 'I cannot evaluate that response. Please use a displayed option or clarify the numerical value.'
          : partial
            ? `You selected supported controls: ${response
                .split('|')
                .filter((value) => q.correct.includes(value))
                .join(
                  ', ',
                )}. ${response.split('|').some((value) => !q.correct.includes(value)) ? 'Some selected items are unsupported. ' : ''}Which remaining pathway still needs a matching control?`
            : minMistake
              ? 'You chose the larger score. That follows MAX’s goal, but this is MIN: the opponent wants the least favorable result for MAX. Keep MIN A in view and compare the simpler example below.'
              : `You selected “${response}”. ${plan?.simpler ?? q.hints[0]}`;
  const record = base ? observation(s, base, original) : null;
  let next: ShowcaseState = {
    ...s,
    questionAttempt: attempt,
    lastFeedback: feedback,
    completion,
    misconceptionCategory: misconception,
    permittedHintLevel:
      accepted || q.type === 'text' ? help : Math.min(2, attempt),
    teaching: {
      ...s.teaching,
      status:
        accepted || q.type === 'text'
          ? 'READY_TO_CONTINUE'
          : unclear || partial
            ? 'AWAITING_RESPONSE'
            : 'RETEACHING',
      followup: partial
        ? false
        : accepted || unclear || q.type === 'text'
          ? s.teaching.followup
          : true,
      variant:
        accepted || unclear || q.type === 'text'
          ? s.teaching.variant
          : attempt > 1
            ? 'second-example'
            : 'simpler',
    },
    observations: record
      ? {
          ...s.observations,
          [original.id]: {
            ...record,
            responses: [
              ...record.responses,
              {
                questionId: q.id,
                response,
                validation,
                misconception,
                variant: s.teaching.variant,
              },
            ],
            retries:
              record.retries +
              (validation === 'incorrect' || validation === 'partial' ? 1 : 0),
            explanationVariants: [
              ...new Set([
                ...record.explanationVariants,
                ...(!accepted && !unclear
                  ? [attempt > 1 ? 'second-example' : 'simpler']
                  : []),
              ]),
            ],
          },
        }
      : s.observations,
    cue: null,
  };
  if (base && !accepted && !unclear && q.type !== 'text')
    next = { ...next, ...checkpointVisual(next, base, original, 'retry') };
  if (accepted && !s.teaching.followup) {
    const v = next.visualState;
    if (v.kind === 'tree' && ['AI3-Q09', 'AI3-Q10'].includes(original.id))
      next = {
        ...next,
        visualState: { ...v, pruneStep: original.id === 'AI3-Q09' ? 4 : 6 },
      };
    if (v.kind === 'kb' && original.id === 'AI4-Q02')
      next = {
        ...next,
        visualState: {
          ...v,
          facts: [...new Set([...v.facts, 'Bird(Tweety)'])],
        },
      };
    if (v.kind === 'kb' && original.id === 'AI4-Q05')
      next = {
        ...next,
        visualState: {
          ...v,
          derived: [...new Set([...v.derived, 'HasWings(Tweety)'])],
        },
      };
    if (v.kind === 'kb' && original.id === 'AI4-Q10')
      next = {
        ...next,
        visualState: {
          ...v,
          facts: [...new Set([...v.facts, 'Bird(Rio)'])],
          derived: [...new Set([...v.derived, 'HasWings(Rio)'])],
        },
      };
    if (v.kind === 'network' && original.id === 'AI-Q06')
      next = { ...next, visualState: { ...v, input: 2, weight: 1.5 } };
    if (v.kind === 'clocks' && original.id === 'TIME-Q04')
      next = { ...next, visualState: { ...v, speed: 0.8 } };
  }
  if (
    next.visualState.kind === 'tree' &&
    next.visualState.transfer &&
    (accepted || q.type === 'text')
  )
    next = { ...next, visualState: { ...next.visualState, reveal: 3 } };
  if (next.visualState.kind === 'tree' && next.visualState.example && accepted)
    next = {
      ...next,
      visualState: {
        ...next.visualState,
        example: { ...next.visualState.example, revealAnswer: true },
      },
    };
  return next;
}

export function cueAllowed(typing: boolean, requested: boolean) {
  return requested || !typing;
}
export function interrupt(s: ShowcaseState, requestId: string): ShowcaseState {
  return {
    ...s,
    teaching: { ...s.teaching, status: 'INTERRUPTED' },
    paused: true,
    pendingRequest: requestId,
    interruptionCheckpoint: {
      questionId: s.interruptionCheckpoint?.questionId ?? s.questionId,
      stepId: s.interruptionCheckpoint?.stepId ?? s.stepId,
      highlight: s.interruptionCheckpoint?.highlight ?? s.highlightTargetId,
      teaching: s.interruptionCheckpoint?.teaching ?? s.teaching,
      visual: s.interruptionCheckpoint?.visual ?? s.visualState,
      sceneStation: s.interruptionCheckpoint?.sceneStation ?? s.sceneStation,
    },
    cue: null,
  };
}
export function resume(s: ShowcaseState): ShowcaseState {
  if (s.pendingRequest) return s;
  const saved = s.interruptionCheckpoint;
  const sourcePages =
    lessons
      .find((l) => l.id === s.lessonId)
      ?.questions.find((q) => q.id === saved?.questionId)?.pages ??
    s.sourcePages;
  return {
    ...s,
    paused: false,
    teaching: saved?.teaching ?? s.teaching,
    ...(saved
      ? {
          questionId: saved.questionId,
          stepId: saved.stepId,
          sourcePages,
          visualState: saved.visual,
          sceneStation: saved.sceneStation,
          highlightTargetId: saved.highlight,
        }
      : {}),
    interruptionCheckpoint: null,
    cue: null,
  };
}

/** Explicitly requested hints remain available until dismissal or a new teaching context. */
export function yieldCue(cue: ShowcaseState['cue']) {
  return cue?.requested ? cue : null;
}
