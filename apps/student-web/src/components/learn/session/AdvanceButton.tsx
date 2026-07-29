'use client';

import { ArrowRight } from 'lucide-react';

/**
 * The single forward action in a lesson. Same shape, same weight, same place
 * every time — moving on should never cost a decision.
 * `text-st-page` on `bg-st-accentDeep` stays legible in all three student themes.
 */
export function AdvanceButton({
  label = 'Continue',
  onClick,
  align = 'left',
  hint = true,
}: {
  label?: string;
  onClick: () => void;
  align?: 'left' | 'center';
  hint?: boolean;
}) {
  return (
    <div
      className={`mt-5 flex items-center gap-3 ${align === 'center' ? 'justify-center' : ''}`}
    >
      <button
        type="button"
        onClick={onClick}
        data-advance
        className="group inline-flex min-h-[44px] items-center gap-2 rounded-full bg-st-accentDeep px-5 py-2.5 text-sm font-semibold text-st-page shadow-[0_10px_24px_-16px_rgba(12,63,49,0.9)] outline-none transition duration-150 hover:-translate-y-px hover:shadow-[0_16px_30px_-16px_rgba(12,63,49,0.95)] focus-visible:ring-2 focus-visible:ring-st-accent focus-visible:ring-offset-2 focus-visible:ring-offset-st-page active:translate-y-0"
      >
        {label}
        <ArrowRight
          size={15}
          strokeWidth={2.2}
          aria-hidden
          className="transition-transform duration-150 group-hover:translate-x-0.5"
        />
      </button>
      {hint && (
        <span className="hidden items-center gap-1.5 font-mono-ui text-[10.5px] text-st-faint2 sm:inline-flex">
          <kbd className="rounded-[5px] border border-st-bd1 bg-st-card px-1.5 py-0.5">↵</kbd>
          Enter
        </span>
      )}
    </div>
  );
}
