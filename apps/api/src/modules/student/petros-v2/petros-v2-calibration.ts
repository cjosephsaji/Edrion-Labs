/** Qualification preparation only. Human labels and authority receipts must come from independent reviewers. */
import { z } from 'zod';
export const m4CalibrationLabelSchema = z
  .object({
    responseId: z.string().uuid(),
    subjectId: z.string().uuid(),
    criterionId: z.string().uuid(),
    human: z.enum(['satisfied', 'not_satisfied', 'ambiguous']),
    evaluated: z.enum(['satisfied', 'not_satisfied', 'abstained']),
    reviewerReceiptId: z.string().uuid(),
    critical: z.boolean(),
  })
  .strict();
/** One-sided exact Clopper–Pearson bound, found from the binomial CDF. */
export function criticalFalseAcceptanceUpper(accepted: number, incorrect: number, alpha = 0.05) {
  if (incorrect === 0 || accepted === incorrect) return 1;
  if (accepted === 0) return 1 - Math.pow(alpha, 1 / incorrect);
  const cdf = (p: number) => {
    const logs: number[] = [];
    let combination = 0;
    for (let k = 0; k <= accepted; k++) {
      if (k > 0) combination += Math.log(incorrect - k + 1) - Math.log(k);
      logs.push(combination + k * Math.log(p) + (incorrect - k) * Math.log1p(-p));
    }
    const max = Math.max(...logs);
    return Math.exp(max) * logs.reduce((sum, v) => sum + Math.exp(v - max), 0);
  };
  let low = 0,
    high = 1;
  for (let i = 0; i < 70; i++) {
    const mid = (low + high) / 2;
    if (cdf(mid) > alpha) low = mid;
    else high = mid;
  }
  return high;
}
export function assessM4Calibration(raw: unknown) {
  const rows = z.array(m4CalibrationLabelSchema).max(100_000).parse(raw);
  const unique = new Set(rows.map((r) => `${r.responseId}:${r.criterionId}`));
  if (unique.size !== rows.length) throw new Error('DUPLICATE_CALIBRATION_LABEL');
  const responses = new Set(rows.map((r) => r.responseId)),
    subjects = new Set(rows.map((r) => r.subjectId));
  const byResponse = new Map<string, typeof rows>();
  for (const row of rows)
    byResponse.set(row.responseId, [...(byResponse.get(row.responseId) ?? []), row]);
  const correct = new Set(
    [...byResponse]
      .filter(([, labels]) => labels.every((r) => r.human === 'satisfied'))
      .map(([id]) => id),
  );
  const incorrect = new Set(
    [...byResponse]
      .filter(([, labels]) => labels.some((r) => r.human === 'not_satisfied'))
      .map(([id]) => id),
  );
  // Correlated criteria from one response cannot inflate the binomial denominator.
  const critical = new Map<string, boolean>();
  for (const row of rows.filter((r) => r.critical && r.human === 'not_satisfied'))
    critical.set(
      row.responseId,
      (critical.get(row.responseId) ?? false) || row.evaluated === 'satisfied',
    );
  const falseAcceptance = [...critical.values()].filter(Boolean).length;
  const agreed = rows.filter((r) =>
    r.human === 'ambiguous' ? r.evaluated === 'abstained' : r.evaluated === r.human,
  ).length;
  const agreement = rows.length ? agreed / rows.length : 0,
    upper = criticalFalseAcceptanceUpper(falseAcceptance, critical.size);
  return {
    responses: responses.size,
    subjects: subjects.size,
    correct: correct.size,
    incorrect: incorrect.size,
    criterionAgreement: agreement,
    criticalIncorrect: critical.size,
    criticalFalseAcceptance: falseAcceptance,
    oneSided95Upper: upper,
    engineeringMetricsPass:
      responses.size >= 500 &&
      subjects.size >= 2 &&
      correct.size >= 200 &&
      incorrect.size >= 200 &&
      agreement >= 0.95 &&
      upper <= 0.02,
    qualification: 'independent_reviewer_authority_and_dataset_review_required' as const,
  };
}
