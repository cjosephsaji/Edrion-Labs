'use client';

import { Check, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { MathText } from '@/components/learn/MathText';
import { BlockChrome, type OverflowVerbId } from './BlockChrome';
import type { BlockVisualState } from './learn-visual';

/** Room at the top-right of a block so hover chrome never lands on text. */
const CHROME_GUTTER = 'pr-[76px]';

/**
 * MathText renders markdown through `prose prose-sm`, whose own font-size would
 * clamp every Learn surface to 14px. Each surface restates its size on the
 * MathText itself so the utility wins over the plugin's component class.
 */
const READING = 'text-[15.5px] leading-[1.7] [&_p+p]:mt-3';

export type ExplanationBlockProps = {
  heading?: string;
  bodyMd: string;
  deeperMd?: string;
  whyHere: string;
  state?: BlockVisualState;
  onOverflow?: (verb: OverflowVerbId) => void;
};

/** No card — typeset like an article in the reading column. */
export function ExplanationBlock({
  heading,
  bodyMd,
  deeperMd,
  whyHere,
  state = 'active',
  onOverflow,
}: ExplanationBlockProps) {
  const [deeper, setDeeper] = useState(false);
  const settled = state === 'completed' || state === 'degraded';

  if (state === 'loading') {
    return (
      <div className="animate-st-block-in py-2" aria-hidden>
        <div className="h-3 w-20 rounded-full bg-st-accentSoft shimmer" />
        <div className="mt-4 space-y-2.5">
          <div className="h-3 w-full rounded-full bg-st-surface2 shimmer" />
          <div className="h-3 w-[90%] rounded-full bg-st-surface2 shimmer" />
          <div className="h-3 w-[72%] rounded-full bg-st-surface2 shimmer" />
        </div>
      </div>
    );
  }

  return (
    <BlockChrome whyHere={whyHere} onOverflow={onOverflow} className="animate-st-block-in">
      <article className={settled ? 'opacity-90' : ''}>
        {heading && (
          <h3
            className={`font-display text-[21px] font-semibold leading-tight tracking-[-0.015em] text-st-ink ${CHROME_GUTTER}`}
          >
            {heading}
          </h3>
        )}
        <div className={`text-st-inkSoft ${heading ? 'mt-3' : CHROME_GUTTER}`}>
          <MathText className={READING}>{bodyMd}</MathText>
        </div>
        {deeperMd && (
          <div className="mt-4">
            <button
              type="button"
              onClick={() => setDeeper((v) => !v)}
              aria-expanded={deeper}
              className="text-[13.5px] font-semibold text-st-accent transition hover:text-st-accentDeep"
            >
              {deeper ? '− Show less' : '+ Go deeper'}
            </button>
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
                deeper ? 'mt-3 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
              }`}
            >
              <div className="overflow-hidden">
                <div className="border-l-2 border-st-accentBd pl-4 text-st-inkSoft">
                  <MathText className="text-[14.5px] leading-[1.7] [&_p+p]:mt-3">{deeperMd}</MathText>
                </div>
              </div>
            </div>
          </div>
        )}
        {state === 'degraded' && (
          <p className="mt-3 text-xs text-st-faint">Continuing with a plain explanation.</p>
        )}
      </article>
    </BlockChrome>
  );
}

export type WorkedExampleProps = {
  problemMd: string;
  steps: string[];
  predictAtStep?: number;
  whyHere: string;
  state?: BlockVisualState;
  onOverflow?: (verb: OverflowVerbId) => void;
  /** Fires once every step is on screen — the shell shows Continue only then. */
  onAllRevealed?: () => void;
};

export function WorkedExampleBlock({
  problemMd,
  steps,
  predictAtStep = 1,
  whyHere,
  state = 'active',
  onOverflow,
  onAllRevealed,
}: WorkedExampleProps) {
  const [revealed, setRevealed] = useState(state === 'completed' ? steps.length : 1);
  const [prediction, setPrediction] = useState('');
  const [committed, setCommitted] = useState<string | null>(null);
  const waitingPredict = revealed === predictAtStep && committed === null && state === 'active';
  const announced = useRef(false);

  useEffect(() => {
    if (announced.current || revealed < steps.length) return;
    announced.current = true;
    onAllRevealed?.();
  }, [revealed, steps.length, onAllRevealed]);

  if (state === 'loading') {
    return (
      <div className="animate-st-block-in overflow-hidden rounded-[18px] border border-st-bd1 bg-st-card" aria-hidden>
        <div className="border-l-[3px] border-st-accent bg-st-surface2 px-5 py-4">
          <div className="h-3 w-40 rounded-full bg-st-bd2 shimmer" />
        </div>
        <div className="space-y-3 p-5">
          <div className="h-3 w-full rounded-full bg-st-surface2 shimmer" />
          <div className="h-3 w-3/4 rounded-full bg-st-surface2 shimmer" />
        </div>
      </div>
    );
  }

  return (
    <BlockChrome whyHere={whyHere} onOverflow={onOverflow} className="animate-st-block-in">
      <article
        className={`overflow-hidden rounded-[18px] border bg-st-card transition duration-300 ${
          state === 'completed'
            ? 'border-st-bd1 opacity-90'
            : 'border-st-bd1 shadow-[0_14px_36px_-28px_rgba(23,37,31,0.55)]'
        }`}
      >
        <div className={`border-l-[3px] border-st-accent bg-st-surface2 px-5 py-4 ${CHROME_GUTTER}`}>
          <p className="font-mono-ui text-[9.5px] font-semibold uppercase tracking-[0.12em] text-st-faint">
            Worked example
          </p>
          <div className="mt-2 font-medium text-st-ink">
            <MathText className="text-[15px] leading-snug">{problemMd}</MathText>
          </div>
        </div>

        <ol className="space-y-4 px-5 py-5">
          {steps.slice(0, revealed).map((step, i) => (
            <li key={i} className="flex animate-st-fade-up gap-3">
              <span className="mt-[1px] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-st-accentSoft font-mono-ui text-[11px] font-semibold text-st-accentDeep">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 text-st-inkSoft">
                {committed && i === predictAtStep && (
                  <p className="mb-1.5 rounded-lg bg-st-surface2 px-2.5 py-1.5 text-[12.5px] italic text-st-muted">
                    You thought: {committed}
                  </p>
                )}
                <MathText className="text-[14.5px] leading-[1.65]">{step}</MathText>
              </div>
            </li>
          ))}
        </ol>

        {waitingPredict && (
          <div className="animate-st-fade-up border-t border-st-divider bg-st-cardAlt px-5 py-4">
            <p className="text-[14px] font-semibold text-st-ink">What comes next?</p>
            <input
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                setCommitted(prediction.trim() || '…');
                setRevealed((n) => Math.min(n + 1, steps.length));
              }}
              placeholder="Your guess — not graded"
              className="mt-2.5 min-h-[44px] w-full rounded-[12px] border border-st-bd2 bg-st-page px-3.5 py-2.5 text-sm text-st-ink outline-none transition placeholder:text-st-faint focus:border-st-accentBd focus:shadow-[0_0_0_3px_rgba(30,122,94,0.10)]"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-[44px] rounded-full bg-st-accentDeep px-4 py-2 text-sm font-semibold text-st-page transition hover:-translate-y-px"
                onClick={() => {
                  setCommitted(prediction.trim() || '…');
                  setRevealed((n) => Math.min(n + 1, steps.length));
                }}
              >
                Check my thinking
              </button>
              <button
                type="button"
                className="min-h-[44px] rounded-full px-4 py-2 text-sm font-medium text-st-muted transition hover:bg-st-surface2 hover:text-st-ink"
                onClick={() => {
                  setCommitted(null);
                  setRevealed((n) => Math.min(n + 1, steps.length));
                }}
              >
                Just show me
              </button>
            </div>
          </div>
        )}

        {!waitingPredict && revealed < steps.length && state === 'active' && (
          <div className="border-t border-st-divider px-5 py-3">
            <button
              type="button"
              className="text-[13.5px] font-semibold text-st-accent transition hover:text-st-accentDeep"
              onClick={() => setRevealed((n) => Math.min(n + 1, steps.length))}
            >
              Reveal next step → <span className="text-st-faint2">({revealed}/{steps.length})</span>
            </button>
          </div>
        )}
      </article>
    </BlockChrome>
  );
}

export type QuestionOption = {
  id: string;
  label: string;
  correct?: boolean;
  mistake?: { name: string; explainsMd: string };
};

export type QuestionBlockProps = {
  promptMd: string;
  options: QuestionOption[];
  whyHere: string;
  whyCorrectMd?: string;
  state?: BlockVisualState;
  onOverflow?: (verb: OverflowVerbId) => void;
  /** Fires once after local instant grade — persist in background. */
  onAnswered?: (selectedOptionId: string, correct: boolean) => void;
};

/** Instant local feedback — answer key ships with the block for Learn. */
export function QuestionBlock({
  promptMd,
  options,
  whyHere,
  whyCorrectMd,
  state = 'active',
  onOverflow,
  onAnswered,
}: QuestionBlockProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<'correct' | 'wrong' | null>(
    state === 'correct' ? 'correct' : state === 'wrong' ? 'wrong' : null,
  );
  const [showWhy, setShowWhy] = useState(false);
  const settled = result !== null || state === 'completed';

  if (state === 'loading') {
    return (
      <div className="animate-st-block-in rounded-[18px] border border-st-bd1 bg-st-card p-5" aria-hidden>
        <div className="h-3 w-3/4 rounded-full bg-st-surface2 shimmer" />
        <div className="mt-4 space-y-2">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-11 rounded-xl bg-st-surface2 shimmer" />
          ))}
        </div>
      </div>
    );
  }

  const correctId = options.find((o) => o.correct)?.id;
  const chosen = options.find((o) => o.id === selected);

  return (
    <BlockChrome whyHere={whyHere} onOverflow={onOverflow} className="animate-st-block-in">
      <article
        className={`rounded-[18px] border bg-st-card p-5 transition duration-300 ${
          settled
            ? 'border-st-bd1 opacity-95'
            : 'border-st-accentBd shadow-[0_14px_36px_-26px_rgba(12,63,49,0.5)]'
        }`}
      >
        <p className={`font-mono-ui text-[9.5px] font-semibold uppercase tracking-[0.12em] text-st-faint ${CHROME_GUTTER}`}>
          Question
        </p>
        <div className="mt-2 font-medium text-st-ink">
          <MathText className="text-[16px] leading-snug">{promptMd}</MathText>
        </div>

        <div className="mt-4 space-y-2" role="radiogroup" aria-label="Answer options">
          {options.map((opt, i) => {
            const isSelected = selected === opt.id;
            const showCorrect = settled && opt.correct;
            const showWrong = settled && isSelected && !opt.correct;
            return (
              <button
                key={opt.id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={settled}
                onClick={() => setSelected(opt.id)}
                className={`flex min-h-[46px] w-full items-center gap-3 rounded-[13px] border px-3.5 py-2.5 text-left text-[14.5px] transition duration-150 ${
                  showCorrect
                    ? 'border-st-accent bg-st-accentSoft text-st-accentDeep'
                    : showWrong
                      ? 'border-st-amberBd bg-st-amberSoft text-st-amberInk'
                      : isSelected
                        ? 'border-st-accent bg-st-accentSoft/60 text-st-ink'
                        : 'border-st-bd2 bg-st-page/50 text-st-inkSoft hover:border-st-accentBd hover:bg-st-card disabled:hover:border-st-bd2'
                } ${settled && !showCorrect && !showWrong ? 'opacity-55' : ''}`}
              >
                <span
                  aria-hidden
                  className={`grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border font-mono-ui text-[10.5px] font-semibold transition ${
                    showCorrect
                      ? 'border-st-accent bg-st-accent text-st-page'
                      : showWrong
                        ? 'border-st-amberBd bg-st-amber text-st-page'
                        : isSelected
                          ? 'border-st-accent text-st-accentDeep'
                          : 'border-st-bd2 text-st-faint'
                  }`}
                >
                  {showCorrect ? (
                    <Check size={12} strokeWidth={3} />
                  ) : showWrong ? (
                    <X size={12} strokeWidth={3} />
                  ) : (
                    String.fromCharCode(65 + i)
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <MathText className="text-[14.5px] leading-snug">{opt.label}</MathText>
                </span>
              </button>
            );
          })}
        </div>

        {!settled && (
          <button
            type="button"
            disabled={!selected}
            className="mt-4 min-h-[44px] rounded-full bg-st-accentDeep px-5 py-2.5 text-sm font-semibold text-st-page transition hover:-translate-y-px disabled:bg-st-bd2 disabled:text-st-faint disabled:hover:translate-y-0"
            onClick={() => {
              if (!selected) return;
              const ok = selected === correctId;
              setResult(ok ? 'correct' : 'wrong');
              onAnswered?.(selected, ok);
            }}
          >
            Check answer
          </button>
        )}

        {settled && (
          <div className="mt-4 animate-st-fade-up space-y-2.5" aria-live="polite">
            {result === 'correct' && (
              <p className="flex items-center gap-2 text-sm font-semibold text-st-accentDeep">
                <Check size={15} strokeWidth={3} aria-hidden />
                That&apos;s the right move.
              </p>
            )}
            {result === 'wrong' && chosen?.mistake && (
              <div className="rounded-[13px] border border-st-amberBd bg-st-amberSoft px-3.5 py-3">
                <p className="font-mono-ui text-[9.5px] font-semibold uppercase tracking-[0.1em] text-st-amberInk/70">
                  Likely thinking
                </p>
                <p className="mt-1 text-[13.5px] leading-relaxed text-st-amberInk">
                  <span className="font-semibold">{chosen.mistake.name}</span> — {chosen.mistake.explainsMd}
                </p>
              </div>
            )}
            {whyCorrectMd && (
              <>
                <button
                  type="button"
                  aria-expanded={showWhy}
                  className="text-[13.5px] font-semibold text-st-accent transition hover:text-st-accentDeep"
                  onClick={() => setShowWhy((v) => !v)}
                >
                  {showWhy ? '− Hide why' : '+ Why?'}
                </button>
                {showWhy && (
                  <div className="animate-st-fade-up rounded-[13px] bg-st-surface2 p-3.5 text-st-inkSoft">
                    <MathText className="text-[14px] leading-relaxed [&_p+p]:mt-2">{whyCorrectMd}</MathText>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </article>
    </BlockChrome>
  );
}

export type ProbeBlockProps = {
  leadIn?: string;
  questionMd: string;
  whyHere: string;
  state?: BlockVisualState;
  onJustExplain?: () => void;
  onOverflow?: (verb: OverflowVerbId) => void;
};

export function ProbeBlock({
  leadIn = 'Quick check — conversation, not a test.',
  questionMd,
  whyHere,
  state = 'active',
  onJustExplain,
  onOverflow,
}: ProbeBlockProps) {
  const [text, setText] = useState('');

  return (
    <BlockChrome whyHere={whyHere} onOverflow={onOverflow} className="animate-st-block-in">
      <article className="rounded-[18px] border border-st-bd2 bg-st-cardAlt p-5">
        <div className={`flex items-start justify-between gap-3 ${CHROME_GUTTER}`}>
          <p className="text-[12.5px] italic text-st-muted">{leadIn}</p>
        </div>
        <div className="mt-2.5 font-medium text-st-ink">
          <MathText className="text-[15.5px] leading-snug">{questionMd}</MathText>
        </div>
        {state === 'active' && (
          <>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={2}
              placeholder="Your thinking…"
              className="mt-3 w-full resize-y rounded-[13px] border border-st-bd2 bg-st-card px-3.5 py-2.5 text-sm leading-relaxed text-st-ink outline-none transition placeholder:text-st-faint focus:border-st-accentBd focus:shadow-[0_0_0_3px_rgba(30,122,94,0.10)]"
            />
            {onJustExplain && (
              <button
                type="button"
                onClick={onJustExplain}
                className="mt-2 text-[12.5px] font-medium text-st-faint underline-offset-2 transition hover:text-st-inkSoft hover:underline"
              >
                Skip — just explain it
              </button>
            )}
          </>
        )}
      </article>
    </BlockChrome>
  );
}

export function CheckpointDivider({ name }: { name: string }) {
  return (
    <div className="flex w-full animate-st-fade-up items-center gap-3 py-1">
      <div className="h-px flex-1 bg-gradient-to-r from-transparent to-st-accentBd" />
      <div className="flex items-center gap-2 rounded-full border border-st-accentBd bg-st-accentSoft px-3.5 py-1.5">
        <Check size={13} className="text-st-accentDeep" strokeWidth={3} aria-hidden />
        <span className="font-mono-ui text-[10.5px] font-semibold uppercase tracking-[0.1em] text-st-accentDeep">
          {name}
        </span>
      </div>
      <div className="h-px flex-1 bg-gradient-to-l from-transparent to-st-accentBd" />
    </div>
  );
}

export function SystemNotice({
  message,
  actionLabel,
  onAction,
}: {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="animate-st-fade-up rounded-[14px] border border-st-bd2 bg-st-surface2 px-4 py-3.5">
      <p className="text-[13.5px] leading-relaxed text-st-muted">{message}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          data-advance
          className="mt-3 min-h-[44px] rounded-full bg-st-accentDeep px-5 py-2.5 text-sm font-semibold text-st-page transition hover:-translate-y-px"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
