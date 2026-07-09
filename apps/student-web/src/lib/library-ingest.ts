export type IngestItemLike = {
  status: string;
  pagesDone?: number;
  pageCount?: number | null;
  errorMessage?: string | null;
  updatedAt?: string;
};

const STALE_MS = 90_000;

export function ingestIsStale(item: IngestItemLike): boolean {
  if (!item.updatedAt) return false;
  if (item.status !== 'queued' && item.status !== 'reading') return false;
  return Date.now() - new Date(item.updatedAt).getTime() > STALE_MS;
}

export function ingestStatusLine(item: IngestItemLike): {
  line: string;
  showProgress: boolean;
  stale: boolean;
} {
  const stale = ingestIsStale(item);
  const done = typeof item.pagesDone === 'number' ? item.pagesDone : 0;
  const total = typeof item.pageCount === 'number' && item.pageCount > 0 ? item.pageCount : null;

  if (stale) {
    return { line: 'Taking longer than usual…', showProgress: false, stale: true };
  }

  switch (item.status) {
    case 'queued':
      return { line: 'Waiting to be read…', showProgress: false, stale: false };
    case 'reading':
      if (total !== null) {
        return {
          line:
            done >= total
              ? `Finished reading ${total} pages`
              : `Reading page ${Math.min(done + 1, total)} of ${total}`,
          showProgress: done < total,
          stale: false,
        };
      }
      return { line: 'Opening document…', showProgress: false, stale: false };
    case 'needs_ocr_confirm':
      return { line: 'Check what Petros read →', showProgress: false, stale: false };
    case 'error':
      return { line: item.errorMessage ?? 'Could not read this document.', showProgress: false, stale: false };
    default:
      return { line: '', showProgress: false, stale: false };
  }
}
