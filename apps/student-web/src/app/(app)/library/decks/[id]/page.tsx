'use client';
import { useMemo, useState } from 'react';
import {
  useAddCard,
  useDeck,
  useDeleteCard,
  usePatchCard,
  usePatchDeck,
  useReviewCard,
} from '@/lib/hooks';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { EmptyState } from '@/components/ui/empty-state';
import { PillButton } from '@/components/ui/pill-button';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';
import { usePersona } from '@/lib/persona';
import Link from 'next/link';

type Mode = 'cover' | 'study' | 'summary' | 'edit';

export default function DeckPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useDeck(params.id);
  const review = useReviewCard(params.id);
  const patchDeck = usePatchDeck(params.id);
  const addCard = useAddCard(params.id);
  const patchCard = usePatchCard(params.id);
  const deleteCard = useDeleteCard(params.id);
  const { me } = usePersona();

  const [mode, setMode] = useState<Mode>('cover');
  const [queue, setQueue] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [reviewed, setReviewed] = useState(0);
  const [againCount, setAgainCount] = useState(0);

  const cardsById = useMemo(() => {
    const map = new Map(data?.cards.map((c) => [c.id, c]) ?? []);
    return map;
  }, [data?.cards]);

  const current = queue[0] ? cardsById.get(queue[0]) : undefined;
  const progressIndex = data ? data.cardCount - queue.length + 1 : 0;

  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (isLoading) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6">
        <div className="h-64 shimmer rounded-[15px]" />
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

  if (mode === 'edit') {
    return (
      <div className="mx-auto max-w-lg px-4 py-6 pb-24 animate-st-block-in">
        <PageHeader
          backHref={`/library/decks/${params.id}`}
          eyebrow={<Eyebrow>EDIT DECK</Eyebrow>}
          title={data.title}
        />
        <ul className="mt-6 space-y-3">
          {data.cards.map((card, i) => (
            <li key={card.id} className="rounded-[15px] border border-st-bd1 bg-st-card p-3">
              <textarea
                defaultValue={card.prompt}
                className="w-full rounded-[10px] border border-st-bd2 bg-st-cardAlt p-2 text-sm"
                aria-label="Prompt"
                onBlur={(e) => {
                  if (e.target.value !== card.prompt) {
                    void patchCard.mutateAsync({ cardId: card.id, prompt: e.target.value });
                  }
                }}
              />
              <textarea
                defaultValue={card.answer}
                className="mt-2 w-full rounded-[10px] border border-st-bd2 bg-st-cardAlt p-2 text-sm"
                aria-label="Answer"
                onBlur={(e) => {
                  if (e.target.value !== card.answer) {
                    void patchCard.mutateAsync({ cardId: card.id, answer: e.target.value });
                  }
                }}
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <PillButton
                  type="button"
                  variant="ghost"
                  disabled={i === 0}
                  onClick={() => {
                    const order = data.cards.map((c) => c.id);
                    [order[i - 1], order[i]] = [order[i]!, order[i - 1]!];
                    void patchDeck.mutateAsync({ cardOrder: order });
                  }}
                >
                  Up
                </PillButton>
                <PillButton
                  type="button"
                  variant="ghost"
                  disabled={i === data.cards.length - 1}
                  onClick={() => {
                    const order = data.cards.map((c) => c.id);
                    [order[i], order[i + 1]] = [order[i + 1]!, order[i]!];
                    void patchDeck.mutateAsync({ cardOrder: order });
                  }}
                >
                  Down
                </PillButton>
                <PillButton
                  type="button"
                  variant="ghost"
                  onClick={() => void deleteCard.mutateAsync(card.id)}
                >
                  Delete
                </PillButton>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4">
          <PillButton
            type="button"
            variant="soft"
            onClick={() =>
              void addCard.mutateAsync({ prompt: 'New prompt', answer: 'New answer' })
            }
          >
            Add card
          </PillButton>
          <PillButton type="button" className="ml-2" onClick={() => setMode('cover')}>
            Done
          </PillButton>
        </div>
      </div>
    );
  }

  if (mode === 'summary') {
    const intensity = me?.persona === 'school' ? 'Nice work!' : 'Session complete.';
    return (
      <div className="mx-auto max-w-lg px-4 py-6 pb-24 animate-st-block-in">
        <PageHeader eyebrow={<Eyebrow>SESSION</Eyebrow>} title={intensity} />
        <p className="mt-4 text-st-ink">
          {reviewed} reviewed · {againCount} need another look
        </p>
        <div className="mt-6 flex gap-2">
          <PillButton type="button" onClick={() => setMode('cover')}>
            Back to deck
          </PillButton>
          <Link href="/library">
            <PillButton type="button" variant="ghost">
              Library
            </PillButton>
          </Link>
        </div>
      </div>
    );
  }

  if (mode === 'study' && current) {
    return (
      <div className="mx-auto max-w-lg px-4 py-6 pb-24 animate-st-block-in">
        <p className="font-mono-ui text-[10px] tracking-wide text-st-faint">
          {progressIndex} OF {data.cardCount}
        </p>
        <button
          type="button"
          className="mt-4 flex min-h-[220px] w-full items-center justify-center rounded-[15px] border border-st-bd1 bg-st-card p-6 text-center"
          style={
            reduceMotion
              ? undefined
              : {
                  transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  transition: 'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
                  transformStyle: 'preserve-3d',
                }
          }
          onClick={() => setFlipped((f) => !f)}
        >
          <span
            className="font-display text-xl text-st-ink"
            style={reduceMotion ? undefined : { transform: flipped ? 'rotateY(180deg)' : undefined }}
          >
            {flipped ? current.answer : current.prompt}
          </span>
        </button>
        {current.sourcePage && (
          <p className="mt-2 text-xs text-st-muted">From p.{current.sourcePage}</p>
        )}
        <div className="mt-6 flex gap-2">
          <PillButton
            type="button"
            variant="soft"
            disabled={review.isPending}
            onClick={async () => {
              await review.mutateAsync({ cardId: current.id, result: 'got_it' });
              setReviewed((n) => n + 1);
              setFlipped(false);
              setQueue((q) => q.slice(1));
              if (queue.length <= 1) setMode('summary');
            }}
          >
            Got it
          </PillButton>
          <PillButton
            type="button"
            variant="ghost"
            disabled={review.isPending}
            onClick={async () => {
              await review.mutateAsync({ cardId: current.id, result: 'again' });
              setAgainCount((n) => n + 1);
              setReviewed((n) => n + 1);
              setFlipped(false);
              setQueue((q) => [...q.slice(1), current.id]);
            }}
          >
            Again
          </PillButton>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref={data.itemId ? `/library/${data.itemId}` : '/library'}
        eyebrow={<Eyebrow>✦ FLASHCARDS</Eyebrow>}
        title={data.title}
        subtitle={data.fromLabel}
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <FreshnessChip freshness={data.freshness} />
        <span className="text-sm text-st-muted">
          {data.cardCount} cards · {data.dueToday} due
        </span>
      </div>
      <div className="mt-8 flex flex-wrap gap-2">
        <PillButton
          type="button"
          onClick={() => {
            const ids =
              data.dueToday > 0
                ? data.cards.filter((c) => c.dueNow).map((c) => c.id)
                : data.cards.map((c) => c.id);
            setQueue(ids.length ? ids : data.cards.map((c) => c.id));
            setReviewed(0);
            setAgainCount(0);
            setFlipped(false);
            setMode('study');
          }}
        >
          Start
        </PillButton>
        <PillButton type="button" variant="ghost" onClick={() => setMode('edit')}>
          Edit deck
        </PillButton>
      </div>
    </div>
  );
}
