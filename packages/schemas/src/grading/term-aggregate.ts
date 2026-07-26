import type { SchemeSnapshot } from './types';

export type TermSubjectAggregateInput = {
  weighted_pct: number;
  grade_points: number | null;
  is_pass: boolean;
  credits: number | null;
  open_weight_pct: number;
};

export type TermAggregateResult = {
  termPct: number;
  termGpa: number | null;
  creditsEarned: number;
  creditsTotal: number;
  isComplete: boolean;
};

/** Shared term GPA / percentage rollup for Results recompute and report-card merge. */
export function computeTermAggregate(
  scheme: SchemeSnapshot,
  subjects: TermSubjectAggregateInput[],
): TermAggregateResult {
  let creditsEarned = 0;
  let creditsTotal = 0;
  let gpaNumerator = 0;
  let gpaDenominator = 0;
  let isComplete = true;
  let termPctSum = 0;
  let termPctCount = 0;

  for (const standing of subjects) {
    if (standing.open_weight_pct > 0) isComplete = false;
    termPctSum += standing.weighted_pct;
    termPctCount += 1;

    if (scheme.gpa_formula === 'credit_weighted' && standing.credits !== null && standing.grade_points !== null) {
      creditsTotal += standing.credits;
      if (standing.is_pass) creditsEarned += standing.credits;
      gpaNumerator += standing.grade_points * standing.credits;
      gpaDenominator += standing.credits;
    }
  }

  const termPct = termPctCount > 0 ? Math.round((termPctSum / termPctCount) * 100) / 100 : 0;
  const termGpa =
    scheme.gpa_formula === 'credit_weighted' && gpaDenominator > 0
      ? Math.round((gpaNumerator / gpaDenominator) * 100) / 100
      : scheme.gpa_formula === 'simple_average' && termPctCount > 0
        ? termPct
        : null;

  return { termPct, termGpa, creditsEarned, creditsTotal, isComplete };
}
