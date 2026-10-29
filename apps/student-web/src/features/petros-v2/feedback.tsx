import type { M4Snapshot } from '@edrion/schemas';
import {
  Badge,
  BookOpen,
  Circle,
  CircleDashed,
  CircleDot,
  Clock3,
  MessageSquareText,
  PencilLine,
  Save,
  type LucideIcon,
} from 'lucide-react';
import {
  criterionState,
  currentEvaluation,
  feedbackLabels,
  feedbackSummary,
  type PublicCriterion,
  type FeedbackState,
} from './feedback-state';
import styles from './feedback.module.css';
const icons: Record<FeedbackState, LucideIcon> = {
  'not-selected': Circle,
  selected: CircleDot,
  saved: Save,
  pending: Clock3,
  correct: Badge,
  incorrect: PencilLine,
  partial: CircleDashed,
  review: MessageSquareText,
  assisted: BookOpen,
};
function FeedbackIcon({ state }: { state: FeedbackState }) {
  const Icon = icons[state];
  return <Icon className={styles.icon} size={14} strokeWidth={1.75} aria-hidden="true" />;
}
export function FeedbackBadge({ state, label }: { state: FeedbackState; label?: string }) {
  return (
    <span className={`${styles.scope} ${styles.badge}`} data-feedback={state}>
      <FeedbackIcon state={state} />
      {label ?? feedbackLabels[state]}
    </span>
  );
}
export function CriterionFeedback({
  snapshot,
  criterion,
}: {
  snapshot: M4Snapshot;
  criterion: PublicCriterion;
}) {
  const state = criterionState(snapshot, criterion);
  return (
    <div
      className={`${styles.scope} ${styles.criterion}`}
      data-feedback={state}
      data-criterion={criterion.criterionId}
      id={`feedback-${criterion.criterionId}`}
    >
      <strong>
        <FeedbackIcon state={state} />
        {criterion.label}
      </strong>{' '}
      · <span>{feedbackLabels[state]}</span>
      <p>{criterion.feedback}</p>
    </div>
  );
}
export function ResponseFeedback({
  snapshot: s,
  inlineIds = [],
}: {
  snapshot: M4Snapshot;
  inlineIds?: string[];
}) {
  const summary = feedbackSummary(s),
    e = s.evaluation?.responseId === s.submission?.id ? s.evaluation : null;
  return (
    <div
      className={`${styles.scope} ${styles.panel}`}
      data-feedback={summary.state}
      aria-label="Response feedback"
    >
      <h3 aria-live="polite" aria-atomic="true">
        {summary.label}
      </h3>
      <p>
        {currentEvaluation(s)?.status === 'evaluated'
          ? 'Deterministically checked'
          : 'Correctness is not fully established.'}
      </p>
      {s.assistance === 'assisted' && (
        <FeedbackBadge
          state="assisted"
          label="Assisted practice · separate from independent verification"
        />
      )}
      {e && (
        <div className={styles.list}>
          {e.criteria
            .filter((c) => !inlineIds.includes(c.criterionId))
            .map((c) => (
              <CriterionFeedback snapshot={s} criterion={c} key={c.criterionId} />
            ))}
        </div>
      )}
      {summary.state === 'partial' || summary.state === 'incorrect' ? (
        <p>
          {summary.state === 'partial' ? 'Keep the parts that passed. ' : ''}
          Review the marked criterion, then work on it with Petros.
        </p>
      ) : summary.state === 'review' ? (
        <p>
          Your explanation is saved for teacher review. Checked factual parts remain marked
          individually.
        </p>
      ) : summary.state === 'pending' ? (
        <p>Your work is saved. Wait for evaluation or check the saved lesson.</p>
      ) : s.evaluation?.status === 'unavailable' ? (
        <p>
          Your answer is saved. Feedback is unavailable, so correctness has not been established.
        </p>
      ) : (
        <p>Review the checked parts, then continue with the next available learning step.</p>
      )}
      <details>
        <summary>About this feedback</summary>
        <p>
          This is a learning observation. A single answer does not establish mastery. Only the
          current authorized evaluation can verify a criterion.
        </p>
      </details>
    </div>
  );
}
