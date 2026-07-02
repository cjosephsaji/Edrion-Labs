'use client';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { UserProfileDialog } from '@/components/people/user-profile-dialog';
import { usePeopleList, usePeopleMutations, type ParentRow } from '@/lib/people';

const PERMISSIONS: ResourcePermissions = {
  view: 'parents.view',
  create: 'parents.manage',
  update: 'parents.manage',
  delete: 'parents.manage',
};

const fields: FieldDef[] = [
  { name: 'firstName', label: 'First name', type: 'text', required: true },
  { name: 'lastName', label: 'Last name', type: 'text', required: true },
  { name: 'email', label: 'Email', type: 'text', nullable: true, placeholder: 'Optional' },
  { name: 'phone', label: 'Phone', type: 'phone', nullable: true },
  { name: 'occupation', label: 'Occupation', type: 'text', nullable: true, placeholder: 'Optional' },
  { name: 'address', label: 'Address', type: 'textarea', nullable: true, placeholder: 'Optional' },
];

const columns: Column<ParentRow>[] = [
  { key: 'lastName', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.firstName} {r.lastName}</span> },
  { key: 'email', header: 'Email', render: (r) => <span className="text-text-muted">{r.email ?? '—'}</span> },
  { key: 'phone', header: 'Phone', render: (r) => r.phone ?? '—' },
  { key: 'occupation', header: 'Occupation', render: (r) => <span className="text-text-muted">{r.occupation ?? '—'}</span> },
];

export default function ParentsPage() {
  return (
    <ResourceManager<ParentRow>
      resource="parents"
      title="Parents"
      noun="parent"
      columns={columns}
      fields={fields}
      defaultSortBy="lastName"
      permissions={PERMISSIONS}
      useList={usePeopleList}
      useMutations={usePeopleMutations}
      rowLabel={(r) => `${r.firstName} ${r.lastName}`}
      renderDetail={(ctx) => <UserProfileDialog kind="parent" {...ctx} />}
      toFormValues={(r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email ?? '',
        phone: r.phone ?? '',
        occupation: r.occupation ?? '',
        address: r.address ?? '',
      })}
    />
  );
}
