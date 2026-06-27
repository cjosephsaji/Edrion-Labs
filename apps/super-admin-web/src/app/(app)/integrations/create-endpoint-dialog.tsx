'use client';
import { useState } from 'react';
import { Label } from '@edrion/ui';
import { SUBSCRIBABLE_WEBHOOK_EVENTS } from '@edrion/schemas';
import { ApiClientError, useCreateEndpoint } from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';

const fieldClass =
  'w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary ' +
  'placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

/** Create a webhook endpoint. The signing secret is shown exactly once, after creation. */
export function CreateEndpointDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (secret: string | undefined) => void;
}) {
  const create = useCreateEndpoint();
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggle = (e: string) =>
    setEvents((prev) => (prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e]));

  const onConfirm = () => {
    setError(null);
    if (!url.trim()) return setError('A URL is required.');
    if (events.length === 0) return setError('Subscribe to at least one event.');
    create.mutate(
      { url: url.trim(), events, description: description.trim() || undefined },
      {
        onSuccess: (ep) => onCreated(ep.secret),
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not create the endpoint.'),
      },
    );
  };

  return (
    <ConfirmDialog
      open
      title="New webhook endpoint"
      description="Edrion will POST HMAC-signed event payloads to this URL."
      requireReason={false}
      confirmLabel="Create endpoint"
      loading={create.isPending}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div>
        <Label htmlFor="wh-url">Payload URL</Label>
        <input
          id="wh-url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com/webhooks/edrion"
          className={fieldClass}
        />
      </div>
      <div>
        <Label htmlFor="wh-desc">Description (optional)</Label>
        <input id="wh-desc" value={description} onChange={(e) => setDescription(e.target.value)} className={fieldClass} />
      </div>
      <div>
        <Label>Events</Label>
        <div className="mt-1 grid grid-cols-1 gap-1.5">
          {SUBSCRIBABLE_WEBHOOK_EVENTS.map((e) => (
            <label
              key={e}
              className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm text-text-secondary hover:bg-background-secondary"
            >
              <input type="checkbox" checked={events.includes(e)} onChange={() => toggle(e)} />
              <span className="font-mono text-xs">{e}</span>
            </label>
          ))}
        </div>
      </div>
    </ConfirmDialog>
  );
}
