'use client';

import Link from 'next/link';
import { useState } from 'react';
import { usePetrosConnectivityMode } from './use-petros-connectivity-mode';
import { useQuery } from '@tanstack/react-query';
import type { PetrosCompanionBlock, PetrosLearningSessionDocument, PetrosSessionBlock } from '@edrion/schemas';
import { useStudentApi } from '@/lib/api-client';
import { PetrosTeachingBlockPreview } from './petros-teaching-block-preview';
import { petrosLessonTarget } from './petros-lesson-narration';

/**
 * Shared safe renderer for a lesson block title and a read-only companion reference.
 * Narration follows the block's visible interaction state, so unrevealed answers and
 * locked history are never copied into the companion surface.
 */
export function PetrosTeachingBlockRenderer({
  block,
  variant,
  sessionId,
}: {
  block: PetrosSessionBlock;
  variant: 'lesson-title' | 'companion-reference';
  sessionId?: string;
}) {
  if (variant === 'lesson-title') {
    return <h2 data-petros-target={petrosLessonTarget(block.id, 'title')}>{block.content.title}</h2>;
  }

  return (
    <div className="grid gap-2">
      <PetrosTeachingBlockPreview block={block} heading="Lesson reference" disclosure={false} />
      {sessionId ? (
        <Link className="min-h-10 inline-flex items-center underline" href={`/petros/session?session=${encodeURIComponent(sessionId)}`}>
          Open this step in the lesson
        </Link>
      ) : null}
      <p className="text-xs text-[var(--s-faint)]">Read-only reference. Continue practice in the lesson to record progress.</p>
    </div>
  );
}

export function PetrosTeachingReference({ reference }: { reference: Extract<PetrosCompanionBlock, { type: 'teaching_reference' }> }) {
  const api = useStudentApi();
  const query = useQuery({
    queryKey: ['student', 'petros', 'teaching-reference', reference.sessionId, reference.blockId, reference.sourceVersion, reference.sceneRevision],
    retry: false,
    queryFn: async () => {
      const session = await api.get<PetrosLearningSessionDocument>(`/student/petros/sessions/${encodeURIComponent(reference.sessionId)}`);
      if (session.id !== reference.sessionId || session.sourceContext?.sourceFingerprint !== reference.sourceVersion) return null;
      const block = session.blocks.find((candidate) => candidate.id === reference.blockId);
      if (!block) return null;
      if (reference.sceneRevision !== null) {
        const workspace = await api.get<{ status: string; snapshot?: { program: { revision: number } } }>(
          `/student/petros/sessions/${encodeURIComponent(reference.sessionId)}/blocks/${encodeURIComponent(reference.blockId)}/workspace`,
        );
        if (workspace.status !== 'available' || workspace.snapshot?.program.revision !== reference.sceneRevision) return null;
      }
      return block;
    },
  });

  if (query.isPending) return <p className="text-sm" role="status">Checking this lesson reference against your current access…</p>;
  if (query.error || !query.data) return <div className="grid gap-2 rounded border p-3" role="status">
    <p>This lesson reference is unavailable or has changed. Open the lesson to check its current version.</p>
    <Link className="min-h-10 inline-flex items-center underline" href={`/petros/session?session=${encodeURIComponent(reference.sessionId)}`}>Open lesson</Link>
  </div>;
  return <div className="grid gap-2 rounded border p-3">
    <p className="text-sm font-medium">{reference.label}</p>
    <p className="text-xs text-[var(--s-faint)]">Verified source version {reference.sourceVersion}{reference.sceneRevision !== null ? ` · scene revision ${reference.sceneRevision}` : ''}</p>
    <PetrosTeachingBlockRenderer block={query.data} variant="companion-reference" sessionId={reference.sessionId} />
  </div>;
}

/** Prepared source text remains available before optional scene requests and speech. */
export function PetrosPreparedVisual({text,children}:{text:string;children:React.ReactNode}){
 const {mode,ready}=usePetrosConnectivityMode();const [requested,setRequested]=useState(false);
 if(ready&&(mode!=='low_bandwidth'||requested))return <>{children}</>;
 return <section aria-label="Prepared lesson text" className="grid gap-3 rounded border p-4">
  <p className="whitespace-pre-wrap">{text}</p>
  <p className="text-sm">Text-first mode keeps the same source and learning objective. Optional visual controls and automatic speech stay paused until you request them.</p>
  <button type="button" className="min-h-11 underline" onClick={()=>setRequested(true)} disabled={!ready}>Load optional visual</button>
 </section>;
}
