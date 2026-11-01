import type { Lesson, Question, ShowcaseState } from './types';
import type { Validation } from './validation';
import { conceptProgress } from './progress';
export type Intervention =
  | 'prerequisite'
  | 'wrong-rule'
  | 'unsupported-conclusion'
  | 'partial'
  | 'repeated'
  | 'clarify'
  | 'independent';
export type Achievement =
  | 'Not assessed'
  | 'Learning'
  | 'Needs practice'
  | 'Verified now'
  | 'Retained';
export interface LearningAttempt {
  id: string;
  conceptId: string;
  questionId: string;
  kind: 'apply' | 'diagnostic' | 'test' | 'final';
  response: string;
  validation: Validation;
  assisted: boolean;
  assistance: string[];
  attempt: number;
  independent: boolean;
  skipped: boolean;
  intervention: Intervention | null;
  submittedAt: number;
}
export interface LearningEvidence {
  version: 1;
  attempts: LearningAttempt[];
  visited: string[];
  exposed: string[];
  skipped: string[];
  diagnostic: 'not-assessed' | 'skipped' | 'completed';
  startingPoint: 'standard' | 'foundation' | 'application' | 'rule-repair';
}
export function emptyEvidence(): LearningEvidence {
  return {
    version: 1,
    attempts: [],
    visited: [],
    exposed: [],
    skipped: [],
    diagnostic: 'not-assessed',
    startingPoint: 'standard',
  };
}
export function visitConcept(s: ShowcaseState, id: string) {
  const e = s.evidence ?? emptyEvidence();
  return { ...e, visited: [...new Set([...e.visited, id])] };
}
export function assistance(s: ShowcaseState, kind: string): ShowcaseState {
  if (!s.learning) return s;
  return {
    ...s,
    learning: {
      ...s.learning,
      assisted: true,
      helpUsed: [...(s.learning.helpUsed ?? []), kind],
    },
    // The per-attempt list is kept apart from the navigation checkpoint.
    evidence: s.evidence ?? emptyEvidence(),
    observations:
      s.questionId && s.observations[s.questionId]
        ? {
            ...s.observations,
            [s.questionId]: {
              ...s.observations[s.questionId]!,
              assistance: [...s.observations[s.questionId]!.assistance, kind],
            },
          }
        : s.observations,
  };
}
export function interventionFor(
  q: Question,
  response: string,
  validation: Validation,
  attempts: number,
): Intervention | null {
  if (validation === 'unclear' || validation === 'unverified') return 'clarify';
  if (validation === 'correct') return null;
  if (attempts >= 3) return 'repeated';
  if (validation === 'partial') return 'partial';
  return q.errorCategories?.[response] ?? null;
}
export function recordAttempt(
  s: ShowcaseState,
  q: Question,
  conceptId: string,
  validation: Validation,
): LearningEvidence {
  const e = s.evidence ?? emptyEvidence();
  const prior = e.attempts.filter((a) => a.questionId === q.id);
  const kind =
    s.learning?.activity === 'diagnostic'
      ? 'diagnostic'
      : s.learning?.activity === 'final'
        ? 'final'
        : s.learning?.stage === 'test'
          ? 'test'
          : 'apply';
  const assisted =
    !!s.learning?.assisted || (kind === 'apply' && s.permittedHintLevel > 0);
  const independent =
    ['test', 'final'].includes(kind) &&
    !!s.learning?.fresh &&
    !assisted &&
    prior.length === 0;
  const attempt: LearningAttempt = {
    id: crypto.randomUUID(),
    conceptId,
    questionId: q.id,
    kind,
    response: s.studentResponse.trim(),
    validation,
    assisted,
    assistance: assisted
      ? [...(s.learning?.helpUsed ?? []), 'help-used-this-attempt']
      : [],
    attempt: prior.length + 1,
    independent,
    skipped: false,
    intervention:
      independent && validation === 'correct'
        ? 'independent'
        : interventionFor(
            q,
            s.studentResponse.trim(),
            validation,
            e.attempts.filter(
              (a) =>
                a.conceptId === conceptId &&
                a.kind !== 'diagnostic' &&
                ['incorrect', 'partial'].includes(a.validation),
            ).length + 1,
          ),
    submittedAt: Date.now(),
  };
  return { ...e, attempts: [...e.attempts, attempt] };
}
export function conceptEvidence(s: ShowcaseState, lesson: Lesson) {
  const e = s.evidence ?? emptyEvidence();
  const groups = new Map<string, { ids: string[]; questionIndex: number }>();
  lesson.questions.forEach((q, questionIndex) => {
    const label = conceptProgress(lesson, questionIndex).label ?? q.concept;
    const existing = groups.get(label);
    if (existing) existing.ids.push(q.id);
    else groups.set(label, { ids: [q.id], questionIndex });
  });
  return [...groups.entries()].map(([concept, group]) => {
    const attempts = e.attempts.filter(
      (a) => group.ids.includes(a.conceptId) && a.kind !== 'diagnostic',
    );
    const checks = attempts.filter(
      (a) => a.independent && !a.skipped && ['test', 'final'].includes(a.kind),
    );
    const verified = group.ids.every(
      (id) =>
        checks.filter((a) => a.conceptId === id).at(-1)?.validation ===
        'correct',
    );
    const visited = group.ids.some((id) => e.visited.includes(id));
    const needsPractice =
      !verified &&
      attempts.some(
        (a) => ['incorrect', 'partial'].includes(a.validation) || a.assisted,
      );
    const status: Achievement = verified
      ? 'Verified now'
      : needsPractice
        ? 'Needs practice'
        : visited
          ? 'Learning'
          : 'Not assessed';
    return {
      id: group.ids[0]!,
      questionIndex: group.questionIndex,
      concept,
      visited,
      verified,
      needsPractice,
      skipped: group.ids.some((id) => e.skipped.includes(id)),
      status,
      attempts,
    };
  });
}
export function progressSummary(s: ShowcaseState, lesson: Lesson) {
  const concepts = conceptEvidence(s, lesson);
  return {
    concepts,
    visited: concepts.filter((c) => c.visited).length,
    verified: concepts.filter((c) => c.verified).length,
    practice: concepts.filter((c) => c.needsPractice).length,
    unverified: concepts.filter((c) => c.visited && !c.verified).length,
    skipped: concepts.filter((c) => c.skipped).length,
  };
}
/** Display one result per mixed question while preserving every raw attempt. */
export function mixedCheckResults(s: ShowcaseState) {
  const attempts = s.evidence?.attempts.filter((a) => a.kind === 'final') ?? [];
  const grouped = new Map<string, LearningAttempt[]>();
  for (const attempt of attempts)
    grouped.set(attempt.questionId, [
      ...(grouped.get(attempt.questionId) ?? []),
      attempt,
    ]);
  const questions = [...grouped.values()].map((entries) => ({
    ...entries.at(-1)!,
    assisted: entries.some((a) => a.assisted),
    independentCorrect: entries.some(
      (a) => a.independent && !a.skipped && a.validation === 'correct',
    ),
  }));
  return {
    questions,
    correct: questions.filter((q) => q.independentCorrect).length,
    assisted: questions.filter((q) => q.assisted).length,
    skipped: questions.filter((q) => q.skipped).length,
  };
}
export function validEvidence(value: unknown): value is LearningEvidence {
  if (!value || typeof value !== 'object') return false;
  const e = value as LearningEvidence;
  const ids = (v: unknown) =>
    Array.isArray(v) &&
    v.length <= 3000 &&
    v.every((x) => typeof x === 'string' && x.length < 200);
  return (
    e.version === 1 &&
    ids(e.visited) &&
    ids(e.exposed) &&
    ids(e.skipped) &&
    ['not-assessed', 'skipped', 'completed'].includes(e.diagnostic) &&
    ['standard', 'foundation', 'application', 'rule-repair'].includes(
      e.startingPoint,
    ) &&
    Array.isArray(e.attempts) &&
    e.attempts.length <= 3000 &&
    e.attempts.every(
      (a) =>
        typeof a.id === 'string' &&
        typeof a.conceptId === 'string' &&
        typeof a.questionId === 'string' &&
        typeof a.response === 'string' &&
        a.response.length <= 2500 &&
        ['apply', 'diagnostic', 'test', 'final'].includes(a.kind) &&
        ['correct', 'incorrect', 'partial', 'unclear', 'unverified'].includes(
          a.validation,
        ) &&
        typeof a.assisted === 'boolean' &&
        typeof a.independent === 'boolean' &&
        typeof a.skipped === 'boolean' &&
        Array.isArray(a.assistance) &&
        a.assistance.every((v) => typeof v === 'string') &&
        Number.isInteger(a.attempt) &&
        a.attempt > 0 &&
        Number.isFinite(a.submittedAt) &&
        (!a.independent || (!a.assisted && ['test', 'final'].includes(a.kind))),
    )
  );
}
