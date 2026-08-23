'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
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

type PreviewKind = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'unsupported';

function previewKind(mimeType: string, kindLabel: string): PreviewKind {
  const mime = mimeType.toLowerCase();
  const kind = kindLabel.toLowerCase();
  if (mime === 'application/pdf' || kind === 'pdf') return 'pdf';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('text/')) return 'text';
  return 'unsupported';
}

export function DocumentViewer({
  material,
  previewUrl,
  downloadUrl,
  onClose,
}: {
  material: ViewableMaterial;
  previewUrl: string;
  downloadUrl: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen, setCanFullscreen] = useState(false);
  const kind = previewKind(material.mimeType, material.kindLabel);
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

  async function toggleFullscreen() {
    if (!dialogRef.current) return;
    if (document.fullscreenElement === dialogRef.current) await document.exitFullscreen?.();
    else await dialogRef.current.requestFullscreen?.();
  }

  const preview = (() => {
    if (kind === 'pdf' || kind === 'text') {
      const source = kind === 'pdf' ? `${previewUrl}#page=1&zoom=page-width` : previewUrl;
      return (
        <iframe
          className={styles.documentFrame}
          src={source}
          title={`${material.title} document`}
          onLoad={() => setLoading(false)}
        />
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
              <p className={styles.eyebrow}>Study materials <span aria-hidden="true">/</span> Document viewer</p>
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
          <p>{canPreview ? 'Use the viewer toolbar to zoom, move between pages, or print.' : 'This file remains protected by your Edrion sign-in.'}</p>
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
