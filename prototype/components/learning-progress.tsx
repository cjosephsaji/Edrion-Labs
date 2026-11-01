'use client';
import type { Lesson, Patch, ShowcaseState } from '../teaching/types';
import {
  mixedCheckResults,
  progressSummary,
} from '../teaching/learning-evidence';
import { goToCheckpoint, startFinalAssessment } from '../teaching/checkpoint';
import s from './learning-evidence.module.css';
export function LearningProgress({
  state,
  lesson,
}: {
  state: ShowcaseState;
  lesson: Lesson;
}) {
  const p = progressSummary(state, lesson);
  return (
    <div
      className={s.progress}
      aria-label="Learning evidence"
      aria-live="polite"
    >
      <span>
        <strong>{p.visited}</strong> visited
      </span>
      <span>
        <strong>{p.verified}</strong> verified now
      </span>
      <span>
        <strong>{p.practice}</strong> need practice
      </span>
      <span>
        <strong>{p.unverified}</strong> visited, unverified
      </span>
    </div>
  );
}
export function LearningSummary({
  state,
  lesson,
  patch,
  onHome,
}: {
  state: ShowcaseState;
  lesson: Lesson;
  patch: Patch;
  onHome: () => void;
}) {
  const p = progressSummary(state, lesson);
  const final = mixedCheckResults(state);
  const remaining = lesson.experience?.final.some(
    (e) => !state.evidence?.exposed.includes(e.question.id),
  );
  return (
    <section className={s.summary} aria-label="Learning summary">
      <span className={s.eyebrow}>YOUR LEARNING EVIDENCE</span>
      <h2>What you can apply, and what to revisit.</h2>
      <LearningProgress state={state} lesson={lesson} />
      <p>
        {p.skipped} concepts skipped. Starting knowledge:{' '}
        {state.evidence?.diagnostic === 'completed'
          ? 'two-question diagnostic completed'
          : 'not assessed'}
        . These records belong to this browser tab.
      </p>
      {remaining && (
        <div className={s.assessmentOffer}>
          <strong>Try the mixed knowledge check</strong>
          <p>
            {lesson.experience!.final.length} fresh applications from this lesson.
            Help is allowed and recorded; assisted answers do not count as
            independent.
          </p>
          <button
            onClick={() =>
              patch((current) => startFinalAssessment(current, lesson))
            }
          >
            Start knowledge check
          </button>
        </div>
      )}
      {final.questions.length > 0 && (
        <p role="status">
          Mixed check: {final.correct} of {final.questions.length} questions
          answered correctly and independently. {final.assisted} assisted;{' '}
          {final.skipped} skipped.
        </p>
      )}
      {!lesson.experience && (
        <p>
          Independent assessment has not been authored for this lesson. Its
          practice observations remain unverified.
        </p>
      )}
      <p>
        “Verified now” means a fresh unassisted application in this session.
        “Retained” requires a separate delayed check; this prototype does not
        award it here.
      </p>
      <div className={s.conceptList}>
        {p.concepts.map((c) => (
          <div key={c.id}>
            <span>
              <strong>{c.concept}</strong>
              <small>
                {c.status}
                {c.skipped ? ' · skipped' : ''} · {c.attempts.length} submitted
                attempts
              </small>
            </span>
            <button
              onClick={() =>
                patch((current) =>
                  goToCheckpoint(current, lesson, c.questionIndex, true),
                )
              }
            >
              Review {c.needsPractice ? 'weak area' : 'concept'}
            </button>
          </div>
        ))}
      </div>
      <button onClick={onHome}>Choose another lesson</button>
    </section>
  );
}
