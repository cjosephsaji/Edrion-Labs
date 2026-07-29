'use client';

import { Check } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MathText } from '@/components/learn/MathText';
import { Eyebrow } from '@/components/ui/primitives';
import type { ParkedQuestion } from './SessionAside';

export type ProposedCard = {
  id: string;
  front: string;
  back: string;
  fromWrong: boolean;
};

export function CompletionCard({
  topicTitle,
  checkpoints,
  summaryMd,
  cards,
  parked,
  selected,
  onToggle,
  onSelectAll,
  onSave,
}: {
  topicTitle: string;
  checkpoints: string[];
  summaryMd: string;
  cards: ProposedCard[];
  parked: ParkedQuestion[];
  selected: Record<string, boolean>;
  onToggle: (id: string) => void;
  onSelectAll: (next: boolean) => void;
  onSave: () => Promise<void>;
}) {
  const saveCount = cards.filter((c) => selected[c.id]).length;
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  const allSelected = cards.length > 0 && saveCount === cards.length;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-st-ink/30 p-0 backdrop-blur-[2px] sm:p-4 md:items-center">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="lesson-complete-title"
        tabIndex={-1}
        className="flex max-h-[92dvh] w-full max-w-[520px] animate-st-sheet-in flex-col overflow-hidden rounded-t-[24px] border border-st-bd1 bg-st-card shadow-2xl outline-none sm:rounded-[24px] md:animate-st-pop-in"
      >
        <div className="overflow-y-auto scrollbar-thin px-6 pt-7">
          <div className="mx-auto grid h-14 w-14 animate-st-pop-in place-items-center rounded-full bg-st-accentSoft text-st-accentDeep">
            <Check size={26} strokeWidth={2.6} aria-hidden />
          </div>
          <h2
            id="lesson-complete-title"
            className="mt-4 text-center font-display text-[26px] font-semibold tracking-[-0.01em] text-st-ink"
          >
            Lesson complete
          </h2>
          <p className="mt-1.5 text-center text-sm text-st-muted">{topicTitle}</p>

          {checkpoints.length > 0 && (
            <ul className="mt-6 space-y-2 rounded-[16px] bg-st-surface2 p-4">
              {checkpoints.map((c) => (
                <li key={c} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-st-inkSoft">
                  <Check size={13} strokeWidth={3} className="mt-[3px] shrink-0 text-st-accent" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
          )}

          {summaryMd && (
            <p className="mt-4 text-[14.5px] leading-relaxed text-st-inkSoft">
              {summaryMd.replace(/\*\*/g, '')}
            </p>
          )}

          {cards.length > 0 && (
            <div className="mt-7">
              <div className="flex items-baseline justify-between gap-3">
                <Eyebrow>SAVE TO LIBRARY</Eyebrow>
                <button
                  type="button"
                  onClick={() => onSelectAll(!allSelected)}
                  className="text-[11.5px] font-semibold text-st-accent hover:text-st-accentDeep"
                >
                  {allSelected ? 'Clear all' : 'Select all'}
                </button>
              </div>
              <p className="mt-1 text-[11.5px] text-st-faint">
                Nothing saves automatically — choosing is part of learning.
              </p>
              <div className="mt-3 space-y-2">
                {cards.map((c) => {
                  const on = !!selected[c.id];
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer gap-3 rounded-[14px] border p-3.5 text-sm transition ${
                        on
                          ? 'border-st-accentBd bg-st-accentSoft/50'
                          : 'border-st-bd2 bg-st-page/50 hover:border-st-bd1'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => onToggle(c.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={`mt-[1px] grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border-2 transition ${
                          on ? 'border-st-accent bg-st-accent text-st-page' : 'border-st-bd2 bg-st-card'
                        }`}
                      >
                        {on && <Check size={11} strokeWidth={3.5} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-medium text-st-ink">
                          <MathText className="text-[14.5px] leading-snug">{c.front}</MathText>
                        </span>
                        <span className="mt-1 block text-[13px] leading-snug text-st-muted">
                          <MathText className="text-[13px] leading-snug">{c.back}</MathText>
                        </span>
                        {c.fromWrong && (
                          <span className="mt-1.5 inline-block rounded-full bg-st-amberSoft px-2 py-0.5 font-mono-ui text-[9.5px] font-semibold uppercase tracking-[0.08em] text-st-amberInk">
                            From a miss
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {parked.length > 0 && (
            <div className="mt-7">
              <Eyebrow color="amber">YOU PARKED</Eyebrow>
              <ul className="mt-2 space-y-1.5">
                {parked.map((q) => (
                  <li key={q.id} className="text-[13px] leading-snug text-st-muted">
                    · {q.text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="border-t border-st-divider bg-st-card px-6 pb-6 pt-4">
          {saveError && (
            <p className="mb-3 rounded-xl border border-st-amberBd bg-st-amberSoft px-3 py-2 text-[12.5px] text-st-amberInk">
              {saveError}
            </p>
          )}
          <button
            type="button"
            disabled={saving}
            className="w-full rounded-full bg-gradient-to-br from-[#0C3F31] to-[#155844] px-4 py-3.5 text-sm font-semibold text-[#F6F3E9] shadow-[0_14px_30px_-18px_rgba(12,63,49,0.9)] transition hover:-translate-y-px disabled:opacity-60 disabled:hover:translate-y-0"
            onClick={() => {
              setSaving(true);
              setSaveError(null);
              void onSave()
                .catch((err: unknown) => {
                  setSaveError(
                    err instanceof Error ? err.message : 'Could not save cards to Library. Try again.',
                  );
                })
                .finally(() => setSaving(false));
            }}
          >
            {saving
              ? 'Saving to Library…'
              : saveCount > 0
                ? `Save ${saveCount} ${saveCount === 1 ? 'card' : 'cards'} to Library`
                : 'Finish lesson'}
          </button>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-st-faint">
              {saveCount > 0 ? 'Opens the new deck in Library' : 'No cards selected'}
            </p>
            <Link href="/learn/path" className="text-[12.5px] font-semibold text-st-accent hover:text-st-accentDeep">
              See your path →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
