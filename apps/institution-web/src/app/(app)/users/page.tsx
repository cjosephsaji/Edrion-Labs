'use client';
import { useCallback, useMemo } from 'react';
import { Badge, type BadgeTone, type Column } from '@edrion/ui';
import {
  ResourceManager,
  type FilterDef,
  type MutationLike,
  type ResourcePermissions,
} from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { RoleLabelsText } from '@/components/admin/role-badges';
import { RoleMultiSelect } from '@/components/admin/role-multi-select';
import { PortalUserAccessPanel } from '@/components/admin/staff-portal-access-panel';
import { SuspendUserPanel } from '@/components/admin/suspend-user-panel';
import { UserProfileDialog } from '@/components/people/user-profile-dialog';
import { PortalClientError } from '@/lib/portal-client';
import { usePermissions } from '@/lib/permissions';
import { useRoleCatalogue, useRolesList } from '@/lib/roles';
import { useScope } from '@/lib/scope';
import { usePortalMe } from '@/lib/hooks';
import { usePortalClient } from '@/lib/portal-client';
import { useSetUserAccess, useUsersList, useUsersMutations } from '@/lib/users';
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
  { value: 'disabled', label: 'Suspended' },
  { value: 'locked', label: 'Locked' },
];
const EDITABLE_STATUSES = [
  { value: 'invited', label: 'Invited' },
  { value: 'active', label: 'Active' },
  { value: 'locked', label: 'Locked' },
  { value: 'disabled', label: 'Suspended (use panel below)' },
];
const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  invited: 'info',
  disabled: 'danger',
  locked: 'warning',
  pending_deletion: 'danger',
};

const ACCESS_KEYS = new Set(['roleKeys', 'campusIds', 'directGrants', 'directDenies', 'userVersion']);

export default function UsersPage() {
  const { can } = usePermissions();
  const canManageRoles = can('users.assign_scoped_roles') || can('users.manage_roles');
  const client = usePortalClient();
  const { campuses, scope } = useScope();
  const { data: me } = usePortalMe();
  const { data: roles } = useRolesList<RoleRow>('roles', { page: 1, pageSize: 100, sortDir: 'asc' });
  const { data: catalogue } = useRoleCatalogue();
  const setAccess = useSetUserAccess();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'email', label: 'Email', type: 'text', required: true, placeholder: 'name@school.edu', help: 'Used to sign in. Cannot be changed after invite.' },
      { name: 'fullName', label: 'Full name', type: 'text', required: true, placeholder: 'e.g. Jordan Lee' },
      { name: 'phone', label: 'Phone', type: 'phone', nullable: true },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: EDITABLE_STATUSES,
        help: 'To suspend a user, use Suspend account below (a reason is required).',
      },
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
        required: true,
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
            <span className="text-text-secondary"><RoleLabelsText roleKeys={r.roleKeys} /></span>
          ) : (
            <span className="text-text-muted">—</span>
          ),
      },
      { key: 'campusCount', header: 'Campuses', align: 'right', render: (r) => <span className="tabular-nums">{r.campusCount}</span> },
      {
        key: 'status',
        header: 'Status',
        sortable: true,
        render: (r) => (
          <Badge tone={STATUS_TONE[r.status] ?? 'neutral'}>
            {r.status === 'disabled' ? 'suspended' : r.status}
          </Badge>
        ),
      },
    ],
    [],
  );

  const onSubmitUpdate = useCallback(
    async (
      row: UserRow,
      body: Record<string, unknown>,
      { update }: { update: MutationLike<{ id: string; body: Record<string, unknown> }> },
    ) => {
      let userVersion = (body.userVersion as number | undefined) ?? row.version;

      const nextStatus = String(body.status ?? row.status);
      if (nextStatus === 'disabled' && row.status !== 'disabled') {
        throw new PortalClientError(
          400,
          'USE_SUSPEND',
          'Use Suspend account below to suspend a user — a reason is required.',
        );
      }
      if (row.status === 'disabled' && nextStatus !== 'disabled') {
        throw new PortalClientError(
          400,
          'USE_UNSUSPEND',
          'Use Unsuspend account below to restore access — a reason is required.',
        );
      }

      const profileChanged =
        String(body.fullName ?? '') !== row.fullName ||
        String(body.phone ?? '') !== (row.phone ?? '') ||
        (nextStatus !== 'disabled' && nextStatus !== row.status) ||
        Boolean(body.requireMfa) !== row.requireMfa;

      if (profileChanged && can('users.manage')) {
        const profile: Record<string, unknown> = { version: userVersion };
        for (const [key, value] of Object.entries(body)) {
          if (!ACCESS_KEYS.has(key)) profile[key] = value;
        }
        // Suspension is handled by the dedicated suspend/unsuspend endpoints.
        if (profile.status === 'disabled' || row.status === 'disabled') {
          delete profile.status;
        }
        try {
          const updated = (await update.mutateAsync({ id: row.id, body: profile })) as UserRow;
          userVersion = updated.version;
        } catch (err) {
          if (err instanceof PortalClientError && err.code === 'VERSION_CONFLICT') {
            const fresh = await client.get<UserRow>(`/portal/users/${row.id}`, scope);
            const updated = (await update.mutateAsync({
              id: row.id,
              body: { ...profile, version: fresh.version },
            })) as UserRow;
            userVersion = updated.version;
          } else {
            throw err;
          }
        }
      }

      const roleKeys = Array.isArray(body.roleKeys) ? (body.roleKeys as string[]) : [];
      const editingSelf = Boolean(me?.institutionUserId && row.id === me.institutionUserId);
      if (canManageRoles && !editingSelf && roleKeys.length > 0) {
        await setAccess.mutateAsync({
          id: row.id,
          roleKeys,
          campusIds: (body.campusIds as string[]) ?? [],
          directGrants: (body.directGrants as string[]) ?? row.directGrants,
          directDenies: (body.directDenies as string[]) ?? row.directDenies,
          version: userVersion,
        });
      }
    },
    [can, canManageRoles, client, me?.institutionUserId, scope, setAccess],
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
      renderFormExtra={
        can('users.manage') || canManageRoles
          ? ({ row, setSubmitPayload }) => (
              <div className="flex flex-col gap-6">
                {canManageRoles ? (
                  <PortalUserAccessPanel
                    institutionUserId={row.id}
                    canManage={canManageRoles}
                    setSubmitPayload={setSubmitPayload}
                  />
                ) : null}
                {can('users.manage') ? <SuspendUserPanel user={row} canManage /> : null}
              </div>
            )
          : undefined
      }
      onSubmitUpdate={canManageRoles ? onSubmitUpdate : undefined}
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
