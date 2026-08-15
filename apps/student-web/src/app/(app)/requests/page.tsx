'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ClipboardPlus } from 'lucide-react';
import { ActionLink, Card, PageHeader, StatusPill, type StatusTone } from '@/components/design-system';
import { QueryPage } from '@/components/query-page';
import { EmptyState } from '@/components/ui/states';
import { useStudentApi } from '@/lib/api-client';

type Row = {
  id: string;
  typeLabel?: string | null;
  displayStatus?: string | null;
  summary?: string | null;
  humanCode?: string | null;
  submittedAt?: string | null;
  createdAt?: string | null;
};

export default function Page() {
  const api = useStudentApi();
  const query = useQuery({
    queryKey: ['student', 'requests'],
    queryFn: () => api.get<{ items: Row[] }>('/student/requests'),
  });
  const toneFor = (status?: string | null): StatusTone => {
    const value = status?.toLowerCase() ?? '';
    if (value.includes('rejected') || value.includes('cancel')) return 'critical';
    if (value.includes('approved') || value.includes('complete')) return 'positive';
    if (value.includes('pending') || value.includes('review')) return 'warning';
    return 'neutral';
  };

  return (
    <QueryPage query={query}>
      {(raw) => {
        const items = (raw as { items?: Row[] })?.items ?? [];
        return (
          <div className="mx-auto w-full max-w-[1120px]">
            <PageHeader
              eyebrow="Student services"
              title="Requests"
              description="Leave, documents, and campus service requests."
              actions={<ActionLink href="/requests/new">New request</ActionLink>}
            />
            {items.length === 0 ? (
              <EmptyState
                icon={ClipboardPlus}
                title="No requests yet"
                description="Start a request when you need leave, certificates, or helpdesk support."
                actionHref="/requests/new"
                actionLabel="Start a request"
              />
            ) : (
              <ul className="grid gap-3 md:grid-cols-2">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link href={`/requests/${item.id}`} className="block">
                      <Card interactive className="min-h-[154px]">
                        <div className="flex flex-wrap items-start justify-between gap-3"><p className="text-lg font-semibold text-[var(--s-ink)]">
                          {item.typeLabel ?? 'Request'}
                          {item.humanCode ? ` · ${item.humanCode}` : ''}
                        </p><StatusPill label={item.displayStatus ?? 'Draft'} tone={toneFor(item.displayStatus)} /></div>
                        <p className="mt-4 text-sm leading-6 text-[var(--s-muted)]">
                          {[
                            item.summary,
                            item.submittedAt
                              ? new Date(item.submittedAt).toLocaleString()
                              : item.createdAt
                                ? new Date(item.createdAt).toLocaleString()
                                : '',
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                      </Card>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </QueryPage>
  );
}
