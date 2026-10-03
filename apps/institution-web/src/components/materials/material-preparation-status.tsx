'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { petrosPreparationStatusSchema } from '@edrion/schemas';
import { usePortalClient } from '../../lib/portal-client';
import { useScope } from '../../lib/scope';

/** Preparation is distinct from sharing the original and from selected-scope teachability. */
export function MaterialPreparationStatus({ materialId }: { materialId: string }) {
  const client = usePortalClient();
  const { scope } = useScope();
  const cache = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const focusNext = useRef(false);
  const actionRef = useRef<HTMLButtonElement>(null);
  const statusRef = useRef<HTMLParagraphElement>(null);
  const key = ['material-preparation', materialId, scope];
  const path = `/portal/course-content/materials/${materialId}/preparation`;
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const value = await client.get<unknown>(path, scope);
      return value === null ? null : petrosPreparationStatusSchema.parse(value);
    },
    retry: false,
    refetchInterval: (value) => {
      const row = value.state.data;
      return row && ['queued', 'running'].includes(row.state)
        ? row.workerEnabled
          ? 2000
          : 15000
        : false;
    },
  });
  const command = useMutation({
    mutationFn: async (action: 'retry' | 'cancel') => {
      const row = query.data!;
      return petrosPreparationStatusSchema.parse(
        await client.post(`${path}/${row.id}/${action}`, scope, { version: row.version }),
      );
    },
    onSuccess: (row) => {
      focusNext.current = true;
      cache.setQueryData(key, row);
      setMessage(null);
    },
    onError: () => {
      setMessage('The request was not confirmed. Refresh the status before trying again.');
      void query.refetch();
    },
  });
  const row = query.data;
  useEffect(() => {
    if (focusNext.current && !command.isPending) {
      focusNext.current = false;
      (actionRef.current ?? statusRef.current)?.focus();
    }
  }, [row?.version, command.isPending]);
  const button =
    'rounded border border-border px-2 py-1 text-xs focus-visible:outline focus-visible:outline-2';
  if (query.isError)
    return (
      <div className="mt-2 text-xs">
        <p role="alert">Preparation status is unavailable.</p>
        <button type="button" className={button} onClick={() => void query.refetch()}>
          Refresh preparation status
        </button>
      </div>
    );
  if (!row) return null;
  const active = row.state === 'queued' || row.state === 'running';
  const label =
    row.state === 'succeeded'
      ? 'PDF text prepared. Readable coverage is checked when a lesson starts.'
      : row.state === 'cancelled'
        ? 'Petros preparation cancelled. The original remains shared.'
        : row.state === 'failed'
          ? row.retryable
            ? row.workerEnabled
              ? 'Petros preparation failed. You can retry.'
              : 'Preparation failed. Retrying is paused while processing is unavailable.'
            : preparationFailure(row.errorCode)
          : !row.workerEnabled
            ? 'Petros preparation is paused while processing is unavailable.'
            : row.state === 'queued'
              ? 'Queued for Petros preparation.'
              : `Preparing PDF text · ${row.pagesDone} pages extracted.`;
  return (
    <div className="mt-2 space-y-1 text-xs text-text-muted">
      <p ref={statusRef} tabIndex={-1} role="status" aria-live="polite">
        {label}
      </p>
      {message && <p role="alert">{message}</p>}
      <div className="flex gap-2">
        {active && (
          <button
            ref={actionRef}
            type="button"
            className={button}
            disabled={command.isPending}
            onClick={() => command.mutate('cancel')}
          >
            Cancel preparation
          </button>
        )}
        {!active && row.retryable && (
          <button
            ref={actionRef}
            type="button"
            className={button}
            disabled={command.isPending || !row.workerEnabled}
            onClick={() => command.mutate('retry')}
          >
            Retry preparation
          </button>
        )}
        {row.state !== 'succeeded' && (
          <button
            type="button"
            className={button}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Refresh status
          </button>
        )}
      </div>
    </div>
  );
}

function preparationFailure(code: string | null) {
  if (code === 'PETROS_SOURCE_UNAVAILABLE' || code === 'PETROS_PREPARATION_SOURCE_CHANGED') {
    return 'The source or publication access changed. Check access and share the current PDF again.';
  }
  if (code === 'PETROS_PREPARATION_FANOUT_LIMIT') {
    return 'Preparation capacity for this audience was exceeded. Contact institution support.';
  }
  if (
    code === 'PETROS_SANDBOX_UNAVAILABLE' ||
    code === 'PETROS_PREPARATION_INFRASTRUCTURE' ||
    code === 'PETROS_PREPARATION_RETRIES_EXHAUSTED'
  ) {
    return 'Preparation could not finish within its retry limit. Contact institution support.';
  }
  return 'Petros could not prepare this PDF. Upload a corrected or smaller PDF.';
}
