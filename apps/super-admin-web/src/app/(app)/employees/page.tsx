'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';
import { Card, StatusBadge, TableSkeleton, EmptyState, ErrorState, Button } from '@edrion/ui';
import {
  useEmployees,
  useCreateEmployee,
  useEmployeeStatusAction,
  type EmployeeDto,
} from '@edrion/api-client';
import { errorMessage } from '@/lib/errors';
import { Topbar } from '@/components/app-shell/topbar';
import { RolesModal } from './roles-modal';

const PAGE_SIZE = 25;
const STATUS_FILTERS = ['', 'active', 'disabled', 'locked', 'invited', 'pending_deletion'];
const selectClass =
  'h-input rounded-md border border-border bg-surface px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30';

export default function EmployeesPage() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get('search') ?? '';
  const status = params.get('status') ?? '';
  const page = Number(params.get('page') ?? '1');
  const [searchInput, setSearchInput] = useState(search);
  const [rolesFor, setRolesFor] = useState<EmployeeDto | null>(null);
  const create = useCreateEmployee();

  const setParam = useCallback(
    (next: Record<string, string | number | undefined>) => {
      const sp = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === undefined || v === '') sp.delete(k);
        else sp.set(k, String(v));
      }
      router.replace(`/employees?${sp.toString()}`);
    },
    [params, router],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) setParam({ search: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput, search, setParam]);

  const { data, isLoading, isError } = useEmployees({
    search: search || undefined,
    status: status || undefined,
    page,
    pageSize: PAGE_SIZE,
  });

  const onNew = () => {
    const email = window.prompt('New employee — email?')?.trim();
    if (!email) return;
    const fullName = window.prompt('Full name?')?.trim();
    if (!fullName) return;
    const title = window.prompt('Title? (optional)')?.trim() || undefined;
    create.mutate({ email, fullName, title }, { onError: (e) => window.alert(errorMessage(e)) });
  };

  return (
    <>
      <Topbar title="Employees" />
      <div className="page-enter space-y-5 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              className={`${selectClass} w-64 pl-9`}
              placeholder="Search name or email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search employees"
            />
          </div>
          <select
            className={selectClass}
            value={status}
            onChange={(e) => setParam({ status: e.target.value, page: 1 })}
            aria-label="Filter by status"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {s === '' ? 'All statuses' : s}
              </option>
            ))}
          </select>
          <Button size="sm" className="ml-auto" disabled={create.isPending} onClick={onNew}>
            New employee
          </Button>
        </div>

        {isLoading ? (
          <TableSkeleton />
        ) : isError || !data ? (
          <ErrorState description="Could not load employees. Confirm the API is running on :3001." />
        ) : data.items.length === 0 ? (
          <EmptyState title="No employees" description="No employees match these filters." />
        ) : (
          <Card>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-text-muted">
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Email</th>
                  <th className="p-3 font-medium">Title</th>
                  <th className="p-3 font-medium">Roles</th>
                  <th className="p-3 font-medium">Status</th>
                  <th className="p-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((e) => (
                  <Row key={e.id} employee={e} onManageRoles={() => setRolesFor(e)} />
                ))}
              </tbody>
            </table>
          </Card>
        )}

        {data && data.total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-sm text-text-muted">
            <span>
              Page {page} · {data.total} employees
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setParam({ page: page - 1 })}>
                Previous
              </Button>
              <Button size="sm" variant="secondary" disabled={!data.hasMore} onClick={() => setParam({ page: page + 1 })}>
                Next
              </Button>
            </div>
          </div>
        )}
      </div>

      {rolesFor && <RolesModal employee={rolesFor} onClose={() => setRolesFor(null)} />}
    </>
  );
}

function Row({ employee, onManageRoles }: { employee: EmployeeDto; onManageRoles: () => void }) {
  const action = useEmployeeStatusAction(employee.id);
  const isDisabled = employee.status === 'disabled';
  const onToggle = () => {
    const reason = window.prompt(
      isDisabled ? 'Reason to restore this employee?' : 'Reason to disable this employee?',
    );
    if (!reason || reason.trim().length < 5) return;
    action.mutate(
      { action: isDisabled ? 'restore' : 'disable', reason: reason.trim(), version: employee.version },
      { onError: (e) => window.alert(errorMessage(e)) },
    );
  };
  return (
    <tr className="border-b border-border last:border-0">
      <td className="p-3 text-text-primary">{employee.fullName}</td>
      <td className="p-3 text-text-muted">{employee.email}</td>
      <td className="p-3 text-text-muted">{employee.title ?? '—'}</td>
      <td className="p-3 text-text-muted">{employee.roleCount ?? 0}</td>
      <td className="p-3">
        <StatusBadge status={employee.status} />
      </td>
      <td className="p-3 text-right">
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={onManageRoles}>
            Roles
          </Button>
          <Button size="sm" variant="secondary" disabled={action.isPending} onClick={onToggle}>
            {isDisabled ? 'Restore' : 'Disable'}
          </Button>
        </div>
      </td>
    </tr>
  );
}
