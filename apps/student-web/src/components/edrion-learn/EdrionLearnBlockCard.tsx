'use client';
import { useEffect, useRef, useState } from 'react';
import type { BlockV1, SessionBlockV1Dto } from '@edrion/schemas';
import { MathText } from '@/components/learn/MathText';
import { PillButton } from '@/components/ui/pill-button';

const IDLE_SKIP_MS = 45_000;

function useIdleSkip(enabled: boolean, onSkip: () => void) {
  const onSkipRef = useRef(onSkip);
  onSkipRef.current = onSkip;
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!enabled) {
      setShow(false);
      return;
    }
    const t = window.setTimeout(() => setShow(true), IDLE_SKIP_MS);
    return () => {
      window.clearTimeout(t);
      setShow(false);
    };
  }, [enabled]);
  return show;
}

type BlockHandlers = {
  onAnswer?: (questionId: string, response: unknown, hintsUsed?: number) => void;
  onInteract?: (action: string, data?: Record<string, unknown>) => void;
  onCommit?: (cardIds: string[]) => void;
  onOverflow?: (verb: OverflowVerb, blockRow: SessionBlockV1Dto) => void;
  answerPending?: boolean;
  lastEvaluation?: { correct?: boolean | null; feedback?: string; correctOptionId?: string };
  locked?: boolean;
};

export type OverflowVerb =
  | 'save_notes'
  | 'make_flashcard'
  | 'explain_simpler'
  | 'explain_deeper';

const OVERFLOW_VERBS: { key: OverflowVerb; label: string }[] = [
  { key: 'save_notes', label: 'Save to notes' },
  { key: 'make_flashcard', label: 'Make flashcard from this' },
  { key: 'explain_simpler', label: 'Explain simpler' },
  { key: 'explain_deeper', label: 'Explain deeper' },
];

