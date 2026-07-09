'use client';
import Link from 'next/link';
import { PillButton } from '@/components/ui/pill-button';
import { ingestStatusLine } from '@/lib/library-ingest';

export function IngestionCard({
  title,
  status,
  pagesDone,
  pageCount,
  error,
  updatedAt,
  itemId,
  onRetry,
  confirmHref,
}: {
  title: string;
  status?: string;
  pagesDone?: number;
  pageCount?: number | null;
  error?: string | null;
  updatedAt?: string;
  itemId?: string;
  onRetry?: () => void;
  confirmHref?: string;
}) {
  const done = typeof pagesDone === 'number' ? pagesDone : 0;
  const total = typeof pageCount === 'number' && pageCount > 0 ? pageCount : null;

  const { line, showProgress, stale } = error
    ? { line: error, showProgress: false, stale: false }
    : status
      ? ingestStatusLine({ status, pagesDone, pageCount, errorMessage: error, updatedAt })
      : { line: 'Opening document…', showProgress: false, stale: false };

  return (
    <div className="rounded-[15px] border border-st-bd1 bg-st-card p-4 shadow-md">
      <p className="font-medium text-st-ink">{title}</p>
      <p className={`mt-1 text-sm ${error ? 'text-st-danger' : 'text-st-muted'}`}>{line}</p>
      {showProgress && total !== null && done < total && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-st-bd2">
          <div
            className="h-full rounded-full bg-st-accent transition-[width] duration-300"
            style={{ width: `${Math.max(4, Math.round((done / total) * 100))}%` }}
          />
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {(onRetry && (status === 'error' || stale || status === 'reading' || status === 'queued')) && (
          <PillButton type="button" variant="soft" onClick={onRetry}>
            Retry
          </PillButton>
        )}
        {confirmHref && (
          <Link href={confirmHref}>
            <PillButton type="button" variant="soft">
              Review text →
            </PillButton>
          </Link>
        )}
        {itemId && (
          <Link href={`/library/${itemId}`}>
            <PillButton type="button" variant="ghost">
              Open
            </PillButton>
          </Link>
        )}
      </div>
    </div>
  );
}
