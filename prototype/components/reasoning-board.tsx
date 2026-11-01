'use client';
import type { Question, ShowcaseState } from '../teaching/types';
import s from './learning-evidence.module.css';
/** The same candidate selection is used by Classic and World's accessible board overlay. */
export function ReasoningBoard({
  state,
  question,
  onSelect,
  compact = false,
}: {
  state: ShowcaseState;
  question: Question;
  onSelect: (value: string) => void;
  compact?: boolean;
}) {
  const board = question.board;
  if (!board) return null;
  const awaiting = state.teaching.status === 'AWAITING_RESPONSE';
  const disabled = !awaiting || state.paused || !!state.pendingRequest;
  return (
    <section
      className={s.reasoning}
      data-compact={compact}
      aria-label="Reasoning board"
    >
      <div className={s.premises}>
        <div>
          <strong>Supplied facts</strong>
          {board.facts.length ? (
            board.facts.map((f) => <p key={f}>{f}</p>)
          ) : (
            <p>No named fact stored yet</p>
          )}
        </div>
        <div>
          <strong>One-way rules</strong>
          {board.rules.map((r, i) => (
            <p key={i}>
              {r.premise} → {r.conclusion}
            </p>
          ))}
        </div>
      </div>
      <p className={s.instruction}>
        Use only the supplied information. Select your response, then check it.
      </p>
      <div
        className={s.candidates}
        role="group"
        aria-label="Board response choices"
      >
        {question.options.map((value) => (
          <button
            key={value}
            disabled={disabled}
            aria-pressed={state.studentResponse === value}
            onClick={() => onSelect(value)}
          >
            {value}
          </button>
        ))}
      </div>
      {state.highlightTargetId === 'unsupported' && (
        <p role="status">
          Look for a supplied rule that reaches the proposed conclusion. A
          missing link is not a proof.
        </p>
      )}
      {state.highlightTargetId === 'rule' && (
        <p role="status">
          Follow the arrow from its premise to its conclusion. Reversing it
          requires a separate rule.
        </p>
      )}
    </section>
  );
}
