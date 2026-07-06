'use client';
import { Drawer } from '@edrion/ui';
import type { ReportDefinitionRow } from '@/lib/reports-types';
import { ReportRunsPanel } from './report-runs-panel';

/** @deprecated Prefer `ReportRunsPanel` in the report detail popup. */
export function ReportRunsDrawer({
  report,
  open,
  onClose,
}: {
  report: ReportDefinitionRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Exports" description={report?.name ?? ''}>
      {report && <ReportRunsPanel reportId={report.id} reportName={report.name} />}
    </Drawer>
  );
}

export { ReportRunsPanel } from './report-runs-panel';
