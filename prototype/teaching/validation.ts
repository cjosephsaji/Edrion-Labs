import type { Question } from './types';
export type Validation =
  | 'correct'
  | 'incorrect'
  | 'partial'
  | 'unclear'
  | 'unverified';
/** One response evaluator for practice, diagnostics and independent checks. */
export function validateResponse(q: Question, raw: string): Validation {
  const response = raw.trim();
  if (!response) return 'unclear';
  if (q.type === 'text') return 'unverified';
  if (q.type === 'number') {
    if (!Number.isFinite(Number(response))) return 'unclear';
    return q.correct.some((v) => Number(v) === Number(response))
      ? 'correct'
      : 'incorrect';
  }
  const values = q.type === 'multi' ? response.split('|') : [response];
  if (
    new Set(values).size !== values.length ||
    values.some((v) => !q.options.includes(v))
  )
    return 'unclear';
  if (q.type === 'multi') {
    if (
      JSON.stringify([...values].sort()) ===
      JSON.stringify([...q.correct].sort())
    )
      return 'correct';
    return values.some((v) => q.correct.includes(v)) ? 'partial' : 'incorrect';
  }
  return q.correct.includes(response) ? 'correct' : 'incorrect';
}
