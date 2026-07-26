'use client';

import { useEffect, useState } from 'react';
import { Button, Label } from '@edrion/ui';
import { useSuspendUser, useUnsuspendUser } from '@/lib/users';
import type { UserRow } from '@/lib/admin-types';

/**
 * Suspend / unsuspend a portal user. Suspension always requires a written reason
 * (stored on the account and audited).
 */
export function SuspendUserPanel({
  user,
  canManage,
  onDone,
}: {
  user: UserRow;
  canManage: boolean;
  onDone?: () => void;
}) {
  const suspend = useSuspendUser();
  const unsuspend = useUnsuspendUser();
  const [current, setCurrent] = useState(user);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCurrent(user);
  }, [user]);

  const suspended = current.status === 'disabled';
  const pending = suspend.isPending || unsuspend.isPending;
  const reasonOk = reason.trim().length >= 5;

  if (!canManage) return null;

  async function onSuspend() {
    setError(null);
    setMessage(null);
    if (!reasonOk) {
      setError('Provide a reason (at least 5 characters).');
      return;
    }
    try {
      const updated = await suspend.mutateAsync({
        id: current.id,
        version: current.version,
        reason: reason.trim(),
      });
      setCurrent(updated);
      setMessage('User suspended. All sessions were revoked.');
      setReason('');
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not suspend user');
    }
  }

  async function onUnsuspend() {
    setError(null);
    setMessage(null);
    if (!reasonOk) {
      setError('Provide a reason (at least 5 characters).');
      return;
    }
    try {
      const updated = await unsuspend.mutateAsync({
        id: current.id,
        version: current.version,
        reason: reason.trim(),
      });
      setCurrent(updated);
      setMessage('User unsuspended.');
      setReason('');
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not unsuspend user');
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted/30 p-4">
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          {suspended ? 'Unsuspend account' : 'Suspend account'}
        </h3>
        <p className="mt-1 text-xs text-text-muted">
          {suspended
            ? 'Restore sign-in access. A reason is required for the audit log.'
            : 'Blocks sign-in immediately and revokes all sessions. A reason is required.'}
        </p>
        {suspended && current.disabledReason ? (
          <p className="mt-2 text-xs text-text-secondary">
            Current suspension reason: <span className="font-medium">{current.disabledReason}</span>
          </p>
        ) : null}
      </div>

      <div>
        <Label htmlFor={`suspend-reason-${current.id}`}>
          Reason <span className="text-danger">*</span>
        </Label>
        <textarea
          id={`suspend-reason-${current.id}`}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder={
            suspended
              ? 'e.g. Issue resolved after parent meeting'
              : 'e.g. Policy violation — pending investigation'
          }
          className="mt-1.5 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-focus/30"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      {message && <p className="text-sm text-text-secondary">{message}</p>}

      {suspended ? (
        <Button type="button" variant="secondary" loading={pending} disabled={!reasonOk} onClick={onUnsuspend}>
          Unsuspend user
        </Button>
      ) : (
        <Button type="button" variant="danger" loading={pending} disabled={!reasonOk} onClick={onSuspend}>
          Suspend user
        </Button>
      )}
    </div>
  );
}
