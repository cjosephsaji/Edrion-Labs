'use client';
import Link from 'next/link';
import { Trash2 } from 'lucide-react';
import { FreshnessChip } from '@/components/learn/FreshnessChip';
import { ingestStatusLine } from '@/lib/library-ingest';

export function artifactHref(kind: string, id: string) {
  if (kind === 'deck') return `/library/decks/${id}`;
  if (kind === 'concept_map') return `/library/maps/${id}`;
  if (kind === 'quiz') return `/library/quiz/${id}`;
  return `/library/artifacts/${id}`;
}

export function SourceCard({
  id,
  title,
  meta,
  status,
  errorMessage,
  pagesDone,
  pageCount,
  updatedAt,
  onDelete,
  deleting,
}: {
  id: string;
  title: string;
  meta?: string;
  status?: string;
  errorMessage?: string | null;
  pagesDone?: number;
  pageCount?: number | null;
  updatedAt?: string;
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const href =
    status === 'needs_ocr_confirm' ? `/library/${id}/confirm` : `/library/${id}`;

  let statusLine: string | null = null;
  if (status && status !== 'ready') {
    if (status === 'needs_ocr_confirm') {
      statusLine = 'Check what Petros read →';
    } else if (status === 'error') {
      statusLine = errorMessage ? `${errorMessage} — tap to retry` : 'Could not read — tap to retry';
    } else if (status === 'queued' || status === 'reading') {
      statusLine = ingestStatusLine({ status, pagesDone, pageCount, updatedAt }).line;
    } else {
      statusLine = status.replace(/_/g, ' ');
    }
  }

  return (
    <div className="flex items-stretch gap-2 rounded-[15px] border border-st-bd1 bg-st-card transition hover:border-st-accent/40">
      <Link href={href} className="min-h-[44px] min-w-0 flex-1 p-4">
        <p className="font-semibold text-st-ink">{title}</p>
        {meta && <p className="mt-1 text-xs text-st-muted">{meta}</p>}
        {statusLine && (
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-st-amber">
            {statusLine}
          </p>
        )}
      </Link>
      {onDelete && (
        <button
          type="button"
          aria-label={`Delete ${title}`}
          disabled={deleting}
          className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center self-center mr-2 rounded-full text-st-muted transition hover:bg-st-danger/10 hover:text-st-danger disabled:opacity-40"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

export function ArtifactCard({
  id,
  kind,
  title,
  fromLabel,
  freshness,
  meta,
}: {
  id: string;
  kind: string;
  title: string;
  fromLabel: string;
  freshness?: 'fresh' | 'fading' | 'due';
  meta?: string;
}) {
  return (
    <Link
      href={artifactHref(kind, id)}
      className="block min-h-[44px] rounded-[15px] border border-st-bd1 bg-st-card p-4 transition hover:border-st-accent/40"
    >
      <p className="text-[10px] font-semibold text-st-amber">✦ {kind.replace(/_/g, ' ')}</p>
      <p className="mt-1 font-medium text-st-ink">{title}</p>
      <p className="text-xs text-st-muted">{fromLabel}</p>
      <div className="mt-2 flex items-center gap-2">
        {freshness && <FreshnessChip freshness={freshness} />}
        {meta && <span className="text-xs text-st-faint">{meta}</span>}
      </div>
    </Link>
  );
}
