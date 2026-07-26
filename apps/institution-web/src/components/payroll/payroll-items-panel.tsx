'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useStaffOptions, useTeachingStaffOptions, teachingStaffSelectOptions, staffRowSelectOptions } from '@/lib/people';
import { usePayrollItemMutations, usePayrollItems } from '@/lib/payroll';
import { PortalClientError } from '@/lib/portal-client';

/** Inline payroll lines editor — used inside the payroll run edit form. */
export function PayrollItemsPanel({ runId, runName }: { runId: string; runName: string }) {
  const { can } = usePermissions();
  const canManage = can('payroll.manage');
  const { data: items, isLoading } = usePayrollItems(runId);
  const { data: teachers } = useTeachingStaffOptions();
  const { data: staff } = useStaffOptions();
  const { create, remove } = usePayrollItemMutations(runId);

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
      ? teachingStaffSelectOptions(teachers)
      : staffRowSelectOptions(staff?.items);

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Payroll lines</h3>
      <p className="text-xs text-text-muted">Employee lines in {runName}.</p>
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
        <p className="py-4 text-center text-sm text-text-muted">No lines in this payroll run yet.</p>
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
  );
}
