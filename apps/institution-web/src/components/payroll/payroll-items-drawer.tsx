'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Drawer, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useStaffOptions, useTeacherOptions } from '@/lib/people';
import { usePayrollItemMutations, usePayrollItems } from '@/lib/payroll';
import type { PayrollRunRow } from '@/lib/payroll-types';
import { PortalClientError } from '@/lib/portal-client';

/**
 * Manage the per-employee lines within a payroll run. Viewers see the list; `payroll.manage` is
 * required to add or remove — the API re-checks. An employee is a teacher OR a staff member; net is
 * computed (gross − deductions) by the API. One line per (run, employee); a duplicate is rejected.
 */
export function PayrollItemsDrawer({
  run,
  open,
  onClose,
}: {
  run: PayrollRunRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const canManage = can('payroll.manage');
  const { data: items, isLoading } = usePayrollItems(open ? run?.id ?? null : null);
  const { data: teachers } = useTeacherOptions();
  const { data: staff } = useStaffOptions();
  const { create, remove } = usePayrollItemMutations(run?.id ?? '');

  const [employeeType, setEmployeeType] = useState<'teacher' | 'staff'>('teacher');
  const [employeeId, setEmployeeId] = useState('');
  const [gross, setGross] = useState('');
  const [deductions, setDeductions] = useState('0');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setEmployeeId('');
    setGross('');
    setDeductions('0');
  }

  async function add() {
    if (!employeeId || !gross) return;
    setError(null);
    try {
      await create.mutateAsync({
        employeeType,
        teacherId: employeeType === 'teacher' ? employeeId : null,
        staffId: employeeType === 'staff' ? employeeId : null,
        gross: Number(gross),
        deductions: Number(deductions) || 0,
      });
      reset();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not add the line.');
    }
  }

  async function drop(id: string, version: number) {
    setError(null);
    try {
      await remove.mutateAsync({ id, version });
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove the line.');
    }
  }

  const employeeOptions =
    employeeType === 'teacher'
      ? (teachers?.items ?? []).map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName}` }))
      : (staff?.items ?? []).map((s) => ({ value: s.id, label: `${s.firstName} ${s.lastName}` }));

  return (
    <Drawer open={open} onClose={onClose} title="Payroll lines" description={run?.name ?? ''}>
      <div className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {canManage && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="pi-type">Employee type</Label>
                <Select
                  id="pi-type"
                  value={employeeType}
                  onChange={(e) => {
                    setEmployeeType(e.target.value as 'teacher' | 'staff');
                    setEmployeeId('');
                  }}
                  options={[
                    { value: 'teacher', label: 'Teacher' },
                    { value: 'staff', label: 'Staff' },
                  ]}
                />
              </div>
              <div>
                <Label htmlFor="pi-emp">Employee</Label>
                <Select
                  id="pi-emp"
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="Select…"
                  options={employeeOptions}
                />
              </div>
              <div>
                <Label htmlFor="pi-gross">Gross</Label>
                <Input id="pi-gross" type="number" min={0} value={gross} onChange={(e) => setGross(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pi-ded">Deductions</Label>
                <Input id="pi-ded" type="number" min={0} value={deductions} onChange={(e) => setDeductions(e.target.value)} />
              </div>
            </div>
            <Button onClick={add} loading={create.isPending} disabled={!employeeId || !gross}>
              Add line
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (items ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">No lines in this payroll run yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(items ?? []).map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text-primary">
                    {it.employeeName ?? 'Employee'} <span className="text-xs text-text-muted">({it.employeeType})</span>
                  </p>
                  <p className="truncate text-xs text-text-muted tabular-nums">
                    gross {it.gross} · deductions {it.deductions} · net {it.net}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    aria-label="Remove line"
                    onClick={() => drop(it.id, it.version)}
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
