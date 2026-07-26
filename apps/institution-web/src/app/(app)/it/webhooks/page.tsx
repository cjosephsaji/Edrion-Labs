'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import { Topbar } from '@/components/app-shell/topbar';
import { ErrorState, Skeleton } from '@edrion/ui';

type Webhook = { id: string; url: string; active: boolean; events: string[] };
type Delivery = { id: string; eventType: string; status: string; attempts: number; lastError: string | null; createdAt: string };

export default function WebhooksPage() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ['portal', 'integrations', 'webhooks'],
    queryFn: () => client.get<{ items: Webhook[] }>('/portal/integrations/webhooks', scope),
  });
  const selected = list.data?.items[0];
  const deliveries = useQuery({
    queryKey: ['portal', 'integrations', 'deliveries', selected?.id],
    enabled: !!selected?.id,
    queryFn: () =>
      client.get<{ items: Delivery[] }>(`/portal/integrations/webhooks/${selected!.id}/deliveries`, scope),
  });
  const retry = useMutation({
    mutationFn: () =>
      client.post(`/portal/integrations/webhooks/${selected!.id}/retry`, scope, {
        event_type: 'webhook.test',
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'integrations', 'deliveries', selected?.id] }),
  });

  return (
    <>
      <Topbar title="Webhooks" />
      <div className="flex flex-1 flex-col gap-4 p-5 lg:p-6">
        {list.isLoading && <Skeleton className="h-40 w-full" />}
        {list.isError && <ErrorState title="Could not load webhooks" />}
        {list.data && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="text-sm font-medium text-text-primary">Endpoints</p>
            <ul className="mt-2 space-y-2 text-sm text-text-secondary">
              {list.data.items.length === 0 && <li>No webhook endpoints yet.</li>}
              {list.data.items.map((w) => (
                <li key={w.id} className="font-mono text-xs">
                  {w.url} · {w.active ? 'active' : 'paused'}
                </li>
              ))}
            </ul>
          </div>
        )}
        {selected && (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-text-primary">Recent deliveries</p>
              <button
                type="button"
                onClick={() => retry.mutate()}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
              >
                Retry test
              </button>
            </div>
            {deliveries.isLoading && <Skeleton className="mt-3 h-24 w-full" />}
            <ul className="mt-3 space-y-1 text-xs text-text-secondary">
              {(deliveries.data?.items ?? []).map((d) => (
                <li key={d.id}>
                  {d.eventType} · {d.status} · attempt {d.attempts}
                  {d.lastError ? ` — ${d.lastError}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}
