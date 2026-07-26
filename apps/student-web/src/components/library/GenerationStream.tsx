'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useGenerationStream, useSaveGenerationDraft, type GenerationKind } from '@/lib/hooks/library';
import { PillButton } from '@/components/ui/pill-button';
import { artifactHref } from './SourceCard';

export function GenerationStream({
  itemId,
  kind,
  autoStart = true,
  onClose,
}: {
  itemId: string;
  kind: GenerationKind;
  autoStart?: boolean;
  onClose?: () => void;
}) {
  const { frames, status, saved, draft, error, start } = useGenerationStream(itemId, kind);
  const saveDraft = useSaveGenerationDraft();
  const [kept, setKept] = useState<boolean[]>([]);
  const [savedLocal, setSavedLocal] = useState<{ artifactId?: string; deckId?: string; noteId?: string } | null>(
    null,
  );
  const reduceMotion =
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (autoStart) start();
  }, [autoStart, start]);

  const elements = frames.filter(
    (f) => f.type === 'section' || f.type === 'card' || f.type === 'item',
  );
  const startFrame = frames.find((f) => f.type === 'start');
  const proposals = useMemo(() => {
    if (draft?.proposals) return draft.proposals as unknown[];
    return elements.map((f) =>
      f.type === 'section' ? f.section : f.type === 'card' ? f.card : f.item,
    );
  }, [draft, elements]);

  useEffect(() => {
    if (proposals.length && kept.length !== proposals.length) {
      setKept(proposals.map(() => true));
    }
  }, [proposals, kept.length]);

  const openHref = saved ?? savedLocal
    ? (saved ?? savedLocal)!.deckId
      ? artifactHref('deck', (saved ?? savedLocal)!.deckId!)
      : (saved ?? savedLocal)!.artifactId
        ? artifactHref(kind === 'quiz' ? 'quiz' : 'summary', (saved ?? savedLocal)!.artifactId!)
        : (saved ?? savedLocal)!.noteId
          ? '/library/notes'
          : null
    : null;

  const onSave = () => {
    if (!draft?.jobId) return;
    const selected = proposals.filter((_, i) => kept[i]);
    saveDraft.mutate(
      { jobId: draft.jobId, kept: selected },
      {
        onSuccess: (res) => {
          setSavedLocal({
            deckId: res.deckId,
            artifactId: res.artifactId,
            noteId: res.noteId,
          });
        },
      },
    );
  };

  return (
    <div className="rounded-[15px] border border-st-bd1 bg-st-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold text-st-amber">✦ Petros is making this</p>
          <p className="mt-1 font-display text-lg font-semibold text-st-ink">
            {startFrame && 'title' in startFrame ? startFrame.title : kind}
          </p>
          {startFrame && 'fromLabel' in startFrame && (
            <p className="text-xs text-st-muted">{startFrame.fromLabel}</p>
          )}
        </div>
        {onClose && (
          <button type="button" className="min-h-[44px] px-2 text-sm text-st-muted" onClick={onClose}>
            Close
          </button>
        )}
      </div>

      <ul className="mt-4 space-y-2">
        {proposals.map((proposal, i) => {
          const body =
            kind === 'summarize'
              ? `${(proposal as { heading?: string }).heading ?? ''}: ${(proposal as { body?: string }).body ?? ''}`
              : kind === 'flashcards'
                ? (proposal as { prompt?: string }).prompt
                : (proposal as { prompt?: string }).prompt;
          return (
            <li
              key={i}
              className={`flex items-start gap-2 rounded-[12px] border border-st-bd2 bg-st-cardAlt p-3 text-sm text-st-ink ${
                reduceMotion ? '' : 'animate-st-fade-up'
              }`}
            >
              {draft && (
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={kept[i] ?? true}
                  onChange={(e) =>
                    setKept((prev) => {
                      const next = [...prev];
                      next[i] = e.target.checked;
                      return next;
                    })
                  }
                />
              )}
              <span>{body}</span>
            </li>
          );
        })}
      </ul>

      {status === 'streaming' && <p className="mt-3 text-xs text-st-muted">Streaming…</p>}
      {error && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-st-danger">{error}</p>
          <PillButton type="button" variant="soft" onClick={start}>
            Retry
          </PillButton>
        </div>
      )}
      {draft && status === 'draft' && (
        <div className="mt-4 flex gap-2">
          <PillButton type="button" disabled={saveDraft.isPending} onClick={onSave}>
            Save {kept.filter(Boolean).length} items
          </PillButton>
        </div>
      )}
      {((saved ?? savedLocal) && (status === 'saved' || savedLocal)) && openHref && (
        <div className="mt-4">
          <Link href={openHref}>
            <PillButton type="button">Open it</PillButton>
          </Link>
        </div>
      )}
    </div>
  );
}
