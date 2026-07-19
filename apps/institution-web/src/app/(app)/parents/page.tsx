'use client';
import { useCallback, useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { ParentPortalLoginSetup } from '@/components/admin/parent-portal-login-setup';
import { UserProfileDialog } from '@/components/people/user-profile-dialog';
import { usePeopleList, usePeopleMutations, type ParentRow } from '@/lib/people';
import { formatPersonName } from '@/lib/person-name';
import { usePermissions } from '@/lib/permissions';

const ACCESS_KEYS = new Set(['createLogin']);

const PERMISSIONS: ResourcePermissions = {
  view: 'parents.view',
  create: 'parents.manage',
  update: 'parents.manage',
  delete: 'parents.manage',
};

const fields: FieldDef[] = [
  { name: 'firstName', label: 'First name', type: 'text', required: true },
  { name: 'middleName', label: 'Middle name', type: 'text', nullable: true, placeholder: 'Optional' },
  { name: 'lastName', label: 'Last name', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'text', nullable: true, placeholder: 'Optional' },
  { name: 'phone', label: 'Phone', type: 'phone', nullable: true },
  { name: 'occupation', label: 'Occupation', type: 'text', nullable: true, placeholder: 'Optional' },
  { name: 'address', label: 'Address', type: 'textarea', nullable: true, placeholder: 'Optional' },
];

export default function ParentsPage() {
  const { can } = usePermissions();
  const canEditParents = can('parents.manage');

  const createFields = useMemo<FieldDef[]>(
    () => [
      {
        name: 'createLogin',
        label: 'Create portal login',
        type: 'checkbox',
        help: 'Turned on automatically when you add an email; you can turn it off.',
      },
    ],
    [],
  );

  const filters = useMemo<FilterDef[]>(
    () => [
      {
        key: 'hasChildren',
        label: 'Linked children',
        options: [
          { value: 'true', label: 'Has children' },
          { value: 'false', label: 'No children' },
        ],
      },
      {
        key: 'hasLogin',
        label: 'Portal login',
        options: [
          { value: 'true', label: 'Has login' },
          { value: 'false', label: 'No login' },
        ],
      },
    ],
    [],
  );

  const columns = useMemo<Column<ParentRow>[]>(
    () => [
      { key: 'lastName', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{formatPersonName(r)}</span> },
      { key: 'email', header: 'Email', render: (r) => <span className="text-text-muted">{r.email ?? '—'}</span> },
      { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
      { key: 'childrenCount', header: 'Children', align: 'right', render: (r) => <span className="tabular-nums">{r.childrenCount ?? '—'}</span> },
      { key: 'occupation', header: 'Occupation', render: (r) => <span className="text-text-muted">{r.occupation ?? '—'}</span> },
    ],
    [],
  );

  const onSubmitUpdate = useCallback(
    async (row: ParentRow, body: Record<string, unknown>, { update }) => {
      const profile: Record<string, unknown> = { version: row.version };
      for (const [key, value] of Object.entries(body)) {
        if (!ACCESS_KEYS.has(key)) profile[key] = value;
      }
      if (body.createLogin && !row.institutionUserId) {
        profile.createLogin = true;
      }
      await update.mutateAsync({ id: row.id, body: profile });
    },
    [],
  );

  return (
    <ResourceManager<ParentRow>
      resource="parents"
      title="Parents"
      noun="parent"
      columns={columns}
      fields={fields}
      createFields={createFields}
      filters={filters}
      defaultSortBy="lastName"
      permissions={PERMISSIONS}
      requireRoleKeysOnCreateLogin={false}
      useList={usePeopleList}
      useMutations={usePeopleMutations}
      rowLabel={(r) => formatPersonName(r)}
      editFormDescription="Scroll down to provision a portal login if needed."
      renderDetail={(ctx) => <UserProfileDialog kind="parent" {...ctx} />}
      renderFormExtra={
        canEditParents
          ? ({ row, setSubmitPayload, values }) =>
              row.institutionUserId ? (
                <p className="text-sm text-text-muted">This parent already has a portal login.</p>
              ) : (
                <ParentPortalLoginSetup
                  email={
                    typeof values.email === 'string' && values.email.trim()
                      ? values.email
                      : row.email
                  }
                  canManage={canEditParents}
                  setSubmitPayload={setSubmitPayload}
                />
              )
          : undefined
      }
      onSubmitUpdate={canEditParents ? onSubmitUpdate : undefined}
      toFormValues={(r) => ({
        firstName: r.firstName,
        middleName: r.middleName ?? '',
        lastName: r.lastName,
        email: r.email ?? '',
        phone: r.phone ?? '',
        occupation: r.occupation ?? '',
        address: r.address ?? '',
      })}
    />
  );
}
