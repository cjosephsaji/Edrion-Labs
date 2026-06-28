'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Drawer, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useReportRunMutations, useReportRuns } from '@/lib/reports';
import type { ReportDefinitionRow } from '@/lib/reports-types';
import { PortalClientError } from '@/lib/portal-client';

const FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
  { value: 'xlsx', label: 'Excel' },
];

/**
 * The generated exports of a report definition (the export bridge). Viewers see the runs;
 * `reports.export` is required to generate or remove one — the API re-checks. Mirrors the exam-papers
 * drawer (a CRUD list).
 */
export function ReportRunsDrawer({
  report,
  open,
  onClose,
}: {
  report: ReportDefinitionRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const canExport = can('reports.export');
  const { data: runs, isLoading } = useReportRuns(open ? report?.id ?? null : null);
  const { create, remove } = useReportRunMutations(report?.id ?? '');

  const [format, setFormat] = useState('csv');
  const [rowCount, setRowCount] = useState('0');
  const [error, setError] = useState<string | null>(null);

  async function add() {
    setError(null);
    try {
      await create.mutateAsync({ format, rowCount: Number(rowCount) || 0 });
      setRowCount('0');
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not generate the export.');
    }
  }

  async function drop(id: string) {
    setError(null);
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove the export.');
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Exports" description={report?.name ?? ''}>
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {canExport && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="run-format">Format</Label>
                <Select id="run-format" value={format} onChange={(e) => setFormat(e.target.value)} options={FORMATS} />
              </div>
              <div>
                <Label htmlFor="run-rows">Rows</Label>
                <Input id="run-rows" type="number" min={0} value={rowCount} onChange={(e) => setRowCount(e.target.value)} />
              </div>
            </div>
            <Button onClick={add} loading={create.isPending}>
              Generate export
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (runs ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">No exports generated for this report yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(runs ?? []).map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary uppercase">{r.format}</p>
                  <p className="truncate text-xs text-text-muted">
                    {[`${r.rowCount} rows`, r.status, r.generatedDate].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {canExport && (
                  <button
                    type="button"
                    aria-label="Remove export"
                    onClick={() => drop(r.id)}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
