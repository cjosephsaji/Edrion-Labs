import type { Lesson, LessonId, Question, TopicDiagram } from './types';
import {
  validVisualSpec,
  validRuntime,
  validModelState,
  type ModelState,
  type VisualSpec,
} from './visual-spec';
import { visualScene } from './visual-scene';

export interface TopicCheck {
  model?: ModelState;
  feedback: string[];
  task: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}
export interface TopicOutline {
  subject?: string;
  diagnostic?: TopicCheck[];
  learningGoals: string[];
  prerequisites: string[];
  title: string;
  subtitle: string;
  introduction: string;
  steps: {
    concept: string;
    introduction: string;
    demonstration: string;
    simpler: string;
    example: string;
    diagramLabels: string[];
    diagramCaption: string;
    visual?: VisualSpec;
    independent?: TopicCheck;
    final?: TopicCheck;
    check: TopicCheck;
    followup: TopicCheck;
  }[];
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function text(value: unknown, max = 900): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}
function strings(value: unknown, min: number, max: number, length = 160): value is string[] {
  return (
    Array.isArray(value) &&
    value.length >= min &&
    value.length <= max &&
    value.every((s) => text(s, length))
  );
}
function check(value: unknown): value is TopicCheck {
  return (
    object(value) &&
    text(value.task, 360) &&
    strings(value.options, 3, 3) &&
    new Set(value.options).size === 3 &&
    Number.isInteger(value.correctIndex) &&
    Number(value.correctIndex) >= 0 &&
    Number(value.correctIndex) < 3 &&
    text(value.explanation) &&
    strings(value.feedback, 3, 3, 500)
  );
}
export function validOutline(value: unknown): value is TopicOutline {
  return (
    object(value) &&
    text(value.title, 120) &&
    text(value.subtitle, 180) &&
    text(value.introduction) &&
    (value.subject === undefined || text(value.subject, 100)) &&
    (value.diagnostic === undefined ||
      (Array.isArray(value.diagnostic) &&
        value.diagnostic.length === 2 &&
        value.diagnostic.every(check))) &&
    strings(value.learningGoals, 2, 4, 180) &&
    strings(value.prerequisites, 1, 3, 180) &&
    Array.isArray(value.steps) &&
    value.steps.length >= 4 &&
    value.steps.length <= 8 &&
    new Set(value.steps.map((s) => (object(s) ? s.concept : null))).size === value.steps.length &&
    value.steps.every(
      (s) =>
        object(s) &&
        text(s.concept, 100) &&
        text(s.introduction) &&
        text(s.demonstration) &&
        text(s.simpler) &&
        text(s.example) &&
        strings(s.diagramLabels, 3, 3, 100) &&
        text(s.diagramCaption, 360) &&
        (s.visual === undefined || validVisualSpec(s.visual)) &&
        [s.check, s.followup, s.independent, s.final]
          .filter(Boolean)
          .every(
            (c) =>
              check(c) &&
              (c.model === undefined ||
                (s.visual &&
                  validModelState(s.visual as VisualSpec, c.model) &&
                  !c.model.reveal &&
                  c.model.highlights.length === 0 &&
                  c.model.selected === null)),
          ) &&
        check(s.check) &&
        check(s.followup) &&
        s.check.task !== s.followup.task,
    )
  );
}
export function makeTopicLesson(
  outline: unknown,
  origin: 'prepared' | 'generated',
  id: LessonId,
): Lesson {
  if (!validOutline(outline) || !id.startsWith('topic-'))
    throw Error('The lesson response was incomplete. Please try again.');
  if (
    origin === 'generated' &&
    !outline.steps.every(
      (s) =>
        s.visual &&
        s.independent &&
        s.final &&
        s.check.model &&
        s.followup.model &&
        s.independent.model &&
        s.final.model,
    )
  )
    throw Error(
      'A generated lesson must plan a supported visual or explain its absence, with fresh assessment tasks.',
    );
  if (
    outline.diagnostic?.some(
      (c, i) =>
        c.model &&
        (!outline.steps[i]?.visual || !validModelState(outline.steps[i]!.visual!, c.model)),
    )
  )
    throw Error('Diagnostic visual state does not match its concept.');
  if (
    outline.steps.some(
      (s) =>
        new Set([s.check.task, s.followup.task, s.independent?.task, s.final?.task].filter(Boolean))
          .size !== [s.check, s.followup, s.independent, s.final].filter(Boolean).length,
    )
  )
    throw Error('Practice and independent tasks must use distinct scenarios.');
  const prefix = id.toUpperCase();
  const questions: Question[] = outline.steps.map((step, i) => ({
    id: `${prefix}-Q${i + 1}`,
    task: step.check.task,
    type: 'choice',
    options: step.check.options,
    correct: [step.check.options[step.check.correctIndex]!],
    pages: [],
    phase: 'interact',
    concept: step.concept,
    explanation: step.check.explanation,
    optionFeedback: step.check.feedback,
    misconception: `Revisit ${step.concept.toLowerCase()}.`,
    hints: [step.simpler, step.example],
    retry: 'retry-worked-skip',
    next: i === outline.steps.length - 1 ? 'recap' : `${prefix}-Q${i + 2}`,
    teaching: {
      introduction: step.introduction,
      demonstration: step.demonstration,
      simpler: step.simpler,
      example: step.example,
      diagram: {
        heading: step.concept,
        labels: step.diagramLabels,
        caption: step.diagramCaption,
        ...(step.visual ? { visual: step.visual } : {}),
      },
      followup: {
        task: step.followup.task,
        options: step.followup.options,
        correct: [step.followup.options[step.followup.correctIndex]!],
        explanation: step.followup.explanation,
        optionFeedback: step.followup.feedback,
        ...(step.followup.model ? { visualSnapshot: step.followup.model } : {}),
      },
    },
    ...(step.check.model ? { visualSnapshot: step.check.model } : {}),
  }));
  const assessment = (c: TopicCheck, q: Question, suffix: string): Question => ({
    ...q,
    id: q.id + suffix,
    teaching: undefined,
    task: c.task,
    options: c.options,
    correct: [c.options[c.correctIndex]!],
    explanation: c.explanation,
    optionFeedback: c.feedback,
    visualSnapshot: c.model,
  });
  const complete = outline.steps.every((s) => s.independent && s.final);
  return {
    id,
    origin,
    subject: outline.subject ?? 'Explore a topic',
    module: null,
    general: true,
    title: outline.title,
    subtitle: outline.subtitle,
    chips: outline.steps.slice(0, 3).map((step) => step.concept),
    introduction: outline.introduction,
    learningGoals: outline.learningGoals,
    prerequisites: outline.prerequisites,
    steps: outline.steps.map((step) => step.concept),
    questions,
    ...(complete
      ? {
          experience: {
            objectives: Object.fromEntries(
              questions.map((q, i) => [q.id, outline.steps[i]!.visual?.objective ?? q.concept]),
            ),
            diagnostic: (outline.diagnostic ?? []).map((c, i) =>
              assessment(c, questions[Math.min(i, questions.length - 1)]!, '-diagnostic'),
            ),
            tests: Object.fromEntries(
              questions.map((q, i) => [
                q.id,
                [assessment(outline.steps[i]!.independent!, q, '-independent')],
              ]),
            ),
            final: questions.map((q, i) => ({
              conceptId: q.id,
              question: assessment(outline.steps[i]!.final!, q, '-final'),
            })),
          },
        }
      : {}),
  };
}
export function validDiagram(value: unknown): value is TopicDiagram {
  if (
    !object(value) ||
    !text(value.heading, 120) ||
    !strings(value.labels, 3, 3, 100) ||
    !text(value.caption, 360)
  )
    return false;
  if (
    value.visual !== undefined &&
    (!validVisualSpec(value.visual) ||
      (value.runtime !== undefined && !validRuntime(value.visual, value.runtime)))
  )
    return false;
  if (value.runtime !== undefined && value.visual === undefined) return false;
  if (value.area !== undefined) {
    const a = value.area;
    if (
      !object(a) ||
      !Number.isFinite(a.slope) ||
      !Number.isInteger(a.slope) ||
      Number(a.slope) < 1 ||
      Number(a.slope) > 3 ||
      !Number.isFinite(a.upper) ||
      !Number.isInteger(a.upper) ||
      Number(a.upper) < 1 ||
      Number(a.upper) > 4 ||
      ![4, 8, 16, 32].includes(Number(a.slices))
    )
      return false;
  }
  return true;
}
/** Validate the client response and refresh checkpoint; never accept executable model output. */
export function validTopicLesson(value: unknown): value is Lesson {
  if (
    !object(value) ||
    typeof value.id !== 'string' ||
    !/^topic-[a-z0-9-]{1,80}$/i.test(value.id) ||
    !['prepared', 'generated'].includes(String(value.origin)) ||
    value.general !== true ||
    value.module !== null ||
    !text(value.subject, 100) ||
    !strings(value.chips, 1, 3, 100) ||
    !strings(value.learningGoals, 2, 4, 180) ||
    !strings(value.prerequisites, 1, 3, 180) ||
    !text(value.title, 120) ||
    !text(value.subtitle, 180) ||
    !text(value.introduction) ||
    !strings(value.steps, 4, 8, 100) ||
    !Array.isArray(value.questions) ||
    value.questions.length !== value.steps.length
  )
    return false;
  const ids = new Set<string>();
  if (value.experience !== undefined) {
    const exp = value.experience;
    if (
      !object(exp) ||
      !object(exp.objectives) ||
      !object(exp.tests) ||
      !Array.isArray(exp.diagnostic) ||
      ![0, 2].includes(exp.diagnostic.length) ||
      !Array.isArray(exp.final) ||
      exp.final.length !== value.questions.length
    )
      return false;
    const objectives = exp.objectives,
      tests = exp.tests,
      final = exp.final,
      questions = value.questions;
    const assessmentValid = (a: any, q: any) =>
      object(a) &&
      text(a.id, 140) &&
      a.type === 'choice' &&
      text(a.task, 360) &&
      strings(a.options, 3, 3) &&
      new Set(a.options).size === 3 &&
      strings(a.correct, 1, 1) &&
      a.options.includes(a.correct[0]!) &&
      text(a.explanation) &&
      strings(a.optionFeedback, 3, 3, 500) &&
      (!a.visualSnapshot ||
        (q.teaching?.diagram?.visual &&
          validVisualSpec(q.teaching.diagram.visual) &&
          validModelState(q.teaching.diagram.visual, a.visualSnapshot)));
    if (
      !questions.every((q: any, i: number) => {
        const items = tests[q.id];
        return (
          text(objectives[q.id], 240) &&
          Array.isArray(items) &&
          items.length >= 1 &&
          items.length <= 3 &&
          items.every((a: any) => assessmentValid(a, q) && a.task !== q.task) &&
          final[i]?.conceptId === q.id &&
          assessmentValid(final[i]?.question, q)
        );
      })
    )
      return false;
    if (
      !exp.diagnostic.every((a: any, i: number) =>
        assessmentValid(a, questions[Math.min(i, questions.length - 1)]),
      )
    )
      return false;
    const allIds = [
      ...value.questions,
      ...Object.values(exp.tests).flat(),
      ...exp.diagnostic,
      ...exp.final.map((x: any) => x.question),
    ].map((x: any) => x.id);
    if (new Set(allIds).size !== allIds.length) return false;
  }
  return value.questions.every((q, i, qs) => {
    if (
      !object(q) ||
      !text(q.id, 120) ||
      ids.has(q.id) ||
      q.type !== 'choice' ||
      !text(q.task, 360) ||
      !text(q.concept, 100) ||
      !strings(q.options, 3, 3) ||
      new Set(q.options).size !== 3 ||
      !strings(q.correct, 1, 1) ||
      !q.options.includes(q.correct[0]!) ||
      !text(q.explanation) ||
      !strings(q.optionFeedback, 3, 3, 500) ||
      !strings(q.hints, 2, 2, 900) ||
      !Array.isArray(q.pages) ||
      q.pages.length ||
      q.retry !== 'retry-worked-skip' ||
      q.next !== (i === qs.length - 1 ? 'recap' : qs[i + 1]?.id)
    )
      return false;
    ids.add(q.id);
    const t = q.teaching;
    if (
      !object(t) ||
      !text(t.introduction) ||
      !text(t.demonstration) ||
      !text(t.simpler) ||
      !text(t.example) ||
      !validDiagram(t.diagram)
    )
      return false;
    if (
      q.visualSnapshot &&
      (!t.diagram.visual || !validModelState(t.diagram.visual, q.visualSnapshot))
    )
      return false;
    const f = t.followup;
    return (
      object(f) &&
      text(f.task, 360) &&
      f.task !== q.task &&
      strings(f.options, 3, 3) &&
      new Set(f.options).size === 3 &&
      strings(f.correct, 1, 1) &&
      f.options.includes(f.correct[0]!) &&
      text(f.explanation) &&
      strings(f.optionFeedback, 3, 3, 500) &&
      (!f.visualSnapshot ||
        (t.diagram.visual && validModelState(t.diagram.visual, f.visualSnapshot)))
    );
  });
}
export function integralArea(area: NonNullable<TopicDiagram['area']>) {
  const { slope, upper, slices } = area;
  return {
    exact: (slope * upper * upper) / 2,
    left: (slope * upper * upper * (slices - 1)) / (2 * slices),
  };
}

