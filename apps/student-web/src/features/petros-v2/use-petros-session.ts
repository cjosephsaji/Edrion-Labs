'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  m4SnapshotSchema,
  type M4Snapshot,
  type M4Receipt,
  type M4Response,
} from '@edrion/schemas';
import { useStudentApi, StudentApiError } from '@/lib/api-client';
import { useStudentMe } from '@/lib/hooks';
import { beginPetrosTiming } from './session-performance';
export function usePetrosSession(id: string) {
  const api = useStudentApi(),
    me = useStudentMe();
  const refetchOwner = me.refetch;
  const owner = `${me.data?.institutionId}:${me.data?.studentId}`;
  const [snapshot, setSnapshot] = useState<M4Snapshot | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(''),
    [dirty, setDirty] = useState(false);
  const generation = useRef(0),
    flight = useRef(false),
    pending = useRef<{ path: string; body: unknown } | null>(null),
    abort = useRef<AbortController | null>(null);
  const draftDirty = useRef(false);
  const draftValue = useRef('');
  const draftVersion = useRef(0);
  const latest = useRef<M4Snapshot | null>(null);
  const readFlight = useRef<{
    generation: number;
    promise: Promise<M4Snapshot | undefined>;
  } | null>(null);
  const refresh = useCallback(
    (afterMutation = false): Promise<M4Snapshot | undefined> => {
      const gen = generation.current;
      if (!afterMutation && readFlight.current?.generation === gen)
        return readFlight.current.promise;
      const run = async () => {
        let value: M4Snapshot;
        const received = beginPetrosTiming('projection_request');
        try {
          const raw = await api.get(`/student/petros/v2/sessions/${id}`, abort.current?.signal);
          received();
          const validated = beginPetrosTiming('projection_validation');
          value = m4SnapshotSchema.parse(raw);
          validated();
        } catch (error) {
          if (
            gen === generation.current &&
            error instanceof StudentApiError &&
            [401, 403, 404].includes(error.status)
          ) {
            latest.current = null;
            setSnapshot(null);
            draftDirty.current = false;
            setDraft('');
            draftValue.current = '';
            draftVersion.current++;
            setDirty(false);
            pending.current = null;
          }
          throw error;
        }
        if (gen !== generation.current) return;
        if (
          latest.current &&
          latest.current.id === value.id &&
          latest.current.revision > value.revision
        )
          return latest.current;
        latest.current = value;
        if (value.submission) pending.current = null;
        setSnapshot(value);
        if (!draftDirty.current) {
          draftValue.current = value.draft;
          setDraft(value.draft);
          setDirty(false);
        }
        return value;
      };
      const promise = run().finally(() => {
        if (readFlight.current?.promise === promise) readFlight.current = null;
      });
      readFlight.current = { generation: gen, promise };
      return promise;
    },
    [api, id],
  );
  const invalidateGeneration = useCallback(() => {
    generation.current++;
    readFlight.current = null;
  }, []);
  useEffect(() => {
    invalidateGeneration();
    abort.current = new AbortController();
    draftDirty.current = false;
    draftValue.current = '';
    draftVersion.current++;
    pending.current = null;
    flight.current = false;
    latest.current = null;
    setSnapshot(null);
    setDraft('');
    setDirty(false);
    setError('');
    setBusy(false);
    const signal = abort.current.signal;
    void refresh().catch(() => {
      if (!signal.aborted)
        setError('We could not open this lesson. Check your connection and try again.');
    });
    const online = () =>
      void refresh().catch(() =>
        setError('Your connection has not recovered yet. Your local work is still here.'),
      );
    const focus = () => {
      void refetchOwner();
      void refresh().catch(() => undefined);
    };
    window.addEventListener('online', online);
    window.addEventListener('focus', focus);
    return () => {
      invalidateGeneration();
      abort.current?.abort();
      window.removeEventListener('online', online);
      window.removeEventListener('focus', focus);
    };
  }, [owner, refresh, refetchOwner, invalidateGeneration]);
  const submissionId = snapshot?.submission?.id,
    submissionStatus = snapshot?.submission?.status;
  useEffect(() => {
    if (!submissionId || submissionStatus !== 'pending') return;
    let cancelled = false,
      timer: ReturnType<typeof setTimeout>,
      attempt = 0;
    const poll = async () => {
      try {
        const value = await refresh();
        if (value?.submission?.status === 'complete') return;
      } catch {
        /* Saved commitment remains visible. */
      }
      if (!cancelled && attempt++ < 60)
        timer = setTimeout(() => void poll(), Math.min(10_000, 600 * 1.5 ** attempt));
    };
    timer = setTimeout(() => void poll(), 600);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [submissionId, submissionStatus, refresh]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (draftDirty.current || flight.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const changeDraft = (value: string) => {
    draftValue.current = value;
    draftVersion.current++;
    draftDirty.current = true;
    setDirty(true);
    setDraft(value);
  };
  const send = async (path: string, body: unknown, preserveRetry = false) => {
    if (flight.current) return null;
    flight.current = true;
    setBusy(true);
    setError('');
    const gen = generation.current;
    const request = preserveRetry && pending.current ? pending.current : { path, body };
    const applied = beginPetrosTiming('action_to_projection');
    if (preserveRetry) pending.current = request;
    try {
      const acknowledged = beginPetrosTiming('request_acknowledgment');
      const receipt = await api.post<M4Receipt>(
        request.path,
        request.body,
        undefined,
        abort.current?.signal,
      );
      acknowledged();
      if (gen !== generation.current) return null;
      if (preserveRetry) {
        pending.current = null;
        draftDirty.current = false;
        setDirty(false);
      }
      if (receipt.status === 'blocked') setError(receipt.message);
      // A pre-commit GET cannot stand in for the post-commit authority read.
      await refresh(true);
      applied();
      return receipt;
    } catch (e) {
      if (gen !== generation.current) return null;
      if (e instanceof StudentApiError && e.status === 409) {
        pending.current = null;
        setError(
          e.code === 'M5_FRESH_QUALIFIED_TASK_UNAVAILABLE'
            ? 'A fresh reviewed task is not available. Your saved correction is assisted practice; independent verification remains unavailable.'
            : e.code === 'M5_EXPLANATION_REQUIRED'
              ? 'Save your explanation of the experiment before opening the reviewed practice task.'
              : 'Your lesson changed. Your local work is preserved. Review the latest saved version before retrying.',
        );
      } else
        setError(
          preserveRetry
            ? 'We could not confirm the save. Your answer may already be submitted. Check the saved lesson or retry the same answer.'
            : 'Your change could not be saved. Your local work is still here.',
        );
      await refresh(true).catch(() => undefined);
      return null;
    } finally {
      if (gen === generation.current) {
        flight.current = false;
        setBusy(false);
      }
    }
  };
  const command = (type: string, extra: Record<string, unknown> = {}) =>
    latest.current
      ? send(`/student/petros/v2/sessions/${id}/commands`, {
          commandId: crypto.randomUUID(),
          expectedRevision: latest.current.revision,
          epoch: latest.current.epoch,
          type,
          ...extra,
        })
      : Promise.resolve(null);
  const save = async () => {
    const savingVersion = draftVersion.current;
    const receipt = await command('canvas_checkpoint', {
      draft: draftValue.current,
      canvasRevision: latest.current?.canvas?.revision ?? 0,
    });
    if (receipt?.status === 'committed' && savingVersion === draftVersion.current) {
      draftDirty.current = false;
      setDirty(false);
    }
    return receipt;
  };
  const pause = async () => {
    if (draftDirty.current) {
      const receipt = await save();
      if (receipt?.status !== 'committed') return null;
      const fresh = latest.current;
      if (!fresh) return null;
      return send(`/student/petros/v2/sessions/${id}/commands`, {
        commandId: crypto.randomUUID(),
        expectedRevision: fresh.revision,
        epoch: fresh.epoch,
        type: 'pause',
      });
    }
    return command('pause');
  };
  const leave = async (close = false) => {
    let fresh = latest.current;
    if (draftDirty.current) {
      const receipt = await save();
      if (receipt?.status !== 'committed') return null;
      fresh = latest.current;
    }
    if (!fresh) return null;
    if (!close && fresh.status !== 'active') return { status: 'committed' };
    return send(`/student/petros/v2/sessions/${id}/commands`, {
      commandId: crypto.randomUUID(),
      expectedRevision: fresh.revision,
      epoch: fresh.epoch,
      type: close ? 'close' : 'pause',
    });
  };
  const submit = (response: M4Response) =>
    snapshot?.task
      ? send(
          `/student/petros/v2/sessions/${id}/tasks/${snapshot.task.taskId}/responses`,
          {
            commandId: crypto.randomUUID(),
            expectedRevision: snapshot.revision,
            epoch: snapshot.epoch,
            taskInstanceHash: snapshot.task.instanceHash,
            canvasRevision: snapshot.canvas?.revision ?? 0,
            response,
          },
          true,
        )
      : Promise.resolve(null);
  return {
    snapshot,
    error,
    busy,
    draft,
    dirty,
    changeDraft,
    refresh,
    command,
    save,
    pause,
    leave,
    submit,
    hasUnconfirmedSubmission: !!pending.current,
    // Current acknowledged projection for a sequential presentation-only follow-up.
    // Reuses the mandatory post-mutation read, rather than issuing a duplicate GET.
    getSnapshot: () => latest.current,
  };
}
