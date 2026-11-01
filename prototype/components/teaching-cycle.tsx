'use client';
import { useEffect, useRef, useState } from 'react';
import type { Lesson, Patch, ShowcaseState } from '../teaching/types';
import { teachingPlan } from '../teaching/curriculum';
import { useLessonController } from '../teaching/use-lesson-controller';
import { interrupt, resume } from '../teaching/controller';
import {
  beginConceptTest,
  skipDiagnostic,
  observation,
  teachAction,
} from '../teaching/checkpoint';
import { LearningProgress } from './learning-progress';
import { ReasoningBoard } from './reasoning-board';
import { conceptProgress } from '../teaching/progress';
import styles from './teaching-cycle.module.css';
import { MotionCaption } from '../world/cloud';

/** Shared teaching, assistance and response controls in Classic and World. */
export function TeachingCycle({
  state,
  lesson,
  patch,
  onAsk,
  interactionBlocked = false,
  teachingCaption,
  onFocusBoard,
}: {
  state: ShowcaseState;
  lesson: Lesson;
  patch: Patch;
  onAsk?: (text: string) => Promise<void>;
  interactionBlocked?: boolean;
  teachingCaption?: string;
  onFocusBoard?: () => void;
}) {
  const c = useLessonController(state, lesson, patch),
    plan = teachingPlan(state, lesson, c.base);
  const [help, setHelp] = useState<
    null | 'menu' | 'simpler' | 'repeat' | 'ask' | 'example'
  >(null);
  const helpButton = useRef<HTMLButtonElement>(null);
  const status =
    state.interruptionCheckpoint?.teaching.status ?? state.teaching.status;
  const ready = status === 'READY_TO_CONTINUE',
    awaiting = status === 'AWAITING_RESPONSE';
  const disabled = state.paused || !!state.pendingRequest || interactionBlocked;
  const last = state.observations[c.base.id]?.responses.at(-1);
  const progress = conceptProgress(lesson, c.qi);
  const activity = state.learning?.activity ?? 'lesson';
  const stage =
    state.learning?.stage ?? (awaiting || ready ? 'apply' : 'learn');
  const assessment = activity !== 'lesson';
  const tests = lesson.experience?.tests[c.base.id] ?? [];
  const freshTest = tests.some((q) => !state.evidence?.exposed.includes(q.id));
  const latestEvidence = state.evidence?.attempts.at(-1);
  const fresh =
    ready &&
    last?.validation === 'correct' &&
    !state.teaching.followup &&
    ['AI3-Q02', 'AI3-Q03'].includes(c.base.id);
  const caption =
    teachingCaption ??
    (status === 'INTRODUCING'
      ? (state.learning?.introduction ?? plan.introduction)
      : status === 'DEMONSTRATING'
        ? plan.demonstration
        : status === 'RETEACHING' && state.questionAttempt > 1
          ? `Let's work with a smaller example. ${plan.example}`
          : status === 'RETEACHING' || ready
            ? state.lastFeedback || plan.example
            : c.q.task);
  useEffect(() => {
    if (state.paused && state.interruptionCheckpoint && !help) setHelp('ask');
  }, [state.paused, state.interruptionCheckpoint, help]);
  function closeHelp() {
    if (state.pendingRequest) return;
    patch((current) => resume(current));
    setHelp(null);
    requestAnimationFrame(() => helpButton.current?.focus());
  }
  function openHelp() {
    if (help) return closeHelp();
    patch((current) => ({ ...interrupt(current, ''), pendingRequest: null }));
    setHelp('menu');
  }
  function assist(kind: 'simpler' | 'example' | 'repeat' | 'ask') {
    patch((current) => {
      const record = observation(current, lesson, c.base);
      const updated = {
        ...current,
        learning: current.learning
          ? {
              ...current.learning,
              assisted: true,
              helpUsed: [...(current.learning.helpUsed ?? []), kind],
            }
          : current.learning,
        permittedHintLevel: Math.max(1, current.permittedHintLevel),
        observations: {
          ...current.observations,
          [c.base.id]: {
            ...record,
            assistance:
              kind === 'example'
                ? record.assistance
                : [...record.assistance, kind],
          },
        },
      };
      return kind === 'example' && stage !== 'test'
        ? teachAction(resume(updated), lesson, 'example')
        : updated;
    });
    setHelp(kind === 'example' && stage !== 'test' ? null : kind);
  }
  return (
    <section
      className={styles.cycle}
      aria-label="Student-paced teaching"
      data-teaching-state={state.teaching.status}
      data-question={state.questionId}
      data-last-validation={last?.validation ?? ''}
      data-response-count={state.observations[c.base.id]?.responses.length ?? 0}
      data-retries={state.observations[c.base.id]?.retries ?? 0}
      data-help-open={!!help}
      data-renderer={state.mode}
      data-learning-stage={stage}
      data-learning-activity={activity}
    >
      <div className={styles.learningHeader}>
        <ol className={styles.stages} aria-label="Concept learning stages">
          {(['learn', 'apply', 'test'] as const).map((name) => (
            <li key={name} aria-current={stage === name ? 'step' : undefined}>
              <button disabled={disabled || (name === 'test' && (!ready || !freshTest))} aria-current={stage === name ? 'step' : undefined} onClick={() => name === 'test' ? patch(current => beginConceptTest(current, lesson)) : c.teach(name === 'learn' ? 'repeat' : 'check')}>{name}</button>
            </li>
          ))}
        </ol>
        {onFocusBoard && <button onClick={onFocusBoard}>Focus board</button>}
      </div>
      <p className={styles.objective}>
        <strong>
          {assessment
            ? activity === 'diagnostic'
              ? 'Starting knowledge'
              : 'Mixed knowledge check'
            : 'Your objective'}
        </strong>{' '}
        {assessment
          ? state.learning!.item +
            1 +
            ' of ' +
            (activity === 'diagnostic'
              ? lesson.experience!.diagnostic.length
              : lesson.experience!.final.length) +
            ' questions. Help is allowed and recorded.'
          : stage === 'test' ? 'Use the diagram and supplied facts to solve this fresh application.' : (lesson.experience?.objectives[c.base.id] ??
            'Apply the idea: ' + c.base.concept + '.')}
      </p>
      <LearningProgress state={state} lesson={lesson} />
      {activity === 'diagnostic' && (
        <button
          className={styles.quiet}
          disabled={disabled}
          onClick={() => patch((current) => skipDiagnostic(current, lesson))}
        >
          Skip diagnostic · start normally
        </button>
      )}
      <div className={styles.meta}>
        <span>
          {progress.label} · {progress.index} of {progress.total} concepts
        </span>
        <span>At your pace</span>
      </div>
      <div className={styles.voice}>
        <img
          src={`/petros/states/petros-${help ? 'listening' : 'idle'}.png`}
          alt="Petros, your teaching companion"
          width={66}
          height={88}
          draggable={false}
        />
        <div className={styles.cloud}>
          <span className={styles.speaker}>PETROS</span>
          {state.mode === 'world' ? (
            <MotionCaption
              paused={state.paused}
              text={caption}
              identity={`${state.sessionId}:${state.questionId}:${JSON.stringify(state.visualState.kind === 'tree' ? [state.visualState.example?.role, state.visualState.example?.values, state.visualState.transfer] : state.visualState.kind === 'network' ? [state.visualState.input, state.visualState.weight, state.visualState.target] : state.visualState.kind === 'clocks' ? [state.visualState.speed, state.visualState.earthYears] : state.visualState.kind)}`}
              role={ready || status === 'RETEACHING' ? 'status' : undefined}
            />
          ) : (
            <p role={ready || status === 'RETEACHING' ? 'status' : undefined}>
              {caption}
            </p>
          )}
          {(ready || status === 'RETEACHING') && last && (
            <small>
              Your answer: {last.response}
              {state.permittedHintLevel > 0 ? ' · with support' : ''}
            </small>
          )}
        </div>
      </div>
      <div className={styles.task}>
        {(ready || status === 'RETEACHING') && last && (
          <p className={styles.example}>{last.task ?? c.q.task}</p>
        )}
        {status === 'INTRODUCING' && (
          <button
            className={styles.primary}
            disabled={disabled}
            onClick={() => c.teach('demonstrate')}
          >
            Show me <span aria-hidden="true">→</span>
          </button>
        )}
        {status === 'DEMONSTRATING' && (
          <button
            className={styles.primary}
            disabled={disabled}
            onClick={() => c.teach('check')}
          >
            Your turn <span aria-hidden="true">→</span>
          </button>
        )}
        {status === 'CHECKING_UNDERSTANDING' && (
          <button
            className={styles.primary}
            disabled={disabled}
            onClick={() => c.teach('answer')}
          >
            Your turn
          </button>
        )}
        {status === 'RETEACHING' && (
          <>
            <button
              className={styles.primary}
              disabled={disabled}
              onClick={() => c.teach('check')}
            >
              {state.teaching.followup
                ? 'Try a new example'
                : 'Compare and try again'}{' '}
              <span aria-hidden="true">→</span>
            </button>
          </>
        )}
        {awaiting && (
          <>
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
            ) : c.q.board ? (
              state.mode === 'world' ? (
                <ReasoningBoard
                  state={state}
                  question={c.q}
                  onSelect={c.choose}
                  compact
                />
              ) : (
                <p className={styles.example}>
                  Select your response on the reasoning board above.
                </p>
              )
            ) : state.mode === 'classic' &&
              state.visualState.kind === 'tree' &&
              state.visualState.example ? (
              <p className={styles.example}>
                {state.studentResponse
                  ? `Your selection: ${state.studentResponse}`
                  : 'Select a value on the diagram above.'}
              </p>
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
              {c.q.type === 'text' ? 'Record explanation' : 'Check my answer'}{' '}
              <span aria-hidden="true">→</span>
            </button>
          </>
        )}
        {ready && (
          <button
            className={styles.primary}
            disabled={disabled}
            onClick={() =>
              assessment
                ? c.next('self-reported')
                : lesson.experience &&
                    (stage !== 'test' || latestEvidence?.assisted) &&
                    freshTest
                  ? patch((current) => beginConceptTest(current, lesson))
                  : fresh
                    ? c.teach('practice')
                    : c.next(
                        last?.validation === 'correct'
                          ? 'validated'
                          : 'self-reported',
                      )
            }
          >
            {assessment
              ? state.learning!.item ===
                (activity === 'diagnostic'
                  ? lesson.experience!.diagnostic.length
                  : lesson.experience!.final.length) -
                  1
                ? activity === 'diagnostic'
                  ? 'Begin my lesson'
                  : 'See learning summary'
                : 'Next question'
              : lesson.experience &&
                  (stage !== 'test' || latestEvidence?.assisted) &&
                  freshTest
                ? stage === 'test'
                  ? 'Try a different independent question'
                  : 'Test this concept'
                : fresh
                  ? 'Try a fresh example'
                  : last?.validation === 'unverified'
                    ? 'Continue · unverified'
                    : 'Continue'}{' '}
            <span aria-hidden="true">→</span>
          </button>
        )}
        {ready && !assessment && lesson.experience && stage !== 'test' && (
          <button
            className={styles.quiet}
            disabled={disabled}
            onClick={() =>
              c.next(
                last?.validation === 'correct' ? 'validated' : 'self-reported',
              )
            }
          >
            Continue without independent check
          </button>
        )}
        {ready &&
          !assessment &&
          lesson.experience &&
          !freshTest &&
          !latestEvidence?.independent && (
            <p className={styles.example}>
              No unused independent variant remains here. Review or continue;
              your evidence stays unverified.
            </p>
          )}
        {!lesson.experience && ready && (
          <small>
            Independent Test questions are not authored for this lesson.
            Practice is recorded without verification.
          </small>
        )}
        {stage === 'test' && (
          <p className={styles.example}>
            {lesson.origin === 'generated' ? 'Generated answer keys are not independently validated. Responses are compared and recorded as unverified.' : state.learning?.assisted
              ? 'Help used: this attempt is assisted. A different question is needed for independent verification.'
              : 'A fresh, unassisted correct response can verify this concept now. It does not establish long-term retention.'}
          </p>
        )}
      </div>
      <div className={styles.tools}>
        <button
          ref={helpButton}
          aria-expanded={!!help}
          aria-controls="lesson-help"
          disabled={!!state.pendingRequest}
          onClick={openHelp}
        >
          Need help?
        </button>
        <details>
          <summary>More</summary>
          <div className={styles.more}>
            {!assessment && (
              <button
                disabled={disabled || c.qi === 0}
                onClick={() => c.question(c.qi - 1)}
              >
                Go back one step
              </button>
            )}
            {!assessment && (
              <button disabled={disabled} onClick={() => c.teach('practice')}>
                Extra practice
              </button>
            )}
            <button disabled={disabled} onClick={() => c.next('skipped')}>
              {assessment
                ? 'Skip this question · unverified'
                : 'Skip · understanding unverified'}
            </button>
            <button
              disabled={disabled}
              onClick={() => patch({ phase: 'recap', sceneStation: 'desk' })}
            >
              Finish lesson and review evidence
            </button>
          </div>
        </details>
        <small>Practice, not an academic grade</small>
      </div>
      {help && (
        <div
          id="lesson-help"
          className={styles.help}
          role="region"
          aria-label="Lesson help"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              closeHelp();
            }
          }}
        >
          <div className={styles.helpHeader}>
            <strong>
              {help === 'menu'
                ? 'How can I help?'
                : 'Your lesson is paused here'}
            </strong>
            <button
              aria-label="Close help and resume"
              disabled={!!state.pendingRequest}
              onClick={closeHelp}
            >
              ×
            </button>
          </div>
          {help === 'menu' ? (
            <div className={styles.helpOptions}>
              <button onClick={() => assist('simpler')}>
                Explain it more simply
              </button>
              <button onClick={() => assist('example')}>
                Show another example
              </button>
              <button onClick={() => assist('repeat')}>
                Repeat that explanation
              </button>
              <button onClick={() => assist('ask')}>
                Ask Petros a question
              </button>
            </div>
          ) : (
            <>
              {help === 'simpler' && <p>{plan.simpler}</p>}
              {help === 'repeat' && <p>{plan.introduction}</p>}
              {help === 'example' && <p>{plan.example}</p>}
              {help === 'ask' && (
                <>
                  {state.conversationHistory.slice(-2).map((turn, i) => (
                    <div key={i} className={styles.turn}>
                      <small>{turn.label}</small>
                      <p>{turn.text}</p>
                    </div>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (onAsk) void onAsk(state.askDraft);
                    }}
                  >
                    <label htmlFor="petros-question">
                      Ask about the highlighted example
                    </label>
                    <textarea
                      id="petros-question"
                      aria-label="Ask Petros a question"
                      rows={2}
                      maxLength={1200}
                      value={state.askDraft}
                      onChange={(e) => patch({ askDraft: e.target.value })}
                      placeholder="Why would it choose that value?"
                    />
                    <button
                      disabled={
                        !!state.pendingRequest ||
                        !state.askDraft.trim() ||
                        !onAsk
                      }
                    >
                      {state.pendingRequest ? 'Thinking…' : 'Ask Petros'}
                    </button>
                  </form>
                  <small>
                    Contextual replies are prepared. Broader questions require
                    an available model.
                  </small>
                </>
              )}
              <button disabled={!!state.pendingRequest} onClick={closeHelp}>
                Resume this step →
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
