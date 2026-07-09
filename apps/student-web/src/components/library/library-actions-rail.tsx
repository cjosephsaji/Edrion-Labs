'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  useLibraryConceptMap,
  useLibraryGlossary,
  useLibraryTutor,
} from '@/lib/hooks';
import { GenerationStream } from './GenerationStream';
import { PillButton } from '@/components/ui/pill-button';
import { useToast } from '@/components/ui/toast';
import type { GenerationKind } from '@/lib/hooks/library';

export function LibraryActionsRail({
  itemId,
  ready,
}: {
  itemId: string;
  ready: boolean;
}) {
  const router = useRouter();
  const { say } = useToast();
  const tutor = useLibraryTutor(itemId);
  const conceptMap = useLibraryConceptMap(itemId);
  const glossary = useLibraryGlossary(itemId);
  const [streaming, setStreaming] = useState<GenerationKind | null>(null);
  const busy = tutor.isPending || conceptMap.isPending || glossary.isPending;

  const hint = ready ? undefined : 'Confirm OCR / wait until ready';

  return (
    <div className="space-y-3">
      <h2 className="text-[10px] font-semibold tracking-wide text-st-amber">
        DO SOMETHING WITH THIS ✦
      </h2>
      <div className="flex flex-wrap gap-2">
        <PillButton
          type="button"
          disabled={!ready || busy}
          title={hint}
          onClick={async () => {
            try {
              const r = await tutor.mutateAsync({});
              router.push(`/learn/session/${r.sessionId}`);
            } catch (e) {
              say((e as Error).message ?? 'Could not start tutoring');
            }
          }}
        >
          Tutor me
        </PillButton>
        {(['summarize', 'flashcards', 'quiz'] as GenerationKind[]).map((kind) => (
          <PillButton
            key={kind}
            type="button"
            variant="soft"
            disabled={!ready || busy || streaming !== null}
            title={hint}
            onClick={() => setStreaming(kind)}
          >
            {kind === 'summarize' ? 'Summarize' : kind === 'flashcards' ? 'Flashcards' : 'Quiz'}
          </PillButton>
        ))}
        <PillButton
          type="button"
          variant="ghost"
          disabled={!ready || busy}
          title={hint}
          onClick={async () => {
            try {
              const r = await conceptMap.mutateAsync();
              router.push(`/library/maps/${r.id}`);
            } catch (e) {
              say((e as Error).message ?? 'Concept map failed');
            }
          }}
        >
          Concept map
        </PillButton>
        <PillButton
          type="button"
          variant="ghost"
          disabled={!ready || busy}
          title={hint}
          onClick={async () => {
            try {
              await glossary.mutateAsync();
              say('Glossary ready — see Already made');
            } catch (e) {
              say((e as Error).message ?? 'Glossary failed');
            }
          }}
        >
          Glossary
        </PillButton>
      </div>
      {!ready && (
        <p className="text-xs text-st-muted">
          Actions unlock when this source is ready.
        </p>
      )}
      {streaming && (
        <GenerationStream
          itemId={itemId}
          kind={streaming}
          onClose={() => setStreaming(null)}
        />
      )}
    </div>
  );
}
