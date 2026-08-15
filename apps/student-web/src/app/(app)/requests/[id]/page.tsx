'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { QueryPage } from '@/components/query-page';
import { Button } from '@/components/ui/button';
import { PageHeader, SurfaceCard } from '@/components/ui/states';
import { formatApiError, useStudentApi } from '@/lib/api-client';

type Event = {
  id: string;
  type: string;
  createdAt: string;
  actorName?: string | null;
  note?: string | null;
};

type Detail = {
  id: string;
  typeLabel?: string | null;
  displayStatus?: string | null;
  summary?: string | null;
  humanCode?: string | null;
  status?: string | null;
  canCancel?: boolean | null;
  version?: number | null;
  decisionNote?: string | null;
  submittedAt?: string | null;
  resolvedAt?: string | null;
  events?: Event[];
};

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useStudentApi();
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['student', 'requests', id],
    queryFn: () => api.get<Detail>(`/student/requests/${id}`),
    enabled: Boolean(id),
  });

  const cancel = useMutation({
    mutationFn: () =>
      api.post<Detail>(`/student/requests/${id}/cancel`, {
        version: query.data?.version ?? 0,
      }),
    onSuccess: async () => {
      setError(null);
      await qc.invalidateQueries({ queryKey: ['student', 'requests'] });
      await query.refetch();
    },
    onError: (err) => setError(formatApiError(err)),
  });

  return (
    <QueryPage query={query} loadingLabel="Loading request…">
      {(raw) => {
        const data = raw as Detail;
        return (
          <div>
            <PageHeader
              title={data.typeLabel ?? 'Request'}
              description={[data.humanCode, data.displayStatus ?? data.status]
                .filter(Boolean)
                .join(' · ')}
              actions={
                <Link href="/requests" className="text-sm font-medium text-[var(--s-accentDeep)]">
                  All requests
                </Link>
              }
            />

            <div className="space-y-4">
              <SurfaceCard>
                <p className="text-sm text-[var(--s-inkSoft)]">{data.summary || 'No summary.'}</p>
                <dl className="mt-4 grid gap-3 sm:grid-cols-2">
                  <Meta label="Submitted" value={fmt(data.submittedAt)} />
                  <Meta label="Resolved" value={fmt(data.resolvedAt)} />
                </dl>
                {data.decisionNote ? (
                  <p className="mt-3 rounded-xl bg-[var(--s-surface2)] px-3 py-2 text-sm">
                    Decision note: {data.decisionNote}
                  </p>
                ) : null}
              </SurfaceCard>

              {(data.events?.length ?? 0) > 0 ? (
                <SurfaceCard>
                  <h2 className="text-sm font-semibold text-[var(--s-ink)]">Timeline</h2>
                  <ul className="mt-3 space-y-2">
                    {data.events!.map((event) => (
                      <li key={event.id} className="text-sm text-[var(--s-inkSoft)]">
                        <span className="font-medium text-[var(--s-ink)]">{event.type}</span>
                        {' · '}
                        {new Date(event.createdAt).toLocaleString()}
                        {event.actorName ? ` · ${event.actorName}` : ''}
                        {event.note ? ` — ${event.note}` : ''}
                      </li>
                    ))}
                  </ul>
                </SurfaceCard>
              ) : null}

              {error ? <p className="text-sm text-[var(--s-danger)]">{error}</p> : null}

              {data.canCancel ? (
                <Button
                  variant="danger"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (confirm('Cancel this request?')) cancel.mutate();
                  }}
                >
                  {cancel.isPending ? 'Cancelling…' : 'Cancel request'}
                </Button>
              ) : null}
            </div>
          </div>
        );
      }}
    </QueryPage>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-[var(--s-faint)]">{label}</dt>
      <dd className="mt-1 text-sm text-[var(--s-ink)]">{value}</dd>
    </div>
  );
}

function fmt(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}
