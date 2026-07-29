'use client';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import {
  useAddCard,
  useDeck,
  useDeleteCard,
  usePatchCard,
  usePatchDeck,
  useReviewCard,
} from '@/lib/hooks';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { MathText } from '@/components/learn/MathText';
import {
  FlashcardStudy,
  type StudyCard,
  type StudyOutcome,
} from '@/components/library/deck/FlashcardStudy';
import { StudySummary } from '@/components/library/deck/StudySummary';
import { EmptyState } from '@/components/ui/empty-state';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { useToast } from '@/components/ui/toast';

type Mode = 'cover' | 'study' | 'summary' | 'edit';

export default function DeckPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useDeck(params.id);
  const review = useReviewCard(params.id);
  const patchDeck = usePatchDeck(params.id);
  const addCard = useAddCard(params.id);
  const patchCard = usePatchCard(params.id);
  const deleteCard = useDeleteCard(params.id);
  const { say } = useToast();

  const [mode, setMode] = useState<Mode>('cover');
  const [sessionCards, setSessionCards] = useState<StudyCard[]>([]);
  const [outcome, setOutcome] = useState<StudyOutcome | null>(null);

  const cardsById = useMemo(
    () => new Map(data?.cards.map((c) => [c.id, c]) ?? []),
    [data?.cards],
  );

  const startStudy = useCallback(
    (ids?: string[]) => {
      if (!data) return;
      const pool = ids
        ? (ids.map((id) => cardsById.get(id)).filter(Boolean) as typeof data.cards)
        : data.dueToday > 0
          ? data.cards.filter((c) => c.dueNow)
          : data.cards;
      const chosen = pool.length ? pool : data.cards;
      if (!chosen.length) return;

      setSessionCards(
        chosen.map((c) => ({
          id: c.id,
          prompt: c.prompt,
          answer: c.answer,
          sourcePage: c.sourcePage,
        })),
      );
      setOutcome(null);
      setMode('study');
    },
    [cardsById, data],
  );

  /**
   * Grading never blocks on the network — the next card is up immediately and
   * the write lands in the background. A failure surfaces as a toast, not a stall.
   */
  const grade = useCallback(
    (cardId: string, result: 'got_it' | 'again') => {
      review.mutate(
        { cardId, result },
        { onError: () => say('That review didn’t save — check your connection.') },
      );
    },
    [review, say],
  );

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[600px] px-4 py-6">
        <div className="h-4 w-32 rounded-full bg-st-surface2 shimmer" />
        <div className="mt-4 h-7 w-2/3 rounded-full bg-st-surface2 shimmer" />
        <div className="mt-8 h-[286px] rounded-[26px] bg-st-surface2 shimmer" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <EmptyState eyebrow="DECK" title="Deck not found" />
      </div>
    );
  }

  if (mode === 'study' && sessionCards.length > 0) {
    return (
      <FlashcardStudy
        cards={sessionCards}
        deckTitle={data.title}
        onGrade={grade}
        onExit={() => setMode('cover')}
        onDone={(result) => {
          setOutcome(result);
          setMode('summary');
        }}
      />
    );
  }

  if (mode === 'summary' && outcome) {
    return (
      <StudySummary
        outcome={outcome}
        deckTitle={data.title}
        onRestartShaky={() => startStudy(outcome.shakyIds)}
        onBackToDeck={() => setMode('cover')}
      />
    );
  }

  if (mode === 'edit') {
    return (
      <div className="mx-auto max-w-[640px] animate-st-block-in px-4 py-6 pb-28 sm:px-5">
        <PageHeader
          backHref={`/library/decks/${params.id}`}
          eyebrow={<Eyebrow>EDIT DECK</Eyebrow>}
          title={data.title}
          subtitle="Changes save when you click away from a field."
        />
        <ul className="mt-6 space-y-3">
          {data.cards.map((card, i) => (
            <li key={card.id} className="rounded-[18px] border border-st-bd1 bg-st-card p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-ui text-[10px] font-semibold tracking-[0.12em] text-st-faint">
                  CARD {i + 1}
                </span>
                <div className="flex items-center gap-0.5">
                  <IconAction
                    label="Move up"
                    disabled={i === 0}
                    onClick={() => {
                      const order = data.cards.map((c) => c.id);
                      [order[i - 1], order[i]] = [order[i]!, order[i - 1]!];
                      void patchDeck.mutateAsync({ cardOrder: order });
                    }}
                  >
                    <ArrowUp size={15} strokeWidth={2} aria-hidden />
                  </IconAction>
                  <IconAction
                    label="Move down"
                    disabled={i === data.cards.length - 1}
                    onClick={() => {
                      const order = data.cards.map((c) => c.id);
                      [order[i], order[i + 1]] = [order[i + 1]!, order[i]!];
                      void patchDeck.mutateAsync({ cardOrder: order });
                    }}
                  >
                    <ArrowDown size={15} strokeWidth={2} aria-hidden />
                  </IconAction>
                  <IconAction
                    label="Delete card"
                    danger
                    onClick={() => void deleteCard.mutateAsync(card.id)}
                  >
                    <Trash2 size={15} strokeWidth={2} aria-hidden />
                  </IconAction>
                </div>
              </div>

              <label className="mt-3 block">
                <span className="font-mono-ui text-[9.5px] font-semibold tracking-[0.1em] text-st-faint">
                  QUESTION
                </span>
                <textarea
                  defaultValue={card.prompt}
                  rows={2}
                  className="mt-1 w-full resize-y rounded-[12px] border border-st-bd2 bg-st-cardAlt p-2.5 text-sm text-st-ink outline-none transition focus:border-st-accentBd focus:shadow-[0_0_0_3px_rgba(30,122,94,0.10)]"
                  onBlur={(e) => {
                    if (e.target.value !== card.prompt) {
                      void patchCard.mutateAsync({ cardId: card.id, prompt: e.target.value });
                    }
                  }}
                />
              </label>
              <label className="mt-2.5 block">
                <span className="font-mono-ui text-[9.5px] font-semibold tracking-[0.1em] text-st-faint">
                  ANSWER
                </span>
                <textarea
                  defaultValue={card.answer}
                  rows={2}
                  className="mt-1 w-full resize-y rounded-[12px] border border-st-bd2 bg-st-cardAlt p-2.5 text-sm text-st-ink outline-none transition focus:border-st-accentBd focus:shadow-[0_0_0_3px_rgba(30,122,94,0.10)]"
                  onBlur={(e) => {
                    if (e.target.value !== card.answer) {
                      void patchCard.mutateAsync({ cardId: card.id, answer: e.target.value });
                    }
                  }}
                />
              </label>
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-wrap gap-2">
          <PillButton
            type="button"
            variant="soft"
            onClick={() => void addCard.mutateAsync({ prompt: 'New prompt', answer: 'New answer' })}
          >
            <Plus size={15} strokeWidth={2.2} className="mr-1.5" aria-hidden />
            Add card
          </PillButton>
          <PillButton type="button" onClick={() => setMode('cover')}>
            Done
          </PillButton>
        </div>
      </div>
    );
  }

  const due = data.dueToday;
  const studyCount = due > 0 ? due : data.cardCount;
  const preview = data.cards[0];

  return (
    <div className="mx-auto max-w-[600px] animate-st-block-in px-4 py-6 pb-28 sm:px-5">
      <PageHeader
        backHref={data.itemId ? `/library/${data.itemId}` : '/library'}
        eyebrow={<Eyebrow>✦ FLASHCARDS</Eyebrow>}
        title={data.title}
        subtitle={data.fromLabel}
        right={<FreshnessChip freshness={data.freshness} />}
      />

      <div className="mt-6 grid grid-cols-3 gap-2.5">
        <Stat value={data.cardCount} label="cards" />
        <Stat value={due} label="due today" tone={due > 0 ? 'accent' : 'muted'} />
        <Stat value={data.cardCount - due} label="resting" tone="muted" />
      </div>

      {preview && (
        <div className="relative mt-7">
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 h-full rounded-[22px] border border-st-bd1 bg-st-card/60 [transform:translateY(10px)_scale(0.96)]"
          />
          <div className="relative rounded-[22px] border border-st-bd1 bg-st-card p-6 shadow-[0_20px_50px_-38px_rgba(23,37,31,0.6)]">
            <Eyebrow>FIRST CARD</Eyebrow>
            <div className="mt-3 text-st-ink">
              <MathText className="font-display text-[19px] leading-[1.45]">
                {preview.prompt}
              </MathText>
            </div>
            <p className="mt-4 border-t border-st-divider pt-3 font-mono-ui text-[10px] uppercase tracking-[0.12em] text-st-faint2">
              Answer hidden until you study
            </p>
          </div>
        </div>
      )}

      <div className="mt-7 flex flex-col gap-2.5 sm:flex-row">
        <button
          type="button"
          disabled={data.cardCount === 0}
          onClick={() => startStudy()}
          className="flex min-h-[52px] flex-1 items-center justify-center rounded-full bg-gradient-to-br from-[#0C3F31] to-[#155844] px-5 text-[15px] font-semibold text-[#F6F3E9] shadow-[0_16px_34px_-20px_rgba(12,63,49,0.9)] transition hover:-translate-y-px disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {due > 0 ? `Study ${due} due` : `Study all ${studyCount}`}
        </button>
        <button
          type="button"
          onClick={() => setMode('edit')}
          className="flex min-h-[52px] items-center justify-center rounded-full border border-st-bd2 bg-st-card px-6 text-sm font-semibold text-st-inkSoft transition hover:border-st-accent hover:text-st-accentDeep"
        >
          Edit deck
        </button>
      </div>
      {due > 0 && due < data.cardCount && (
        <button
          type="button"
          onClick={() => startStudy(data.cards.map((c) => c.id))}
          className="mt-3 w-full text-center text-[12.5px] font-semibold text-st-accent hover:text-st-accentDeep"
        >
          Or run all {data.cardCount} cards →
        </button>
      )}

      {data.cards.length > 0 && (
        <section className="mt-10">
          <Eyebrow>ALL CARDS</Eyebrow>
          <ul className="mt-3 divide-y divide-st-divider overflow-hidden rounded-[18px] border border-st-bd1 bg-st-card">
            {data.cards.map((card) => (
              <li key={card.id} className="flex gap-3 px-4 py-3.5">
                <span
                  aria-hidden
                  title={card.dueNow ? 'Due now' : 'Resting'}
                  className={`mt-[7px] h-[7px] w-[7px] shrink-0 rounded-full ${
                    card.dueNow ? 'bg-st-accent' : 'bg-st-bd2'
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="text-st-ink">
                    <MathText className="text-[13.5px] font-medium leading-snug">
                      {card.prompt}
                    </MathText>
                  </div>
                  <div className="mt-0.5 text-st-muted">
                    <MathText className="text-[12.5px] leading-snug">{card.answer}</MathText>
                  </div>
                </div>
                {card.sourcePage && (
                  <span className="mt-0.5 shrink-0 font-mono-ui text-[10px] text-st-faint2">
                    p.{card.sourcePage}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 text-center">
        <Link href="/library" className="text-[13px] font-semibold text-st-accent hover:text-st-accentDeep">
          Back to Library →
        </Link>
      </div>
    </div>
  );
}

function Stat({
  value,
  label,
  tone = 'accent',
}: {
  value: number;
  label: string;
  tone?: 'accent' | 'muted';
}) {
  return (
    <div className="rounded-[14px] border border-st-bd1 bg-st-card px-3 py-3 text-center">
      <p
        className={`font-mono-ui text-[22px] font-semibold leading-none ${
          tone === 'accent' ? 'text-st-accentDeep' : 'text-st-muted'
        }`}
      >
        {value}
      </p>
      <p className="mt-1.5 text-[11px] text-st-faint">{label}</p>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  disabled,
  danger,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-full transition disabled:opacity-30 ${
        danger
          ? 'text-st-faint hover:bg-st-dangerSoft hover:text-st-danger'
          : 'text-st-faint hover:bg-st-surface2 hover:text-st-ink'
      }`}
    >
      {children}
    </button>
  );
}
