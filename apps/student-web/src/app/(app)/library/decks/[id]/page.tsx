'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useDeck } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { Card } from '@/components/ui/card';

export default function DeckStudyPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useDeck(params.id);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);

  const deck = data as {
    title: string;
    fromLabel: string;
    cards: { id: string; prompt: string; answer: string }[];
  } | undefined;

  if (isLoading) return <div className="mx-auto max-w-2xl p-6 h-64 shimmer rounded-2xl" />;

  if (!deck?.cards?.length) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-st-muted">Deck not found or empty.</p>
        <Link href="/library" className="mt-4 text-sm text-st-accent">← Library</Link>
      </div>
    );
  }

  const card = deck.cards[idx]!;

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/library" className="text-sm text-st-accent">← Library</Link>
      <h1 className="mt-4 font-display text-xl font-semibold text-st-ink">{deck.title}</h1>
      <p className="text-xs text-st-muted">{deck.fromLabel}</p>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="mt-8 w-full"
      >
        <Card className="min-h-48 flex items-center justify-center text-center transition">
          <p className="text-lg text-st-ink">{flipped ? card.answer : card.prompt}</p>
          <p className="mt-4 text-xs text-st-faint">Tap to flip</p>
        </Card>
      </button>

      <p className="mt-4 text-center text-xs text-st-muted">
        Card {idx + 1} of {deck.cards.length}
      </p>

      <div className="mt-6 flex justify-center gap-3">
        <PillButton
          variant="ghost"
          disabled={idx === 0}
          onClick={() => { setIdx((i) => i - 1); setFlipped(false); }}
        >
          Previous
        </PillButton>
        <PillButton
          onClick={() => {
            if (idx < deck.cards.length - 1) {
              setIdx((i) => i + 1);
              setFlipped(false);
            }
          }}
        >
          {idx < deck.cards.length - 1 ? 'Next' : 'Done'}
        </PillButton>
      </div>
    </div>
  );
}
