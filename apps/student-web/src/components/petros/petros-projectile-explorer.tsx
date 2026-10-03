'use client';

import React, { useEffect, useRef, useState } from 'react';
import {
  petrosProjectileResponseSchema,
  renderPetrosProjectileCheckpoint,
  type PetrosProjectileBinding,
  type PetrosProjectileCommand,
  type PetrosProjectileInput,
  type PetrosProjectileSnapshot,
} from '@edrion/schemas';
import { newIdempotencyKey, StudentApiError, useStudentApi } from '@/lib/api-client';
import { PetrosVisualPrimitiveViews } from './petros-visual-explorer';
import styles from './petros-visual-explorer.module.css';

type Recovery = 'none' | 'original_source' | 'access_lost';
type ProjectileParameter =
  | 'launch_velocity_x'
  | 'launch_velocity_y'
  | 'gravity'
  | 'elapsed_time';
type ReadySimulation = { binding: PetrosProjectileBinding; defaultInput: PetrosProjectileInput };

const labels: Record<ProjectileParameter, string> = {
  launch_velocity_x: 'Horizontal launch velocity',
  launch_velocity_y: 'Vertical launch velocity',
  gravity: 'Gravity',
  elapsed_time: 'Elapsed time',
};

/**
 * An optional, server-authorized analytic view. It has no client-side bootstrap: a learner
 * can manipulate only an already-approved snapshot bound to the original diagram.
 */
