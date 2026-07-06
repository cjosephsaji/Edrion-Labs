'use client';
import { useMemo } from 'react';
import { Badge, type BadgeTone, type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { RoleMultiSelect } from '@/components/admin/role-multi-select';
import { UserAccessPanel } from '@/components/admin/user-access-panel';
import { UserProfileDialog } from '@/components/people/user-profile-dialog';
import { usePermissions } from '@/lib/permissions';
import { useRoleCatalogue, useRolesList } from '@/lib/roles';
import { useScope } from '@/lib/scope';
import { useUsersList, useUsersMutations } from '@/lib/users';
import type { RoleRow, UserRow } from '@/lib/admin-types';

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
  const { campuses } = useScope();
  const { data: roles } = useRolesList<RoleRow>('roles', { page: 1, pageSize: 100, sortDir: 'asc' });
  const { data: catalogue } = useRoleCatalogue();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'email', label: 'Email', type: 'text', required: true, placeholder: 'name@school.edu', help: 'Used to sign in. Cannot be changed after invite.' },
      { name: 'fullName', label: 'Full name', type: 'text', required: true, placeholder: 'e.g. Jordan Lee' },
      { name: 'phone', label: 'Phone', type: 'phone', nullable: true },
      { name: 'status', label: 'Status', type: 'select', options: STATUSES, help: 'Applies when editing; new users start as Invited.' },
      { name: 'requireMfa', label: 'Require MFA at next sign-in', type: 'checkbox' },
    ],
    [],
  );

  const createFields = useMemo<FieldDef[]>(
    () => [
      {
        name: 'roleKeys',
        label: 'Roles',
        type: 'custom',
        help: 'At least one role is required for new users.',
        render: (value, onChange) => (
          <RoleMultiSelect value={(value as string[]) ?? []} onChange={(keys) => onChange(keys)} />
        ),
      },
    ],
    [],
  );

  const filters = useMemo<FilterDef[]>(
    () => [
      { key: 'status', label: 'All statuses', options: STATUSES },
      {
        key: 'roleKey',
        label: 'All roles',
        options: (roles?.items ?? []).map((r) => ({ value: r.key, label: r.name })),
      },
      {
        key: 'campusId',
        label: 'All campuses',
        options: campuses.map((c) => ({ value: c.id, label: c.name })),
      },
      {
        key: 'mfaEnrolled',
        label: 'MFA',
        options: [
          { value: 'true', label: 'MFA enrolled' },
          { value: 'false', label: 'No MFA' },
        ],
      },
      {
        key: 'permission',
        label: 'All permissions',
        options: (catalogue?.permissions ?? []).map((p) => ({ value: p.key, label: p.key })),
      },
      {
        key: 'provisionedFromStaff',
        label: 'Provisioned from staff',
        options: [
          { value: 'true', label: 'From staff' },
          { value: 'false', label: 'Not from staff' },
        ],
      },
    ],
    [roles, campuses, catalogue],
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
    <ResourceManager<UserRow>
      resource="users"
      title="User Management"
      noun="user"
      columns={columns}
      fields={fields}
      createFields={createFields}
      filters={filters}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useUsersList}
      useMutations={useUsersMutations}
      rowLabel={(r) => r.fullName}
      renderDetail={(ctx) => <UserProfileDialog kind="user" {...ctx} />}
      renderFormExtra={canManageRoles ? ({ row }) => <UserAccessPanel user={row} canManage={canManageRoles} /> : undefined}
      toFormValues={(r) => ({
        email: r.email,
        fullName: r.fullName,
        phone: r.phone ?? '',
        status: r.status,
        requireMfa: r.requireMfa,
      })}
    />
  );
}
