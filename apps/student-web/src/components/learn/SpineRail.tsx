'use client';
import type { LearnSessionDto } from '@edrion/schemas';
import { useTheme } from '@/lib/theme';

const stepLabels: Record<string, string> = {
  understand: 'Understand',
  see_it_visually: 'See it',
  worked_example: 'Example',
  check_understanding: 'Check',
  solve_yourself: 'Practice',
  wrap_up: 'Wrap up',
};

export function SpineRail({ spine }: { spine: LearnSessionDto['spine'] }) {
  const { reducedMotion } = useTheme();

  return (
    <>
      <nav
        className="hidden min-[920px]:block w-[252px] shrink-0"
        aria-label="Session progress"
      >
        <div className="sticky top-20 space-y-0">
          {spine.map((entry, i) => (
            <div key={entry.step} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-5 w-5 items-center justify-center rounded-full ${
                    entry.status === 'done'
                      ? 'bg-st-accent text-white'
                      : entry.status === 'current'
                        ? 'border-2 border-st-accent'
                        : 'border border-dashed border-st-faint2'
                  } ${entry.status === 'current' && !reducedMotion ? 'animate-st-soft-pulse' : ''}`}
                >
                  {entry.status === 'done' && (
                    <svg width="9" height="9" viewBox="0 0 12 12" fill="none" aria-hidden>
                      <path
                        d="M2 6.5l2.6 2.6L10 3.5"
                        stroke="currentColor"
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  {entry.status === 'current' && (
                    <span className="h-1.5 w-1.5 rounded-full bg-st-accent" />
                  )}
                </div>
                {i < spine.length - 1 && (
                  <div
                    className={`my-0.5 w-px flex-1 min-h-[20px] ${
                      entry.status === 'done' ? 'bg-st-accentLine' : 'bg-st-bd1'
                    }`}
                  />
                )}
              </div>
              <div className="pb-4">
                <p
                  className={`text-xs font-semibold ${
                    entry.status === 'current' ? 'text-st-accentDeep' : 'text-st-muted'
                  }`}
                >
                  {stepLabels[entry.step] ?? entry.label}
                </p>
              </div>
            </div>
          ))}
          <p className="mt-2 font-mono-ui text-[9px] leading-relaxed text-st-faint">
            Evidence from your answers shapes what comes next.
          </p>
        </div>
      </nav>

      <nav className="flex gap-1 overflow-x-auto pb-2 scrollbar-thin min-[920px]:hidden" aria-label="Session progress">
        {spine.map((entry) => (
          <div
            key={entry.step}
            className={`h-1.5 w-8 shrink-0 rounded-full ${
              entry.status === 'current'
                ? 'bg-st-accent'
                : entry.status === 'done'
                  ? 'bg-st-accentLine'
                  : 'bg-st-bd1'
            }`}
          />
        ))}
      </nav>
    </>
  );
}
