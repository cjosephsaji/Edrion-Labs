import type { M4Snapshot, M4Evaluation } from '@edrion/schemas';
export type FeedbackState =
  | 'not-selected'
  | 'selected'
  | 'saved'
  | 'pending'
  | 'correct'
  | 'incorrect'
  | 'partial'
  | 'review'
  | 'assisted';
export const feedbackLabels: Record<FeedbackState, string> = {
  'not-selected': 'Not selected',
  selected: 'Selected · not submitted',
  saved: 'Saved · not evaluated',
  pending: 'Pending evaluation',
  correct: 'Correct',
  incorrect: 'Incorrect · needs another look',
  partial: 'Partially correct',
  review: 'Teacher review needed',
  assisted: 'Assisted practice',
};
export type PublicCriterion = M4Evaluation['criteria'][number];
/** Presentation of authorized public results. No answer content is scored here. */
export function currentEvaluation(s: M4Snapshot) {
  const e = s.teaching ? null : s.evaluation;
  return s.submission?.status === 'complete' &&
    e?.responseId === s.submission.id &&
    e.criteria.length > 0 &&
    ((e.status === 'evaluated' &&
      e.criteria.every((c) => c.origin === 'trusted_kernel' && c.status !== 'abstained')) ||
      (e.status === 'review_required' && e.criteria.some((c) => c.status === 'abstained')))
    ? e
    : null;
}
export function criterionState(s: M4Snapshot, c: PublicCriterion): FeedbackState {
  if (!currentEvaluation(s))
    return s.evaluation?.status === 'review_required'
      ? 'review'
      : s.evaluation?.status === 'unavailable'
        ? 'saved'
        : 'pending';
  return c.origin !== 'trusted_kernel' || c.status === 'abstained'
    ? 'review'
    : c.status === 'satisfied'
      ? 'correct'
      : 'incorrect';
}
export function feedbackSummary(s: M4Snapshot): {
  state: FeedbackState;
  label: string;
} {
  const e = currentEvaluation(s);
  if (!e && s.evaluation?.status === 'unavailable')
    return { state: 'saved', label: 'Feedback unavailable' };
  if (!e)
    return {
      state: 'pending',
      label:
        s.evaluation?.status === 'review_required' ? feedbackLabels.review : 'Feedback pending',
    };
  const passed = e.criteria.filter((c) => criterionState(s, c) === 'correct').length;
  const failed = e.criteria.filter((c) => criterionState(s, c) === 'incorrect').length;
  if (e.status === 'review_required') return { state: 'review', label: 'Teacher review needed' };
  if (passed && failed)
    return {
      state: 'partial',
      label: `Partially correct — ${passed} of ${e.criteria.length} checked parts passed`,
    };
  return passed === e.criteria.length
    ? { state: 'correct', label: 'Correct — all checked parts passed' }
    : {
        state: 'incorrect',
        label: 'Needs another look — checked criteria not yet met',
      };
}
export function criteriaFor(s: M4Snapshot, target: { fieldId?: string; elementId?: string }) {
  // No positional or label matching: locations come from the private evaluator's safe public projection.
  return (
    !s.teaching && s.evaluation?.responseId === s.submission?.id
      ? (s.evaluation?.criteria ?? [])
      : []
  ).filter((c) =>
    target.fieldId
      ? c.target?.fieldId === target.fieldId
      : !!target.elementId && !!c.target?.elementIds?.includes(target.elementId),
  );
}
