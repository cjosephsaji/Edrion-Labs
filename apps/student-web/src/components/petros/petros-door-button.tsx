'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock3, FileText, LoaderCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { PetrosLearningSessionDocument, PetrosSessionIntent } from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import styles from './petros-door-button.module.css';

type Door = PetrosSessionIntent['door'];

export function PetrosDoorButton({
  door,
  sourceId,
  label,
  className,
  timeBudgetSeconds = 900,
  page,
  section,
  question,
  route,
  disabled,
}: {
  door: Door;
  sourceId: string;
  label: string;
  className?: string;
  timeBudgetSeconds?: number;
  page?: number;
  section?: string;
  question?: string;
  route?: string;
  disabled?: boolean;
}) {
  const api = useStudentApi();
  const router = useRouter();
  const [intent, setIntent] = useState<PetrosSessionIntent | null>(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const keySuffix = `${door}:${sourceId}:${page ?? 'all'}:${section ?? ''}`;

  const close = useCallback(() => {
    if (starting) return;
    setIntent(null);
    setError('');
    window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, [starting]);

  useEffect(() => {
    if (!intent) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !starting) close();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [close, intent, starting]);

  async function preview() {
    if (loading || disabled) return;
    setLoading(true);
    setError('');
    try {
      const storageKey = `petros:intent:${keySuffix}`;
      const idempotencyKey = sessionStorage.getItem(storageKey) ?? newIdempotencyKey();
      sessionStorage.setItem(storageKey, idempotencyKey);
      const resolved = await api.post<PetrosSessionIntent>('/student/petros/intents/resolve', {
        door,
        sourceId,
        idempotencyKey,
        timeBudgetSeconds,
        ...(page ? { page } : {}),
        ...(section ? { section } : {}),
        ...(question ? { question } : {}),
        ...(route ? { route } : {}),
        language: 'en',
        accessibility: [],
      });
      setIntent(resolved);
    } catch (caught) {
      setError(formatApiError(caught));
    } finally {
      setLoading(false);
    }
  }

  async function start() {
    if (!intent || starting) return;
    setStarting(true);
    setError('');
    try {
      const storageKey = `petros:intent-start:${intent.id}`;
      const idempotencyKey = sessionStorage.getItem(storageKey) ?? newIdempotencyKey();
      sessionStorage.setItem(storageKey, idempotencyKey);
      const response = await api.post<{
        intent: PetrosSessionIntent;
        session: PetrosLearningSessionDocument;
      }>(`/student/petros/intents/${intent.id}/start`, { idempotencyKey });
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(`petros:intent:${keySuffix}`);
      router.push(`/petros/session?session=${response.session.id}`);
    } catch (caught) {
      setError(formatApiError(caught));
      setStarting(false);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={className ?? styles.trigger}
        onClick={() => void preview()}
        disabled={disabled || loading}
      >
        {loading ? <LoaderCircle aria-hidden="true" className={styles.spin} /> : <Sparkles aria-hidden="true" />}
        {loading ? 'Checking context…' : label}
      </button>
      {error && !intent ? <p className={styles.inlineError} role="alert">{error}</p> : null}
      {intent && typeof document !== 'undefined' ? createPortal(
        <div className={styles.layer} data-petros-preview-layer="true">
          <button type="button" className={styles.backdrop} onClick={close} aria-label="Close Petros preview" />
          <section
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`petros-intent-${intent.id}`}
            className={styles.dialog}
          >
            <header className={styles.head}>
              <span><Sparkles aria-hidden="true" /></span>
              <div>
                <p>{doorLabel(intent.door)} · {intent.sessionType}</p>
                <h2 id={`petros-intent-${intent.id}`}>Preview this Petros session</h2>
              </div>
              <button type="button" onClick={close} disabled={starting} aria-label="Close preview"><X aria-hidden="true" /></button>
            </header>
            <div className={styles.body}>
              <section className={styles.goal}>
                <strong>{intent.goal}</strong>
                <p>{intent.scope.summary}</p>
              </section>
              <div className={styles.facts}>
                <span><Clock3 aria-hidden="true" />About {Math.ceil(intent.time.budgetSeconds / 60)} minutes</span>
                <span><FileText aria-hidden="true" />{intent.citations.length || 1} verified source reference{intent.citations.length === 1 ? '' : 's'}</span>
              </div>
              {intent.scope.knownFailureDetails.length ? (
                <section className={styles.details}>
                  <h3>What Petros knows now</h3>
                  <ul>{intent.scope.knownFailureDetails.map((detail) => <li key={detail}>{detail}</li>)}</ul>
                </section>
              ) : null}
              {intent.citations.length ? (
                <section className={styles.details}>
                  <h3>Source and scope</h3>
                  <ul>{intent.citations.slice(0, 4).map((citation) => <li key={`${citation.sourceId}:${citation.page ?? citation.section}`}>{citation.label}{citation.section ? ` · ${citation.section}` : ''}</li>)}</ul>
                </section>
              ) : null}
              <section className={styles.policy}>
                <ShieldCheck aria-hidden="true" />
                <div>
                  <h3>Institution and source rules</h3>
                  {intent.policyDisclosures.map((disclosure) => <p key={disclosure}>{disclosure}</p>)}
                </div>
              </section>
              {error ? <p className={styles.error} role="alert">{error}</p> : null}
            </div>
            <footer className={styles.foot}>
              <button type="button" onClick={close} disabled={starting}>Not now</button>
              <button type="button" onClick={() => void start()} disabled={starting}>
                {starting ? <LoaderCircle aria-hidden="true" className={styles.spin} /> : <ArrowRight aria-hidden="true" />}
                {starting ? 'Starting one session…' : 'Start this session'}
              </button>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
    </>
  );
}

export function PetrosDocumentDoor({
  sourceId,
  title,
  pageCount,
  ready,
}: {
  sourceId: string;
  title: string;
  pageCount: number | null;
  ready: boolean;
}) {
  const [page, setPage] = useState(1);
  return (
    <div className={styles.documentDoor}>
      <label>
        Page
        <input
          type="number"
          min={1}
          max={pageCount ?? 1}
          value={page}
          disabled={!ready}
          onChange={(event) => setPage(Math.max(1, Math.min(pageCount ?? 1, Number(event.target.value) || 1)))}
        />
        {pageCount ? ` of ${pageCount}` : ''}
      </label>
      <PetrosDoorButton
        door="uploaded_document"
        sourceId={sourceId}
        page={page}
        label={ready ? `Teach me this page from ${title}` : 'Extraction in progress'}
        disabled={!ready}
      />
    </div>
  );
}

function doorLabel(door: Door) {
  return {
    result_repair: 'Published result',
    upcoming_exam: 'Upcoming exam',
    uploaded_document: 'Uploaded document',
    learning_path: 'Learning path',
    assistant_handoff: 'Assistant handoff',
    reflection_action: 'Reflection next action',
    active_homework: 'Active assignment',
  }[door];
}
