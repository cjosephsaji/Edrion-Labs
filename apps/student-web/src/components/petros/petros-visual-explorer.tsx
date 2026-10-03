'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import {
  boundPetrosVisualInput,
  petrosVisualResponseSchema,
  resolvePetrosVisualViews,
  type PetrosVisualCommand,
  type PetrosVisualPrimitive,
  type PetrosVisualSnapshot,
} from '@edrion/schemas';
import { newIdempotencyKey, StudentApiError, useStudentApi } from '@/lib/api-client';
import { PetrosProjectileExplorer } from './petros-projectile-explorer';
import styles from './petros-visual-explorer.module.css';

/** Optional composed view. The original diagram, editing and narration remain available. */
export function PetrosVisualExplorer({
  sessionId,
  blockId,
}: {
  sessionId: string;
  blockId: string;
}) {
  const api = useStudentApi();
  const [snapshot, setSnapshot] = useState<PetrosVisualSnapshot | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const pending = useRef<PetrosVisualCommand | null>(null);
  const region = useRef<HTMLElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (busy || !restoreFocus.current) return;
    const target = restoreFocus.current;
    restoreFocus.current = null;
    if (document.activeElement === document.body) {
      if (target.isConnected) target.focus();
      else region.current?.querySelector('summary')?.focus();
    }
  }, [busy]);
  const url = `/student/petros/sessions/${sessionId}/blocks/${blockId}/visual`;
  const identity = useRef(url);
  identity.current = url;
  const decode = (raw: unknown) => {
    boundPetrosVisualInput(raw);
    const response = petrosVisualResponseSchema.parse(raw);
    if (response.status === 'available' && response.snapshot.program.programId !== blockId)
      throw new Error('Visual identity mismatch');
    return response;
  };
  useEffect(() => {
    const abort = new AbortController();
    setSnapshot(null);
    setError('');
    setEnabled(false);
    setBusy(false);
    pending.current = null;
    api
      .get<unknown>(url, abort.signal)
      .then((raw) => {
        if (abort.signal.aborted) return;
        const response = decode(raw);
        if (response.status === 'available') {
          setSnapshot(response.snapshot);
          setEnabled(true);
        } else if (response.status === 'unavailable') setError(response.reason);
      })
      .catch(() => {
        if (!abort.signal.aborted)
          setError('Exploration is unavailable. The original diagram remains available.');
      });
    return () => abort.abort();
    // Identity is the canonical block, not the changing legacy draft or teaching state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, url]);

  async function refresh() {
    setBusy(true);
    try {
      const response = decode(await api.get<unknown>(url));
      if (identity.current !== url) return;
      pending.current = null;
      if (response.status === 'available') {
        setSnapshot(response.snapshot);
        setEnabled(true);
        setError('');
      } else {
        setEnabled(false);
        setError(response.reason);
      }
    } catch (failure) {
      if (identity.current !== url) return;
      if (failure instanceof StudentApiError && [401, 403, 404].includes(failure.status)) {
        setSnapshot(null);
        setEnabled(false);
        pending.current = null;
        setError('This representation is no longer available.');
      } else setError('Could not refresh exploration. Your last acknowledged view is retained.');
    } finally {
      if (identity.current === url) setBusy(false);
    }
  }
  async function send(command: PetrosVisualCommand) {
    if (busy) return;
    restoreFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pending.current = command;
    setBusy(true);
    try {
      const response = decode(await api.put<unknown>(url, command));
      if (identity.current !== url) return;
      if (response.status !== 'available') throw new Error('Unavailable');
      if (
        response.snapshot.lastOperation?.id !== command.operationId ||
        response.snapshot.checkpoint.version !== command.expectedVersion + 1
      )
        throw new Error('Unexpected checkpoint');
      setSnapshot(response.snapshot);
      pending.current = null;
      setError('');
    } catch (failure) {
      if (identity.current !== url) return;
      if (failure instanceof StudentApiError && [401, 403, 404].includes(failure.status)) {
        setSnapshot(null);
        setEnabled(false);
        pending.current = null;
        setError('This representation is no longer available.');
      } else
        setError('The change was not confirmed. Retry it or refresh to recover the saved view.');
    } finally {
      if (identity.current === url) setBusy(false);
    }
  }
  function command(action: PetrosVisualCommand['action']) {
    if (!snapshot || pending.current || !enabled) return;
    void send({
      operationId: newIdempotencyKey(),
      expectedRevision: snapshot.program.revision,
      expectedVersion: snapshot.checkpoint.version,
      action,
    });
  }
  if (!snapshot && !error) {
    // Projectile admission is independent of the legacy declarative visual snapshot.
    // Its component remains inert when the Phase 2 flag is off.
    return <PetrosProjectileExplorer sessionId={sessionId} blockId={blockId} />;
  }
  return (
    <>
      <PetrosProjectileExplorer sessionId={sessionId} blockId={blockId} />
      <section ref={region} className={styles.explorer} aria-label="Representation exploration">
      {error && (
        <div role="status">
          <p>{error}</p>
          {pending.current && (
            <button type="button" disabled={busy} onClick={() => void send(pending.current!)}>
              Retry change
            </button>
          )}
          <button type="button" disabled={busy} onClick={() => void refresh()}>
            Refresh exploration
          </button>
        </div>
      )}
      {snapshot && (
        <details>
          <summary>Explore the original representation</summary>
          <p>
            Step through the explanation and inspect its relationships. Edits in the original
            diagram below remain separate.
          </p>
          <PetrosVisualProgramView
            snapshot={snapshot}
            disabled={busy || !!pending.current || !enabled}
            onCommand={command}
          />
          <p role="status" aria-live="polite">
            {busy ? 'Saving view…' : `Saved view ${snapshot.checkpoint.version}`}
          </p>
        </details>
      )}
      </section>
    </>
  );
}

/** Primitive dispatch only: no diagram recipe, expression interpreter or generated executable. */
export function PetrosVisualProgramView({
  snapshot,
  disabled,
  onCommand,
}: {
  snapshot: PetrosVisualSnapshot;
  disabled: boolean;
  onCommand: (action: PetrosVisualCommand['action']) => void;
}) {
  const views = resolvePetrosVisualViews(snapshot.program, snapshot.checkpoint);
  const { program, checkpoint } = snapshot;
  const beat = program.teachingTrack[checkpoint.presentation.beat];
  return (
    <div>
      <p>{program.description}</p>
      {program.parameters.map((parameter) => (
        <label className={styles.control} key={parameter.id}>
          <span>
            {parameter.label}
            {parameter.quantity.type === 'number' ? ` (${parameter.quantity.unit})` : ''}
          </span>
          {parameter.quantity.type === 'boolean' ? (
            <input
              type="checkbox"
              checked={checkpoint.parameters[parameter.id] as boolean}
              disabled={disabled}
              onChange={(event) =>
                onCommand({
                  type: 'set_parameter',
                  parameterId: parameter.id,
                  value: event.target.checked,
                })
              }
            />
          ) : (
            <input
              type="number"
              value={checkpoint.parameters[parameter.id] as number}
              min={parameter.quantity.min}
              max={parameter.quantity.max}
              step="any"
              disabled={disabled}
              onChange={(event) => {
                if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber))
                  onCommand({
                    type: 'set_parameter',
                    parameterId: parameter.id,
                    value: event.target.valueAsNumber,
                  });
              }}
            />
          )}
        </label>
      ))}
      <PetrosVisualPrimitiveViews views={views} highlightedTargets={beat?.targets} />
      {beat && (
        <div>
          <p aria-live="polite">{beat.text}</p>
          <button
            type="button"
            disabled={disabled || checkpoint.presentation.beat === 0}
            onClick={() => onCommand({ type: 'set_beat', beat: checkpoint.presentation.beat - 1 })}
          >
            Previous explanation
          </button>
          <button
            type="button"
            disabled={disabled || checkpoint.presentation.beat === program.teachingTrack.length - 1}
            onClick={() => onCommand({ type: 'set_beat', beat: checkpoint.presentation.beat + 1 })}
          >
            Next explanation
          </button>
        </div>
      )}
      <ul>
        {program.assumptions.map((assumption, i) => (
          <li key={i}>{assumption}</li>
        ))}
      </ul>
    </div>
  );
}

