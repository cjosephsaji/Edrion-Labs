'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { useStudentMe } from '@/lib/hooks';
import { usePetrosConnectivityMode } from './use-petros-connectivity-mode';
import styles from './petros-continuity.module.css';

type Capability = { enabled: boolean; independentSupported: false; guardianSharing: false; fullOffline: false };
type Journey = {
  id: string; version: number; returnPoint: { sessionId: string; unresolvedRequest: string; returnTarget: string; connectivity: string };
  source: { title?: string; sourceVersion: string; [key: string]: unknown };
  objective?: { statement?: string; [key: string]: unknown } | null;
  policyVersion: string; resumeHref: string; recovery?: { acknowledgedOnly?: boolean; unacknowledgedInterval?: string } | string | null;
};
type Recommendation = {
  id: string; journeyId: string; sessionId: string; state: 'not_assessed' | 'not_demonstrated' | 'review_due' | 'demonstrated';
  reviewApplication?: {status:'available'|'unavailable';reason:string;href:string|null}; objectiveStatement?: string; reason: string; evidenceIds: string[]; watermark: number; source: { title?: string; sourceVersion: string; [key: string]: unknown };
  objective?: { statement?: string; [key: string]: unknown } | null; policyVersion: string; href: string; uncertainty?: string | null;
};
type Continuity = { capabilities?: Capability; journeys?: { journeys: Journey[]; unavailableCount: number }; recommendations?: { items: Recommendation[]; memoryRevision: number } };
type MemoryRecord = {
  id: string; category: 'explicit_preference' | 'session_continuity' | 'learning_evidence' | 'episodic' | 'hypothesis' | 'sensitive';
  content: string; scope: { sessionId?: string | null; sourceVersion?: string | null }; revision: number; sourceEventId: string;
  confidence: number | null; expiresAt: string | null; corrected: boolean; deletedAt: string | null;
};
type MemoryResponse = {
  memoryRevision: number; optionalMemoryEnabled: boolean;
  preferences: { responseDepth: 'brief' | 'balanced' | 'thorough'; language: string; quietMode: boolean };
  records: MemoryRecord[]; retainedEvidenceNotice: string;
};

const safeHref = (href: string) => href.startsWith('/') && !href.startsWith('//') && !href.includes('\\') ? href : null;
const commandId = () => crypto.randomUUID();

