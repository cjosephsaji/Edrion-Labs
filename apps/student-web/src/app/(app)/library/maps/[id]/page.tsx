'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useLibraryArtifact, useVisualLegacyLookup } from '@/lib/hooks';
import { PillButton } from '@/components/ui/pill-button';
import { StudentClientError } from '@/lib/student-client';

export default function ConceptMapRedirectPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data, isLoading } = useLibraryArtifact(params.id);
  const legacy = useVisualLegacyLookup(params.id);

  const sourceId = data?.itemId ?? undefined;
  const rebuildHref = sourceId ? `/lab/visual?source_id=${sourceId}` : '/lab/visual';

  useEffect(() => {
    if (legacy.data && 'canvas_id' in legacy.data) {
      router.replace(`/lab/visual/${legacy.data.canvas_id}`);
    }
  }, [legacy.data, router]);

  if (isLoading || legacy.isLoading) {
    return <div className="mx-auto max-w-2xl p-6 h-64 shimmer rounded-2xl" />;
  }

  if (!data || (data.kind !== 'concept_map' && data.kind !== 'visual')) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-st-muted">Map not found.</p>
        <Link href="/library" className="mt-4 text-sm text-st-accent">
          ← Library
        </Link>
      </div>
    );
  }

  if (legacy.data && 'canvas_id' in legacy.data) {
    return <div className="mx-auto max-w-2xl p-6 h-64 shimmer rounded-2xl" />;
  }

  const rebuildRequired =
    legacy.isError &&
    legacy.error instanceof StudentClientError &&
    legacy.error.code === 'VISUAL_LEGACY_REBUILD_REQUIRED';

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in pb-24">
      <Link href={sourceId ? `/library/${sourceId}` : '/library'} className="text-sm text-st-accent">
        ← Source
      </Link>
      <p className="mt-4 text-xs font-medium text-st-violet">✦ Older map</p>
      <h1 className="font-display text-2xl font-semibold text-st-ink">{data.title}</h1>
      <p className="mt-1 text-xs text-st-muted">Made from: {data.fromLabel.replace(/^From:\s*/i, '')}</p>

      <div className="mt-8 rounded-[15px] border border-st-bd1 bg-st-card p-6">
        <p className="font-display text-lg font-semibold text-st-ink">
          {rebuildRequired
            ? 'This older map needs a fresh layout.'
            : 'Opening your Thinking Canvas…'}
        </p>
        <p className="mt-2 text-sm text-st-muted">
          Petros can rebuild this from your source with the new visual engine.
        </p>
        <div className="mt-6">
          <PillButton onClick={() => router.push(rebuildHref)}>Rebuild as a Thinking Canvas</PillButton>
        </div>
      </div>
    </div>
  );
}
