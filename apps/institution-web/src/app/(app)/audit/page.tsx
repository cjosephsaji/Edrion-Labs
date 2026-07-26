'use client';
import { useMemo, useState } from 'react';
import { Download, Search } from 'lucide-react';
import { Badge, Button, DataTable, PermissionDenied, Select, type BadgeTone, type Column } from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { useScope } from '@/lib/scope';
import { scopeHeader } from '@/lib/portal-client';
import { webEnv } from '@/lib/env';
import { useAuditFilters, useAuditList, type AuditRow } from '@/lib/audit';

const PAGE_SIZE = 25;
const RISK_TONE: Record<string, BadgeTone> = { low: 'neutral', medium: 'info', high: 'warning', critical: 'danger' };
const RESULTS = [
  { value: 'success', label: 'Success' },
  { value: 'failure', label: 'Failure' },
];
const RISKS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
];

export default function AuditPage() {
  const { can } = usePermissions();
  const { scope } = useScope();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [result, setResult] = useState('');
  const [riskLevel, setRiskLevel] = useState('');
  const [exporting, setExporting] = useState(false);

  const params = { page, pageSize: PAGE_SIZE, search: search || undefined, module: module || undefined, result: result || undefined, riskLevel: riskLevel || undefined };
  const { data, isLoading, isError } = useAuditList(params);
  const { data: filters } = useAuditFilters();
  const canExport = can('audit.export');

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo<Column<AuditRow>[]>(
    () => [
      {
        key: 'occurredAt',
        header: 'When',
        render: (r) => <span className="whitespace-nowrap tabular-nums text-text-secondary">{new Date(r.occurredAt).toLocaleString()}</span>,
      },
      { key: 'action', header: 'Action', render: (r) => <span className="font-medium">{r.action}</span> },
      { key: 'module', header: 'Module', render: (r) => <span className="font-mono text-xs">{r.module}</span> },
      { key: 'actorName', header: 'Actor', render: (r) => <span className="text-text-secondary">{r.actorName ?? r.actorType}</span> },
      { key: 'result', header: 'Result', render: (r) => <Badge tone={r.result === 'success' ? 'success' : 'danger'}>{r.result}</Badge> },
      { key: 'riskLevel', header: 'Risk', render: (r) => <Badge tone={RISK_TONE[r.riskLevel] ?? 'neutral'}>{r.riskLevel}</Badge> },
    ],
    [],
  );

  async function exportCsv() {
    setExporting(true);
    try {
      const sp = new URLSearchParams();
      if (search) sp.set('search', search);
      if (module) sp.set('module', module);
      if (result) sp.set('result', result);
      if (riskLevel) sp.set('riskLevel', riskLevel);
      const res = await fetch(`${webEnv.apiBaseUrl}/v1/portal/audit/export?${sp.toString()}`, {
        credentials: 'include',
        headers: {
          'x-institution-scope': scopeHeader(scope),
          ...(webEnv.devUserEmail ? { 'x-institution-user-email': webEnv.devUserEmail } : {}),
        },
      });
      const text = await res.text();
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-export-${Date.now()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  if (!can('audit.view')) {
    return (
      <>
        <Topbar title="Audit Logs" />
        <div className="p-6">
          <PermissionDenied description="You don’t have permission to view audit logs." />
        </div>
      </>
    );
  }

  return (
    <>
      <Topbar
        title="Audit Logs"
        actions={
          canExport ? (
            <Button size="sm" variant="secondary" onClick={exportCsv} loading={exporting}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          ) : undefined
        }
      />

      <div className="page-enter flex flex-1 flex-col gap-4 p-5">
        {filters?.summary && (
          <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
            <span>
              <span className="font-medium text-text-primary tabular-nums">{filters.summary.total}</span> events
            </span>
            <span>
              <span className="font-medium text-warning tabular-nums">{filters.summary.failures}</span> failures
            </span>
            <span>
              <span className="font-medium text-text-primary tabular-nums">{filters.summary.aiInvolved}</span> AI-involved
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search actions, actors…"
              className="h-9 w-full rounded-md border border-border bg-surface pl-8 pr-3 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
            />
          </div>
          <Select
            className="h-9 w-44"
            value={module}
            onChange={(e) => {
              setModule(e.target.value);
              setPage(1);
            }}
            placeholder="All modules"
            options={(filters?.modules ?? []).map((m) => ({ value: m, label: m }))}
          />
          <Select
            className="h-9 w-36"
            value={result}
            onChange={(e) => {
              setResult(e.target.value);
              setPage(1);
            }}
            placeholder="Any result"
            options={RESULTS}
          />
          <Select
            className="h-9 w-36"
            value={riskLevel}
            onChange={(e) => {
              setRiskLevel(e.target.value);
              setPage(1);
            }}
            placeholder="Any risk"
            options={RISKS}
          />
        </div>

        <DataTable<AuditRow>
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={isLoading}
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          emptyTitle={isError ? 'Couldn’t load the audit log' : 'No audit events match'}
          emptyDescription={
            isError ? 'The portal API may be offline. Retry in a moment.' : 'Adjust the filters to widen your search.'
          }
        />
      </div>
    </>
  );
}
