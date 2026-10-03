'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock3, FileText, LoaderCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import { PETROS_DOCUMENT_SOURCE_VERSION, petrosDocumentReadinessSchema, type PetrosDocumentReadiness } from '@edrion/schemas';
import type { PetrosLearningSessionDocument, PetrosSessionIntent, PetrosTeachingPriority } from '@edrion/schemas';
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
  const [readinessError, setReadinessError] = useState<PetrosDocumentReadiness | null>(null);
  const [topicId, setTopicId] = useState('');
  const [priority, setPriority] = useState<PetrosTeachingPriority>('understand');
  const [sessionMinutes, setSessionMinutes] = useState(Math.ceil(timeBudgetSeconds / 60));
  const [existingDoubt, setExistingDoubt] = useState('');
  const dialogRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const keySuffix = `${door}:${sourceId}:${page ?? 'all'}:${section ?? ''}`;

  const close = useCallback(() => {
    if (starting) return;
    setIntent(null);
    setError('');
    setReadinessError(null);
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
    setReadinessError(null);
    try {
      const storageKey = `petros:intent:${keySuffix}`;
      const resolve = async () => {
        const idempotencyKey = sessionStorage.getItem(storageKey) ?? newIdempotencyKey();
        sessionStorage.setItem(storageKey, idempotencyKey);
        return api.post<PetrosSessionIntent>('/student/petros/intents/resolve', {
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
        }, { 'x-petros-document-source': PETROS_DOCUMENT_SOURCE_VERSION });
      };
      // A stale result is definitive. A lost response is not: retain its key for retries.
      let resolved: PetrosSessionIntent;
      try {
        resolved = await resolve();
      } catch (caught) {
        if (apiErrorCode(caught) !== 'PETROS_INTENT_STALE') throw caught;
        sessionStorage.removeItem(storageKey);
        resolved = await resolve();
      }
      setIntent(resolved);
      setTopicId(resolved.planning?.suggestedTopicId ?? '');
      setPriority(resolved.planning?.suggestedPriority ?? (resolved.time.examDate ? 'exam_prep' : 'understand'));
      setSessionMinutes(Math.ceil(resolved.time.budgetSeconds / 60));
      setExistingDoubt('');
    } catch (caught) {
      setError(formatApiError(caught));
      setReadinessError(sourceReadinessError(caught));
      if (apiErrorCode(caught) === 'PETROS_INTENT_STALE') {
        sessionStorage.removeItem(`petros:intent:${keySuffix}`);
      }
    } finally {
      setLoading(false);
    }
  }

  async function start() {
    if (!intent || starting) return;
    setStarting(true);
    setError('');
    setReadinessError(null);
    try {
      const storageKey = `petros:intent-start:${intent.id}`;
      const idempotencyKey = sessionStorage.getItem(storageKey) ?? newIdempotencyKey();
      sessionStorage.setItem(storageKey, idempotencyKey);
      const response = await api.post<{
        intent: PetrosSessionIntent;
        session: PetrosLearningSessionDocument;
      }>(`/student/petros/intents/${intent.id}/start`, {
        idempotencyKey,
        ...(intent.planning ? {
          plan: {
            topicId: topicId || intent.planning.suggestedTopicId,
            priority,
            timeBudgetSeconds: sessionMinutes * 60,
            existingDoubt: existingDoubt.trim() || null,
          },
        } : {}),
      }, { 'x-petros-document-source': PETROS_DOCUMENT_SOURCE_VERSION });
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(`petros:intent:${keySuffix}`);
      router.push(`/petros/session?session=${response.session.id}`);
    } catch (caught) {
      setError(formatApiError(caught));
      setReadinessError(sourceReadinessError(caught));
      if (apiErrorCode(caught) === 'PETROS_INTENT_STALE') {
        sessionStorage.removeItem(`petros:intent:${keySuffix}`);
        sessionStorage.removeItem(`petros:intent-start:${intent.id}`);
        setIntent(null);
        triggerRef.current?.focus();
      }
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
        aria-busy={loading}
        data-loading-indicator={loading || undefined}
      >
        {loading ? <LoaderCircle aria-hidden="true" className={styles.spin} /> : <Sparkles aria-hidden="true" />}
        {loading ? 'Checking context…' : label}
      </button>
      {error && !intent ? <div className={styles.inlineError} role="alert">{error}<ReadinessDetails readiness={readinessError} /></div> : null}
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
              {intent.planning ? (
                <section className={styles.planning} aria-labelledby={`petros-plan-${intent.id}`}>
                  <div className={styles.planningHead}>
                    <div>
                      <p>Before I teach</p>
                      <h3 id={`petros-plan-${intent.id}`}>Let’s shape a useful lesson</h3>
                    </div>
                    <span>{intent.planning.outlineStatus === 'cached' ? 'Outline reused' : intent.planning.outlineStatus === 'generated' ? 'Outline prepared once' : 'Context ready'}</span>
                  </div>
                  {intent.planning.deadline ? (
                    <p className={styles.scheduleNote}>
                      I found <strong>{intent.planning.deadline.title}</strong> on your teacher’s schedule for {formatPlanningDate(intent.planning.deadline.at)}. I’ve used that to suggest what to prioritize.
                    </p>
                  ) : null}
                  <fieldset>
                    <legend>What would you like to learn first?</legend>
                    <div className={styles.choices}>
                      {intent.planning.topics.map((topic) => (
                        <button key={topic.id} type="button" aria-pressed={topicId === topic.id} onClick={() => setTopicId(topic.id)}>
                          <strong>{topic.title}</strong>
                          <span>{topic.pageStart ? `p. ${topic.pageStart}${topic.pageEnd && topic.pageEnd !== topic.pageStart ? `–${topic.pageEnd}` : ''} · ` : ''}{topic.estimatedMinutes} min</span>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>What’s your priority right now?</legend>
                    <div className={styles.compactChoices}>
                      {([
                        ['exam_prep', 'Exam prep'],
                        ['understand', 'Understand it'],
                        ['revisit_weak_topic', 'Revisit a weak spot'],
                        ['quick_review', 'Quick review'],
                      ] as const).map(([value, label]) => (
                        <button key={value} type="button" aria-pressed={priority === value} onClick={() => setPriority(value)}>{label}</button>
                      ))}
                    </div>
                  </fieldset>
                  <fieldset>
                    <legend>How much time do you have?</legend>
                    <div className={styles.compactChoices}>
                      {[10, 15, 25, 40].map((value) => <button key={value} type="button" aria-pressed={sessionMinutes === value} onClick={() => setSessionMinutes(value)}>{value} min</button>)}
                    </div>
                  </fieldset>
                  <label className={styles.doubt}>
                    Any doubt already in mind? <span>Optional</span>
                    <textarea value={existingDoubt} onChange={(event) => setExistingDoubt(event.target.value)} maxLength={2_000} rows={2} placeholder="For example: I understand the definition, but not why it matters." />
                  </label>
                </section>
              ) : null}
              <div className={styles.facts}>
                <span><Clock3 aria-hidden="true" />About {intent.planning ? sessionMinutes : Math.ceil(intent.time.budgetSeconds / 60)} minutes</span>
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
              {error ? <div className={styles.error} role="alert">{error}<ReadinessDetails readiness={readinessError} /></div> : null}
            </div>
            <footer className={styles.foot}>
              <button type="button" onClick={close} disabled={starting}>Not now</button>
              <button type="button" onClick={() => void start()} disabled={starting} aria-busy={starting} data-loading-indicator={starting || undefined}>
                {starting ? <LoaderCircle aria-hidden="true" className={styles.spin} /> : <ArrowRight aria-hidden="true" />}
                {starting ? 'Starting your lesson…' : intent.planning ? 'Start planned lesson' : 'Start this session'}
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
  const [scope, setScope] = useState<'document' | 'page'>('document');
  return (
    <div className={styles.documentDoor}>
      <label>Teach
        <select value={scope} disabled={!ready} onChange={(event) => setScope(event.target.value as 'document' | 'page')}>
          <option value="document">Whole document</option>
          <option value="page">One page</option>
        </select>
      </label>
      {scope === 'page' ? <label>Page
        <input
          type="number"
          min={1}
          max={pageCount ?? 1}
          value={page}
          disabled={!ready}
          onChange={(event) => setPage(Math.max(1, Math.min(pageCount ?? 1, Number(event.target.value) || 1)))}
        />
        {pageCount ? ` of ${pageCount}` : ''}
      </label> : null}
      <PetrosDoorButton
        door="uploaded_document"
        sourceId={sourceId}
        page={scope === 'page' ? page : undefined}
        label={ready ? `Plan a lesson from ${title}` : 'Teaching source unavailable'}
        disabled={!ready}
      />
    </div>
  );
}

function formatPlanningDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'its published date';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function doorLabel(door: Door) {
  return {
    result_repair: 'Published result',
    upcoming_exam: 'Upcoming exam',
    uploaded_document: 'Study document',
    learning_path: 'Learning path',
    assistant_handoff: 'Assistant handoff',
    reflection_action: 'Reflection next action',
    active_homework: 'Active assignment',
  }[door];
}

function apiErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}

function sourceReadinessError(error: unknown): PetrosDocumentReadiness | null {
  const meta = error && typeof error === 'object' && 'meta' in error ? error.meta : null;
  const result = petrosDocumentReadinessSchema.safeParse(meta && typeof meta === 'object' && 'readiness' in meta ? meta.readiness : null);
  return result.success ? result.data : null;
}

const readinessReasons: Record<PetrosDocumentReadiness['reasons'][number], string> = {
  pending: 'Text preparation is still pending. Retry after preparation finishes.',
  extraction_failed: 'Text extraction failed. Correct the file and retry preparation.',
  preview_only: 'This format has a preview only. Provide a readable PDF for teaching.',
  truncated: 'The extracted text was truncated. Provide a smaller, complete source.',
  missing_pages: 'Some selected pages have no extracted text. Select an available page.',
  unreadable_text: 'Some selected text is unreadable. Check the original and correct the file.',
  confirmation_required: 'Extracted text needs confirmation before teaching.',
  invalid_locator: 'The selected page cannot be located reliably in the original.',
  resource_limit: 'The source exceeds the preparation limits. Provide a smaller file.',
  invalid_metadata: 'Preparation information is invalid. Retry preparation after correcting the file.',
};

function ReadinessDetails({ readiness }: { readiness: PetrosDocumentReadiness | null }) {
  if (!readiness) return null;
  return <div>
    {readiness.unavailablePages.length ? <p>Unavailable or unconfirmed pages: {readiness.unavailablePages.join(', ')}.</p> : null}
    <ul>{readiness.reasons.map((reason) => <li key={reason}>{readinessReasons[reason]}</li>)}</ul>
  </div>;
}
