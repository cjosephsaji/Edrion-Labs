'use client';
import { Drawer } from '@edrion/ui';
import type { PayrollRunRow } from '@/lib/payroll-types';
import { PayrollItemsPanel } from './payroll-items-panel';

/** @deprecated Prefer `PayrollItemsPanel` inside the payroll run edit form. */
export function PayrollItemsDrawer({
  run,
  open,
  onClose,
}: {
  run: PayrollRunRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Payroll lines" description={run?.name ?? ''}>
      {run && <PayrollItemsPanel runId={run.id} runName={run.name} />}
    </Drawer>
  );
}

export { PayrollItemsPanel } from './payroll-items-panel';
