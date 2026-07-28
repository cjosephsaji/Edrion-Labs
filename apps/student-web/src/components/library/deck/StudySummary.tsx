'use client';

import { Check, RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { Eyebrow } from '@/components/ui/primitives';
import type { StudyOutcome } from './FlashcardStudy';

function ResultRing({ solid, total }: { solid: number; total: number }) {
  const pct = total > 0 ? solid / total : 0;
  const c = 2 * Math.PI * 34;
  return (
    <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden className="shrink-0">
      <circle cx="42" cy="42" r="34" fill="none" stroke="var(--st-bd1)" strokeWidth="7" />
      <circle
        cx="42"
        cy="42"
        r="34"
        fill="none"
        stroke="var(--st-accent)"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={`${pct * c} ${c}`}
        transform="rotate(-90 42 42)"
        style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.22,1,0.36,1)' }}
      />
      <text
        x="42"
        y="48"
        textAnchor="middle"
        fontSize="20"
        fontWeight="600"
        fill="var(--st-accentDeep)"
        fontFamily="IBM Plex Mono, monospace"
      >
        {Math.round(pct * 100)}
      </text>
    </svg>
  );
}

/**
 * Says what actually happened rather than congratulating. "First try" is the
 * number worth reporting — everything else came back around until it stuck.
 */
export function StudySummary({
  outcome,
  deckTitle,
  onRestartShaky,
  onBackToDeck,
}: {
  outcome: StudyOutcome;
  deckTitle: string;
  onRestartShaky: () => void;
  onBackToDeck: () => void;
}) {
  const firstTry = outcome.total - outcome.shaky;

  return (
    <div className="mx-auto w-full max-w-[560px] animate-st-block-in px-4 py-10 pb-28 sm:px-5">
      <div className="rounded-[26px] border border-st-bd1 bg-st-card p-6 shadow-[0_24px_60px_-42px_rgba(23,37,31,0.6)] sm:p-8">
        <Eyebrow color="accent">ROUND COMPLETE</Eyebrow>
        <h1 className="mt-2 font-display text-[27px] font-semibold tracking-[-0.015em] text-st-ink">
          Every card cleared
        </h1>
        <p className="mt-1.5 text-sm text-st-muted">{deckTitle}</p>

        <div className="mt-6 flex items-center gap-5">
          <ResultRing solid={firstTry} total={outcome.total} />
          <div className="min-w-0 space-y-2.5">
            <p className="flex items-center gap-2 text-[14px] text-st-inkSoft">
              <Check size={15} strokeWidth={3} className="shrink-0 text-st-accent" aria-hidden />
              <span>
                <span className="font-semibold text-st-ink">{firstTry}</span> of {outcome.total} on
                the first try
              </span>
            </p>
            {outcome.shaky > 0 ? (
              <p className="flex items-center gap-2 text-[14px] text-st-inkSoft">
                <RotateCcw size={14} strokeWidth={2.4} className="shrink-0 text-st-amber" aria-hidden />
                <span>
                  <span className="font-semibold text-st-ink">{outcome.shaky}</span> needed another
                  look
                  {outcome.againPresses > outcome.shaky && ` (${outcome.againPresses} repeats)`}
                </span>
              </p>
            ) : (
              <p className="text-[14px] text-st-muted">Nothing came back around.</p>
            )}
          </div>
        </div>

        <p className="mt-6 border-t border-st-divider pt-4 text-[13px] leading-relaxed text-st-muted">
          {outcome.shaky > 0
            ? 'The shaky ones are scheduled sooner. Spacing does the rest — you do not need to grind them now.'
            : 'These are scheduled further out now. Come back when they are due, not before.'}
        </p>
      </div>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row">
        {outcome.shaky > 0 && (
          <button
            type="button"
            onClick={onRestartShaky}
            className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-full bg-st-accentDeep px-5 text-sm font-semibold text-st-page shadow-[0_14px_30px_-18px_rgba(12,63,49,0.9)] transition hover:-translate-y-px"
          >
            <RotateCcw size={15} strokeWidth={2.3} aria-hidden />
            Redo the {outcome.shaky} shaky {outcome.shaky === 1 ? 'card' : 'cards'}
          </button>
        )}
        <button
          type="button"
          onClick={onBackToDeck}
          className="flex min-h-[48px] flex-1 items-center justify-center rounded-full border border-st-bd2 bg-st-card px-5 text-sm font-semibold text-st-inkSoft transition hover:border-st-accent hover:text-st-accentDeep"
        >
          Back to deck
        </button>
      </div>

      <div className="mt-4 text-center">
        <Link href="/library" className="text-[13px] font-semibold text-st-accent hover:text-st-accentDeep">
          Back to Library →
        </Link>
      </div>
    </div>
  );
}