type PrimitiveView = {
  id: string;
  title: string;
  width: number;
  height: number;
  primitives: PetrosVisualPrimitive[];
};

/** Shared declarative SVG renderer for legacy visual and Phase 2 analytic views. */
export function PetrosVisualPrimitiveViews({
  views,
  highlightedTargets = [],
  analytic = false,
}: {
  views: readonly PrimitiveView[];
  highlightedTargets?: readonly { viewId: string; primitiveId: string }[];
  analytic?: boolean;
}) {
  const marker = `visual-${useId().replace(/:/g, '')}`;
  return (
    <>
      {views.map((view) => (
        <figure key={view.id}>
          <figcaption>{view.title}</figcaption>
          <svg
            className={styles.canvas}
            viewBox={`0 0 ${view.width} ${view.height}`}
            role="img"
            aria-label={view.title}
          >
            <defs>
              <marker
                id={`${marker}-${view.id}`}
                markerWidth="9"
                markerHeight="6"
                refX="9"
                refY="3"
                orient="auto"
              >
                <path d="M0 0 L9 3 L0 6" fill="currentColor" />
              </marker>
            </defs>
            {view.primitives
              .filter((p) => p.visible)
              .map((p) => {
                const highlighted = highlightedTargets.some(
                  (t) => t.viewId === view.id && t.primitiveId === p.id,
                );
                return (
                  <g key={p.id} data-highlighted={highlighted || undefined}>
                    <title>{p.description}</title>
                    {p.kind === 'rect' ? (
                      <rect x={p.x} y={p.y} width={p.width} height={p.height} rx="8" />
                    ) : p.kind === 'line' ? (
                      <line
                        x1={p.x}
                        y1={p.y}
                        x2={p.x2}
                        y2={p.y2}
                        markerEnd={analytic ? undefined : `url(#${marker}-${view.id})`}
                      />
                    ) : (
                      <text x={p.x} y={p.y} textAnchor={analytic ? 'start' : 'middle'}>
                        {p.kind === 'text'
                          ? analytic ? p.text : p.text.slice(0, 32)
                          : `${p.label}: ${p.value} ${p.unit}`}
                      </text>
                    )}
                  </g>
                );
              })}
          </svg>
          <details>
            <summary>Full text for {view.title}</summary>
            <ul>
              {view.primitives
                .filter((p) => p.visible && p.kind !== 'rect')
                .map((p) => (
                  <li key={p.id}>
                    {p.kind === 'readout'
                      ? `${p.label}: ${p.value} ${p.unit}. ${p.description}`
                      : p.kind === 'text'
                        ? `${p.text}. ${p.description}`
                        : p.description}
                  </li>
                ))}
            </ul>
          </details>
        </figure>
      ))}
    </>
  );
}
