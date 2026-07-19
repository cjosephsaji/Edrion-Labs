'use client';
import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { Button, Card, StatusBadge, TableSkeleton, EmptyState, ErrorState, Select } from '@edrion/ui';
import { useAuditEvents, useAuditExport, useCurrentEmployee, type AuditFilter } from '@edrion/api-client';
import { Topbar } from '@/components/app-shell/topbar';
import { rowActivation } from '@/lib/use-focus-trap';
import { AuditDetailDrawer } from '@/components/audit/audit-detail-drawer';

const RISK = ['', 'low', 'medium', 'high', 'critical'];
const RESULT = ['', 'success', 'failure', 'denied'];

const selectClass =
  'h-input rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

export default function AuditPage() {
  const me = useCurrentEmployee();
  const canExport = me.data?.permissions?.includes('audit.export') || me.data?.permissions?.includes('*');
  const exportMut = useAuditExport();

  const [filter, setFilter] = useState<AuditFilter>({ limit: 50 });
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAuditEvents(filter);

  const rows = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  function applySearch() {
    setFilter((f) => ({ ...f, search: searchInput || undefined }));
  }
  function set<K extends keyof AuditFilter>(key: K, value: AuditFilter[K]) {
    setFilter((f) => ({ ...f, [key]: value || undefined }));
  }

  return (
    <>
      <Topbar
        title="Audit Logs"
        actions={
          canExport ? (
            <Button size="sm" variant="secondary" loading={exportMut.isPending} onClick={() => exportMut.mutate(filter)}>
              <Download className="h-4 w-4" /> Export CSV
            </Button>
          ) : undefined
        }
      />
      <div className="page-enter space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applySearch()}
              placeholder="Search action, actor, institution…"
              className="h-input w-72 rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
            />
          </div>
          <input
            value={filter.module ?? ''}
            onChange={(e) => set('module', e.target.value)}
            placeholder="Module"
            className={selectClass + ' w-36'}
          />
          <Select value={filter.riskLevel ?? ''} onChange={(e) => set('riskLevel', e.target.value)} className={selectClass} options={RISK.map((r) => ({ value: r, label: r === '' ? 'All risk' : r }))} />
          <Select value={filter.result ?? ''} onChange={(e) => set('result', e.target.value)} className={selectClass} options={RESULT.map((r) => ({ value: r, label: r === '' ? 'All results' : r }))} />
          <input
            type="date"
            value={filter.from?.slice(0, 10) ?? ''}
            onChange={(e) => set('from', e.target.value ? new Date(e.target.value).toISOString() : undefined)}
            className={selectClass}
            aria-label="From date"
          />
          <Button size="sm" variant="secondary" onClick={applySearch}>Apply</Button>
        </div>

        <Card className="overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={8} cols={6} />
          ) : isError ? (
            <div className="p-6">
              <ErrorState description="Could not load audit events. Confirm the API is running on :3001." />
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              <EmptyState title="No audit events" description="Nothing matches these filters." />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="h-table-header border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-text-muted">
                  <th className="px-4">When</th>
                  <th className="px-4">Action</th>
                  <th className="px-4">Actor</th>
                  <th className="px-4">Institution</th>
                  <th className="px-4">Result</th>
                  <th className="px-4">Risk</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((e) => (
                  <tr
                    key={e.id}
                    className="h-table-row cursor-pointer transition-colors hover:bg-background-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    onClick={() => setSelected(e.id)}
                    {...rowActivation(() => setSelected(e.id), `View audit event ${e.action}`)}
                  >
                    <td className="px-4 whitespace-nowrap text-text-muted">{new Date(e.occurredAt).toLocaleString()}</td>
                    <td className="px-4 font-mono text-xs text-text-primary">{e.action}</td>
                    <td className="px-4 text-text-secondary">{e.actorName ?? e.actorType}</td>
                    <td className="px-4 text-text-secondary">{e.institutionName ?? '—'}</td>
                    <td className="px-4"><StatusBadge status={e.result} /></td>
                    <td className="px-4 capitalize text-text-secondary">{e.riskLevel}</td>
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

      <AuditDetailDrawer id={selected} onClose={() => setSelected(null)} />
    </>
  );
}
