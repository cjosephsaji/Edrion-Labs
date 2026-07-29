'use client';

import { Check, X } from 'lucide-react';
import { Eyebrow } from '@/components/ui/primitives';

export type ParkedQuestion = { id: string; text: string; atStep: string };

function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  const circumference = 2 * Math.PI * 17;
  return (
    <svg width="42" height="42" viewBox="0 0 42 42" aria-hidden className="shrink-0">
      <circle cx="21" cy="21" r="17" fill="none" stroke="var(--st-bd1)" strokeWidth="4" />
      <circle
        cx="21"
        cy="21"
        r="17"
        fill="none"
        stroke="var(--st-accent)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray={`${pct * circumference} ${circumference}`}
        transform="rotate(-90 21 21)"
        style={{ transition: 'stroke-dasharray 600ms cubic-bezier(0.22,1,0.36,1)' }}
      />
      <text
        x="21"
        y="25"
        textAnchor="middle"
        fontSize="12"
        fontWeight="600"
        fill="var(--st-accentDeep)"
        fontFamily="IBM Plex Mono, monospace"
      >
        {done}
      </text>
    </svg>
  );
}

/**
 * The right rail earns its width only when it holds real state: what has
 * actually been passed, and what the student actually parked. Empty states
 * stay a single quiet line rather than a card of promises.
 */
export function SessionAside({
  learned,
  totalCheckpoints,
  parked,
  onRemoveParked,
}: {
  learned: string[];
  totalCheckpoints: number;
  parked: ParkedQuestion[];
  onRemoveParked: (id: string) => void;
}) {
  return (
    <div className="sticky top-24 space-y-6">
      <section>
        <Eyebrow>THIS SESSION</Eyebrow>
        <div className="mt-3 flex items-center gap-3">
          <ProgressRing done={learned.length} total={totalCheckpoints} />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-st-ink">
              {learned.length} of {totalCheckpoints} checkpoints
            </p>
            <p className="text-[11.5px] text-st-faint">
              {learned.length === 0 ? 'Nothing passed yet' : 'Passed so far'}
            </p>
          </div>
        </div>

        {learned.length > 0 && (
          <ul className="mt-4 space-y-2">
            {learned.map((label) => (
              <li
                key={label}
                className="flex animate-st-fade-up items-start gap-2 text-[13px] leading-snug text-st-inkSoft"
              >
                <Check size={13} strokeWidth={3} className="mt-[3px] shrink-0 text-st-accent" aria-hidden />
                {label}
              </li>
            ))}
          </ul>
        )}
      </section>

      {parked.length > 0 && (
        <section>
          <Eyebrow color="amber">PARKED QUESTIONS</Eyebrow>
          <ul className="mt-3 space-y-2">
            {parked.map((q) => (
              <li
                key={q.id}
                className="group animate-st-fade-up rounded-[12px] border border-st-amberBd bg-st-amberSoft px-3 py-2.5"
              >
                <div className="flex items-start gap-2">
                  <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-st-amberInk">{q.text}</p>
                  <button
                    type="button"
                    onClick={() => onRemoveParked(q.id)}
                    aria-label={`Remove question: ${q.text}`}
                    className="-mr-1 -mt-0.5 shrink-0 rounded-md p-1 text-st-amberInk/60 opacity-0 transition hover:bg-st-card/60 hover:text-st-amberInk focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                  >
                    <X size={13} strokeWidth={2.4} />
                  </button>
                </div>
                <p className="mt-1 font-mono-ui text-[9.5px] uppercase tracking-[0.08em] text-st-amberInk/60">
                  {q.atStep}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="border-t border-st-divider pt-4 text-[11.5px] leading-relaxed text-st-faint">
        Cards and diagrams appear at the end for you to curate. Nothing saves automatically.
      </p>
    </div>
  );
}
