'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ArrowRight, Clock3, FileText, LoaderCircle, ShieldCheck, Sparkles, X } from 'lucide-react';
import { PETROS_DOCUMENT_SOURCE_VERSION, petrosDocumentReadinessSchema, type PetrosDocumentReadiness } from '@edrion/schemas';
import type { PetrosDocumentPreparation, PetrosLearningSessionDocument, PetrosSessionIntent, PetrosTeachingPriority } from '@edrion/schemas';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';
import styles from './petros-door-button.module.css';
import { studentIntentDetail } from './petros-intent-detail';

type Door = PetrosSessionIntent['door'];

function isExpiredIntent(intent: PetrosSessionIntent) {
  if (intent.status === 'invalidated' || intent.status === 'expired') return true;
  const expiresAt = Date.parse(intent.expiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= Date.now();
}

function isStaleIntentError(error: unknown) {
  return Boolean(
    error
    && typeof error === 'object'
    && 'code' in error
    && error.code === 'PETROS_INTENT_STALE',
  );
}

function preparationLabel(stage: PetrosDocumentPreparation['stage']) {
  if (stage === 'queued' || stage === 'checking_source') return 'Reading your material';
  if (stage === 'mapping_document' || stage === 'selecting_start') return 'Organizing the ideas';
  if (stage === 'generating_lesson' || stage === 'repairing_lesson' || stage === 'validating_lesson') return 'Preparing your first activity';
  if (stage === 'first_lesson_ready' || stage === 'preparing_next') return 'Your first activity is ready';
  if (stage === 'complete') return 'Your learning path is ready';
  if (stage === 'cancelled') return 'Preparation stopped';
  return 'This source needs attention';
}

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
  const [preparation, setPreparation] = useState<PetrosDocumentPreparation | null>(null);
  const [error, setError] = useState('');
  const [readinessError, setReadinessError] = useState<PetrosDocumentReadiness | null>(null);
  const [topicId, setTopicId] = useState('');
  const [priority, setPriority] = useState<PetrosTeachingPriority>('understand');
  const [sessionMinutes, setSessionMinutes] = useState(Math.ceil(timeBudgetSeconds / 60));
  const [existingDoubt, setExistingDoubt] = useState('');
  const dialogRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const keySuffix = `${door}:${sourceId}:${page ?? 'all'}:${section ?? ''}`;
  const preparationId = preparation?.id;
  const preparationStatus = preparation?.status;

  const close = useCallback(() => {
    if (starting) return;
    setIntent(null);
    setPreparation(null);
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

  useEffect(() => {
    if (!preparationId || !intent || !preparationStatus || ['ready', 'needs_attention', 'cancelled'].includes(preparationStatus)) return;
    let active = true;
    let timer: number | undefined;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const next = await api.get<PetrosDocumentPreparation>(
          `/student/petros/document-preparations/${preparationId}`,
          controller.signal,
        );
        if (!active) return;
        setPreparation(next);
        if (!['ready', 'needs_attention', 'cancelled'].includes(next.status)) {
          timer = window.setTimeout(() => void poll(), 1_500);
        }
      } catch (caught) {
        if (!active || controller.signal.aborted) return;
        setError(formatApiError(caught));
        timer = window.setTimeout(() => void poll(), 3_000);
      }
    };
    void poll();
    return () => {
      active = false;
      controller.abort();
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [api, intent, preparationId, preparationStatus]);

  useEffect(() => {
    if (preparation?.status !== 'ready' || starting) return;
    setPreparation(null);
    void start();
    // The ready transition is the trigger; start reads current selections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preparation?.status]);

  async function preview(options?: { preserveSelections?: boolean; refreshed?: boolean }) {
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
      if (isExpiredIntent(resolved)) {
        sessionStorage.removeItem(storageKey);
        resolved = await resolve();
      }
      setIntent(resolved);
      setPreparation(null);
      const selectedTopicStillExists = resolved.planning?.topics.some((topic) => topic.id === topicId) ?? false;
      if (!options?.preserveSelections || !selectedTopicStillExists) {
        setTopicId(resolved.planning?.suggestedTopicId ?? '');
      }
      if (!options?.preserveSelections) {
        setPriority(resolved.planning?.suggestedPriority ?? (resolved.time.examDate ? 'exam_prep' : 'understand'));
        setSessionMinutes(Math.ceil(resolved.time.budgetSeconds / 60));
        setExistingDoubt('');
      }
      if (options?.refreshed) {
        setError('The source preview was refreshed. Please confirm the current lesson scope before starting.');
      }
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
    const storageKey = `petros:intent-start:${intent.id}`;
    try {
      const idempotencyKey = sessionStorage.getItem(storageKey) ?? newIdempotencyKey();
      sessionStorage.setItem(storageKey, idempotencyKey);
      const response = await api.post<{
        intent: PetrosSessionIntent;
        session: PetrosLearningSessionDocument | null;
        preparation?: PetrosDocumentPreparation;
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
      if (!response.session && response.preparation) {
        setPreparation(response.preparation);
        setStarting(false);
        return;
      }
      if (!response.session) throw new Error('Petros did not return a lesson or a preparation status.');
      sessionStorage.removeItem(storageKey);
      sessionStorage.removeItem(`petros:intent:${keySuffix}`);
      router.push(`${response.session.documentTeaching ? '/petros/document' : '/petros/session'}?session=${response.session.id}`);
    } catch (caught) {
      if (isStaleIntentError(caught)) {
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem(`petros:intent:${keySuffix}`);
        setIntent(null);
        setStarting(false);
        void preview({ preserveSelections: true, refreshed: true });
        return;
      }
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
                <h2 id={`petros-intent-${intent.id}`}>What shall we figure out?</h2>
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
                      <p>Your learning plan</p>
                      <h3 id={`petros-plan-${intent.id}`}>Start with an idea that matters to you</h3>
                    </div>
                    <span>{intent.planning.topics.length} learning topics</span>
                  </div>
                  {intent.planning.organization === 'headings' ? <p className={styles.scheduleNote}>This plan follows the document’s headings. Add a specific idea or question below to focus your session.</p> : null}
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
                          <span>{topic.summary}</span>
                          <small>About {topic.estimatedMinutes} min{topic.difficulty ? ` · ${topic.difficulty}` : ''}</small>
                          {topic.prerequisites?.length ? <small>Builds on {topic.prerequisites.join(', ')}</small> : null}
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
                  <ul>{intent.scope.knownFailureDetails.map((detail) => <li key={detail}>{studentIntentDetail(detail)}</li>)}</ul>
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
              {preparation ? (
                <section className={styles.preparation} aria-live="polite" aria-busy={preparation.status === 'preparing' || preparation.status === 'queued'}>
                  <div><Sparkles aria-hidden="true" /><strong>{preparation.message}</strong></div>
                  <progress max={100} value={preparation.progress}>{preparation.progress}%</progress>
                  <p>{preparationLabel(preparation.stage)} · {preparation.progress}%</p>
                  {preparation.status === 'needs_attention' && preparation.retryable ? (
                    <button type="button" onClick={() => { setPreparation(null); void start(); }}>Retry preparation</button>
                  ) : null}
                </section>
              ) : null}
            </div>
            <footer className={styles.foot}>
              <button type="button" onClick={close} disabled={starting}>Not now</button>
              <button type="button" onClick={() => void start()} disabled={starting || Boolean(preparation && preparation.status !== 'needs_attention')} aria-busy={starting || preparation?.status === 'preparing'} data-loading-indicator={starting || preparation?.status === 'preparing' || undefined}>
                {starting || (preparation && preparation.status !== 'needs_attention') ? <LoaderCircle aria-hidden="true" className={styles.spin} /> : <ArrowRight aria-hidden="true" />}
                {starting ? 'Checking for a ready activity…' : preparation?.status === 'needs_attention' ? 'Retry preparation' : preparation ? 'Preparing your first activity…' : intent.planning ? 'Start planned lesson' : 'Start this session'}
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
      <label>Explore
        <select value={scope} disabled={!ready} onChange={(event) => setScope(event.target.value as 'document' | 'page')}>
          <option value="document">Concepts in this document</option>
          <option value="page">Concept around a source page</option>
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
