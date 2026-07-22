'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLibraryGlossary, useLibraryTutor } from '@/lib/hooks';
import { GenerationStream } from './GenerationStream';
import { PillButton } from '@/components/ui/pill-button';
import { useToast } from '@/components/ui/toast';
import type { GenerationKind } from '@/lib/hooks/library';

const BUDGET_OPTIONS = [10, 15, 25] as const;

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
  const glossary = useLibraryGlossary(itemId);
  const [streaming, setStreaming] = useState<GenerationKind | null>(null);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const busy = tutor.isPending || glossary.isPending;

  const hint = ready ? undefined : 'Confirm OCR / wait until ready';

  async function startTeach(minutes: number) {
    setBudgetOpen(false);
    try {
      const r = await tutor.mutateAsync({ timeBudgetMinutes: minutes });
      router.push(`/learn/session/${r.sessionId}`);
    } catch (e) {
      say((e as Error).message ?? 'Could not start lesson');
    }
  }

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
          onClick={() => setBudgetOpen(true)}
        >
          Teach me this
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
          onClick={() => router.push(`/lab/visual?source_id=${itemId}`)}
        >
          Visualize this
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
      {budgetOpen && (
        <div className="rounded-[15px] border border-st-bd2 bg-st-card p-4">
          <p className="text-sm font-medium text-st-ink">How long do you have?</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {BUDGET_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                className="rounded-full border border-st-bd2 px-4 py-2 text-sm hover:border-[#1f604a]"
                onClick={() => void startTeach(m)}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
      )}
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
