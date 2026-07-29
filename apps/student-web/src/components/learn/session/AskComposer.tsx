'use client';

import { ArrowUp } from 'lucide-react';
import { useState } from 'react';

/**
 * Ask lives at the bottom of the reading column, not floating over it —
 * it scrolls with the lesson and sticks only once the column is taller
 * than the viewport, so short lessons never end in a stranded bar.
 *
 * Live Ask is stubbed server-side during the Learn rebuild, so a question
 * is parked against the current step instead of pretending to answer.
 */
export function AskComposer({
  onPark,
  stepLabel,
}: {
  onPark: (text: string) => void;
  stepLabel?: string;
}) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const canSend = value.trim().length > 0;

  const send = () => {
    if (!canSend) return;
    onPark(value.trim());
    setValue('');
  };

  return (
    <div className="sticky bottom-0 z-20 mt-auto">
      <div
        aria-hidden
        className="pointer-events-none h-10 bg-gradient-to-t from-st-page to-transparent"
      />
      <div className="bg-st-page pb-4">
        <div
          className={`flex items-center gap-2 rounded-full border bg-st-card pl-4 pr-2 transition duration-200 ${
            focused
              ? 'border-st-accentBd shadow-[0_0_0_4px_rgba(30,122,94,0.10)]'
              : 'border-st-bd2 shadow-[0_8px_24px_-20px_rgba(23,37,31,0.5)]'
          }`}
        >
          <label htmlFor="learn-ask" className="sr-only">
            Ask about this step
          </label>
          <input
            id="learn-ask"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask anything about this step…"
            autoComplete="off"
            className="min-h-[44px] flex-1 bg-transparent py-3 text-sm text-st-ink outline-none placeholder:text-st-faint"
          />
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Park this question"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-st-accentDeep text-st-page transition disabled:bg-st-bd2 disabled:text-st-faint"
          >
            <ArrowUp size={16} strokeWidth={2.4} aria-hidden />
          </button>
        </div>
        <p className="mt-2 px-4 text-center text-[10.5px] text-st-faint2">
          {canSend && stepLabel
            ? `Parks against “${stepLabel}” — you'll see it again at the end.`
            : 'Questions park here and come back at the end of the lesson.'}
        </p>
      </div>
    </div>
  );
}