export function EdrionLearnBlockCard({
  blockRow,
  handlers,
  isLastBlock = false,
  isActive = false,
}: {
  blockRow: SessionBlockV1Dto;
  handlers: BlockHandlers;
  isLastBlock?: boolean;
  isActive?: boolean;
}) {
  const { block, reasoning, degraded, interactionState } = blockRow;
  const expandedFromServer = Boolean(
    (interactionState as { expandedDeeper?: boolean } | undefined)?.expandedDeeper,
  );
  const [deeper, setDeeper] = useState(expandedFromServer);
  const [menuOpen, setMenuOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const whyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!whyOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (whyRef.current && !whyRef.current.contains(e.target as Node)) setWhyOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [whyOpen]);

  useEffect(() => {
    setDeeper(expandedFromServer);
  }, [expandedFromServer, blockRow.id]);

  const evaluation = (interactionState as {
    evaluation?: BlockHandlers['lastEvaluation'] & { correctOptionId?: string };
  })?.evaluation;

  return (
    <article
      className={`rounded-[18px] border bg-st-card transition duration-300 motion-reduce:transition-none ${
        isActive
          ? 'animate-st-block-in border-st-accentBd p-5 shadow-[0_12px_40px_-18px_color-mix(in_srgb,var(--st-accentDeep)_35%,transparent)] ring-1 ring-st-accent/15 motion-reduce:animate-none'
          : 'border-st-bd2 p-5 shadow-sm'
      }`}
    >
      <header className="mb-4 flex items-start justify-between gap-2">
        {block.title ? (
          <h2 className="font-display text-[17px] font-semibold leading-snug tracking-tight text-st-ink">
            {block.title}
          </h2>
        ) : (
          <span />
        )}
        <div className="flex shrink-0 items-center gap-0.5">
          <div className="relative" ref={whyRef}>
            <button
              type="button"
              aria-label="Why this?"
              onClick={() => setWhyOpen((v) => !v)}
              className="rounded-md px-1.5 py-0.5 text-xs text-st-faint transition hover:bg-st-surface2 hover:text-st-muted"
            >
              ⓘ
            </button>
            {whyOpen && (
              <div
                role="tooltip"
                className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-st-bd2 bg-st-card p-3 text-left text-xs leading-relaxed text-st-inkSoft shadow-md"
              >
                {degraded ? 'I improvised this one.' : reasoning || 'Chosen to match where you are in this lesson.'}
              </div>
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              aria-label="More actions"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-md px-1.5 py-0.5 text-xs text-st-faint transition hover:bg-st-surface2 hover:text-st-muted"
            >
              ⋯
            </button>
            {menuOpen && (
              <div className="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-st-bd2 bg-st-card py-1 shadow-md">
                {OVERFLOW_VERBS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    className="block w-full px-3 py-2 text-left text-xs text-st-ink transition hover:bg-st-surface2"
                    onClick={() => {
                      setMenuOpen(false);
                      handlers.onOverflow?.(v.key, blockRow);
                    }}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </header>

      <BlockBody
        block={block}
        deeper={deeper}
        setDeeper={(v) => {
          setDeeper(v);
          if (v) handlers.onInteract?.('expand_deeper');
        }}
        handlers={handlers}
        interactionState={interactionState}
        evaluation={evaluation ?? handlers.lastEvaluation}
        isLastBlock={isLastBlock}
        isActive={isActive}
      />
    </article>
  );
}

function ContinueButton({
  handlers,
  interactionState,
  disabled,
}: {
  handlers: BlockHandlers;
  interactionState: Record<string, unknown>;
  disabled?: boolean;
}) {
  if (interactionState.acknowledged) return null;
  return (
    <PillButton
      disabled={disabled}
      className="mt-5 min-h-0 px-5 py-2.5 text-sm"
      onClick={() => handlers.onInteract?.('acknowledge')}
    >
      Continue
    </PillButton>
  );
}

function BlockBody({
  block,
  deeper,
  setDeeper,
  handlers,
  interactionState,
  evaluation,
  isLastBlock,
  isActive,
}: {
  block: BlockV1;
  deeper: boolean;
  setDeeper: (v: boolean) => void;
  handlers: BlockHandlers;
  interactionState: Record<string, unknown>;
  evaluation?: BlockHandlers['lastEvaluation'];
  isLastBlock: boolean;
  isActive: boolean;
}) {
  switch (block.block_type) {
    case 'explanation':
      return (
        <div>
          <div className="prose prose-sm max-w-none text-st-inkSoft">
            <MathText>{block.body_md}</MathText>
          </div>
          {block.deeper_md && (
            <button
              type="button"
              className="mt-3 text-sm text-st-accent hover:underline"
              onClick={() => setDeeper(!deeper)}
            >
              {deeper ? 'Show less' : 'Go deeper'}
            </button>
          )}
          {deeper && block.deeper_md && (
            <div className="mt-2 prose prose-sm max-w-none text-st-inkSoft">
              <MathText>{block.deeper_md}</MathText>
            </div>
          )}
          {isLastBlock && (
            <ContinueButton handlers={handlers} interactionState={interactionState} />
          )}
        </div>
      );

    case 'worked_example':
      return (
        <WorkedExample
          block={block}
          interactionState={interactionState}
          handlers={handlers}
          isLastBlock={isLastBlock}
        />
      );

    case 'question_set':
      return (
        <QuestionSet
          block={block}
          interactionState={interactionState}
          handlers={handlers}
          evaluation={evaluation}
          isActive={isActive}
        />
      );

    case 'probe':
      return <ProbeBlock block={block} handlers={handlers} interactionState={interactionState} />;

    case 'synthesis':
      return <SynthesisBlock block={block} handlers={handlers} interactionState={interactionState} />;

    case 'artifact_commit':
      return <ArtifactCommitBlock block={block} handlers={handlers} />;

    case 'canvas_embed':
      return (
        <div>
          {block.caption && <p className="mb-2 text-sm text-st-muted">{block.caption}</p>}
          <div className="overflow-hidden rounded-lg border border-st-bd2 bg-st-surface2">
            <iframe
              title="Lesson diagram"
              src={`/lab/visual/${block.canvas_id}`}
              className="h-64 w-full border-0"
            />
          </div>
          <a
            href={`/lab/visual/${block.canvas_id}`}
            className="mt-2 inline-block text-xs text-st-accent hover:underline"
          >
            Open in Lab
          </a>
          {isLastBlock && (
            <ContinueButton handlers={handlers} interactionState={interactionState} />
          )}
        </div>
      );

    case 'system_notice':
      return (
        <div
          className={`-mx-5 -mb-5 mt-0 rounded-b-[15px] border-t px-5 py-4 ${
            block.kind === 'budget'
              ? 'border-amber-200 bg-amber-50 text-amber-900'
              : block.kind === 'break'
                ? 'border-st-bd2 bg-st-surface2 text-st-ink'
                : 'border-st-bd2 bg-st-surface2 text-st-muted'
          }`}
        >
          <MathText>{block.body_md}</MathText>
          {block.actions?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {block.actions.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className="rounded-full border border-current/30 px-3 py-1 text-xs font-medium"
                  onClick={() => handlers.onInteract?.('notice_action', { key: a.key })}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      );

    default:
      return isLastBlock ? (
        <ContinueButton handlers={handlers} interactionState={interactionState} />
      ) : (
        <p className="text-sm text-st-muted">Continue when you are ready.</p>
      );
  }
}

function ProbeBlock({
  block,
  handlers,
  interactionState,
}: {
  block: Extract<BlockV1, { block_type: 'probe' }>;
  handlers: BlockHandlers;
  interactionState: Record<string, unknown>;
}) {
  const [answer, setAnswer] = useState('');
  const submitted = Boolean(interactionState.probeAnswer);
  return (
    <div>
      <MathText>{block.question_md}</MathText>
      {!submitted && (
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value.slice(0, 500))}
          rows={3}
          disabled={handlers.locked}
          className="mt-3 w-full rounded-lg border border-st-bd2 px-3 py-2 text-sm"
          placeholder="Your answer…"
        />
      )}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {!submitted && (
          <button
            type="button"
            disabled={!answer.trim() || handlers.locked}
            className="rounded-full bg-st-accent px-4 py-2 text-sm text-white disabled:opacity-40"
            onClick={() => handlers.onInteract?.('probe_answer', { text: answer.trim() })}
          >
            Submit
          </button>
        )}
        <button
          type="button"
          className="text-sm text-st-muted hover:underline"
          disabled={handlers.locked}
          onClick={() => handlers.onInteract?.('probe_escape')}
        >
          Just explain it
        </button>
      </div>
    </div>
  );
}

function WorkedExample({
  block,
  interactionState,
  handlers,
  isLastBlock,
}: {
  block: Extract<BlockV1, { block_type: 'worked_example' }>;
  interactionState: Record<string, unknown>;
  handlers: BlockHandlers;
  isLastBlock: boolean;
}) {
  const revealed = new Set((interactionState.revealedSteps as number[]) ?? [0]);
  const [prediction, setPrediction] = useState('');
  const nextIdx = [...Array(block.steps.length).keys()].find((i) => !revealed.has(i) && i > 0);

  return (
    <div className="space-y-3">
      <div className="prose prose-sm text-st-inkSoft">
        <MathText>{block.problem_md}</MathText>
      </div>
      {block.steps.map((step, i) => {
        if (!revealed.has(i) && i > 0) return null;
        const priorPrediction = interactionState[`prediction_${i}`] as string | undefined;
        return (
          <div key={i} className="rounded-lg bg-st-surface2 px-3 py-2 text-sm">
            <span className="font-mono text-xs text-st-muted">Step {i + 1}</span>
            {priorPrediction && (
              <p className="mb-1 italic text-st-muted">You said: {priorPrediction}</p>
            )}
            <MathText>{step.step_md}</MathText>
          </div>
        );
      })}
      {nextIdx != null && (
        <div className="space-y-2 rounded-lg border border-st-bd2 p-3">
          {block.steps[nextIdx]?.predict_prompt && (
            <>
              <p className="text-sm text-st-inkSoft">{block.steps[nextIdx]!.predict_prompt}</p>
              <input
                value={prediction}
                onChange={(e) => setPrediction(e.target.value)}
                className="w-full rounded-lg border border-st-bd2 px-3 py-2 text-sm"
                placeholder="Your thinking…"
              />
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {block.steps[nextIdx]?.predict_prompt && (
              <button
                type="button"
                className="rounded-full bg-st-accent px-3 py-1.5 text-xs text-white"
                onClick={() => {
                  handlers.onInteract?.('reveal_step', { stepIndex: nextIdx, prediction });
                  setPrediction('');
                }}
              >
                Check my thinking
              </button>
            )}
            <button
              type="button"
              className="rounded-full border border-st-bd2 px-3 py-1.5 text-xs"
              onClick={() => handlers.onInteract?.('reveal_step', { stepIndex: nextIdx })}
            >
              Just show the step
            </button>
          </div>
        </div>
      )}
      {isLastBlock && nextIdx == null && (
        <ContinueButton handlers={handlers} interactionState={interactionState} />
      )}
    </div>
  );
}

function QuestionSet({
  block,
  interactionState,
  handlers,
  evaluation,
  isActive,
}: {
  block: Extract<BlockV1, { block_type: 'question_set' }>;
  interactionState: Record<string, unknown>;
  handlers: BlockHandlers;
  evaluation?: BlockHandlers['lastEvaluation'];
  isActive: boolean;
}) {
  // One question at a time with per-question lock (G2).
  const answeredMap =
    (interactionState.answeredMap as Record<
      string,
      { correct?: boolean | null; feedback?: string; correctOptionId?: string }
    >) ?? {};
  const answeredId = interactionState.answered as string | undefined;
  const firstUnanswered = block.questions.findIndex((q) => !answeredMap[q.id] && q.id !== answeredId);
  const activeIdx = firstUnanswered >= 0 ? firstUnanswered : Math.max(0, block.questions.length - 1);
  const q = block.questions[activeIdx]!;
  const locked = Boolean(answeredMap[q.id] || answeredId === q.id);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [shortText, setShortText] = useState('');
  const [hintsRevealed, setHintsRevealed] = useState(0);
  const ev = answeredMap[q.id] ?? (answeredId === q.id ? evaluation : undefined);
  const hints = q.hints ?? [];
  const showSkip = useIdleSkip(
    isActive && !locked && !handlers.locked && !handlers.answerPending,
    () => handlers.onInteract?.('skip_step'),
  );
  const optionLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="font-mono-ui text-[10px] uppercase tracking-[0.14em] text-st-faint">
          {activeIdx + 1} of {block.questions.length}
        </p>
        {!locked && hints.length > 0 && hintsRevealed < hints.length && (
          <button
            type="button"
            className="text-xs font-medium text-st-accent transition hover:text-st-accentDeep"
            disabled={handlers.locked}
            onClick={() => setHintsRevealed((n) => Math.min(n + 1, hints.length))}
          >
            Give me a hint
          </button>
        )}
      </div>
      <div className="text-[15px] leading-relaxed text-st-ink">
        <MathText>{q.prompt_md}</MathText>
      </div>
      {handlers.answerPending && (
        <p className="flex items-center gap-2 text-xs text-st-muted" aria-live="polite">
          <span className="inline-flex gap-0.5" aria-hidden>
            <span className="h-1.5 w-1.5 animate-st-dot-bounce rounded-full bg-st-accent [animation-delay:0ms]" />
            <span className="h-1.5 w-1.5 animate-st-dot-bounce rounded-full bg-st-accent [animation-delay:120ms]" />
            <span className="h-1.5 w-1.5 animate-st-dot-bounce rounded-full bg-st-accent [animation-delay:240ms]" />
          </span>
          Checking…
        </p>
      )}
      {hintsRevealed > 0 && (
        <ul className="space-y-1.5 rounded-xl border border-st-accentBd/50 bg-st-accentSoft/40 px-3.5 py-2.5 text-sm text-st-inkSoft">
          {hints.slice(0, hintsRevealed).map((h, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 font-mono-ui text-[10px] text-st-accent">hint {i + 1}</span>
              <MathText>{h}</MathText>
            </li>
          ))}
        </ul>
      )}
      {q.type === 'mcq_single' && q.options && (
        <div className="mt-1 space-y-2" role="radiogroup" aria-label="Answer choices">
          {q.options.map((opt, oi) => {
            const isSelected = selectedOption === opt.id;
            const showWrong = locked && ev?.correct === false && isSelected;
            const isCorrectSelected = locked && ev?.correct === true && isSelected;
            const showCorrectReveal =
              locked && ev?.correct === false && ev.correctOptionId === opt.id;
            const letter = optionLetters[oi] ?? String(oi + 1);
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={locked || handlers.answerPending || handlers.locked}
                onClick={() => {
                  if (locked || handlers.answerPending || handlers.locked) return;
                  setSelectedOption(opt.id);
                }}
                className={`group flex w-full items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-sm leading-snug transition duration-150 disabled:cursor-not-allowed motion-reduce:transition-none ${
                  isCorrectSelected || showCorrectReveal
                    ? 'border-st-success bg-st-mintBg'
                    : showWrong
                      ? 'border-st-amberBd bg-st-amberSoft'
                      : isSelected
                        ? 'border-st-accent bg-st-accentSoft shadow-[inset_0_0_0_1px_var(--st-accent)]'
                        : 'border-st-bd2 bg-st-card hover:border-st-accentLine hover:bg-st-surface2/60'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md font-mono-ui text-[11px] font-semibold transition ${
                    isCorrectSelected || showCorrectReveal
                      ? 'bg-st-success text-white'
                      : showWrong
                        ? 'bg-st-amber text-white'
                        : isSelected
                          ? 'bg-st-accent text-white'
                          : 'bg-st-surface2 text-st-muted group-hover:bg-st-accentSoft group-hover:text-st-accentDeep'
                  }`}
                  aria-hidden
                >
                  {letter}
                </span>
                <span className="min-w-0 flex-1 pt-0.5 text-st-ink">
                  <MathText>{opt.label_md}</MathText>
                </span>
              </button>
            );
          })}
          {!locked && (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-st-divider pt-3">
              <PillButton
                disabled={!selectedOption || handlers.answerPending || handlers.locked}
                className="min-h-0 px-5 py-2.5 text-sm disabled:opacity-40"
                onClick={() => handlers.onAnswer?.(q.id, { optionId: selectedOption }, hintsRevealed)}
              >
                Submit
              </PillButton>
              {showSkip && (
                <button
                  type="button"
                  className="text-sm text-st-muted transition hover:text-st-ink hover:underline"
                  onClick={() => handlers.onInteract?.('skip_step')}
                >
                  Skip this
                </button>
              )}
            </div>
          )}
          {locked && ev?.correct === false && (
            <p className="mt-2 rounded-lg border border-st-amberBd bg-st-amberSoft px-3 py-2 text-sm text-st-amberInk">
              {ev.feedback ?? 'Not quite — review the explanation and try the next one.'}
            </p>
          )}
          {locked && ev?.correct === true && (
            <p className="mt-2 rounded-lg border border-st-accentBd bg-st-mintBg px-3 py-2 text-sm text-st-success">
              {ev.feedback ?? 'Nice — that lands.'}
            </p>
          )}
          {locked && ev?.correct === null && (
            <p className="mt-2 text-sm text-st-muted">
              {ev.feedback ?? "Recorded — couldn't auto-check this one."}
            </p>
          )}
        </div>
      )}
      {(q.type === 'short_text' || q.type === 'numeric') && !locked && (
        <div className="mt-1 space-y-3 border-t border-st-divider pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={shortText}
              onChange={(e) => setShortText(e.target.value)}
              disabled={handlers.locked}
              className="min-w-[12rem] flex-1 rounded-xl border border-st-bd2 bg-st-card px-3.5 py-2.5 text-sm outline-none transition focus:border-st-accent"
            />
            <PillButton
              disabled={!shortText.trim() || handlers.answerPending || handlers.locked}
              className="min-h-0 shrink-0 px-4 py-2.5 text-sm"
              onClick={() =>
                handlers.onAnswer?.(
                  q.id,
                  q.type === 'numeric' ? { value: Number(shortText) } : { text: shortText },
                  hintsRevealed,
                )
              }
            >
              Submit
            </PillButton>
          </div>
          {showSkip && (
            <button
              type="button"
              className="text-sm text-st-muted hover:underline"
              onClick={() => handlers.onInteract?.('skip_step')}
            >
              Skip this
            </button>
          )}
        </div>
      )}
      {(q.type === 'short_text' || q.type === 'numeric') && locked && (
        <div className="mt-3 space-y-2 rounded-xl border border-st-bd2 bg-st-surface2 px-3.5 py-3 text-sm">
          <p className="text-st-ink">
            <span className="text-st-muted">Your answer: </span>
            {shortText || (ev as { response?: string } | undefined)?.response || '—'}
          </p>
          {ev?.correct === false && (
            <p className="text-st-amberInk">{ev.feedback ?? 'Not quite.'}</p>
          )}
          {ev?.correct === true && ev.feedback && <p className="text-st-muted">{ev.feedback}</p>}
          {ev?.correct === null && (
            <p className="text-st-muted">
              {ev.feedback ?? "Recorded — couldn't auto-check this one."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SynthesisBlock({
  block,
  handlers,
  interactionState,
}: {
  block: Extract<BlockV1, { block_type: 'synthesis' }>;
  handlers: BlockHandlers;
  interactionState: Record<string, unknown>;
}) {
  const [text, setText] = useState('');
  const submitted = Boolean(interactionState.synthesisText);
  const tightened = interactionState.synthesisTightened as string | undefined;
  return (
    <div>
      <MathText>{block.prompt_md}</MathText>
      {!submitted ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, 280))}
            maxLength={280}
            rows={3}
            disabled={handlers.locked}
            className="mt-3 w-full rounded-lg border border-st-bd2 px-3 py-2 text-sm"
            placeholder="Your synthesis (≤280 chars)"
          />
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              disabled={!text.trim() || handlers.locked}
              className="rounded-full bg-st-accent px-4 py-2 text-sm text-white disabled:opacity-40"
              onClick={() => handlers.onInteract?.('synthesis_submit', { text })}
            >
              Submit
            </button>
            <button
              type="button"
              disabled={handlers.locked}
              className="text-sm text-st-muted"
              onClick={() => handlers.onInteract?.('synthesis_skip')}
            >
              Skip
            </button>
          </div>
        </>
      ) : (
        <div className="mt-3 space-y-2 text-sm">
          <p className="text-st-inkSoft">{String(interactionState.synthesisText)}</p>
          {tightened && (
            <p className="text-st-ink">
              <span className="font-medium">Tightened:</span> {tightened}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ArtifactCommitBlock({
  block,
  handlers,
}: {
  block: Extract<BlockV1, { block_type: 'artifact_commit' }>;
  handlers: BlockHandlers;
}) {
  // Spec: checkboxes default ON.
  const [selectedCards, setSelectedCards] = useState<Set<string>>(
    () => new Set(block.cards.map((c) => c.source_block_id)),
  );
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-2">
      {block.cards.map((card) => {
        const open = expanded.has(card.source_block_id);
        return (
          <label
            key={card.source_block_id}
            className="flex items-start gap-2 rounded-lg border border-st-bd2 p-3 text-sm"
          >
            <input
              type="checkbox"
              checked={selectedCards.has(card.source_block_id)}
              onChange={(e) => {
                const next = new Set(selectedCards);
                if (e.target.checked) next.add(card.source_block_id);
                else next.delete(card.source_block_id);
                setSelectedCards(next);
              }}
            />
            <span className="min-w-0 flex-1">
              <strong>{card.front_md}</strong>
              <button
                type="button"
                className="mt-1 block text-xs text-st-accent hover:underline"
                onClick={(e) => {
                  e.preventDefault();
                  const next = new Set(expanded);
                  if (open) next.delete(card.source_block_id);
                  else next.add(card.source_block_id);
                  setExpanded(next);
                }}
              >
                {open ? 'Hide answer' : 'Show answer'}
              </button>
              {open && <span className="mt-1 block text-st-muted">{card.back_md}</span>}
            </span>
          </label>
        );
      })}
      <button
        type="button"
        className="mt-2 rounded-full bg-st-accent px-4 py-2 text-sm text-white"
        onClick={() => handlers.onCommit?.([...selectedCards])}
      >
        Save {selectedCards.size || block.cards.length} to Library
      </button>
    </div>
  );
}