/** An honest offline hint, labelled as saved content and tied to the current diagram. */
export function savedTopicExplanation(
  lesson: Lesson,
  q: Question,
  prompt: string,
  diagram: TopicDiagram,
) {
  const t = q.teaching;
  if (!t) return null;
  const words = new Set(
    (q.concept + ' ' + diagram.labels.join(' ') + ' ' + diagram.caption)
      .toLowerCase()
      .match(/[a-z]{4,}/g) ?? [],
  );
  const normalized = prompt.toLowerCase();
  if (
    !/simpler|simply|example|understand|this|that|repeat|continue|previous|go back/.test(
      normalized,
    ) &&
    ![...words].some((word) => normalized.includes(word))
  )
    return null;
  const current = diagram.area
    ? (() => {
        const a = diagram.area,
          totals = integralArea(a);
        return `Current model: f(x) = ${a.slope}x on [0, ${a.upper}], with ${a.slices} left-endpoint rectangles. The left sum is ${Number(totals.left.toFixed(6))} and the exact integral is ${Number(totals.exact.toFixed(6))}.`;
      })()
    : diagram.visual && diagram.runtime
      ? `${visualScene(diagram.visual, diagram.runtime).description} Current parameters: ${diagram.runtime.values.map(p => `${p.id}=${p.value}`).join(', ') || 'no numeric parameters'}.`
      : diagram.caption;
  return {
    text: `${t.introduction} ${/simpler|simply|understand/.test(normalized) ? t.simpler : `Worked example: ${t.demonstration}`} ${current}`,
    label:
      lesson.origin === 'generated'
        ? 'From your AI-generated lesson'
        : diagram.area ? 'Prepared mathematics explanation' : 'Prepared lesson explanation',
    target: null,
  };
}
