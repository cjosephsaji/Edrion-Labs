'use client';
import { useMemo } from 'react';
import { Badge, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { RolePermissionsPanel } from '@/components/admin/role-permissions-panel';
import { usePermissions } from '@/lib/permissions';
import { useRolesList, useRolesMutations } from '@/lib/roles';
import type { RoleRow } from '@/lib/admin-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'roles.view',
  create: 'roles.manage',
  update: 'roles.manage',
  delete: 'roles.manage',
};

export default function RolesPage() {
  const { can } = usePermissions();
  const canManage = can('roles.manage');

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'key', label: 'Key', type: 'text', required: true, placeholder: 'e.g. exam_officer', help: 'Lower-case, letters/numbers/underscore. Cannot be changed later.' },
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Exam Officer' },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [],
  );

  const columns = useMemo<Column<RoleRow>[]>(
    () => [
      { key: 'name', header: 'Role', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'key', header: 'Key', sortable: true, render: (r) => <span className="font-mono text-xs">{r.key}</span> },
      {
        key: 'source',
        header: 'Type',
        render: (r) => <Badge tone={r.isSystem ? 'neutral' : 'primary'}>{r.isSystem ? 'Built-in' : 'Custom'}</Badge>,
      },
      { key: 'permissionCount', header: 'Permissions', align: 'right', render: (r) => <span className="tabular-nums">{r.permissionCount}</span> },
      { key: 'inUse', header: 'In use', align: 'right', render: (r) => <span className="tabular-nums">{r.inUse}</span> },
    ],
    [],
  );

  return (
    <ResourceManager<RoleRow>
      resource="roles"
      title="Roles & Permissions"
      noun="role"
      columns={columns}
      fields={fields}
      defaultSortBy="name"
      defaultSortDir="asc"
      permissions={PERMISSIONS}
      useList={useRolesList}
      useMutations={useRolesMutations}
      rowLabel={(r) => r.name}
      renderFormExtra={({ row }) => <RolePermissionsPanel role={row} canManage={canManage} />}
      toFormValues={(r) => ({ key: r.key, name: r.name, description: r.description ?? '' })}
    />
  );
}
