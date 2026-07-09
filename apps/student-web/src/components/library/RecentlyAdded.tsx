'use client';
import Link from 'next/link';

export function RecentlyAdded({
  items,
}: {
  items: Array<{ id: string; title: string; kind: string }>;
}) {
  if (!items.length) return null;
  return (
    <section>
      <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">RECENTLY ADDED</h2>
      <div className="mt-3 -mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {items.map((item) => (
          <Link
            key={item.id}
            href={`/library/${item.id}`}
            className="min-h-[44px] w-40 shrink-0 rounded-[15px] border border-st-bd1 bg-st-card p-3 transition hover:border-st-accent/40"
          >
            <p className="line-clamp-2 text-sm font-semibold text-st-ink">{item.title}</p>
            <p className="mt-1 text-[10px] uppercase tracking-wide text-st-faint">
              {item.kind.replace(/_/g, ' ')}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
