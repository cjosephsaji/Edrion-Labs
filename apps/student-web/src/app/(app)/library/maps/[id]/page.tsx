'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ConceptMapContent } from '@edrion/schemas';
import { useLibraryArtifact, useLibraryTutor } from '@/lib/hooks';
import { ConceptMapCanvas } from '@/components/lab/GraphCanvas';
import { PillButton } from '@/components/ui/pill-button';

export default function ConceptMapPage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const { data, isLoading } = useLibraryArtifact(params.id);
  const itemId = data?.itemId ?? '';
  const tutor = useLibraryTutor(itemId);
  const [flagged, setFlagged] = useState<Set<string>>(new Set());

  if (isLoading) return <div className="mx-auto max-w-2xl p-6 h-64 shimmer rounded-2xl" />;

  if (!data || data.kind !== 'concept_map') {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <p className="text-st-muted">Concept map not found.</p>
        <Link href="/library" className="mt-4 text-sm text-st-accent">← Library</Link>
      </div>
    );
  }

  const content = data.content as ConceptMapContent;

  const handleLearnThis = async (label: string) => {
    if (!itemId) return;
    const result = await tutor.mutateAsync({ focusConcept: label });
    router.push(`/learn/session/${result.sessionId}`);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 animate-st-block-in pb-24">
      <Link href={data.itemId ? `/library/${data.itemId}` : '/library'} className="text-sm text-st-accent">
        ← Source
      </Link>
      <p className="mt-4 text-xs font-medium text-st-violet">✦ AI-generated concept map</p>
      <h1 className="font-display text-2xl font-semibold text-st-ink">{data.title}</h1>
      <p className="mt-1 text-xs text-st-muted">Made from: {data.fromLabel.replace(/^From:\s*/i, '')}</p>

      <div className="mt-6">
        <ConceptMapCanvas
          content={content}
          flaggedIds={flagged}
          onFlagShaky={(nodeId) => setFlagged((prev) => new Set(prev).add(nodeId))}
          onLearnThis={(label) => void handleLearnThis(label)}
        />
      </div>

      {tutor.isPending && (
        <p className="mt-4 text-sm text-st-muted">Starting a grounded session…</p>
      )}
      <div className="mt-6">
        <PillButton variant="ghost" onClick={() => router.push(data.itemId ? `/library/${data.itemId}` : '/library')}>
          Back to source
        </PillButton>
      </div>
    </div>
  );
}
