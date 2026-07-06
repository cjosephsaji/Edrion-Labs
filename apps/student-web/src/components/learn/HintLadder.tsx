'use client';
import { useState } from 'react';

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
      <p className="text-xs font-semibold text-st-faint">Hints</p>
      {[1, 2, 3].map((rung) => {
        const idx = rung - 1;
        const unlocked = revealed >= rung;
        return (
          <button
            key={rung}
            type="button"
            onClick={() => reveal(rung as 1 | 2 | 3)}
            className={`w-full rounded-xl border px-4 py-2.5 text-left text-sm ${
              unlocked ? 'border-st-accent/30 bg-st-accentSoft/40 text-st-ink' : 'border-st-bd1 text-st-muted'
            }`}
          >
            <span className="font-semibold">Hint {rung}</span>
            {unlocked && <p className="mt-1 text-st-muted">{hints[idx]}</p>}
          </button>
        );
      })}
    </div>
  );
}
