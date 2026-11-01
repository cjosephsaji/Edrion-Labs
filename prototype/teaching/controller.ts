import { teachingPlan } from './curriculum';
import {
  assessmentQuestion,
  checkpointVisual,
  initialCycle,
  observation,
} from './checkpoint';
import { validateResponse } from './validation';
import { assistance, emptyEvidence, recordAttempt } from './learning-evidence';
import { lessonForState } from './tree-variant';
import { resolveLesson } from './lesson-registry';
import type { ShowcaseState, Lesson, VisualState, Question } from './types';
import { runtime } from './visual-spec';
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
export function lessonVisual(id: string, lesson?: Lesson): VisualState {
  if (id.startsWith('topic-') && lesson?.questions[0]?.teaching)
    return { kind: 'topic', ...lesson.questions[0].teaching.diagram, ...(lesson.questions[0].teaching.diagram.visual ? { runtime: runtime(lesson.questions[0].teaching.diagram.visual.initial) } : {}) };
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
  return {
    ...initialState.visualState,
    kind: 'tree',
    treeOrder: 'v2',
  } as VisualState;
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
    topicLesson: lesson.id.startsWith('topic-') ? lesson : undefined,
    moduleId: lesson.module,
    sourceId: lesson.filename ?? null,
    sourceHash: hash,
    inputOrigin:
      lesson.origin === 'generated'
        ? 'live_open_topic'
        : lesson.general
          ? 'curated_open_topic'
          : s.receipts.some((r) => r.recognized === lesson.id)
            ? 'uploaded_pdf'
            : 'seeded_pdf',
    sourcePages: lesson.questions[0]!.pages,
    questionId: lesson.questions[0]!.id,
    visualState: lessonVisual(lesson.id, lesson),
    cue: null,
    evidence: emptyEvidence(),
    learning: {
      stage: 'learn',
      activity: 'lesson',
      item: 0,
      taskId: null,
      assisted: false,
      fresh: false,
    },
  };
}
export function practice(s: ShowcaseState, q: Question): ShowcaseState {
  if (
    s.paused ||
    s.pendingRequest ||
    s.interruptionCheckpoint ||
    s.teaching.status === 'READY_TO_CONTINUE' ||
    s.teaching.status === 'RETEACHING'
  )
    return s;
  const actualLesson = resolveLesson(s);
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
  const assessed = base ? assessmentQuestion(s, base) : undefined;
  if (assessed) q = assessed;
  else if (base && s.teaching.followup)
    q = teachingPlan(s, base, original).followup;
  const comparison = validateResponse(q, response);
  const generated = actualLesson?.origin === 'generated';
  // A model-declared key can support comparison, not establish factual correctness.
  const validation =
    generated && comparison !== 'unclear' ? 'unverified' : comparison;
  const accepted = comparison === 'correct',
    partial = !generated && comparison === 'partial',
    unclear = comparison === 'unclear';
  const recorded = accepted || q.type === 'text';
  const help = Math.max(
    s.permittedHintLevel,
    s.completion[original.id]?.help ?? 0,
  );
  const completion = { ...s.completion };
  if (recorded && s.learning?.activity !== 'diagnostic')
    completion[original.id] = {
      response,
      attempts: attempt,
      outcome: q.type === 'text' || generated ? 'recorded' : 'explored',
      help,
    };
  const plan = base ? teachingPlan(s, base, original) : null;
  const minMistake = original.id === 'AI3-Q03' && validation === 'incorrect';
  const minRoleConfusion =
    minMistake &&
    s.visualState.kind === 'tree' &&
    s.visualState.example &&
    Number(response) === Math.max(...s.visualState.example.values);
  const misconception =
    validation === 'incorrect'
      ? original.id === 'AI4-Q07' && response === 'Definitely false'
        ? 'unknown-as-false'
        : original.id === 'AI4-Q03' && response === 'Facts'
          ? 'rule-as-individual-fact'
          : original.id === 'AI3-Q07' && response === 'B'
            ? 'large-leaf-as-guarantee'
            : minRoleConfusion
              ? 'MIN-maximizes-MAX-score'
              : minMistake
                ? 'MIN-comparison-incomplete'
                : q.misconception
      : partial
        ? 'incomplete-selection'
        : null;
  const feedback =
    generated && !unclear
      ? 'Generated practice · Your response ' +
        (accepted ? 'matches' : 'differs from') +
        ' the model-declared key. That key is not an independently validated answer. Compare this explanation: ' +
        q.explanation +
        ' Your understanding remains unverified.'
      : assessed && !unclear
        ? accepted
          ? 'Practice feedback · ' + q.explanation
          : 'You selected “' +
            response +
            '”. ' +
            (q.optionFeedback?.[q.options.indexOf(response)] ??
              'Trace the supplied premises and one-way rules before deciding.')
        : q.type === 'text'
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
                  ? `You chose ${response}. ${response === '8' ? "That would be MAX's choice, because 8 is the highest. But MIN wants the smallest score for MAX. Let's compare the choices again." : 'MIN wants fewer points for MAX. Compare your choice with the smaller values still on the board.'}`
                  : original.id === 'AI3-Q02'
                    ? `You chose ${response}. MAX wants the highest score; a larger choice is still available. Compare the values before trying a new example.`
                    : `You selected “${response}”. ${q.optionFeedback?.[q.options.indexOf(response)] ?? plan?.simpler ?? q.hints[0]}`;
  const record = base ? observation(s, base, original) : null;
  let next: ShowcaseState = {
    ...s,
    questionAttempt: attempt,
    lastFeedback: feedback,
    completion,
    misconceptionCategory: misconception,
    permittedHintLevel: recorded ? help : Math.min(2, attempt),
    teaching: {
      ...s.teaching,
      status: recorded
        ? 'READY_TO_CONTINUE'
        : unclear || partial
          ? 'AWAITING_RESPONSE'
          : 'RETEACHING',
      followup: partial
        ? false
        : recorded || unclear
          ? s.teaching.followup
          : minMistake && attempt === 1 && !s.teaching.followup
            ? false
            : true,
      variant:
        recorded || unclear
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
                task: q.task,
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
                ...(!recorded && !unclear
                  ? [attempt > 1 ? 'second-example' : 'simpler']
                  : []),
              ]),
            ],
          },
        }
      : s.observations,
    cue: null,
    evidence: recordAttempt(s, q, original.id, validation),
  };
  if (next.visualState.kind === 'topic' && next.visualState.visual && !unclear) {
    const v = next.visualState, spec = v.visual!;
    next = { ...next, visualState: { ...v, runtime: { ...(v.runtime ?? runtime(spec.initial)), playing: false, highlights: accepted ? spec.feedback.correct : spec.feedback.incorrect, reveal: true } }, highlightTargetId: (accepted ? spec.feedback.correct : spec.feedback.incorrect)[0] ?? null };
  }
  if (assessed) {
    const entry = next.evidence!.attempts.at(-1)!;
    if (
      s.learning?.activity === 'diagnostic' ||
      s.learning?.activity === 'final'
    ) {
      return {
        ...next,
        teaching: {
          ...next.teaching,
          status: unclear ? 'AWAITING_RESPONSE' : 'READY_TO_CONTINUE',
        },
      };
    }
    if (accepted)
      return {
        ...next,
        lastFeedback:
          generated ? feedback : (entry.independent
            ? 'Verified now · A fresh, unassisted application. '
            : 'Assisted practice · This attempt does not independently verify the concept. ') +
          q.explanation,
        teaching: { ...next.teaching, status: 'READY_TO_CONTINUE' },
      };
    if (!unclear)
      return {
        ...next,
        learning: {
          stage: 'apply',
          activity: 'lesson',
          item: 0,
          taskId: null,
          assisted: true,
          fresh: false,
        },
        teaching: {
          ...next.teaching,
          status: 'RETEACHING',
          followup: true,
          variant: 'simpler',
        },
        lastFeedback:
          feedback +
          ' Let us compare a supported path before a new application.',
        highlightTargetId: next.visualState.kind === 'topic' ? next.highlightTargetId : entry.intervention === 'wrong-rule' ? 'rule' : 'unsupported',
      };
    return next;
  }
  const intervention = next.evidence!.attempts.at(-1)?.intervention;
  if (!accepted && !unclear && intervention) {
    next = {
      ...next,
      highlightTargetId:
        intervention === 'wrong-rule'
          ? 'rule'
          : intervention === 'unsupported-conclusion'
            ? 'unsupported'
            : next.highlightTargetId,
      lastFeedback:
        feedback +
        (intervention === 'repeated'
          ? ' Repeating this check is not helping yet. Use another worked example, review the idea, or continue with understanding unverified.'
          : ''),
    };
  }
  if (
    base &&
    !recorded &&
    !unclear &&
    !partial &&
    q.type !== 'text' &&
    attempt > 1
  )
    next = { ...next, ...checkpointVisual(next, base, original, 'retry') };
  if (accepted && original.id === 'AI3-Q07' && next.visualState.kind === 'tree')
    next = { ...next, visualState: { ...next.visualState, reveal: 3 } };
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
/** All diagram, overlay and keyboard selections use the same response gate. */
export function selectResponse(
  s: ShowcaseState,
  q: Question,
  value: string,
): ShowcaseState {
  if (
    s.paused ||
    s.pendingRequest ||
    s.interruptionCheckpoint ||
    s.teaching.status !== 'AWAITING_RESPONSE' ||
    q.type === 'text' ||
    q.type === 'number' ||
    !q.options.includes(value)
  )
    return s;
  const values = s.studentResponse ? s.studentResponse.split('|') : [];
  return {
    ...s,
    studentResponse:
      q.type === 'multi'
        ? (values.includes(value)
            ? values.filter((v) => v !== value)
            : [...values, value]
          ).join('|')
        : value,
    cue: yieldCue(s.cue),
    lastFeedback: '',
  };
}

export function cueAllowed(typing: boolean, requested: boolean) {
  return requested || !typing;
}
export function interrupt(s: ShowcaseState, requestId: string): ShowcaseState {
  s = assistance(s, requestId ? 'asked-petros' : 'opened-help');
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
    resolveLesson(s)?.questions.find((q) => q.id === saved?.questionId)
      ?.pages ?? s.sourcePages;
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
