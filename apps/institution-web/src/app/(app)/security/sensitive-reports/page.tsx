'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { usePortalClient } from '@/lib/portal-client';
import { useScope } from '@/lib/scope';
import { Topbar } from '@/components/app-shell/topbar';
import { ErrorState, Skeleton } from '@edrion/ui';

type Item = { requestId: string; humanCode: string; status: string; createdAt: string };

export default function SensitiveReportsPage() {
  const client = usePortalClient();
  const { scope } = useScope();
  const [purpose, setPurpose] = useState('');
  const [firstApprovalId, setFirstApprovalId] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ['portal', 'sensitive-reports'],
    queryFn: () => client.get<{ items: Item[] }>('/portal/sensitive-reports', scope),
  });
  const unseal = useMutation({
    mutationFn: (requestId: string) =>
      client.post<{ stage?: string; approvalId?: string; identity?: Record<string, unknown> }>(
        `/portal/sensitive-reports/${requestId}/unseal`,
        scope,
        { purpose, ttl_hours: 24, ...(firstApprovalId ? { first_approval_id: firstApprovalId } : {}) },
      ),
  });

  return (
    <>
      <Topbar title="Sensitive reports" />
      <div className="flex flex-1 flex-col gap-4 p-5 lg:p-6">
        {list.isLoading && <Skeleton className="h-32 w-full" />}
        {list.isError && <ErrorState title="Could not load sealed reports" />}
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-text-secondary">Two-person unseal required. First approver receives an approval id; second approver completes reveal.</p>
          <textarea
            className="mt-3 w-full rounded-md border border-border bg-background p-2 text-sm"
            placeholder="Purpose (min 10 chars)"
            value={purpose}
            onChange={(e) => setPurpose(e.target.value)}
          />
          <input
            className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm"
            placeholder="First approval id (second approver only)"
            value={firstApprovalId}
            onChange={(e) => setFirstApprovalId(e.target.value)}
          />
        </div>
        <ul className="space-y-2">
          {(list.data?.items ?? []).map((row) => (
            <li key={row.requestId} className="flex items-center justify-between rounded-lg border border-border px-3 py-2 text-sm">
              <button type="button" onClick={() => setSelected(row.requestId)} className="text-left">
                {row.humanCode} · {row.status}
              </button>
              {selected === row.requestId && (
                <button
                  type="button"
                  className="rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground"
                  onClick={() => unseal.mutate(row.requestId)}
                >
                  Unseal step
                </button>
              )}
            </li>
          ))}
        </ul>
        {unseal.data && (
          <pre className="rounded-md bg-muted p-3 text-xs overflow-auto">{JSON.stringify(unseal.data, null, 2)}</pre>
        )}
      </div>
    </>
  );
}
