'use client';
import { useState } from 'react';
import { Eyebrow } from '@/components/ui/primitives';
import { MathText } from './MathText';

const RUNG_LABELS = ['Nudge', 'Bigger hint', 'Walkthrough'] as const;

export function HintLadder({
  hints,
  startRevealed = 0,
  loadingRung = null,
  onReveal,
}: {
  hints: [string, string, string];
  startRevealed?: number;
  loadingRung?: number | null;
  onReveal?: (rung: 1 | 2 | 3) => void | Promise<void>;
}) {
  const [revealed, setRevealed] = useState(startRevealed);

  const reveal = async (rung: 1 | 2 | 3) => {
    if (rung <= revealed || loadingRung !== null) return;
    await onReveal?.(rung);
    setRevealed(rung);
  };

  return (
    <div className="space-y-2">
      <Eyebrow>HINT LADDER</Eyebrow>
      {[1, 2, 3].map((rung) => {
        const idx = rung - 1;
        const unlocked = revealed >= rung;
        const isNext = revealed + 1 === rung;
        const isLoading = loadingRung === rung;
        const hintText = hints[idx]?.trim();
        return (
          <button
            key={rung}
            type="button"
            onClick={() => void reveal(rung as 1 | 2 | 3)}
            disabled={(!unlocked && !isNext) || isLoading || loadingRung !== null}
            className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm transition ${
              unlocked
                ? 'border-st-violet/30 bg-st-violetSoft/50 text-st-ink'
                : isNext
                  ? 'border-st-bd2 bg-st-card text-st-muted hover:border-st-violet/30'
                  : 'border-dashed border-st-bd2 bg-st-cardAlt text-st-faint2'
            }`}
          >
            <span className="font-mono-ui text-[10px] font-semibold tracking-wide text-st-faint">
              RUNG {rung} · {RUNG_LABELS[idx]}
            </span>
            {isLoading && (
              <div className="mt-2 h-4 w-3/4 shimmer rounded" aria-label="Loading hint" />
            )}
            {unlocked && !isLoading && hintText && (
              <p className="mt-1 text-st-muted">
                <MathText>{hintText}</MathText>
              </p>
            )}
            {unlocked && !isLoading && !hintText && (
              <p className="mt-1 text-xs text-st-faint">Hint unavailable — try the next rung.</p>
            )}
            {!unlocked && isNext && !isLoading && <p className="mt-1 text-xs">Tap to reveal</p>}
          </button>
        );
      })}
    </div>
  );
}
