'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useGenerationStream, type GenerationKind } from '@/lib/hooks/library';
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
  const { frames, status, saved, error, start } = useGenerationStream(itemId, kind);
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

  const openHref = saved
    ? saved.deckId
      ? artifactHref('deck', saved.deckId)
      : saved.artifactId
        ? artifactHref(kind === 'quiz' ? 'quiz' : 'summary', saved.artifactId)
        : null
    : null;

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
        {elements.map((frame, i) => {
          const body =
            frame.type === 'section'
              ? `${(frame.section as { heading?: string }).heading ?? ''}: ${(frame.section as { body?: string }).body ?? ''}`
              : frame.type === 'card'
                ? (frame.card as { prompt?: string }).prompt
                : (frame.item as { prompt?: string }).prompt;
          return (
            <li
              key={i}
              className={`rounded-[12px] border border-st-bd2 bg-st-cardAlt p-3 text-sm text-st-ink ${
                reduceMotion ? '' : 'animate-st-fade-up'
              }`}
            >
              {body}
            </li>
          );
        })}
      </ul>

      {status === 'streaming' && (
        <p className="mt-3 text-xs text-st-muted">Streaming…</p>
      )}
      {error && (
        <div className="mt-3 space-y-2">
          <p className="text-sm text-st-danger">{error}</p>
          <PillButton type="button" variant="soft" onClick={start}>
            Retry
          </PillButton>
        </div>
      )}
      {status === 'saved' && openHref && (
        <div className="mt-4">
          <Link href={openHref}>
            <PillButton type="button">Open it</PillButton>
          </Link>
        </div>
      )}
    </div>
  );
}