export function PetrosProjectileExplorer({
  sessionId,
  blockId,
}: {
  sessionId: string;
  blockId: string;
}) {
  const api = useStudentApi();
  const url = `/student/petros/sessions/${sessionId}/blocks/${blockId}/projectile`;
  const identity = useRef(url);
  identity.current = url;
  const pending = useRef<PetrosProjectileCommand | null>(null);
  const [snapshot, setSnapshot] = useState<PetrosProjectileSnapshot | null>(null);
  const [ready, setReady] = useState<ReadySimulation | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<Recovery>('none');
  const [message, setMessage] = useState('');

  function decode(raw: unknown) {
    const response = petrosProjectileResponseSchema.parse(raw);
    if (response.status === 'ready' && response.binding.originalDiagramBlockId !== blockId)
      throw new Error('Projectile identity mismatch');
    if (response.status === 'available') {
      if (response.snapshot.binding.originalDiagramBlockId !== blockId)
        throw new Error('Projectile identity mismatch');
      // Validate the bounded presentation before it reaches React. This does not grant
      // authority; it only derives primitives from the server-authorized checkpoint.
      renderPetrosProjectileCheckpoint(response.snapshot.binding, response.snapshot.state);
    }
    return response;
  }

  function accept(raw: unknown) {
    const response = decode(raw);
    if (response.status === 'available') {
      setSnapshot(response.snapshot);
      setReady(null);
      setEnabled(true);
      setRecovery('none');
      setMessage('');
    } else if (response.status === 'ready') {
      setSnapshot(null);
      setReady({ binding: response.binding, defaultInput: response.defaultInput });
      setEnabled(true);
      setRecovery('none');
      setMessage('');
      pending.current = null;
    } else if (response.status === 'disabled') {
      setSnapshot(null);
      setReady(null);
      setEnabled(false);
      setRecovery('none');
      setMessage('');
      pending.current = null;
    } else if (response.status === 'unavailable') {
      setSnapshot(null);
      setReady(null);
      setEnabled(false);
      setRecovery('original_source');
      setMessage(response.reason);
      pending.current = null;
    } else {
      setSnapshot(null);
      setReady(null);
      setEnabled(false);
      setRecovery('original_source');
      setMessage('The requested simulation change was cancelled. The original diagram remains available.');
      pending.current = null;
    }
    return response;
  }

  useEffect(() => {
    const abort = new AbortController();
    setSnapshot(null);
    setReady(null);
    setEnabled(false);
    setBusy(false);
    setRecovery('none');
    setMessage('');
    pending.current = null;
    api
      .get<unknown>(url, abort.signal)
      .then((raw) => {
        if (!abort.signal.aborted && identity.current === url) accept(raw);
      })
      .catch(() => {
        if (!abort.signal.aborted && identity.current === url) {
          setRecovery('original_source');
          setMessage('The simulation could not be checked. The original diagram remains available.');
        }
      });
    return () => abort.abort();
    // The URL names the canonical diagram; do not reset for a derived presentation change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, url]);

  async function refresh() {
    if (busy) return;
    setBusy(true);
    try {
      const raw = await api.get<unknown>(url);
      if (identity.current !== url) return;
      const response = accept(raw);
      if (response.status !== 'available') pending.current = null;
    } catch (failure) {
      if (identity.current !== url) return;
      if (failure instanceof StudentApiError && [401, 403, 404].includes(failure.status)) {
        setSnapshot(null);
        setReady(null);
        setEnabled(false);
        pending.current = null;
        setRecovery('access_lost');
        setMessage('This simulation is no longer available. Continue with the original diagram.');
      } else {
        // A failed read cannot establish that an older snapshot remains current. Drop it
        // before showing recovery so no stale UI can produce another write.
        setSnapshot(null);
        setReady(null);
        setEnabled(false);
        pending.current = null;
        setRecovery('original_source');
        setMessage('Could not refresh the simulation. The original diagram remains available.');
      }
    } finally {
      if (identity.current === url) setBusy(false);
    }
  }

  async function send(command: PetrosProjectileCommand) {
    if (busy) return;
    pending.current = command;
    setBusy(true);
    try {
      const response = decode(await api.put<unknown>(url, command));
      if (identity.current !== url) return;
      if (response.status !== 'available') {
        accept(response);
        return;
      }
      if (
        response.snapshot.operationId !== command.operationId ||
        response.snapshot.version !== command.expectedVersion + 1
      ) {
        throw new Error('Projectile checkpoint mismatch');
      }
      setSnapshot(response.snapshot);
      setReady(null);
      setEnabled(true);
      setRecovery('none');
      setMessage('');
      pending.current = null;
    } catch (failure) {
      if (identity.current !== url) return;
      if (failure instanceof StudentApiError && [401, 403, 404].includes(failure.status)) {
        setSnapshot(null);
        setReady(null);
        setEnabled(false);
        pending.current = null;
        setRecovery('access_lost');
        setMessage('This simulation is no longer available. Continue with the original diagram.');
      } else if (failure instanceof StudentApiError && failure.status === 409) {
        setSnapshot(null);
        setReady(null);
        setEnabled(false);
        pending.current = null;
        setRecovery('original_source');
        setMessage('This simulation changed. Continue with the original diagram, then refresh it.');
      } else {
        setMessage('The change was not confirmed. Retry the same change or refresh the simulation.');
      }
    } finally {
      if (identity.current === url) setBusy(false);
    }
  }

  function parameterChange(parameter: ProjectileParameter, value: number) {
    switch (parameter) {
      case 'launch_velocity_x':
      case 'launch_velocity_y':
        return { parameter, value, unit: 'm/s' as const };
      case 'gravity':
        return { parameter, value, unit: 'm/s^2' as const };
      case 'elapsed_time':
        return { parameter, value, unit: 's' as const };
    }
  }

  function start() {
    if (!ready || !enabled || pending.current) return;
    void send({
      schemaVersion: 'petros.projectile-command.v1',
      operationId: newIdempotencyKey(),
      expectedVersion: 0,
      binding: ready.binding,
      action: { kind: 'initialise', input: ready.defaultInput },
    });
  }

  function change(parameter: ProjectileParameter, value: number) {
    if (!snapshot || !enabled || pending.current || !Number.isFinite(value)) return;
    const control = renderPetrosProjectileCheckpoint(snapshot.binding, snapshot.state).controls.find(
      (item) => item.parameter === parameter,
    );
    if (!control || value < control.min || value > control.max) return;
    void send({
      schemaVersion: 'petros.projectile-command.v1',
      operationId: newIdempotencyKey(),
      expectedVersion: snapshot.version,
      binding: snapshot.binding,
      action: {
        kind: 'parameter',
        change: parameterChange(parameter, value),
      },
    });
  }

  // Both flags default off. A disabled endpoint must create no learner-facing affordance.
  if (!enabled && !ready && recovery === 'none' && !message) return null;
  if (ready) {
    return (
      <section className={styles.explorer} aria-label="Projectile simulation">
        <p>
          A reviewed projectile model is ready for this diagram. Starting it uses the saved
          SI initial conditions supplied by the server.
        </p>
        <button type="button" disabled={busy || !!pending.current} onClick={() => start()}>
          Start simulation
        </button>
        {message && <p role="status">{message}</p>}
        {pending.current && (
          <button type="button" disabled={busy} onClick={() => void send(pending.current!)}>
            Retry start
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh simulation
        </button>
      </section>
    );
  }
  if (!snapshot) {
    return (
      <section className={styles.explorer} aria-label="Projectile simulation status">
        <p role="status">{message}</p>
        {recovery !== 'access_lost' && (
          <button type="button" disabled={busy} onClick={() => void refresh()}>
            Check simulation
          </button>
        )}
      </section>
    );
  }

  const view = renderPetrosProjectileCheckpoint(snapshot.binding, snapshot.state);
  return (
    <section className={styles.explorer} aria-label="Projectile simulation">
      <details>
        <summary>Explore the reviewed projectile model</summary>
        <p>
          This view uses a fixed no-drag, uniform-gravity model. It remains separate from the
          original diagram and creates no learning evidence.
        </p>
        {view.controls.map((control) => (
          <label className={styles.control} key={control.parameter}>
            <span>{labels[control.parameter]} ({control.unit})</span>
            <input
              type="number"
              aria-label={`${labels[control.parameter]} (${control.unit})`}
              value={control.value}
              min={control.min}
              max={control.max}
              step="any"
              disabled={!enabled || busy || !!pending.current}
              onChange={(event) => {
                if (event.target.value !== '' && Number.isFinite(event.target.valueAsNumber))
                  change(control.parameter, event.target.valueAsNumber);
              }}
            />
          </label>
        ))}
        <PetrosVisualPrimitiveViews views={view.views} analytic />
        <ul>
          <li>Point mass on level ground; launch and landing are at y = 0 m.</li>
          <li>Gravity is constant and downward; air resistance and wind are absent.</li>
          <li>Values use SI units. The display scale is explanatory, not a measurement.</li>
        </ul>
        {message && <p role="status">{message}</p>}
        {pending.current && (
          <button type="button" disabled={busy} onClick={() => void send(pending.current!)}>
            Retry change
          </button>
        )}
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh simulation
        </button>
        <p role="status" aria-live="polite">
          {busy ? 'Saving simulation…' : `Saved simulation version ${snapshot.version}`}
        </p>
      </details>
    </section>
  );
}
