import type {
  Lesson,
  PracticeObservation,
  Question,
  ShowcaseState,
  TeachingCycle,
} from './types';
import { teachingPlan } from './curriculum';
import {
  assistance as markAssisted,
  emptyEvidence,
  visitConcept,
} from './learning-evidence';
import { runtime } from './visual-spec';

export const initialCycle: TeachingCycle = {
  status: 'INTRODUCING',
  variant: 'primary',
  followup: false,
  practiceCount: 0,
};
export function currentQuestion(s: ShowcaseState, lesson: Lesson) {
  const assessed = assessmentQuestion(s, lesson);
  if (assessed) return assessed;
  const base =
    lesson.questions.find((q) => q.id === s.questionId) ?? lesson.questions[0]!;
  return s.teaching.followup ? teachingPlan(s, lesson, base).followup : base;
}
export function assessmentQuestion(
  s: ShowcaseState,
  lesson: Lesson,
): Question | undefined {
  const nav = s.learning,
    experience = lesson.experience;
  if (!nav || !experience) return;
  if (nav.activity === 'diagnostic') return experience.diagnostic[nav.item];
  if (nav.activity === 'final') return experience.final[nav.item]?.question;
  if (nav.stage === 'test')
    return experience.tests[s.questionId ?? '']?.find(
      (q) => q.id === nav.taskId,
    );
}
function openAssessment(
  s: ShowcaseState,
  q: Question,
  activity: 'lesson' | 'diagnostic' | 'final',
  item = 0,
): ShowcaseState {
  const evidence = s.evidence ?? emptyEvidence();
  const base = lessonDiagramForAssessment(s, q);
  return {
    ...s,
    phase: 'interact',
    paused: false,
    studentResponse: '',
    questionAttempt: 0,
    lastFeedback: '',
    permittedHintLevel: 0,
    misconceptionCategory: null,
    cue: null,
    learning: {
      stage: 'test',
      activity,
      item,
      taskId: q.id,
      assisted: false,
      fresh: !evidence.exposed.includes(q.id),
    },
    teaching: { ...initialCycle, status: 'AWAITING_RESPONSE' },
    evidence: {
      ...evidence,
      exposed: [...new Set([...evidence.exposed, q.id])],
    },
    highlightTargetId: null,
    visualState: q.board
      ? {
          kind: 'kb',
          facts: q.board.facts,
          derived: [],
          query: '',
          direction: 'forward',
        }
      : base,
  };
}
function lessonDiagramForAssessment(s: ShowcaseState, q: Question) {
  const base = s.topicLesson?.questions.find(x => x.id === s.questionId)?.teaching?.diagram;
  if (base?.visual && q.visualSnapshot) return { kind: 'topic' as const, ...base, runtime: runtime(q.visualSnapshot) };
  return s.visualState;
}
export function startLearning(s: ShowcaseState, lesson: Lesson): ShowcaseState {
  if (s.pendingRequest || s.paused) return s;
  if (s.learning?.activity === 'diagnostic') return s;
  if (
    lesson.experience?.diagnostic.length &&
    (s.evidence?.diagnostic ?? 'not-assessed') === 'not-assessed'
  )
    return openAssessment(s, lesson.experience.diagnostic[0]!, 'diagnostic');
  return goToCheckpoint(s, lesson, 0);
}
export function skipDiagnostic(
  s: ShowcaseState,
  lesson: Lesson,
): ShowcaseState {
  if (s.pendingRequest) return s;
  if (s.learning?.activity !== 'diagnostic') return s;
  return goToCheckpoint(
    {
      ...s,
      evidence: {
        ...(s.evidence ?? emptyEvidence()),
        diagnostic: 'skipped',
        startingPoint: 'standard',
      },
    },
    lesson,
    0,
  );
}
export function beginConceptTest(
  s: ShowcaseState,
  lesson: Lesson,
): ShowcaseState {
  if (s.paused || s.pendingRequest || s.interruptionCheckpoint) return s;
  if (s.teaching.status !== 'READY_TO_CONTINUE') return s;
  const next = lesson.experience?.tests[s.questionId ?? '']?.find(
    (q) => !s.evidence?.exposed.includes(q.id),
  );
  return next
    ? openAssessment(s, next, 'lesson')
    : {
        ...s,
        lastFeedback:
          'No unused independent question remains for this concept. You can practise, review or continue with the recorded evidence unchanged.',
      };
}
export function startFinalAssessment(
  s: ShowcaseState,
  lesson: Lesson,
): ShowcaseState {
  if (
    s.paused ||
    s.pendingRequest ||
    s.interruptionCheckpoint ||
    !lesson.experience ||
    s.phase !== 'recap'
  )
    return s;
  const item = lesson.experience.final.findIndex(
    (entry) => !s.evidence?.exposed.includes(entry.question.id),
  );
  if (item < 0) return s;
  const entry = lesson.experience.final[item]!;
  return openAssessment(
    {
      ...s,
      questionId: entry.conceptId,
      sourcePages: entry.question.pages,
      sceneStation: 'board',
    },
    entry.question,
    'final',
    item,
  );
}
export function continueAssessment(
  s: ShowcaseState,
  lesson: Lesson,
  skip = false,
): ShowcaseState {
  if (
    s.paused ||
    s.pendingRequest ||
    s.interruptionCheckpoint ||
    !lesson.experience
  )
    return s;
  if (!skip && s.teaching.status !== 'READY_TO_CONTINUE') return s;
  const nav = s.learning;
  if (!nav || nav.activity === 'lesson') return s;
  let evidence = s.evidence ?? emptyEvidence();
  const active = assessmentQuestion(s, lesson);
  if (skip && active && s.teaching.status !== 'READY_TO_CONTINUE') {
    evidence = {
      ...evidence,
      attempts: [
        ...evidence.attempts,
        {
          id: crypto.randomUUID(),
          conceptId: s.questionId!,
          questionId: active.id,
          kind: nav.activity,
          response: '',
          validation: 'unverified',
          assisted: nav.assisted,
          assistance: [],
          attempt: 1,
          independent: false,
          skipped: true,
          intervention: null,
          submittedAt: Date.now(),
        },
      ],
    };
  }
  if (nav.activity === 'diagnostic') {
    const next = lesson.experience.diagnostic[nav.item + 1];
    if (next)
      return openAssessment(
        { ...s, evidence },
        next,
        'diagnostic',
        nav.item + 1,
      );
    const answers = evidence.attempts.filter((a) => a.kind === 'diagnostic');
    const ready =
      answers.length === 2 &&
      answers.every((a) => a.validation === 'correct' && !a.assisted);
    const reverse = answers.some((a) => a.intervention === 'wrong-rule');
    evidence = {
      ...evidence,
      diagnostic: 'completed',
      startingPoint: ready
        ? 'application'
        : reverse
          ? 'rule-repair'
          : 'foundation',
    };
    const nextState = goToCheckpoint({ ...s, evidence }, lesson, 0);
    return {
      ...nextState,
      teaching: ready
        ? { ...nextState.teaching, status: 'AWAITING_RESPONSE' }
        : nextState.teaching,
      learning: {
        ...nextState.learning!,
        stage: ready ? 'apply' : 'learn',
        introduction: lesson.id !== 'ai4' ? undefined : ready
          ? undefined
          : reverse
            ? 'Start with direction: Bird(x) → HasWings(x) goes from bird to wings. Wings alone cannot prove that something is a bird. We will practise following only supplied links.'
            : 'Start with two building blocks: a fact names something known; a rule connects a matching premise to a conclusion. Together they can justify a new statement.',
      },
    };
  }
  const item = lesson.experience.final.findIndex(
    (entry, i) => i > nav.item && !evidence.exposed.includes(entry.question.id),
  );
  if (item < 0)
    return {
      ...s,
      evidence,
      phase: 'recap',
      sceneStation: 'desk',
      learning: { ...nav, item: lesson.experience.final.length, taskId: null },
    };
  const entry = lesson.experience.final[item]!;
  return openAssessment(
    {
      ...s,
      evidence,
      questionId: entry.conceptId,
      sourcePages: entry.question.pages,
    },
    entry.question,
    'final',
    item,
  );
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
  if (v.kind === 'topic' && q.teaching)
    {
      const diagram = q.teaching.diagram, spec = diagram.visual;
      const snapshot = stage === 'check'
        ? (s.teaching.followup ? q.teaching.followup.visualSnapshot : q.visualSnapshot) ?? spec?.apply
        : stage === 'demo' || stage === 'retry' ? spec?.demonstration : spec?.initial;
      v = { kind: 'topic', ...diagram, ...(snapshot ? { runtime: runtime(snapshot) } : {}) };
      if (stage === 'retry' && v.runtime && spec) v.runtime.highlights = spec.feedback.incorrect;
    }
  if (v.kind === 'tree') {
    const example =
      stage === 'introduce' && !s.teaching.followup
        ? plan.checkExample
        : stage === 'demo' && !s.teaching.followup
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
      opponents: i === 0,
      allLeaves: i >= 3,
      example: example
        ? { ...example, revealAnswer: stage === 'demo' || stage === 'retry' }
        : undefined,
      transfer: i === 11 || (s.teaching.followup && [5, 6, 11].includes(i)),
      reveal: i < 3 ? 1 : i < 6 ? 1 : i === 6 ? 2 : 3,
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
      safer:
        s.teaching.followup ||
        stage === 'retry' ||
        i === 6 ||
        (i === 8 && stage === 'demo'),
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
      weight: i >= 6 || (stage === 'demo' && i === 5) ? 1.5 : 0.5,
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
    evidence: visitConcept(s, q.id),
    learning: {
      stage: 'learn' as const,
      activity: 'lesson' as const,
      item: 0,
      taskId: null,
      assisted: false,
      fresh: false,
    },
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
  // Help during an assessment must not replace its task or reset its conditions.
  if (s.learning?.stage === 'test') return markAssisted(s, action);
  const q =
    lesson.questions.find((q) => q.id === s.questionId) ?? lesson.questions[0]!;
  const record = observation(s, lesson, q);
  const assistance = ['simpler', 'example', 'repeat'].includes(action);
  const variant =
    action === 'simpler'
      ? 'simpler'
      : action === 'example'
        ? 'second-example'
        : s.teaching.variant;
  const status =
    action === 'demonstrate'
      ? 'DEMONSTRATING'
      : action === 'check' || action === 'practice'
        ? 'AWAITING_RESPONSE'
        : action === 'answer'
          ? 'AWAITING_RESPONSE'
          : action === 'repeat'
            ? 'INTRODUCING'
            : 'RETEACHING';
  const next = {
    ...s,
    ...(action === 'answer' || action === 'check' || action === 'practice'
      ? { studentResponse: '' }
      : {}),
    teaching: {
      ...s.teaching,
      status,
      variant,
      followup:
        ['simpler', 'example', 'practice'].includes(action) ||
        s.teaching.followup,
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
    learning: {
      stage:
        status === 'AWAITING_RESPONSE'
          ? ('apply' as const)
          : ('learn' as const),
      activity: 'lesson' as const,
      item: 0,
      taskId: null,
      assisted: assistance || !!s.learning?.assisted,
      fresh: false,
    },
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
  if (s.learning?.activity !== 'lesson' && s.learning?.activity)
    return continueAssessment(s, lesson, reason === 'skipped');
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
  if (
    reason === 'validated' &&
    ['AI3-Q02', 'AI3-Q03'].includes(q.id) &&
    !s.teaching.followup
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
  let evidence = s.evidence ?? emptyEvidence();
  if (reason === 'skipped') {
    const active = currentQuestion(s, lesson);
    evidence = {
      ...evidence,
      attempts: [
        ...evidence.attempts,
        {
          id: crypto.randomUUID(),
          conceptId: q.id,
          questionId: active.id,
          kind: s.learning?.stage === 'test' ? 'test' : 'apply',
          response: s.studentResponse,
          validation: 'unverified',
          assisted: !!s.learning?.assisted,
          assistance: [],
          attempt:
            evidence.attempts.filter((a) => a.questionId === active.id).length +
            1,
          independent: false,
          skipped: true,
          intervention: null,
          submittedAt: Date.now(),
        },
      ],
    };
  }
  const next = {
    ...s,
    observations,
    completion,
    evidence: {
      ...evidence,
      skipped:
        reason === 'skipped'
          ? [...new Set([...evidence.skipped, q.id])]
          : evidence.skipped,
    },
  };
  const index = lesson.questions.indexOf(q);
  return index === lesson.questions.length - 1
    ? { ...next, phase: 'recap', sceneStation: 'desk', cue: null }
    : goToCheckpoint(next, lesson, index + 1);
}
