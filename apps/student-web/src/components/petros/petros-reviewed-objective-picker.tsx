'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { formatApiError, newIdempotencyKey, useStudentApi } from '@/lib/api-client';

type PackRef = { id: string; version: number };
type ObjectiveRef = { id: string; version: number; statement: string };

type ReviewedPack = {
  pack: PackRef;
  objective: ObjectiveRef;
  concepts: Array<{ id: string; label: string }>;
  review: { receiptId: string; version: number; reviewedAt: string };
};

type AdaptiveAvailability = {
  status: 'disabled' | 'legacy_unavailable' | 'bound' | 'available';
  pack?: PackRef;
  objective?: ObjectiveRef;
  packs?: ReviewedPack[];
};

type PendingCommand = {
  sessionId: string;
  commandId: string;
  pack: PackRef;
};

function isPackRef(value: unknown): value is PackRef {
  return !!value && typeof value === 'object'
    && typeof (value as PackRef).id === 'string'
    && Number.isInteger((value as PackRef).version)
    && (value as PackRef).version > 0;
}

function isObjectiveRef(value: unknown): value is ObjectiveRef {
  return isPackRef(value)
    && typeof (value as ObjectiveRef).statement === 'string'
    && (value as ObjectiveRef).statement.trim().length > 0;
}

function isReviewedPack(value: unknown): value is ReviewedPack {
  if (!value || typeof value !== 'object') return false;
  const pack = value as ReviewedPack;
  return isPackRef(pack.pack) && isObjectiveRef(pack.objective)
    && Array.isArray(pack.concepts)
    && pack.concepts.every((concept) => !!concept && typeof concept.id === 'string' && typeof concept.label === 'string')
    && !!pack.review && typeof pack.review.receiptId === 'string'
    && Number.isInteger(pack.review.version) && pack.review.version > 0
    && typeof pack.review.reviewedAt === 'string';
}

function parseAvailability(value: unknown): AdaptiveAvailability | null {
  if (!value || typeof value !== 'object') return null;
  const availability = value as AdaptiveAvailability;
  if (!['disabled', 'legacy_unavailable', 'bound', 'available'].includes(availability.status)) return null;
  if (availability.status === 'bound') {
    return isPackRef(availability.pack) && isObjectiveRef(availability.objective) ? availability : null;
  }
  if (availability.status === 'available') {
    return Array.isArray(availability.packs) && availability.packs.every(isReviewedPack) ? availability : null;
  }
  return availability;
}

/**
 * Lets a learner explicitly select an educator-reviewed teaching pack for this session.
 * Review approves teaching content; it does not state that the learner has demonstrated it.
 */
