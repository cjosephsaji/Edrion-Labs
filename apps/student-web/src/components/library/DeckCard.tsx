import Link from 'next/link';
import { FreshnessChip } from '@/components/learn/FreshnessChip';

export function DeckCard({
  id,
  title,
  fromLabel,
  freshness,
  meta,
}: {
  id: string;
  title: string;
  fromLabel: string;
  freshness?: 'fresh' | 'fading' | 'due';
  meta?: string;
}) {
  return (
    <Link
      href={`/library/decks/${id}`}
      className="block rounded-2xl border border-st-bd1 bg-st-card p-4 transition hover:border-st-accent/40"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-display text-base font-semibold text-st-ink">{title}</p>
        {freshness && <FreshnessChip freshness={freshness} />}
      </div>
      <p className="mt-1 text-xs text-st-muted">{fromLabel}</p>
      {meta && <p className="mt-2 text-xs text-st-faint">{meta}</p>}
    </Link>
  );
}
