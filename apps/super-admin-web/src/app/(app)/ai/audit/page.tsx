'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { Card, Button, TableSkeleton, EmptyState, ErrorState, Select } from '@edrion/ui';
import { useAiRuns } from '@edrion/api-client';
import { AiActionStatus } from '@edrion/shared-types';
import { Topbar } from '@/components/app-shell/topbar';
import { rowActivation } from '@/lib/use-focus-trap';
import { AiRunDrawer } from '@/components/copilot/ai-run-drawer';

const STATUS_FILTERS = ['', ...Object.values(AiActionStatus)];

const STATUS_TONE: Record<string, string> = {
  executed: 'text-success',
  failed: 'text-danger',
  rejected: 'text-text-muted',
  expired: 'text-text-muted',
  awaiting_confirmation: 'text-warning',
  confirmed: 'text-warning',
  proposed: 'text-text-muted',
};

export default function AiAuditPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useAiRuns({
    search: search || undefined,
    status: status || undefined,
    limit: 50,
  });

  const runs = data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <>
      <Topbar title="AI Audit" actions={<span />} />
      <div className="page-enter space-y-5 p-6">
        <p className="max-w-3xl text-sm text-text-secondary">
          Every Copilot run — prompt, context sources, model, prepared vs final action, guardrail
          decision, confirmation and result. Each run links to the audit events it produced.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search prompt, summary or employee…"
              className="h-input w-80 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-input w-auto min-w-[10rem]"
            options={STATUS_FILTERS.map((s) => ({ value: s, label: s === '' ? 'All statuses' : s.replace(/_/g, ' ') }))}
          />
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={6} cols={6} />
          ) : isError ? (
            <div className="p-6">
              <ErrorState description="Could not load AI runs. Confirm the API is running on :3001." />
            </div>
          ) : runs.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No AI runs yet" description="Copilot runs will appear here once employees use it." />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="h-table-header border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="px-4">When</th>
                  <th className="px-4">Employee</th>
                  <th className="px-4">Prompt</th>
                  <th className="px-4">Status</th>
                  <th className="px-4">Risk</th>
                  <th className="px-4 text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {runs.map((r) => (
                  <tr
                    key={r.id}
                    className="h-table-row cursor-pointer transition-colors hover:bg-background-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    onClick={() => setSelected(r.id)}
                    {...rowActivation(() => setSelected(r.id), 'View AI run detail')}
                  >
                    <td className="px-4 text-text-muted">{new Date(r.startedAt).toLocaleString()}</td>
                    <td className="px-4 text-text-secondary">{r.employeeName ?? '—'}</td>
                    <td className="max-w-md truncate px-4 text-text-primary">{r.summary ?? r.prompt}</td>
                    <td className={`px-4 ${STATUS_TONE[r.status] ?? ''}`}>{r.status.replace(/_/g, ' ')}</td>
                    <td className="px-4 capitalize text-text-muted">{r.riskLevel ?? '—'}</td>
                    <td className="px-4 text-right text-text-muted">{r.durationMs != null ? `${r.durationMs} ms` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {hasNextPage && (
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => fetchNextPage()} loading={isFetchingNextPage}>
              Load more
            </Button>
          </div>
        )}
      </div>

      <AiRunDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