export function PetrosReviewedObjectivePicker({
  sessionId,
  onBound,
  beforeLesson = false,
}: {
  sessionId: string;
  onBound: () => void;
  beforeLesson?: boolean;
}) {
  const api = useStudentApi();
  const sessionIdRef = useRef(sessionId);
  const [availability, setAvailability] = useState<AdaptiveAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pending, setPending] = useState<PendingCommand | null>(null);
  const [binding, setBinding] = useState(false);
  const [bindError, setBindError] = useState('');

  useEffect(() => {
    sessionIdRef.current = sessionId;
    let active = true;
    setAvailability(null);
    setLoading(true);
    setLoadError('');
    setPending(null);
    setBinding(false);
    setBindError('');

    void api.get<unknown>(`/student/petros/sessions/${sessionId}/adaptive`)
      .then((raw) => {
        const parsed = parseAvailability(raw);
        if (!parsed) throw new Error('Reviewed teaching objectives are unavailable. Please retry.');
        if (active && sessionIdRef.current === sessionId) setAvailability(parsed);
      })
      .catch((caught) => {
        if (active && sessionIdRef.current === sessionId) setLoadError(formatApiError(caught));
      })
      .finally(() => {
        if (active && sessionIdRef.current === sessionId) setLoading(false);
      });

    return () => { active = false; };
  }, [api, sessionId]);

  const load = useCallback(async () => {
    const requestedSessionId = sessionId;
    setLoading(true);
    setLoadError('');
    try {
      const raw = await api.get<unknown>(`/student/petros/sessions/${requestedSessionId}/adaptive`);
      const parsed = parseAvailability(raw);
      if (!parsed) throw new Error('Reviewed teaching objectives are unavailable. Please retry.');
      if (sessionIdRef.current !== requestedSessionId) return;
      setAvailability(parsed);
      setPending(null);
      setBindError('');
    } catch (caught) {
      if (sessionIdRef.current === requestedSessionId) setLoadError(formatApiError(caught));
    } finally {
      if (sessionIdRef.current === requestedSessionId) setLoading(false);
    }
  }, [api, sessionId]);

  const bind = useCallback(async (command: PendingCommand) => {
    if (binding) return;
    if (command.sessionId !== sessionIdRef.current) {
      setPending(null);
      setBindError('This session changed before the reviewed objective could be chosen. Refresh the current session.');
      return;
    }
    setBinding(true);
    setBindError('');
    try {
      const result = await api.post<{ status?: string }>(`/student/petros/sessions/${command.sessionId}/adaptive`, {
        commandId: command.commandId,
        pack: command.pack,
      });
      if (command.sessionId !== sessionIdRef.current) return;
      if (result?.status !== 'bound') throw new Error('The reviewed objective was not bound to this session. Please retry.');
      setPending(null);
      onBound();
    } catch (caught) {
      if (command.sessionId === sessionIdRef.current) setBindError(formatApiError(caught));
    } finally {
      if (command.sessionId === sessionIdRef.current) setBinding(false);
    }
  }, [api, binding, onBound]);

  if (loading) return null;
  if (availability?.status === 'disabled' || availability?.status === 'legacy_unavailable') return null;

  if (loadError || !availability) return (
    <section aria-label="Reviewed teaching objectives" role="status">
      <p>{loadError || 'Reviewed teaching objectives are unavailable.'}</p>
      <button type="button" onClick={() => void load()}>Retry</button>
    </section>
  );

  if (availability.status === 'bound') return (
    <section aria-label="Reviewed teaching objective" data-before-lesson={beforeLesson || undefined}>
      <p>This session uses a reviewed teaching objective.</p>
      <p><strong>{availability.objective!.statement}</strong></p>
      <p>Objective version {availability.objective!.version} · Teaching pack version {availability.pack!.version}</p>
      <p>Review approves the teaching content. It does not record a demonstration of your learning.</p>
    </section>
  );

  const packs = availability.packs ?? [];
  if (!packs.length) return (
    <section aria-label="Reviewed teaching objectives" data-before-lesson={beforeLesson || undefined}>
      <p>No reviewed teaching objective is available for this session.</p>
      <p>Review approval applies to teaching content and is not a record of your learning.</p>
    </section>
  );

  return (
    <section aria-label="Reviewed teaching objectives" data-before-lesson={beforeLesson || undefined}>
      <h2>Choose a reviewed objective</h2>
      <p>Choose only if you want this session to use that reviewed teaching content. This review is not evidence that you have demonstrated the objective.</p>
      <details>
        <summary>Reviewed objectives ({packs.length})</summary>
        <ul>
          {packs.map((item) => {
            const command = pending?.sessionId === sessionId && pending.pack.id === item.pack.id
              && pending.pack.version === item.pack.version ? pending : null;
            return (
              <li key={`${item.pack.id}:${item.pack.version}`}>
                <p><strong>{item.objective.statement}</strong></p>
                <p>Objective version {item.objective.version} · Teaching pack version {item.pack.version}</p>
                {item.concepts.length ? <p>Reviewed concepts: {item.concepts.map((concept) => concept.label).join(', ')}</p> : null}
                <p>Educator review version {item.review.version} recorded {formatReviewDate(item.review.reviewedAt)}.</p>
                {command ? (
                  <button type="button" onClick={() => void bind(command)} disabled={binding} aria-busy={binding}>
                    {binding ? 'Choosing reviewed objective…' : 'Retry choosing reviewed objective'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      const next = { sessionId, commandId: newIdempotencyKey(), pack: item.pack };
                      setPending(next);
                      void bind(next);
                    }}
                    disabled={binding || !!pending}
                  >
                    Choose reviewed objective
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </details>
      {bindError ? <p role="alert">{bindError}</p> : null}
    </section>
  );
}

function formatReviewDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'on a recorded date' : date.toLocaleDateString();
}
