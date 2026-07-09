'use client';
import Link from 'next/link';

export function CollectionsRow({
  collections,
}: {
  collections: Array<{ id: string; name: string; color: string | null; count: number }>;
}) {
  if (!collections.length) return null;
  return (
    <section>
      <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">COLLECTIONS</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {collections.map((c) => (
          <Link
            key={c.id}
            href={`/library/collections/${c.id}`}
            className="min-h-[44px] rounded-[15px] border border-st-bd1 bg-st-card p-4 transition hover:border-st-accent/40"
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: c.color ?? 'var(--st-accent)' }}
            />
            <p className="mt-2 font-medium text-st-ink">{c.name}</p>
            <p className="text-xs text-st-muted">{c.count} items</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