export function PetrosContinuityOverview({ compact = false }: { compact?: boolean }) {
  const api = useStudentApi();
  const me = useStudentMe();
  const enabled = me.data?.kind === 'institutional';
  const result = useQuery({
    queryKey: ['student', 'petros', 'continuity', me.data?.institutionId, me.data?.studentId],
    enabled: !!me.data,
    retry: false,
    queryFn: async () => {
      const capabilities = await api.get<Capability>('/student/petros/continuity/capabilities');
      if (!enabled || !capabilities.enabled) return { capabilities, journeys: { journeys: [], unavailableCount: 0 }, recommendations: { items: [], memoryRevision: 0 } };
      const [journeys, recommendations] = await Promise.all([
        api.get<{ journeys: Journey[]; unavailableCount: number }>('/student/petros/continuity/journeys'),
        api.get<{ items: Recommendation[]; memoryRevision: number }>('/student/petros/continuity/recommendations'),
      ]);
      return { capabilities, journeys, recommendations } satisfies Continuity;
    },
  });
  const queryClient = useQueryClient();
  const journeyById = new Map((result.data?.journeys?.journeys ?? []).map((journey) => [journey.id, journey]));
  const dismiss = useMutation({
    mutationFn: ({ journeyId, version }: { journeyId: string; version: number }) =>
      api.post(`/student/petros/continuity/recommendations/${journeyId}/dismiss`, { commandId: commandId(), expectedVersion: version }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student', 'petros', 'continuity'] }),
  });

  if (!me.data) return null;
  if (me.data.kind === 'independent') return <section className="my-5 rounded-xl border border-[var(--s-bd1)] bg-[var(--s-card)] p-4" aria-label="Petros continuity availability"><h2 className="font-semibold">Learning continuity</h2><p className="mt-1 text-sm">Cross-surface Petros continuity is not available for independent accounts yet.</p></section>;
  if (result.isPending) return null;
  if (result.error) return <p className="my-4 text-sm" role="status">Your saved learning continuity is unavailable right now.</p>;
  if (!result.data?.capabilities?.enabled) return compact ? <section className={styles.continue} aria-label="Start learning"><div><p className={styles.kicker}>A little space to think</p><h2>Bring one idea into focus.</h2><p>Open a class source or bring a question. Choose the scope before your lesson begins.</p></div><Link className={styles.primary} href="/petros">Prepare a lesson <span aria-hidden="true">↗</span></Link></section> : null;

  const journeys = result.data.journeys?.journeys ?? [];
  const recommendations = result.data.recommendations?.items ?? [];
  const stateLabel = (state: Recommendation['state']) => ({ not_assessed: 'Not assessed', not_demonstrated: 'Not yet demonstrated', review_due: 'Review due', demonstrated: 'Demonstrated' })[state];
  return <section className={styles.overview} aria-label="Petros learning continuity">
    <div className={styles.continue}>
      <div><p className={styles.kicker}>{journeys.length ? 'Your learning · saved return point' : 'Your learning · one clear starting point'}</p><h2>{journeys.length ? 'Pick up where you left off' : 'Begin with a source'}</h2>
        <p>{journeys[0]?.source.title ?? journeys[0]?.objective?.statement ?? 'Choose one idea to explore with Petros.'}</p>
        {journeys[0]?.returnPoint.unresolvedRequest && <p>Your open question: {journeys[0].returnPoint.unresolvedRequest}</p>}
      </div>
      {journeys[0] && safeHref(journeys[0].resumeHref) ? <Link className={styles.primary} href={safeHref(journeys[0].resumeHref)!}>Resume learning <span aria-hidden="true">↗</span></Link> : <Link className={styles.primary} href="/petros">Prepare a lesson <span aria-hidden="true">↗</span></Link>}
    </div>
    {journeys.length ? <ul className={styles.journeys}>{journeys.slice(0, compact ? 1 : 4).map((journey, index) => <li key={journey.id}>
      {index > 0 && <><p className="font-medium">{journey.source.title ?? journey.objective?.statement ?? 'Saved learning session'}</p>
      {safeHref(journey.resumeHref) && <Link className="inline-flex min-h-10 underline" href={safeHref(journey.resumeHref)!}>Resume learning</Link>}</>}
      {journey.recovery && <p role="status">{typeof journey.recovery === 'string' ? journey.recovery : journey.recovery.acknowledgedOnly ? 'Only acknowledged progress is restored. Work from the unacknowledged interval may not be available.' : 'Saved progress was checked before resume.'}</p>}
      <details><summary>Source and saved state</summary><p className="break-all">Source version {journey.source.sourceVersion} · {journey.returnPoint.connectivity.replaceAll('_', ' ')}</p></details>
    </li>)}</ul> : <p className={styles.empty}>No saved learning sessions are available to resume.</p>}
    {(result.data.journeys?.unavailableCount ?? 0) > 0 && <p role="status">{result.data.journeys!.unavailableCount} saved session(s) need current access before they can be resumed.</p>}
    {recommendations.length > 0 && <details className={styles.recommendations} open={!compact}><summary>A useful next step · evidence and review</summary><ul>{recommendations.slice(0, compact ? 2 : 4).map((item) => {
      const journey = journeyById.get(item.journeyId);
      return <li key={item.id}><p className={styles.kicker}>{stateLabel(item.state)}</p>
        <h3>{item.objectiveStatement ?? item.objective?.statement ?? item.source.title ?? 'Continue your learning'}</h3><p>{item.reason}</p>
        {item.uncertainty && <p>{item.uncertainty}</p>}
        {item.state === 'review_due' && item.reviewApplication && <p>{item.reviewApplication.reason}{safeHref(item.reviewApplication.href ?? '') && <Link className="inline-flex min-h-10 underline" href={safeHref(item.reviewApplication.href ?? '')!}>Continue to a reviewed application</Link>}</p>}
        <div className={styles.links}>{safeHref(item.href) && <Link href={safeHref(item.href)!}>Open next step</Link>}
          {journey && <button type="button" disabled={dismiss.isPending} onClick={() => dismiss.mutate({ journeyId: item.journeyId, version: journey.version })}>Dismiss suggestion</button>}
        </div>
      </li>;
    })}</ul></details>}
    {dismiss.error && <p role="alert">{formatApiError(dismiss.error)}</p>}
    <footer className={styles.links}><Link href="/petros/artifacts">Open your notebook and review deck</Link><Link href="/settings#petros-memory">Memory and connectivity settings</Link></footer>
    {!compact && <p className={styles.empty}>Full offline access and guardian sharing are unavailable. Recommendations show their current evidence state and source.</p>}
  </section>;
}

export function PetrosMemoryControls() {
  const api = useStudentApi();
  const me = useStudentMe();
  const queryClient = useQueryClient();
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [newMemory, setNewMemory] = useState('');
  const [memorySessionId, setMemorySessionId] = useState('');
  const memory = useQuery({
    queryKey: ['student', 'petros', 'memory', me.data?.institutionId, me.data?.studentId],
    enabled: me.data?.kind === 'institutional', retry: false,
    queryFn: () => api.get<MemoryResponse>('/student/petros/continuity/memory'),
  });
  const journeyOptions = useQuery({
    queryKey: ['student', 'petros', 'continuity', 'memory-sessions', me.data?.institutionId, me.data?.studentId],
    enabled: me.data?.kind === 'institutional', retry: false,
    queryFn: () => api.get<{ journeys: Journey[] }>('/student/petros/continuity/journeys'),
  });
  const mutate = useMutation({
    mutationFn: (command: Record<string, unknown>) => api.post('/student/petros/continuity/memory', command),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student', 'petros', 'memory'] }),
  });
  const current = memory.data;
  const updatePreferences = (patch: Partial<MemoryResponse['preferences']> & { optionalMemoryEnabled?: boolean }) => {
    if (!current) return;
    mutate.mutate({ action: 'preferences', commandId: commandId(), expectedMemoryRevision: current.memoryRevision,
      optionalMemoryEnabled: patch.optionalMemoryEnabled ?? current.optionalMemoryEnabled,
      responseDepth: patch.responseDepth ?? current.preferences.responseDepth,
      language: patch.language ?? current.preferences.language,
      quietMode: patch.quietMode ?? current.preferences.quietMode });
  };
  const visibleRecords = (current?.records ?? []).filter((record) => !record.deletedAt);
  const sessionOptions = [...new Map([
    ...(journeyOptions.data?.journeys ?? []).map((journey) => [journey.returnPoint.sessionId, journey.source.title ?? journey.objective?.statement ?? 'Saved learning session'] as const),
    ...visibleRecords.flatMap((record) => record.scope.sessionId ? [[record.scope.sessionId, 'Previously saved session'] as const] : []),
  ]).entries()];
  return <section id="petros-memory" className="mt-5 rounded-xl border border-[var(--s-bd1)] bg-[var(--s-card)] p-4" aria-labelledby="petros-memory-heading">
    <h2 id="petros-memory-heading" className="text-lg font-semibold">What Petros remembers</h2>
    {me.data?.kind === 'independent' ? <p className="mt-2 text-sm">Memory controls are not available for independent accounts yet.</p> : memory.isPending ? <p className="mt-2 text-sm">Loading your memory controls…</p> : memory.error ? <p className="mt-2 text-sm" role="alert">Memory controls are unavailable right now.</p> : current ? <>
      <p className="mt-1 text-sm">Review the scope and source of each saved item. Learning evidence remains owned by the assessment record.</p>
      <label className="mt-3 flex min-h-11 items-center gap-2"><input type="checkbox" checked={current.optionalMemoryEnabled} onChange={(event) => updatePreferences({ optionalMemoryEnabled: event.target.checked })} />Use optional episodic memory and hypotheses</label>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">Response detail<select className="min-h-10 rounded border p-2" value={current.preferences.responseDepth} onChange={(event) => updatePreferences({ responseDepth: event.target.value as MemoryResponse['preferences']['responseDepth'] })}><option value="brief">Brief</option><option value="balanced">Balanced</option><option value="thorough">Thorough</option></select></label>
        <label className="grid gap-1 text-sm">Language<input className="min-h-10 rounded border p-2" value={corrections.__language ?? current.preferences.language} maxLength={20} onChange={(event) => setCorrections((value) => ({ ...value, __language: event.target.value }))} onBlur={(event) => updatePreferences({ language: event.currentTarget.value || current.preferences.language })} /></label>
        <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={current.preferences.quietMode} onChange={(event) => updatePreferences({ quietMode: event.target.checked })} />Quiet mode</label>
      </div>
      <div className="mt-4 grid gap-2 rounded-lg border border-[var(--s-bd1)] p-3">
        <h3 className="font-medium">Remember something for future conversations</h3>
        <p className="text-sm">This saves optional conversational context for one learning session. It does not create assessment evidence.</p>
        <label className="grid gap-1 text-sm">Learning session<select className="min-h-10 rounded border p-2" value={memorySessionId} onChange={(event) => setMemorySessionId(event.target.value)}>
          <option value="">Choose a saved session</option>{sessionOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select></label>
        <label className="grid gap-1 text-sm">What should Petros remember?<textarea className="min-h-20 rounded border p-2" value={newMemory} maxLength={1000} onChange={(event) => setNewMemory(event.target.value)} /></label>
        <button type="button" className="min-h-10 justify-self-start rounded border px-3" disabled={mutate.isPending || !current?.optionalMemoryEnabled || !memorySessionId || !newMemory.trim()} onClick={() => {
          if (!current || !memorySessionId || !newMemory.trim()) return;
          mutate.mutate({ action: 'remember', commandId: commandId(), expectedMemoryRevision: current.memoryRevision, recordId: commandId(), category: 'episodic', sessionId: memorySessionId, content: newMemory.trim(), supportingEvidenceIds: [], confidence: null }, { onSuccess: () => setNewMemory('') });
        }}>Remember this</button>
        {journeyOptions.error && <p className="text-sm" role="status">Saved sessions are unavailable, so new memory cannot be linked right now.</p>}
      </div>
      <ul className="mt-4 grid gap-3">{visibleRecords.map((record) => <li key={record.id} className="rounded-lg bg-[var(--s-surface2)] p-3">
        <p className="text-xs uppercase tracking-wide">{record.category.replaceAll('_', ' ')} · revision {record.revision}{record.corrected ? ' · corrected' : ''}</p>
        <p className="mt-1">{record.content}</p><p className="mt-1 break-all text-xs">Session {record.scope.sessionId ?? 'not session-scoped'} · source {record.scope.sourceVersion ?? 'not pinned'} · event {record.sourceEventId}{record.confidence !== null ? ` · confidence ${Math.round(record.confidence * 100)}%` : ''}{record.expiresAt ? ` · expires ${new Date(record.expiresAt).toLocaleDateString()}` : ''}</p>
        {(record.category === 'episodic' || record.category === 'hypothesis') && <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
          <label className="sr-only" htmlFor={`memory-correction-${record.id}`}>Correct memory</label><input id={`memory-correction-${record.id}`} className="min-h-10 rounded border p-2" value={corrections[record.id] ?? record.content} onChange={(event) => setCorrections((value) => ({ ...value, [record.id]: event.target.value }))} />
          <button className="min-h-10 rounded border px-3" disabled={mutate.isPending || corrections[record.id] === undefined || !corrections[record.id]!.trim()} onClick={() => mutate.mutate({ action: 'correct', commandId: commandId(), expectedMemoryRevision: current.memoryRevision, recordId: record.id, expectedRevision: record.revision, content: corrections[record.id] })}>Correct</button>
          <button className="min-h-10 rounded border px-3" disabled={mutate.isPending} onClick={() => mutate.mutate({ action: 'forget', commandId: commandId(), expectedMemoryRevision: current.memoryRevision, recordId: record.id, expectedRevision: record.revision })}>Forget</button>
        </div>}
      </li>)}</ul>
      {[...new Set(visibleRecords.map((record) => record.scope.sessionId).filter((sessionId): sessionId is string => !!sessionId))].map((sessionId) => <button key={sessionId} className="mt-3 mr-2 min-h-10 rounded border px-3" disabled={mutate.isPending} onClick={() => mutate.mutate({ action: 'reset_topic', commandId: commandId(), expectedMemoryRevision: current.memoryRevision, sessionId })}>Reset memory for session {sessionId.slice(0, 8)}</button>)}
      {current.retainedEvidenceNotice && <p className="mt-3 text-sm" role="note">{current.retainedEvidenceNotice}</p>}
      {mutate.error && <p className="mt-2 text-sm" role="alert">{formatApiError(mutate.error)}</p>}
    </> : null}
  </section>;
}

export function LowBandwidthControl() {
  const { mode } = usePetrosConnectivityMode();
  const [storageError, setStorageError] = useState(false);
  const change = (next: 'online' | 'low_bandwidth') => {
    try { localStorage.setItem('petros:connectivity-mode', next); setStorageError(false); }
    catch { setStorageError(true); }
    window.dispatchEvent(new CustomEvent('petros:connectivity-mode', { detail: { mode: next } }));
  };
  return <section className="mt-5 rounded-xl border border-[var(--s-bd1)] bg-[var(--s-card)] p-4" aria-label="Connectivity preference">
    <h2 className="font-semibold">Connectivity</h2><p className="mt-1 text-sm">Text-first mode shows prepared lesson text, pauses automatic speech and loads optional visual controls only when requested. Connection conditions are recorded with your next saved workspace return point.</p>
    <label className="mt-3 flex min-h-11 items-center gap-2"><input type="checkbox" checked={mode === 'low_bandwidth'} onChange={(event) => change(event.target.checked ? 'low_bandwidth' : 'online')} />Mark this as a low-bandwidth connection</label>
    <p className="text-xs text-[var(--s-faint)]">It does not provide offline lesson materials. Browser storage can be blocked or cleared by the device.</p>
    {storageError && <p role="alert" className="text-sm">This tab will use the preference, but the browser could not save it for your next visit.</p>}
  </section>;
}
