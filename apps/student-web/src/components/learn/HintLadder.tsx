'use client';
import { useState } from 'react';
import { Eyebrow } from '@/components/ui/primitives';

export function HintLadder({
  hints,
  onReveal,
}: {
  hints: [string, string, string];
  onReveal?: (rung: 1 | 2 | 3) => void;
}) {
  const [revealed, setRevealed] = useState(0);

  const reveal = (rung: 1 | 2 | 3) => {
    if (rung <= revealed) return;
    setRevealed(rung);
    onReveal?.(rung);
  };

  return (
    <div className="space-y-2">
      <Eyebrow>HINT LADDER</Eyebrow>
      {[1, 2, 3].map((rung) => {
        const idx = rung - 1;
        const unlocked = revealed >= rung;
        const isNext = revealed + 1 === rung;
        return (
          <button
            key={rung}
            type="button"
            onClick={() => reveal(rung as 1 | 2 | 3)}
            disabled={!unlocked && !isNext}
            className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm transition ${
              unlocked
                ? 'border-st-violet/30 bg-st-violetSoft/50 text-st-ink'
                : isNext
                  ? 'border-st-bd2 bg-st-card text-st-muted hover:border-st-violet/30'
                  : 'border-dashed border-st-bd2 bg-st-cardAlt text-st-faint2'
            }`}
          >
            <span className="font-mono-ui text-[10px] font-semibold tracking-wide text-st-faint">
              RUNG {rung}
            </span>
            {unlocked && <p className="mt-1 text-st-muted">{hints[idx]}</p>}
            {!unlocked && isNext && <p className="mt-1 text-xs">Tap to reveal</p>}
          </button>
        );
      })}
    </div>
  );
}
