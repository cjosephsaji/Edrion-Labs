'use client';
import { useMemo, useState } from 'react';
import { KeyRound } from 'lucide-react';
import { Badge, type BadgeTone, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { UserAccessDrawer } from '@/components/admin/user-access-drawer';
import { usePermissions } from '@/lib/permissions';
import { useUsersList, useUsersMutations } from '@/lib/users';
import type { UserRow } from '@/lib/admin-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'users.view',
  create: 'users.invite',
  update: 'users.manage',
  delete: 'users.manage',
};

const STATUSES = [
  { value: 'invited', label: 'Invited' },
  { value: 'active', label: 'Active' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'locked', label: 'Locked' },
];
const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  invited: 'info',
  disabled: 'neutral',
  locked: 'warning',
  pending_deletion: 'danger',
};

export default function UsersPage() {
  const { can } = usePermissions();
  const canManageRoles = can('users.manage_roles');
  const [accessFor, setAccessFor] = useState<UserRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'email', label: 'Email', type: 'text', required: true, placeholder: 'name@school.edu', help: 'Used to sign in. Cannot be changed after invite.' },
      { name: 'fullName', label: 'Full name', type: 'text', required: true, placeholder: 'e.g. Jordan Lee' },
      { name: 'phone', label: 'Phone', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', options: STATUSES, help: 'Applies when editing; new users start as Invited.' },
      { name: 'requireMfa', label: 'Require MFA at next sign-in', type: 'checkbox' },
    ],
    [],
  );

  const columns = useMemo<Column<UserRow>[]>(
    () => [
      { key: 'fullName', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.fullName}</span> },
      { key: 'email', header: 'Email', sortable: true, render: (r) => <span className="text-text-secondary">{r.email}</span> },
      {
        key: 'roleKeys',
        header: 'Roles',
        render: (r) =>
          r.roleKeys.length ? (
            <span className="text-text-secondary">{r.roleKeys.join(', ')}</span>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      { key: 'campusCount', header: 'Campuses', align: 'right', render: (r) => <span className="tabular-nums">{r.campusCount}</span> },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>{r.status}</Badge>,
      },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<UserRow>
        resource="users"
        title="User Management"
        noun="user"
        columns={columns}
        fields={fields}
        defaultSortBy="createdAt"
        defaultSortDir="desc"
        permissions={PERMISSIONS}
        useList={useUsersList}
        useMutations={useUsersMutations}
        rowLabel={(r) => r.fullName}
        toFormValues={(r) => ({
          email: r.email,
          fullName: r.fullName,
          phone: r.phone ?? '',
          status: r.status,
          requireMfa: r.requireMfa,
        })}
        extraActions={
          canManageRoles
            ? (row) => (
                <button
                  type="button"
                  aria-label="Roles & access"
                  title="Roles & access"
                  onClick={() => setAccessFor(row)}
                  className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
                >
                  <KeyRound className="h-4 w-4" />
                </button>
              )
            : undefined
        }
      />

      <UserAccessDrawer user={accessFor} open={!!accessFor} onClose={() => setAccessFor(null)} canManage={canManageRoles} />
    </>
  );
}
