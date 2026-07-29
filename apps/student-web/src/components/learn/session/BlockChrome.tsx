'use client';

import { BookmarkPlus, Info, Layers, Minimize2, MoreHorizontal, Telescope } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

const OVERFLOW_VERBS = [
  { id: 'save_notes', label: 'Save to notes', icon: BookmarkPlus },
  { id: 'flashcard', label: 'Make a flashcard', icon: Layers },
  { id: 'simpler', label: 'Explain simpler', icon: Minimize2 },
  { id: 'deeper', label: 'Explain deeper', icon: Telescope },
] as const;

export type OverflowVerbId = (typeof OVERFLOW_VERBS)[number]['id'];

/**
 * Per-block affordances. They stay invisible until the block is hovered or
 * focused so the reading column reads as prose, not as a toolbar — but they
 * are always visible on touch, where hover does not exist.
 */
export function BlockChrome({
  whyHere,
  onOverflow,
  children,
  className = '',
}: {
  whyHere: string;
  onOverflow?: (verb: OverflowVerbId) => void;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState<'why' | 'menu' | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const buttonClass = (active: boolean) =>
    `inline-flex h-8 w-8 items-center justify-center rounded-full transition ${
      active
        ? 'bg-st-surface2 text-st-inkSoft'
        : 'text-st-faint hover:bg-st-surface2 hover:text-st-inkSoft'
    }`;

  return (
    <div ref={rootRef} className={`group/block relative ${className}`}>
      <div className="absolute right-0 top-0 z-10 flex gap-0.5 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/block:opacity-100 [@media(hover:none)]:opacity-100">
        <button
          type="button"
          aria-label="Why this is here"
          aria-expanded={open === 'why'}
          onClick={() => setOpen((v) => (v === 'why' ? null : 'why'))}
          className={buttonClass(open === 'why')}
        >
          <Info size={15} strokeWidth={2} aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Block actions"
          aria-expanded={open === 'menu'}
          onClick={() => setOpen((v) => (v === 'menu' ? null : 'menu'))}
          className={buttonClass(open === 'menu')}
        >
          <MoreHorizontal size={15} strokeWidth={2} aria-hidden />
        </button>
      </div>

      {open === 'why' && (
        <div className="absolute right-0 top-9 z-30 w-[min(20rem,calc(100vw-3rem))] animate-st-fade-up rounded-[14px] border border-st-bd2 bg-st-card p-3.5 shadow-[0_18px_40px_-24px_rgba(23,37,31,0.6)]">
          <p className="font-mono-ui text-[9.5px] font-semibold tracking-[0.1em] text-st-faint">
            WHY THIS IS HERE
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-st-inkSoft">{whyHere}</p>
        </div>
      )}

      {open === 'menu' && (
        <div className="absolute right-0 top-9 z-30 min-w-[190px] animate-st-fade-up overflow-hidden rounded-[14px] border border-st-bd2 bg-st-card p-1 shadow-[0_18px_40px_-24px_rgba(23,37,31,0.6)]">
          {OVERFLOW_VERBS.map((verb) => (
            <button
              key={verb.id}
              type="button"
              className="flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] text-st-inkSoft transition hover:bg-st-surface2 hover:text-st-ink"
              onClick={() => {
                onOverflow?.(verb.id);
                setOpen(null);
              }}
            >
              <verb.icon size={14} strokeWidth={1.9} className="shrink-0 text-st-faint" aria-hidden />
              {verb.label}
            </button>
          ))}
        </div>
      )}

      {children}
    </div>
  );
}
