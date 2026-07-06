'use client';
import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Input, Label, Select, Skeleton } from '@edrion/ui';
import { useDepartmentOptions, useProgrammeLevelOptions, useTermOptionsByProgrammeLevel } from '@/lib/academics';
import { usePermissions } from '@/lib/permissions';
import { useReportRunMutations, useReportRuns } from '@/lib/reports';
import { useTerm } from '@/lib/term';
import { PortalClientError } from '@/lib/portal-client';

const FORMATS = [
  { value: 'csv', label: 'CSV' },
  { value: 'pdf', label: 'PDF' },
  { value: 'xlsx', label: 'Excel' },
];

const PROGRAMME_INSTITUTION_TYPES = new Set(['college', 'university', 'training_center']);

/** Inline report exports — shown in the report definition detail popup. */
export function ReportRunsPanel({ reportId, reportName }: { reportId: string; reportName: string }) {
  const { t, tp, type } = useTerm();
  const { can } = usePermissions();
  const canExport = can('reports.export');
  const { data: runs, isLoading } = useReportRuns(reportId);
  const { create, remove } = useReportRunMutations(reportId);

  const { data: allLevels } = useProgrammeLevelOptions();
  const hasProgrammeLinks = (allLevels?.items?.length ?? 0) > 0;
  const showScope = PROGRAMME_INSTITUTION_TYPES.has(type) && hasProgrammeLinks;

  const { data: departments } = useDepartmentOptions();
  const [departmentId, setDepartmentId] = useState('');
  const [programmeLevelId, setProgrammeLevelId] = useState('');
  const [termId, setTermId] = useState('');
  const { data: programmeLevels } = useProgrammeLevelOptions(departmentId || undefined);
  const { data: terms } = useTermOptionsByProgrammeLevel(programmeLevelId || undefined);

  const [format, setFormat] = useState('csv');
  const [rowCount, setRowCount] = useState('0');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDepartmentId('');
    setProgrammeLevelId('');
    setTermId('');
    setError(null);
  }, [reportId]);

  useEffect(() => {
    setProgrammeLevelId('');
    setTermId('');
  }, [departmentId]);

  useEffect(() => {
    setTermId('');
  }, [programmeLevelId]);

  const scopeNote = useMemo(() => {
    if (!showScope) return null;
    const parts: string[] = [];
    const dept = departments?.items?.find((d) => d.id === departmentId);
    const level = programmeLevels?.items?.find((l) => l.id === programmeLevelId);
    const term = terms?.items?.find((tr) => tr.id === termId);
    if (dept) parts.push(dept.name);
    if (level) parts.push(level.gradeLevelName ?? level.durationLabel ?? t('gradeLevel'));
    if (term) parts.push(term.name);
    return parts.length > 0 ? `Scope: ${parts.join(' / ')}` : null;
  }, [showScope, departments, programmeLevels, terms, departmentId, programmeLevelId, termId, t]);

  async function add() {
    setError(null);
    try {
      await create.mutateAsync({
        format,
        rowCount: Number(rowCount) || 0,
        ...(scopeNote ? { notes: scopeNote } : {}),
      });
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
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Exports</h3>
      <p className="text-xs text-text-muted">Generated exports for {reportName}.</p>
      {error && (
        <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </div>
      )}

      {canExport && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          {showScope && (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <div>
                <Label htmlFor="run-dept">{t('department')}</Label>
                <Select
                  id="run-dept"
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  options={[
                    { value: '', label: `All ${tp('department')}` },
                    ...(departments?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
                  ]}
                />
              </div>
              <div>
                <Label htmlFor="run-level">{t('gradeLevel')}</Label>
                <Select
                  id="run-level"
                  value={programmeLevelId}
                  onChange={(e) => setProgrammeLevelId(e.target.value)}
                  disabled={!departmentId}
                  options={[
                    { value: '', label: `All ${tp('gradeLevel')}` },
                    ...(programmeLevels?.items ?? []).map((l) => ({
                      value: l.id,
                      label: l.gradeLevelName ?? l.durationLabel ?? 'Year',
                    })),
                  ]}
                />
              </div>
              <div>
                <Label htmlFor="run-term">{t('term')}</Label>
                <Select
                  id="run-term"
                  value={termId}
                  onChange={(e) => setTermId(e.target.value)}
                  disabled={!programmeLevelId}
                  options={[
                    { value: '', label: `All ${tp('term')}` },
                    ...(terms?.items ?? []).map((tr) => ({ value: tr.id, label: tr.name })),
                  ]}
                />
              </div>
            </div>
          )}
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
          {scopeNote && <p className="text-xs text-text-muted">{scopeNote}</p>}
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
        <p className="py-4 text-center text-sm text-text-muted">No exports generated for this report yet.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {(runs ?? []).map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium uppercase text-text-primary">{r.format}</p>
                <p className="truncate text-xs text-text-muted">
                  {[r.notes, `${r.rowCount} rows`, r.status, r.generatedDate].filter(Boolean).join(' · ')}
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
  );
}
