'use client';
import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useStudentClient } from '@/lib/student-client';
import type { LibraryItemDto } from '@/lib/hooks/library';

const PdfDocumentViewer = dynamic(
  () => import('./PdfPageInner').then((m) => m.PdfDocumentViewer),
  {
    ssr: false,
    loading: () => <div className="h-64 shimmer rounded-[12px]" />,
  },
);

export function DocViewer({
  pages,
  kind,
  pageCount,
}: {
  pages: LibraryItemDto['pages'];
  kind: string;
  /** Known PDF page count from ingestion (preferred over placeholder rows). */
  pageCount?: number | null;
}) {
  const [index, setIndex] = useState(0);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);

  const first = pages[0];
  const mime = first?.mimeType ?? '';
  const isPdf = mime === 'application/pdf' || kind === 'upload_pdf';
  const isImage = mime.startsWith('image/') || kind === 'upload_scan';

  // PDFs: one storage object holds N visual pages — paginate by pdf.js count, not extracted rows.
  const pdfObjectId = useMemo(() => {
    if (!isPdf) return null;
    return first?.objectId ?? null;
  }, [isPdf, first?.objectId]);

  const knownCount =
    typeof pageCount === 'number' && pageCount > 0
      ? pageCount
      : pages.some((p) => p.text)
        ? pages.length
        : null;

  const resolvedCount = isPdf ? pdfPageCount ?? knownCount : knownCount ?? pages.length;
  const total = Math.max(resolvedCount ?? 1, 1);
  const countKnown = resolvedCount !== null && resolvedCount !== undefined;
  const page = pages[Math.min(index, Math.max(pages.length - 1, 0))];

  useEffect(() => {
    setIndex(0);
    setPdfPageCount(null);
  }, [pdfObjectId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(total - 1, i + 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [total]);

  if (!first) {
    return (
      <div className="rounded-[15px] border border-dashed border-st-bd2 bg-st-cardAlt p-8 text-center text-sm text-st-muted">
        No pages yet — Petros is still reading.
      </div>
    );
  }

  return (
    <div className="rounded-[15px] border border-st-bd1 bg-st-card p-3">
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          aria-label="Previous page"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-st-bd1 disabled:opacity-40"
          disabled={index === 0}
          onClick={() => setIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="font-mono-ui text-[10px] tracking-wide text-st-faint">
          {countKnown ? `PAGE ${index + 1} OF ${total}` : 'LOADING PAGES…'}
        </p>
        <button
          type="button"
          aria-label="Next page"
          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full border border-st-bd1 disabled:opacity-40"
          disabled={!countKnown || index >= total - 1}
          onClick={() => setIndex((i) => Math.min(total - 1, i + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 min-h-[240px]">
        {isPdf && pdfObjectId ? (
          <PdfDocumentViewer
            objectId={pdfObjectId}
            pageNumber={index + 1}
            onNumPages={setPdfPageCount}
          />
        ) : isImage ? (
          <AuthImage objectId={page?.objectId ?? first.objectId} alt={`Page ${index + 1}`} />
        ) : (
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-[12px] bg-st-cardAlt p-4 font-body text-sm text-st-ink">
            {page?.text || 'No extracted text on this page.'}
          </pre>
        )}
      </div>
    </div>
  );
}

function AuthImage({ objectId, alt }: { objectId: string; alt: string }) {
  const client = useStudentClient();
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void client.fetchBytes(objectId).then((buf) => {
      if (cancelled) return;
      const blob = new Blob([buf]);
      const next = URL.createObjectURL(blob);
      revoked = next;
      setUrl(next);
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [client, objectId]);

  if (!url) return <div className="h-64 shimmer rounded-[12px]" />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} className="mx-auto max-h-[28rem] w-auto rounded-[12px]" />;
}
