'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EngineSnapshot, PetrosJourneyCommand, PetrosQueuedNote } from '@edrion/schemas';
import { formatApiError, useStudentApi } from '@/lib/api-client';
import { useStudentMe } from '@/lib/hooks';
import { cacheJourneyForOwner, listQueuedNotes, readCachedJourney, removeQueuedNotes, saveQueuedNote } from '@/lib/petros-offline-notes';

type JourneyDetails = {
  id: string; version: number; returnPoint: PetrosJourneyCommand['returnPoint'];
  source: { sourceVersion: string; [key: string]: unknown };
  policyVersion: string;
  workspace?: { checkpointId?: string; programRevision?: number; experimentVersion?: number; draftVersion?: number; branchId?: string } | null;
};
type ReconcileResult = { commandId: string; status: 'applied' | 'duplicate' | 'needs_review' | 'denied' | 'retained_private_draft'; reason?: string; journey?: unknown; current?: unknown };

export function PetrosWorkspaceNoteSave({ sessionId, blockId, snapshot, text, setText, disabled, onSave, onReconciled }: {
  sessionId: string; blockId: string; snapshot: EngineSnapshot; text: string; setText: (value: string) => void;
  disabled: boolean; onSave: () => void; onReconciled: () => void;
}) {
  const api = useStudentApi();
  const me = useStudentMe();
  const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [pendingCount, setPendingCount] = useState(0);
  const [queuedNotes, setQueuedNotes] = useState<PetrosQueuedNote[]>([]);
  const [queueOwnerKey, setQueueOwnerKey] = useState('');
  const [connectivityRevision, setConnectivityRevision] = useState(0);
  const [recovery, setRecovery] = useState<Record<string, string>>({});
  const working = useRef(false);
  const owner = useMemo(() => me.data?.kind === 'institutional' && me.data.institutionId && me.data.studentId
    ? { institutionId: me.data.institutionId, studentId: me.data.studentId } : null,
  [me.data?.institutionId, me.data?.kind, me.data?.studentId]);
const ownerKey = owner ? `${owner.institutionId}:${owner.studentId}` : '';
  const continuityPath = `/student/petros/continuity/sessions/${encodeURIComponent(sessionId)}/journey`;

  const reconcile = useCallback(async () => {
    if (!owner || !navigator.onLine || working.current) return;
    working.current = true;
    try {
      const queued = await listQueuedNotes(owner);
      setQueuedNotes(queued);
      setQueueOwnerKey(ownerKey);
      setPendingCount(queued.length);
      if (!queued.length) return;
      const response = await api.post<{ results: ReconcileResult[] }>('/student/petros/continuity/reconcile', { items: queued });
      const settled = response.results.filter((item) => item.status === 'applied' || item.status === 'duplicate');
      await removeQueuedNotes(settled.map((item) => item.commandId));
      const remaining = queued.filter((item) => !settled.some((result) => result.commandId === item.commandId));
      setQueuedNotes(remaining);
      setQueueOwnerKey(ownerKey);
      setPendingCount(remaining.length);
      setRecovery(Object.fromEntries(response.results.filter((item) => item.status !== 'applied' && item.status !== 'duplicate')
        .map((item) => [item.commandId, `${item.status.replaceAll('_', ' ')}${item.reason ? `: ${item.reason}` : ''}`])));
      if (settled.length) {
        setStatus(`${settled.length} saved note${settled.length === 1 ? '' : 's'} reconciled.`);
        onReconciled();
      }
    } catch (caught) {
      setError(`Queued notes could not be reconciled. Check device storage and reconnect before leaving. ${formatApiError(caught)}`);
    } finally {
      working.current = false;
    }
  }, [api, onReconciled, owner, ownerKey]);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    const modeChanged = () => setConnectivityRevision((value) => value + 1);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.addEventListener('petros:connectivity-mode', modeChanged);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); window.removeEventListener('petros:connectivity-mode', modeChanged); };
  }, []);

  useEffect(() => {
    if (!owner) { setQueuedNotes([]); setPendingCount(0); setQueueOwnerKey(''); return; }
    let cancelled = false;
    void listQueuedNotes(owner).then((rows) => {
      if (!cancelled) { setQueuedNotes(rows); setPendingCount(rows.length); setQueueOwnerKey(ownerKey); }
    }).catch((caught) => {
      if (!cancelled) setError(`Private notes could not be read from this device. ${formatApiError(caught)}`);
    });
    return () => { cancelled = true; };
  }, [owner, ownerKey]);

  useEffect(() => {
    if (!owner || !online) return;
    let cancelled = false;
    void api.get<JourneyDetails>(continuityPath).then(async (journey) => {
      if (cancelled) return;
      let current = journey;
      try {
        const connectivity = localStorage.getItem('petros:connectivity-mode') === 'low_bandwidth' ? 'low_bandwidth' : 'online';
        const checkpointId = journey.workspace?.checkpointId ?? journey.returnPoint.workspace?.checkpointId;
        if (connectivity !== journey.returnPoint.connectivity && checkpointId) {
          const returnPoint: PetrosJourneyCommand['returnPoint'] = {
            ...journey.returnPoint,
            sessionId,
            blockId,
            connectivity,
            acknowledgedEventCursor: Math.max(journey.returnPoint.acknowledgedEventCursor, snapshot.execution.version),
            workspace: {
              blockId,
              checkpointId,
              programRevision: journey.workspace?.programRevision ?? snapshot.program.revision,
              experimentVersion: journey.workspace?.experimentVersion ?? snapshot.execution.version,
              draftVersion: journey.workspace?.draftVersion ?? snapshot.draft.version,
              branchId: journey.workspace?.branchId ?? snapshot.execution.branchId,
            },
          };
          current = await api.post<JourneyDetails>('/student/petros/continuity/journeys', {
            commandId: crypto.randomUUID(), journeyId: journey.id, expectedVersion: journey.version, returnPoint,
          });
        }
      } catch {
        // The workspace remains usable; the server retains its last acknowledged return point.
      }
      if (!cancelled) await cacheJourneyForOwner(owner, current);
    }).catch(() => undefined).finally(() => { if (!cancelled) void reconcile(); });
    return () => { cancelled = true; };
  }, [api, blockId, connectivityRevision, continuityPath, online, owner, ownerKey, reconcile, sessionId, snapshot.draft.version, snapshot.execution.branchId, snapshot.execution.version, snapshot.program.revision]);

  const queueOffline = async () => {
    if (!owner) { setError('Offline note saving is available only for signed-in institutional student accounts.'); return; }
    setError('');
    try {
      const journey = (online ? await api.get<JourneyDetails>(continuityPath) : await readCachedJourney(owner)) as JourneyDetails | null;
      const currentWorkspace = journey?.workspace;
      const checkpointId = currentWorkspace?.checkpointId ?? journey?.returnPoint.workspace?.checkpointId;
      if (!journey?.id || !journey.source?.sourceVersion || !journey.policyVersion || !checkpointId
        || journey.returnPoint.sessionId !== sessionId || (currentWorkspace && 'blockId' in currentWorkspace && currentWorkspace.blockId !== blockId)) {
        setError('A current saved return point is unavailable. Keep this note open and reconnect before saving.');
        return;
      }
      const queuedBefore = await listQueuedNotes(owner);
      const previous = [...queuedBefore].reverse().find((item) => item.payload.sessionId === sessionId && item.payload.blockId === blockId);
      await cacheJourneyForOwner(owner, journey);
      await saveQueuedNote(owner, {
        schemaVersion: 'petros.queued-note.v1', commandId: crypto.randomUUID(), journeyId: journey.id,
        baseVersion: journey.version, sourceVersion: journey.source.sourceVersion, policyVersion: journey.policyVersion,
        programRevision: currentWorkspace?.programRevision ?? snapshot.program.revision,
        expectedExperimentVersion: currentWorkspace?.experimentVersion ?? snapshot.execution.version,
        expectedDraftVersion: currentWorkspace?.draftVersion ?? snapshot.draft.version,
        rubricVersion: null,
        payload: { sessionId, blockId, text }, dependencies: previous ? [previous.commandId] : [],
        localOccurredAt: new Date().toISOString(),
      });
      const refreshed = await listQueuedNotes(owner);
      setQueuedNotes(refreshed);
      setPendingCount(refreshed.length);
      setQueueOwnerKey(ownerKey);
      setStatus('Saved privately on this device. It is not yet saved to your account or accepted as learning evidence.');
      setError('');
    } catch (caught) {
      setError(`This device could not preserve the note. Keep the text open and reconnect before leaving. ${formatApiError(caught)}`);
    }
  };

  const save = () => {
    if (online) { onSave(); setStatus('Saving to the learning workspace…'); return; }
    void queueOffline();
  };
  const retryReconcile = () => void reconcile();
  const discardPrivateDraft = async (commandId: string) => {
    try {
      await removeQueuedNotes([commandId]);
      const remaining = queuedNotes.filter((item) => item.commandId !== commandId);
      setQueuedNotes(remaining);
      setPendingCount(remaining.length);
    } catch (caught) {
      setError(`This device could not discard the private draft. ${formatApiError(caught)}`);
    }
  };
  const blocked = disabled || !text.trim();
  const visibleQueuedNotes = queueOwnerKey === ownerKey ? queuedNotes : [];
  const visiblePendingCount = queueOwnerKey === ownerKey ? pendingCount : 0;
  return <div className="grid gap-2">
    <label>My notes <textarea value={text} onChange={(event) => setText(event.currentTarget.value)} maxLength={4000} /></label>
    <button type="button" onClick={save} disabled={blocked}>{online ? 'Save notes' : 'Keep note on this device'}</button>
    {!online && <p role="status">Offline mode preserves only this note when browser storage is available. Answers and evaluations are not queued.</p>}
    {status && <p role="status">{status}</p>}
    {error && <p role="alert">{error}</p>}
    {visiblePendingCount > 0 && <div role="status"><p>{visiblePendingCount} queued note{visiblePendingCount === 1 ? '' : 's'} await account and version checks.</p>{online && <button type="button" onClick={retryReconcile}>Retry reconciliation</button>}</div>}
    {visibleQueuedNotes.map((note) => <details key={note.commandId} className="rounded border p-2">
      <summary>Private draft · {recovery[note.commandId] ?? 'awaiting sync'}</summary>
      <p className="mt-2 text-xs">This note is stored on this device and is not yet saved to your account or accepted as learning evidence.</p>
      <p className="mt-2 whitespace-pre-wrap text-sm">{note.payload.text}</p>
      {recovery[note.commandId] && <p className="mt-2 text-sm" role="alert">{recovery[note.commandId]}. This note remains private on this device for review.</p>}
      <button type="button" className="mt-2 min-h-10 underline" onClick={() => void discardPrivateDraft(note.commandId)}>Discard this private draft</button>
    </details>)}
  </div>;
}
