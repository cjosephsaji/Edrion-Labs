'use client';

import { Check, RotateCcw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { MathText } from '@/components/learn/MathText';
import { Eyebrow } from '@/components/ui/primitives';

export type StudyCard = {
  id: string;
  prompt: string;
  answer: string;
  sourcePage: number | null;
};

export type StudyOutcome = {
  /** Distinct cards in the session. */
  total: number;
  /** Cards that needed at least one "Again". */
  shaky: number;
  /** Total "Again" presses — a card can be missed more than once. */
  againPresses: number;
  shakyIds: string[];
};

type FlashcardStudyProps = {
  cards: StudyCard[];
  deckTitle: string;
  /** Fire-and-forget — grading must never wait on the network. */
  onGrade: (cardId: string, result: 'got_it' | 'again') => void;
  onExit: () => void;
  onDone: (outcome: StudyOutcome) => void;
};

/** Enough segments to still be readable; longer decks get a continuous bar. */
const MAX_SEGMENTS = 16;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="ml-2 hidden rounded-[5px] border border-current px-1.5 py-0.5 font-mono-ui text-[10px] font-semibold opacity-55 sm:inline-block">
      {children}
    </kbd>
  );
}

export function FlashcardStudy({
  cards,
  deckTitle,
  onGrade,
  onExit,
  onDone,
}: FlashcardStudyProps) {
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  const [queue, setQueue] = useState<string[]>(() => cards.map((c) => c.id));
  const [flipped, setFlipped] = useState(false);
  const [clearedIds, setClearedIds] = useState<string[]>([]);
  const [shakyIds, setShakyIds] = useState<string[]>([]);
  const [againPresses, setAgainPresses] = useState(0);
  const [leaving, setLeaving] = useState<'got_it' | 'again' | null>(null);

  const currentId = queue[0];
  const current = currentId ? byId.get(currentId) : undefined;
  const reduceMotion = prefersReducedMotion();

  const grade = useCallback(
    (result: 'got_it' | 'again') => {
      const id = queue[0];
      if (!id || leaving) return;

      onGrade(id, result);
      setLeaving(result);

      window.setTimeout(
        () => {
          setFlipped(false);
          setLeaving(null);

          if (result === 'again') {
            setAgainPresses((n) => n + 1);
            setShakyIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
            setQueue((q) => [...q.slice(1), id]);
            return;
          }

          const cleared = [...clearedIds, id];
          const rest = queue.slice(1);
          setClearedIds(cleared);
          setQueue(rest);

          if (rest.length === 0) {
            onDone({
              total: cards.length,
              shaky: shakyIds.length,
              againPresses,
              shakyIds,
            });
          }
        },
        reduceMotion ? 0 : 170,
      );
    },
    [againPresses, cards.length, clearedIds, leaving, onDone, onGrade, queue, reduceMotion, shakyIds],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      // Let focused controls handle their own keys — no double-firing.
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A'].includes(target.tagName))
      ) {
        if (e.key !== 'Escape') return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        onExit();
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        setFlipped((f) => !f);
        return;
      }
      if (!flipped) return;
      if (e.key === '1' || e.key === 'ArrowLeft') {
        e.preventDefault();
        grade('again');
      } else if (e.key === '2' || e.key === 'ArrowRight') {
        e.preventDefault();
        grade('got_it');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [flipped, grade, onExit]);

  if (!current) return null;

  const done = clearedIds.length;
  const total = cards.length;
  const pct = total > 0 ? (done / total) * 100 : 0;
  const leavingClass =
    leaving === 'got_it'
      ? 'transition-all duration-150 ease-out translate-x-10 opacity-0'
      : leaving === 'again'
        ? 'transition-all duration-150 ease-out -translate-x-10 opacity-0'
        : '';

  /** `flip3d` is off in reduced-motion mode, where faces are swapped rather than rotated. */
  const face = (side: 'front' | 'back', flip3d: boolean) => {
    const isBack = side === 'back';
    return (
      <div
        className={`col-start-1 row-start-1 flex min-h-[286px] flex-col rounded-[26px] border p-6 shadow-[0_24px_60px_-38px_rgba(23,37,31,0.65)] sm:p-8 ${
          flip3d ? '[backface-visibility:hidden] [-webkit-backface-visibility:hidden]' : ''
        } ${
          isBack
            ? `border-st-accentBd bg-st-cardAlt ${flip3d ? '[transform:rotateY(180deg)]' : ''}`
            : 'border-st-bd1 bg-st-card'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <Eyebrow color={isBack ? 'accent' : 'faint'}>{isBack ? 'ANSWER' : 'QUESTION'}</Eyebrow>
          {isBack && current.sourcePage && (
            <span className="font-mono-ui text-[10px] text-st-faint">p.{current.sourcePage}</span>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center py-6 text-center">
          <div className={isBack ? 'text-st-inkSoft' : 'text-st-ink'}>
            <MathText
              className={
                isBack
                  ? 'text-[17px] leading-[1.6] [&_p+p]:mt-3'
                  : 'font-display text-[21px] leading-[1.45] sm:text-[23px]'
              }
            >
              {isBack ? current.answer : current.prompt}
            </MathText>
          </div>
        </div>

        <p className="text-center font-mono-ui text-[10px] uppercase tracking-[0.12em] text-st-faint2">
          {isBack ? 'How did that go?' : 'Tap or press space to reveal'}
        </p>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-[600px] px-4 py-6 pb-28 sm:px-5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onExit}
          aria-label="Exit study session"
          className="-ml-2 grid h-9 w-9 shrink-0 place-items-center rounded-full text-st-faint transition hover:bg-st-surface2 hover:text-st-ink"
        >
          <X size={17} strokeWidth={2} aria-hidden />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="truncate font-mono-ui text-[10px] font-semibold uppercase tracking-[0.14em] text-st-faint">
              {deckTitle}
            </p>
            <p className="shrink-0 font-mono-ui text-[10px] font-semibold tracking-[0.1em] text-st-muted">
              {done}/{total}
            </p>
          </div>

          <div
            role="progressbar"
            aria-label="Cards cleared"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={done}
            className="mt-2"
          >
            {total <= MAX_SEGMENTS ? (
              <div className="flex gap-1">
                {cards.map((c) => {
                  const cleared = clearedIds.includes(c.id);
                  const shaky = shakyIds.includes(c.id);
                  return (
                    <span
                      key={c.id}
                      className={`h-[5px] flex-1 rounded-full transition-colors duration-300 ${
                        cleared
                          ? shaky
                            ? 'bg-st-amber'
                            : 'bg-st-accent'
                          : 'bg-st-bd2'
                      }`}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="h-[5px] w-full overflow-hidden rounded-full bg-st-bd2">
                <div
                  className="h-full rounded-full bg-st-accent transition-[width] duration-500 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="relative mt-7">
        {/* Deck depth — the pile you are working through, not a lone box. */}
        {queue.length > 2 && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-full origin-top rounded-[26px] border border-st-bd1 bg-st-card/50 [transform:translateY(16px)_scale(0.94)]"
          />
        )}
        {queue.length > 1 && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-full origin-top rounded-[26px] border border-st-bd1 bg-st-card/80 [transform:translateY(8px)_scale(0.97)]"
          />
        )}

        <div className={`relative z-10 ${leavingClass}`}>
          <button
            key={current.id}
            type="button"
            onClick={() => setFlipped((f) => !f)}
            aria-label={flipped ? 'Show question' : 'Show answer'}
            className="block w-full animate-st-block-in rounded-[26px] text-left outline-none focus-visible:ring-2 focus-visible:ring-st-accent focus-visible:ring-offset-4 focus-visible:ring-offset-st-page"
          >
            {reduceMotion ? (
              <div className="grid">{face(flipped ? 'back' : 'front', false)}</div>
            ) : (
              <div className="grid [perspective:1600px]">
                <div
                  className="col-start-1 row-start-1 grid [transform-style:preserve-3d]"
                  style={{
                    transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                    transition: 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }}
                >
                  {face('front', true)}
                  {face('back', true)}
                </div>
              </div>
            )}
          </button>
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {flipped ? `Answer: ${current.answer}` : `Question: ${current.prompt}`}
      </p>

      <div className="mt-7">
        {!flipped ? (
          <button
            type="button"
            onClick={() => setFlipped(true)}
            className="flex min-h-[52px] w-full items-center justify-center rounded-full bg-st-accentDeep px-5 text-[15px] font-semibold text-st-page shadow-[0_14px_30px_-18px_rgba(12,63,49,0.9)] transition hover:-translate-y-px"
          >
            Reveal answer
            <KeyCap>Space</KeyCap>
          </button>
        ) : (
          <div className="grid animate-st-fade-up grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => grade('again')}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-full border border-st-amberBd bg-st-amberSoft px-4 text-[15px] font-semibold text-st-amberInk transition hover:-translate-y-px hover:bg-st-amberSoft/70"
            >
              <RotateCcw size={16} strokeWidth={2.2} aria-hidden />
              Again
              <KeyCap>1</KeyCap>
            </button>
            <button
              type="button"
              onClick={() => grade('got_it')}
              className="flex min-h-[52px] items-center justify-center gap-2 rounded-full bg-st-accentDeep px-4 text-[15px] font-semibold text-st-page shadow-[0_14px_30px_-18px_rgba(12,63,49,0.9)] transition hover:-translate-y-px"
            >
              <Check size={17} strokeWidth={2.6} aria-hidden />
              Got it
              <KeyCap>2</KeyCap>
            </button>
          </div>
        )}

        <p className="mt-3 text-center text-[11.5px] text-st-faint">
          {queue.length === 1
            ? 'Last card in this round'
            : `${queue.length} cards left in this round`}
          {shakyIds.length > 0 && ` · ${shakyIds.length} coming back around`}
        </p>
      </div>
    </div>
  );
}
