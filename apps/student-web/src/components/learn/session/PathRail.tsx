'use client';

import { Check } from 'lucide-react';
import { Eyebrow } from '@/components/ui/primitives';

export type PathCheckpoint = { id: string; label: string };

type PathRailProps = {
  checkpoints: PathCheckpoint[];
  /** Index of the checkpoint currently in progress. */
  current: number;
  /** Jump back to a checkpoint already passed. Omit to make the rail read-only. */
  onJump?: (index: number) => void;
  pathContext?: { label: string; index: number; total: number } | null;
};

/**
 * The lesson spine. One dot per checkpoint, connected — so "where am I"
 * is answered by shape, not by counting. Passed checkpoints are re-readable.
 */
export function PathRail({ checkpoints, current, onJump, pathContext }: PathRailProps) {
  if (checkpoints.length === 0) return null;

  return (
    <nav aria-label="Lesson path" className="sticky top-24">
      <Eyebrow>PATH</Eyebrow>
      <ol className="mt-4">
        {checkpoints.map((cp, i) => {
          const done = i < current;
          const active = i === current;
          const last = i === checkpoints.length - 1;
          const jumpable = done && !!onJump;

          return (
            <li key={cp.id} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className={`absolute bottom-0 left-[8px] top-[19px] w-px transition-colors duration-500 ${
                    done ? 'bg-st-accentLine' : 'bg-st-bd2'
                  }`}
                />
              )}
              <span
                aria-hidden
                className={`relative z-10 mt-[3px] grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full border-2 transition-colors duration-300 ${
                  done
                    ? 'border-st-accent bg-st-accent text-st-page'
                    : active
                      ? 'animate-st-soft-pulse border-st-accent bg-st-page'
                      : 'border-st-bd2 bg-st-page'
                }`}
              >
                {done && <Check size={10} strokeWidth={3.5} />}
                {active && <span className="h-[7px] w-[7px] rounded-full bg-st-accent" />}
              </span>

              {jumpable ? (
                <button
                  type="button"
                  onClick={() => onJump(i)}
                  className="-my-1 -ml-1 rounded-lg px-1 py-1 text-left text-[13.5px] leading-snug text-st-muted transition hover:bg-st-surface2 hover:text-st-ink"
                >
                  {cp.label}
                </button>
              ) : (
                <span
                  aria-current={active ? 'step' : undefined}
                  className={`text-[13.5px] leading-snug ${
                    active ? 'font-semibold text-st-ink' : 'text-st-faint'
                  }`}
                >
                  {cp.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      {pathContext && (
        <p className="mt-6 border-t border-st-divider pt-4 text-[11.5px] leading-relaxed text-st-faint">
          Topic {pathContext.index} of {pathContext.total}
          <span className="block text-st-muted">{pathContext.label}</span>
        </p>
      )}
    </nav>
  );
}

/**
 * Compact rail for narrow screens — the rails are hidden there, so the
 * checkpoint the student is on has to survive somewhere.
 */
export function PathStrip({ checkpoints, current }: { checkpoints: PathCheckpoint[]; current: number }) {
  if (checkpoints.length === 0) return null;
  const label = checkpoints[Math.min(current, checkpoints.length - 1)]?.label;

  return (
    <div className="flex items-center gap-2.5 md:hidden">
      <div className="flex shrink-0 items-center gap-1" aria-hidden>
        {checkpoints.map((cp, i) => (
          <span
            key={cp.id}
            className={`h-[5px] rounded-full transition-all duration-300 ${
              i < current
                ? 'w-[5px] bg-st-accent'
                : i === current
                  ? 'w-4 bg-st-accent'
                  : 'w-[5px] bg-st-bd2'
            }`}
          />
        ))}
      </div>
      <p className="truncate text-[11.5px] font-medium text-st-muted">{label}</p>
    </div>
  );
}
