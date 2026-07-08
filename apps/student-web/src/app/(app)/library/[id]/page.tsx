'use client';
import Link from 'next/link';
import type { GlossaryContent } from '@edrion/schemas';
import { useLibraryArtifact, useLibraryItem } from '@/lib/hooks';
import { LibraryActionsRail } from '@/components/library/library-actions-rail';
import { GlossaryPanel } from '@/components/library/GlossaryPanel';
import { Card } from '@/components/ui/card';

type LibraryItemResponse = {
  item: {
    id: string;
    title: string;
    kind: string;
    aiRead: boolean;
  };
  artifacts: { id: string; kind: string; title: string; fromLabel: string }[];
};

function GlossaryArtifactView({ artifactId }: { artifactId: string }) {
  const { data } = useLibraryArtifact(artifactId);
  if (!data || data.kind !== 'glossary') return null;
  return <GlossaryPanel content={data.content as GlossaryContent} fromLabel={data.fromLabel} />;
}

export default function LibraryItemPage({ params }: { params: { id: string } }) {
  const { data, isLoading } = useLibraryItem(params.id);

  if (isLoading) return <div className="mx-auto max-w-2xl p-6 h-64 shimmer rounded-2xl" />;

  const record = data as LibraryItemResponse | undefined;
  if (!record?.item) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-st-muted">Item not found.</p>
        <Link href="/library" className="mt-4 text-sm text-st-accent">← Back to Library</Link>
      </div>
    );
  }

  const { item, artifacts } = record;
  const glossaryArtifact = artifacts.find((a) => a.kind === 'glossary');

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in pb-24">
      <Link href="/library" className="text-sm text-st-accent">← Library</Link>
      <p className="mt-4 text-[10px] font-semibold tracking-wide text-st-faint">{item.kind.replace(/_/g, ' ').toUpperCase()}</p>
      <h1 className="font-display text-2xl font-semibold text-st-ink">{item.title}</h1>
      {item.aiRead && <p className="mt-1 text-xs text-st-amber">Read by Petros ✦</p>}

      <LibraryActionsRail itemId={item.id} />

      {artifacts.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[10px] font-semibold tracking-wide text-st-faint">
            ALREADY MADE FROM THIS · {artifacts.length}
          </h2>
          <div className="mt-3 space-y-2">
            {artifacts.map((a) => (
              <Card key={a.id}>
                <p className="text-xs font-medium text-st-violet">✦ {a.kind.replace(/_/g, ' ')}</p>
                <p className="font-medium text-st-ink">
                  {a.kind === 'concept_map' ? (
                    <Link href={`/library/maps/${a.id}`} className="hover:text-st-accent">
                      {a.title}
                    </Link>
                  ) : (
                    a.title
                  )}
                </p>
                <p className="mt-1 text-xs text-st-muted">Made from: {a.fromLabel.replace(/^From:\s*/i, '')}</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {glossaryArtifact && <GlossaryArtifactView artifactId={glossaryArtifact.id} />}
    </div>
  );
}
