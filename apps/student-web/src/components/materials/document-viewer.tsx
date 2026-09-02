'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  CircleAlert,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FileText,
  LoaderCircle,
  Maximize2,
  Minimize2,
  ShieldCheck,
  X,
} from 'lucide-react';
import styles from './document-viewer.module.css';

export type ViewableMaterial = {
  id: string;
  title: string;
  kindLabel: string;
  filename: string | null;
  mimeType: string;
};

export type MaterialDocumentPreview = {
  format: 'word' | 'slides' | 'spreadsheet' | 'text' | 'document';
  sections: Array<{
    title: string | null;
    text: string | null;
    rows: string[][] | null;
  }>;
  truncated: boolean;
  note: string | null;
};

export type PreviewKind = 'pdf' | 'presentation' | 'image' | 'video' | 'audio' | 'structured' | 'unsupported';

const DOCUMENT_EXTENSIONS = new Set([
  'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'tsv', 'txt', 'md', 'markdown',
  'rtf', 'odt', 'odp', 'ods', 'json', 'xml', 'yaml', 'yml', 'log', 'tex',
]);

export function previewKind(mimeType: string, kindLabel: string, filename?: string | null): PreviewKind {
  const mime = mimeType.toLowerCase();
  const kind = kindLabel.toLowerCase();
  const extension = filename?.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  if (mime === 'application/pdf' || kind === 'pdf' || extension === 'pdf') return 'pdf';
  if (
    ['ppt', 'pptx', 'odp'].includes(extension)
    || /powerpoint|presentation/.test(mime)
    || /^(slides?|presentation)$/.test(kind)
  ) return 'presentation';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (
    DOCUMENT_EXTENSIONS.has(extension) ||
    mime.startsWith('text/') ||
    /msword|officedocument|opendocument|rtf|spreadsheet|presentation/.test(mime) ||
    /^(doc|word|slides?|presentation|sheet|spreadsheet|notes?|text)$/.test(kind)
  ) return 'structured';
  return 'unsupported';
}

