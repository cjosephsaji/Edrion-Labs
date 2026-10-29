import type { Question, Phase, ResponseType } from '../teaching/types';
export function q(
  prefix: string,
  n: number,
  task: string,
  options: string[],
  correct: string[],
  pages: number[],
  concept: string,
  explanation: string,
  type: ResponseType = 'choice',
  hints?: [string, string],
): Question {
  const phase: Phase =
    n === 1
      ? 'introduce'
      : n < 4
        ? 'demonstrate'
        : n === 12 || type === 'text'
          ? 'explain'
          : 'interact';
  return {
    id: `${prefix}-Q${String(n).padStart(2, '0')}`,
    task,
    options,
    correct,
    pages,
    phase,
    concept,
    explanation,
    type,
    misconception: `${concept}: selected response does not follow the demonstrated relationship`,
    hints: hints ?? [
      `Focus on ${concept.toLowerCase()}. ${explanation.split('. ')[0]}.`,
      explanation,
    ],
    retry: 'retry-worked-skip',
    next:
      n === 12 || type === 'text'
        ? 'recap'
        : `${prefix}-Q${String(n + 1).padStart(2, '0')}`,
  };
}
