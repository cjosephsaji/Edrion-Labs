'use client';
import { useEffect, useState } from 'react';
import { Label } from '@edrion/ui';
import {
  ApiClientError,
  useAssignRoles,
  useEmployee,
  usePlatformRoles,
  type EmployeeDto,
} from '@edrion/api-client';
import { ConfirmDialog } from '@/components/confirm-dialog';

/** Replace an employee's assigned roles. Sensitive — reason required, recorded in audit. */
export function RolesModal({ employee, onClose }: { employee: EmployeeDto; onClose: () => void }) {
  const detail = useEmployee(employee.id);
  const roles = usePlatformRoles();
  const assign = useAssignRoles(employee.id);
  const [selected, setSelected] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seed the selection from the employee's current roles once the detail loads.
  useEffect(() => {
    if (detail.data && selected === null) {
      setSelected(detail.data.roles.map((r) => r.id));
    }
  }, [detail.data, selected]);

  const current = selected ?? [];
  const toggle = (id: string) =>
    setSelected((prev) => {
      const base = prev ?? [];
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  const onConfirm = (reason: string) => {
    setError(null);
    assign.mutate(
      { roleIds: current, reason },
      {
        onSuccess: onClose,
        onError: (e) => setError(e instanceof ApiClientError ? e.message : 'Could not update roles.'),
      },
    );
  };

  const loading = detail.isLoading || roles.isLoading;

  return (
    <ConfirmDialog
      open
      title={`Roles · ${employee.fullName}`}
      description="Select the platform roles this employee should hold. This replaces their current set."
      requireReason
      confirmLabel="Save roles"
      loading={assign.isPending}
      error={error}
      onConfirm={onConfirm}
      onClose={onClose}
    >
      <div>
        <Label>Assigned roles</Label>
        {loading ? (
          <p className="mt-1 text-sm text-text-muted">Loading roles…</p>
        ) : (
          <div className="mt-1 grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto">
            {(roles.data?.items ?? []).map((r) => (
              <label
                key={r.id}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm text-text-secondary hover:bg-background-secondary"
              >
                <input type="checkbox" checked={current.includes(r.id)} onChange={() => toggle(r.id)} />
                <span className="flex-1">{r.name}</span>
                <span className="text-xs text-text-muted">{r.memberCount} members</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </ConfirmDialog>
  );
}