export function DocumentViewer({
  material,
  previewUrl,
  documentPreviewUrl,
  downloadUrl,
  onClose,
}: {
  material: ViewableMaterial;
  previewUrl: string;
  documentPreviewUrl: string;
  downloadUrl: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [documentPreview, setDocumentPreview] = useState<MaterialDocumentPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pageCount, setPageCount] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const kind = previewKind(material.mimeType, material.kindLabel, material.filename);
  const canPreview = kind !== 'unsupported';

  const close = useCallback(async () => {
    if (document.fullscreenElement === dialogRef.current) await document.exitFullscreen?.();
    onClose();
  }, [onClose]);

  useEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    setCanFullscreen(Boolean(document.fullscreenEnabled && dialogRef.current?.requestFullscreen));
    dialogRef.current?.focus();

    const onFullscreenChange = () => setFullscreen(document.fullscreenElement === dialogRef.current);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.fullscreenElement) {
        event.preventDefault();
        void close();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), iframe, video[controls], audio[controls], [tabindex]:not([tabindex="-1"])',
      )];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('keydown', onKeyDown);
      previousFocus.current?.focus();
    };
  }, [close]);

  useEffect(() => {
    if (kind !== 'structured') return;
    const request = new AbortController();
    setLoading(true);
    setPreviewError(null);
    void fetch(documentPreviewUrl, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: request.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Preview request failed (${response.status})`);
        return response.json() as Promise<MaterialDocumentPreview>;
      })
      .then((result) => {
        setDocumentPreview(result);
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (request.signal.aborted) return;
        setPreviewError(error instanceof Error ? error.message : 'The preview could not be prepared.');
        setLoading(false);
      });
    return () => request.abort();
  }, [documentPreviewUrl, kind]);

  useEffect(() => {
    if (kind !== 'pdf' && kind !== 'presentation') return;
    const request = new AbortController();
    setLoading(true);
    setPreviewError(null);
    setPageCount(null);
    setPage(1);
    void fetch(`${previewUrl}/metadata`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: request.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`Preview request failed (${response.status})`);
        return response.json() as Promise<{ pageCount: number }>;
      })
      .then((result) => setPageCount(result.pageCount))
      .catch((error: unknown) => {
        if (request.signal.aborted) return;
        setPreviewError(error instanceof Error ? error.message : 'The preview could not be prepared.');
        setLoading(false);
      });
    return () => request.abort();
  }, [kind, previewUrl]);

  async function toggleFullscreen() {
    if (!dialogRef.current) return;
    if (document.fullscreenElement === dialogRef.current) await document.exitFullscreen?.();
    else await dialogRef.current.requestFullscreen?.();
  }

  const preview = (() => {
    if (kind === 'pdf' || kind === 'presentation') {
      if (previewError) {
        return (
          <div className={styles.unsupported} role="alert">
            <CircleAlert aria-hidden="true" />
            <h3>We could not prepare this preview</h3>
            <p>The original file is safe. Download it to open it on your device.</p>
          </div>
        );
      }
      if (!pageCount) return null;
      return (
        <div className={styles.pdfReader}>
          <div className={styles.pdfScroller}>
            <img
              className={styles.pdfPage}
              src={`${previewUrl}/pages/${page}`}
              alt={`${material.title}, page ${page} of ${pageCount}`}
              onLoad={() => setLoading(false)}
              onError={() => {
                setPreviewError('The page image could not be loaded.');
                setLoading(false);
              }}
            />
          </div>
          <nav className={styles.pageControls} aria-label="Document pages">
            <button
              type="button"
              aria-label="Previous page"
              disabled={page <= 1}
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.max(1, current - 1));
              }}
            ><ChevronLeft aria-hidden="true" /></button>
            <span>Page <strong>{page}</strong> of {pageCount}</span>
            <button
              type="button"
              aria-label="Next page"
              disabled={page >= pageCount}
              onClick={() => {
                setLoading(true);
                setPage((current) => Math.min(pageCount, current + 1));
              }}
            ><ChevronRight aria-hidden="true" /></button>
          </nav>
        </div>
      );
    }
    if (kind === 'image') {
      return <img className={styles.imagePreview} src={previewUrl} alt={material.title} onLoad={() => setLoading(false)} />;
    }
    if (kind === 'video') {
      return <video className={styles.mediaPreview} src={previewUrl} controls onCanPlay={() => setLoading(false)} />;
    }
    if (kind === 'audio') {
      return (
        <div className={styles.audioPreview}>
          <FileText aria-hidden="true" />
          <p>{material.filename ?? material.title}</p>
          <audio src={previewUrl} controls onCanPlay={() => setLoading(false)} />
        </div>
      );
    }
    if (kind === 'structured') {
      if (previewError) {
        return (
          <div className={styles.unsupported} role="alert">
            <CircleAlert aria-hidden="true" />
            <h3>We could not prepare this preview</h3>
            <p>The original file is safe. Download it to open it on your device.</p>
          </div>
        );
      }
      return documentPreview ? <StructuredDocumentPreview preview={documentPreview} /> : null;
    }
    return (
      <div className={styles.unsupported}>
        <FileText aria-hidden="true" />
        <h3>Preview is not available for this file type</h3>
        <p>Open it in a new tab or download it to use the app installed on your device.</p>
      </div>
    );
  })();

  return createPortal(
    <div className={styles.layer} data-testid="document-viewer-layer">
      <button className={styles.backdrop} type="button" aria-label="Close document viewer" onClick={() => void close()} />
      <section
        ref={dialogRef}
        className={styles.dialog}
        data-fullscreen={fullscreen ? 'true' : 'false'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="document-viewer-title"
        tabIndex={-1}
      >
        <header className={styles.header}>
          <div className={styles.identity}>
            <span className={styles.fileMark}><FileText aria-hidden="true" /></span>
            <div>
              <h2 id="document-viewer-title">{material.title}</h2>
              <p className={styles.fileMeta}>
                {material.filename ?? material.kindLabel}
                <span className={styles.secure}><ShieldCheck aria-hidden="true" /> Viewing securely in Edrion</span>
              </p>
            </div>
          </div>

          <div className={styles.toolbar} aria-label="Document options">
            <button
              className={styles.iconAction}
              type="button"
              onClick={() => void toggleFullscreen()}
              disabled={!canFullscreen}
              aria-label={fullscreen ? 'Exit full screen' : 'View full screen'}
              title={canFullscreen ? (fullscreen ? 'Exit full screen' : 'View full screen') : 'Full screen is unavailable in this browser'}
            >
              {fullscreen ? <Minimize2 aria-hidden="true" /> : <Maximize2 aria-hidden="true" />}
            </button>
            <a className={styles.iconAction} href={previewUrl} target="_blank" rel="noreferrer" aria-label="Open document in a new tab" title="Open in a new tab">
              <ExternalLink aria-hidden="true" />
            </a>
            <a className={styles.downloadAction} href={downloadUrl} download={material.filename ?? undefined} aria-label={`Download ${material.title}`}>
              <Download aria-hidden="true" />
              <span>Download</span>
            </a>
            <button className={styles.closeAction} type="button" onClick={() => void close()} aria-label="Close document viewer" title="Close">
              <X aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className={styles.stage} data-kind={kind}>
          {canPreview && loading ? (
            <div className={styles.loading} role="status">
              <LoaderCircle aria-hidden="true" />
              <span>Preparing document…</span>
            </div>
          ) : null}
          {preview}
        </div>

        <footer className={styles.footer}>
          <p>
            {kind === 'structured'
              ? 'Readable preview generated securely in Edrion. Download for the original layout.'
              : kind === 'pdf' || kind === 'presentation'
                ? 'Use the page controls to move through the original document layout.'
                : canPreview
                  ? 'This file is opening securely inside Edrion.'
                  : 'This file remains protected by your Edrion sign-in.'}
          </p>
          <div>
            <a href={previewUrl} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> New tab</a>
            <a href={downloadUrl} download={material.filename ?? undefined}><Download aria-hidden="true" /> Download a copy</a>
          </div>
        </footer>
      </section>
    </div>,
    document.body,
  );
}

function StructuredDocumentPreview({ preview }: { preview: MaterialDocumentPreview }) {
  return (
    <div className={styles.structuredScroller} data-format={preview.format}>
      <div className={styles.structuredDocument}>
        {preview.note ? <p className={styles.previewNote}>{preview.note}</p> : null}
        {preview.sections.map((section, sectionIndex) => (
          <section
            className={section.rows ? styles.sheetPage : preview.format === 'slides' ? styles.slidePage : styles.textPage}
            key={`${section.title ?? 'section'}-${sectionIndex}`}
            aria-label={section.title ?? `Document section ${sectionIndex + 1}`}
          >
            {section.title ? <h3 className={styles.previewSectionTitle}>{section.title}</h3> : null}
            {section.rows ? (
              <div className={styles.tableScroll}>
                <table className={styles.previewTable}>
                  <tbody>
                    {section.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            {section.text ? <div className={styles.previewText}>{section.text}</div> : null}
          </section>
        ))}
        {preview.truncated ? (
          <p className={styles.truncatedNote}>This is a shortened preview. Download the file to read everything.</p>
        ) : null}
      </div>
    </div>
  );
}
