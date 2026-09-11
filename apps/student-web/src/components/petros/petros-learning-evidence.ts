import type { PetrosLearningSessionDocument } from '@edrion/schemas';

/** Completion and reading time never count as evidence of understanding. */
export function learningEvidence(document: PetrosLearningSessionDocument | null) {
  const questions = document?.blocks.flatMap((block) => block.questions) ?? [];
  const roots = new Set(questions.map((question) => question.rootQuestionId));
  let independent = 0;
  let supported = 0;
  let revisit = 0;
  for (const root of roots) {
    const attempts = questions.filter((question) => question.rootQuestionId === root)
      .flatMap((question) => question.attempts)
      .filter((attempt) => attempt.correctness !== 'invalid')
      .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
    if (!attempts.length) continue;
    const first = attempts[0]!;
    const last = attempts.at(-1)!;
    if (last.correctness !== 'correct') revisit += 1;
    else if (first.correctness === 'correct' && first.supportKind === 'none'
      && first.ladderLevel === 0 && !first.fragileSuccess && first.confidence !== 'guessing') independent += 1;
    else supported += 1;
  }
  return { independent, supported, revisit, checked: independent + supported + revisit };
}
