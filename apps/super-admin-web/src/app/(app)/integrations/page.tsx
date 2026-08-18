'use client';
import { useState } from 'react';
import { Card, StatusBadge, Badge, TableSkeleton, EmptyState, ErrorState, Button } from '@edrion/ui';
import {
  useWebhookEndpoints,
  useWebhookEndpoint,
  useTestDelivery,
  useRotateSecret,
  type WebhookEndpointDto,
} from '@edrion/api-client';
import { errorMessage } from '@/lib/errors';
import { Topbar } from '@/components/app-shell/topbar';
import { CreateEndpointDialog } from './create-endpoint-dialog';

const PAGE_SIZE = 25;

export default function IntegrationsPage() {
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const { data, isLoading, isError } = useWebhookEndpoints({ page, pageSize: PAGE_SIZE });

  return (
    <>
      <Topbar title="Integrations" />
      <div className="page-enter space-y-5 p-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text-muted">
            Outbound webhooks. Edrion POSTs HMAC-signed payloads; the{' '}
            <code className="font-mono text-xs">X-Edrion-Signature</code> header is{' '}
            <code className="font-mono text-xs">sha256=HMAC(secret, body)</code>.
          </p>
          <Button size="sm" onClick={() => setCreating(true)}>
            New endpoint
          </Button>
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : isError || !data ? (
          <ErrorState description="Could not load webhook endpoints. Confirm the API is running on :3007." />
        ) : data.items.length === 0 ? (
          <EmptyState title="No endpoints" description="Create one with “New endpoint”." />
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="p-3 font-medium">URL</th>
                  <th className="p-3 font-medium">Events</th>
                  <th className="p-3 font-medium">Deliveries</th>
                  <th className="p-3 font-medium">State</th>
                  <th className="p-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((ep) => (
                  <Row key={ep.id} ep={ep} />
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-text-muted">
            <span>
              Page {page} · {data.total} endpoints
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={!data.hasMore} onClick={() => setPage((p) => p + 1)}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {creating && (
        <CreateEndpointDialog
          onClose={() => setCreating(false)}
          onCreated={(secret) => {
            setCreating(false);
            if (secret) window.alert(`Endpoint created. Save this signing secret now — it is shown only once:\n\n${secret}`);
          }}
        />
      )}
    </>
  );
}

function Row({ ep }: { ep: WebhookEndpointDto }) {
  const [open, setOpen] = useState(false);
  const test = useTestDelivery(ep.id);
  const rotate = useRotateSecret(ep.id);
  const detail = useWebhookEndpoint(open ? ep.id : '');

  const onTest = () =>
    test.mutate(
      {},
      {
        onSuccess: () => {
          setOpen(true);
          window.setTimeout(() => detail.refetch(), 800);
        },
        onError: (e) => window.alert(errorMessage(e)),
      },
    );

  const onRotate = () => {
    const reason = window.prompt('Reason to rotate the signing secret?');
    if (!reason || reason.trim().length < 5) return;
    rotate.mutate(
      { reason: reason.trim(), version: ep.version },
      {
        onSuccess: (r) =>
          r.secret && window.alert(`New signing secret (shown once):\n\n${r.secret}`),
        onError: (e) => window.alert(errorMessage(e)),
      },
    );
  };

  return (
    <>
      <tr className="border-b border-border last:border-0">
        <td className="p-3 text-text-primary">
          <div className="max-w-md truncate font-mono text-xs">{ep.url}</div>
          <div className="text-xs text-text-muted">{ep.secretHint}</div>
        </td>
        <td className="p-3 text-text-muted">{ep.events.length}</td>
        <td className="p-3 text-text-muted">{ep.deliveryCount ?? 0}</td>
        <td className="p-3">
          <Badge tone={ep.active ? 'success' : 'neutral'}>{ep.active ? 'active' : 'inactive'}</Badge>
        </td>
        <td className="p-3 text-right">
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" disabled={test.isPending} onClick={onTest}>
              Send test
            </Button>
            <Button size="sm" variant="secondary" disabled={rotate.isPending} onClick={onRotate}>
              Rotate
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)}>
              {open ? 'Hide' : 'Deliveries'}
            </Button>
          </div>
        </td>
      </tr>
      {open && (
        <tr className="border-b border-border bg-background-secondary/40">
          <td colSpan={5} className="p-3">
            <DeliveriesPanel endpointId={ep.id} detail={detail} />
          </td>
        </tr>
      )}
    </>
  );
}

function DeliveriesPanel({
  endpointId,
  detail,
}: {
  endpointId: string;
  detail: ReturnType<typeof useWebhookEndpoint>;
}) {
  void endpointId;
  if (detail.isLoading) return <p className="text-sm text-text-muted">Loading deliveries…</p>;
  const deliveries = detail.data?.deliveries ?? [];
  if (deliveries.length === 0) return <p className="text-sm text-text-muted">No deliveries yet.</p>;
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="text-left text-text-muted">
          <th className="py-1 pr-3 font-medium">Event</th>
          <th className="py-1 pr-3 font-medium">Status</th>
          <th className="py-1 pr-3 font-medium">HTTP</th>
          <th className="py-1 pr-3 font-medium">Attempt</th>
          <th className="py-1 pr-3 font-medium">When</th>
          <th className="py-1 pr-3 font-medium">Error</th>
        </tr>
      </thead>
      <tbody>
        {deliveries.map((d) => (
          <tr key={d.id} className="border-t border-border/60">
            <td className="py-1 pr-3 font-mono">{d.eventType}</td>
            <td className="py-1 pr-3">
              <StatusBadge status={d.status} />
            </td>
            <td className="py-1 pr-3 text-text-muted">{d.responseStatus ?? '—'}</td>
            <td className="py-1 pr-3 text-text-muted">{d.attempts}</td>
            <td className="py-1 pr-3 text-text-muted">{new Date(d.createdAt).toLocaleTimeString()}</td>
            <td className="py-1 pr-3 text-text-muted">{d.lastError ?? '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
