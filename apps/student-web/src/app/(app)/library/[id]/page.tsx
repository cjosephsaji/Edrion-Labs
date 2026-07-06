'use client';
import Link from 'next/link';
import { useLibraryItem } from '@/lib/hooks';
import { LibraryActionsRail } from '@/components/library/library-actions-rail';
import { Card } from '@/components/ui/card';

export default function LibraryItemPage({ params }: { params: { id: string } }) {
  const { data: item, isLoading } = useLibraryItem(params.id);

  if (isLoading) return <div className="mx-auto max-w-2xl p-6 h-64 shimmer rounded-2xl" />;

  if (!item) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-st-muted">Item not found.</p>
        <Link href="/library" className="mt-4 text-sm text-st-accent">← Back to Library</Link>
      </div>
    );
  }

  const record = item as {
    id: string;
    title: string;
    kind: string;
    aiRead: boolean;
    artifacts?: { id: string; kind: string; title: string }[];
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in">
      <Link href="/library" className="text-sm text-st-accent">← Library</Link>
      <p className="mt-4 text-[10px] font-semibold tracking-wide text-st-faint">{record.kind.replace(/_/g, ' ').toUpperCase()}</p>
      <h1 className="font-display text-2xl font-semibold text-st-ink">{record.title}</h1>
      {record.aiRead && <p className="mt-1 text-xs text-st-amber">Read by Petros ✦</p>}

      <LibraryActionsRail itemId={record.id} />

      {(record.artifacts?.length ?? 0) > 0 && (
        <section className="mt-8">
          <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">
            ALREADY MADE FROM THIS · {record.artifacts!.length}
          </h2>
          <div className="mt-3 space-y-2">
            {record.artifacts!.map((a) => (
              <Card key={a.id}>
                <p className="text-xs text-st-amber">✦ {a.kind}</p>
                <p className="font-medium text-st-ink">{a.title}</p>
              </Card>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
