'use client';
import type { Lesson, Patch, ShowcaseState } from '../teaching/types';
import { teachingPlan } from '../teaching/curriculum';
import { useLessonController } from '../teaching/use-lesson-controller';
import styles from './teaching-cycle.module.css';

/** One readable Petros teaching surface and response interface, rendered beside either diagram. */
export function TeachingCycle({
  state,
  lesson,
  patch,
}: {
  state: ShowcaseState;
  lesson: Lesson;
  patch: Patch;
}) {
  const c = useLessonController(state, lesson, patch),
    plan = teachingPlan(state, lesson, c.base);
  const status = state.teaching.status;
  const ready = status === 'READY_TO_CONTINUE',
    awaiting = status === 'AWAITING_RESPONSE';
  const feedbackOnly = ready || status === 'RETEACHING';
  const disabled =
    state.paused ||
    !!state.pendingRequest ||
    status === 'INTERRUPTED' ||
    status === 'RESUMING';
  const last = state.observations[c.base.id]?.responses.at(-1);
  const text =
    status === 'INTRODUCING'
      ? plan.introduction
      : status === 'DEMONSTRATING'
        ? plan.demonstration
        : status === 'RETEACHING'
          ? plan.simpler
          : status === 'CHECKING_UNDERSTANDING'
            ? 'Your turn. Use the highlighted example to make a prediction. I’ll wait for your response.'
            : '';
  const action = (name: 'demonstrate' | 'check' | 'answer') => c.teach(name);
  return (
    <section
      className={styles.cycle}
      aria-label="Student-paced teaching"
      data-teaching-state={status}
      data-question={state.questionId}
      data-last-validation={last?.validation ?? ''}
      data-response-count={state.observations[c.base.id]?.responses.length ?? 0}
      data-retries={state.observations[c.base.id]?.retries ?? 0}
    >
      <div className={styles.meta}>
        <span>
          Petros · {c.qi + 1}/{lesson.questions.length} · {c.base.concept}
        </span>
        <span>{status.replaceAll('_', ' ').toLowerCase()}</span>
      </div>
      {text && <p className={styles.explanation}>{text}</p>}
      {state.lastFeedback && feedbackOnly && (
        <p className={styles.feedback} role="status">
          {state.lastFeedback}
        </p>
      )}
      {status === 'INTRODUCING' && (
        <button disabled={disabled} onClick={() => action('demonstrate')}>
          Show me
        </button>
      )}
      {status === 'DEMONSTRATING' && (
        <button disabled={disabled} onClick={() => action('check')}>
          Let me try
        </button>
      )}
      {status === 'CHECKING_UNDERSTANDING' && (
        <>
          <h2>{c.q.task}</h2>
          <button disabled={disabled} onClick={() => action('answer')}>
            I’m ready to answer
          </button>
        </>
      )}
      {status === 'RETEACHING' && (
        <>
          <p className={styles.example}>
            {state.teaching.variant === 'second-example'
              ? 'Second worked example'
              : 'Simpler example'}{' '}
            · {plan.example}
          </p>
          <button disabled={disabled} onClick={() => action('check')}>
            Try a follow-up
          </button>
        </>
      )}
      {awaiting && (
        <>
          <h2>{c.q.task}</h2>
          {c.q.type === 'text' ? (
            <textarea
              rows={2}
              aria-label="Your explanation"
              maxLength={2000}
              value={state.studentResponse}
              placeholder="Explain your reasoning…"
              disabled={disabled}
              onChange={(e) =>
                patch({ studentResponse: e.target.value, cue: null })
              }
            />
          ) : c.q.type === 'number' ? (
            <label>
              Your value{' '}
              <input
                aria-label="Practice value"
                inputMode="decimal"
                value={state.studentResponse}
                maxLength={16}
                disabled={disabled}
                onChange={(e) =>
                  patch({ studentResponse: e.target.value, cue: null })
                }
              />
            </label>
          ) : (
            <div
              className={styles.choices}
              role="group"
              aria-label="Practice choices"
            >
              {c.q.options.map((option) => (
                <button
                  key={option}
                  disabled={disabled}
                  aria-pressed={state.studentResponse
                    .split('|')
                    .includes(option)}
                  onClick={() => c.choose(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
          {state.lastFeedback && <p role="status">{state.lastFeedback}</p>}
          <button
            className={styles.primary}
            disabled={disabled || !state.studentResponse.trim()}
            onClick={c.check}
          >
            {c.q.type === 'text'
              ? 'Record explanation'
              : 'Check practice answer'}
          </button>
        </>
      )}
      {ready && (
        <div className={styles.actions}>
          {last?.validation === 'correct' && (
            <button
              className={styles.primary}
              disabled={disabled}
              onClick={() => c.next()}
            >
              Continue
            </button>
          )}
          <button disabled={disabled} onClick={() => c.teach('practice')}>
            More practice
          </button>
        </div>
      )}
      {status === 'INTERRUPTED' && (
        <p>
          The lesson is paused at this checkpoint. Your diagram and response are
          preserved.
        </p>
      )}
      {status === 'RESUMING' && (
        <p>
          Your checkpoint is ready. Resume the same teaching step when you are
          ready.
        </p>
      )}
      <div className={styles.help}>
        <button disabled={disabled} onClick={() => c.teach('simpler')}>
          Explain more simply
        </button>
        <button disabled={disabled} onClick={() => c.teach('example')}>
          Another example
        </button>
        <button disabled={disabled} onClick={() => c.teach('repeat')}>
          Replay explanation
        </button>
      </div>
      <div className={styles.controls}>
        <button
          disabled={disabled || c.qi === 0}
          onClick={() => c.question(c.qi - 1)}
        >
          Previous checkpoint
        </button>
        <button disabled={disabled} onClick={() => c.next('self-reported')}>
          I understand, continue
        </button>
        <button disabled={disabled} onClick={() => c.next('skipped')}>
          Skip this concept
        </button>
      </div>
      <small>
        Prepared teaching · deterministic practice ·{' '}
        {last?.validation === 'unverified'
          ? 'explanation unverified'
          : 'no academic grade'}
      </small>
    </section>
  );
}
