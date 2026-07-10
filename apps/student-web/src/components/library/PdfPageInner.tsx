'use client';
import { useEffect, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { useStudentClient } from '@/lib/student-client';
import 'react-pdf/dist/Page/TextLayer.css';

// Use the exact pdfjs version react-pdf depends on (avoids worker/API mismatch).
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export function PdfDocumentViewer({
  objectId,
  pageNumber,
  onNumPages,
}: {
  objectId: string;
  pageNumber: number;
  onNumPages?: (n: number) => void;
}) {
  const client = useStudentClient();
  const [file, setFile] = useState<{ data: Uint8Array } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(480);

  useEffect(() => {
    const update = () => setWidth(Math.min(window.innerWidth - 64, 560));
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFile(null);
    setError(null);
    void client
      .fetchBytes(objectId)
      .then((buf) => {
        if (cancelled) return;
        // Fresh copy — pdf.js may transfer/detach the ArrayBuffer.
        setFile({ data: Uint8Array.from(new Uint8Array(buf)) });
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message ?? 'Could not load PDF');
      });
    return () => {
      cancelled = true;
    };
  }, [client, objectId]);

  if (error) {
    return <p className="p-4 text-sm text-st-danger">{error}</p>;
  }
  if (!file) return <div className="h-64 shimmer rounded-[12px]" />;

  return (
    <Document
      file={file}
      loading={<div className="h-64 shimmer rounded-[12px]" />}
      error={<p className="p-4 text-sm text-st-danger">Couldn’t render this PDF.</p>}
      onLoadSuccess={({ numPages }) => onNumPages?.(numPages)}
      onLoadError={(err) => setError(err.message || 'Couldn’t render this PDF.')}
    >
      <Page
        pageNumber={pageNumber}
        width={width}
        renderTextLayer
        renderAnnotationLayer={false}
      />
    </Document>
  );
}

/** @deprecated use PdfDocumentViewer */
export const PdfPageInner = PdfDocumentViewer;
