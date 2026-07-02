'use client';
import { useMemo } from 'react';
import { StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { UserProfileDialog } from '@/components/people/user-profile-dialog';
import { useDepartmentOptions } from '@/lib/academics';
import { usePeopleList, usePeopleMutations, type StaffRow } from '@/lib/people';

const PERMISSIONS: ResourcePermissions = {
  view: 'staff.view',
  create: 'staff.manage',
  update: 'staff.manage',
  delete: 'staff.manage',
};

const EMPLOYMENT_OPTIONS = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'visiting', label: 'Visiting' },
];
const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on_leave', label: 'On leave' },
];

export default function StaffPage() {
  const { data: departments } = useDepartmentOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      { name: 'employeeNo', label: 'Employee no.', type: 'text', nullable: true, placeholder: 'e.g. EMP-512' },
      {
        name: 'departmentId',
        label: 'Department',
        type: 'select',
        nullable: true,
        options: (departments?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
      },
      { name: 'designation', label: 'Designation', type: 'text', nullable: true, placeholder: 'e.g. Accountant' },
      { name: 'employmentType', label: 'Employment', type: 'select', required: true, options: EMPLOYMENT_OPTIONS },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
      { name: 'joinDate', label: 'Join date', type: 'date', nullable: true },
      { name: 'email', label: 'Email', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'phone', label: 'Phone', type: 'phone', nullable: true },
    ],
    [departments],
  );

  const columns = useMemo<Column<StaffRow>[]>(
    () => [
      { key: 'lastName', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.firstName} {r.lastName}</span> },
      { key: 'employeeNo', header: 'Employee', render: (r) => <span className="font-mono text-text-secondary">{r.employeeNo ?? '—'}</span> },
      { key: 'departmentName', header: 'Department', render: (r) => <span className="text-text-muted">{r.departmentName ?? '—'}</span> },
      { key: 'designation', header: 'Designation', render: (r) => r.designation ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [],
  );

  return (
    <ResourceManager<StaffRow>
      resource="staff"
      title="Staff"
      noun="staff member"
      columns={columns}
      fields={fields}
      defaultSortBy="lastName"
      permissions={PERMISSIONS}
      useList={usePeopleList}
      useMutations={usePeopleMutations}
      rowLabel={(r) => `${r.firstName} ${r.lastName}`}
      renderDetail={(ctx) => <UserProfileDialog kind="staff" {...ctx} />}
      toFormValues={(r) => ({
        firstName: r.firstName,
        lastName: r.lastName,
        employeeNo: r.employeeNo ?? '',
        departmentId: r.departmentId ?? '',
        designation: r.designation ?? '',
        employmentType: r.employmentType,
        status: r.status,
        joinDate: r.joinDate ?? '',
        email: r.email ?? '',
        phone: r.phone ?? '',
      })}
    />
  );
}
