'use client';
import Link from 'next/link';
import { useLibraryCollection } from '@/lib/hooks';
import { ArtifactCard, SourceCard } from '@/components/library/SourceCard';
import { EmptyState } from '@/components/ui/empty-state';
import { Eyebrow, PageHeader } from '@/components/ui/primitives';

export default function CollectionPage({ params }: { params: { id: string } }) {
  const { data, isLoading, isError } = useLibraryCollection(params.id);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24 animate-st-block-in">
      <PageHeader
        backHref="/library"
        eyebrow={<Eyebrow>COLLECTION</Eyebrow>}
        title={data?.name ?? 'Collection'}
        subtitle={data ? `${data.count} items` : undefined}
      />

      {isLoading ? (
        <div className="mt-8 h-40 shimmer rounded-[15px]" />
      ) : isError || !data ? (
        <EmptyState
          className="mt-8"
          eyebrow="NOT FOUND"
          title="This collection isn’t here"
          action={
            <Link href="/library" className="text-sm font-semibold text-st-accent">
              Back to library
            </Link>
          }
        />
      ) : data.items.length === 0 ? (
        <EmptyState
          className="mt-8"
          eyebrow="EMPTY"
          title="Nothing in this collection yet"
          description="Move uploads here from the item detail page."
        />
      ) : (
        <div className="mt-8 space-y-6">
          {data.items.map((row: {
            item: { id: string; title: string; status: string; kind: string; pageCount: number | null };
            artifacts: Array<{ id: string; kind: string; title: string; fromLabel: string; freshness?: 'fresh' | 'fading' | 'due' }>;
            decks: Array<{ id: string; title: string; fromLabel: string }>;
          }) => (
            <div key={row.item.id} className="space-y-2">
              <SourceCard
                id={row.item.id}
                title={row.item.title}
                status={row.item.status}
                meta={row.item.pageCount ? `${row.item.pageCount} pages` : row.item.kind}
              />
              <div className="grid gap-2 sm:grid-cols-2">
                {row.artifacts.map((a) => (
                  <ArtifactCard
                    key={a.id}
                    id={a.id}
                    kind={a.kind}
                    title={a.title}
                    fromLabel={a.fromLabel}
                    freshness={a.freshness}
                  />
                ))}
                {row.decks.map((d) => (
                  <ArtifactCard
                    key={d.id}
                    id={d.id}
                    kind="deck"
                    title={d.title}
                    fromLabel={d.fromLabel}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
