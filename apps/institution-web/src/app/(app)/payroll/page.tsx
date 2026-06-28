'use client';
import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { PayrollItemsDrawer } from '@/components/payroll/payroll-items-drawer';
import { usePayrollList, usePayrollMutations } from '@/lib/payroll';
import type { PayrollRunRow } from '@/lib/payroll-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'payroll.view',
  create: 'payroll.manage',
  update: 'payroll.manage',
  delete: 'payroll.manage',
};

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'processing', label: 'Processing' },
  { value: 'approved', label: 'Approved' },
  { value: 'paid', label: 'Paid' },
  { value: 'cancelled', label: 'Cancelled' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function PayrollPage() {
  const [itemsFor, setItemsFor] = useState<PayrollRunRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. March 2026 Payroll' },
      { name: 'periodLabel', label: 'Period', type: 'text', nullable: true, placeholder: 'e.g. March 2026' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      { name: 'periodStart', label: 'Period start', type: 'date', nullable: true },
      { name: 'periodEnd', label: 'Period end', type: 'date', nullable: true },
      { name: 'payDate', label: 'Pay date', type: 'date', nullable: true },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [],
  );

  const columns = useMemo<Column<PayrollRunRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'periodLabel', header: 'Period', render: (r) => r.periodLabel ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
      { key: 'payDate', header: 'Pay date', sortable: true, render: (r) => <span className="tabular-nums">{r.payDate ?? '—'}</span> },
      { key: 'itemCount', header: 'Lines', align: 'right', render: (r) => <span className="tabular-nums">{r.itemCount || '—'}</span> },
      { key: 'totalNet', header: 'Total net', align: 'right', render: (r) => <span className="tabular-nums font-medium">{r.totalNet}</span> },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<PayrollRunRow>
        resource="payroll/runs"
        title="Payroll"
        noun="payroll run"
        columns={columns}
        fields={fields}
        defaultSortBy="createdAt"
        defaultSortDir="desc"
        permissions={PERMISSIONS}
        useList={usePayrollList}
        useMutations={usePayrollMutations}
        rowLabel={(r) => r.name}
        toFormValues={(r) => ({
          name: r.name,
          periodLabel: r.periodLabel ?? '',
          status: r.status,
          periodStart: r.periodStart ?? '',
          periodEnd: r.periodEnd ?? '',
          payDate: r.payDate ?? '',
          notes: r.notes ?? '',
        })}
        extraActions={(row) => (
          <button
            type="button"
            aria-label="Payroll lines"
            title="Payroll lines"
            onClick={() => setItemsFor(row)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <Users className="h-4 w-4" />
          </button>
        )}
      />

      <PayrollItemsDrawer run={itemsFor} open={!!itemsFor} onClose={() => setItemsFor(null)} />
    </>
  );
}
