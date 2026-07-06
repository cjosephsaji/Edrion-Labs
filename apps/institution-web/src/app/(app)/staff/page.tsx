'use client';
import { useMemo } from 'react';
import { Badge, StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { RoleMultiSelect } from '@/components/admin/role-multi-select';
import { UserProfileDialog } from '@/components/people/user-profile-dialog';
import { useDepartmentOptions } from '@/lib/academics';
import { usePeopleList, usePeopleMutations, type StaffRow } from '@/lib/people';
import { useRolesList } from '@/lib/roles';
import type { RoleRow } from '@/lib/admin-types';
import { useTerm } from '@/lib/term';

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
  const { t, tp } = useTerm();
  const { data: departments } = useDepartmentOptions();
  const { data: roles } = useRolesList<RoleRow>('roles', { page: 1, pageSize: 100, sortDir: 'asc' });

  const roleFilterOptions = useMemo(
    () => (roles?.items ?? []).map((r) => ({ value: r.key, label: r.name })),
    [roles],
  );

  const filters = useMemo<FilterDef[]>(
    () => [
      { key: 'status', label: 'All statuses', options: STATUS_OPTIONS },
      { key: 'employmentType', label: 'All employment', options: EMPLOYMENT_OPTIONS },
      {
        key: 'departmentId',
        label: `All ${t('department').toLowerCase()}s`,
        options: (departments?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
      },
      { key: 'roleKey', label: 'All roles', options: roleFilterOptions },
      {
        key: 'isTeaching',
        label: 'Teaching / non-teaching',
        options: [
          { value: 'true', label: 'Teaching' },
          { value: 'false', label: 'Non-teaching' },
        ],
      },
    ],
    [departments, roleFilterOptions, t],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      { name: 'employeeNo', label: 'Employee no.', type: 'text', nullable: true, placeholder: 'e.g. EMP-512' },
      {
        name: 'departmentId',
        label: t('department'),
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
    [departments, t],
  );

  const createFields = useMemo<FieldDef[]>(
    () => [
      {
        name: 'createLogin',
        label: 'Create portal login',
        type: 'checkbox',
        help: 'Provision a user account with the email above (default on).',
      },
      {
        name: 'roleKeys',
        label: 'Portal roles',
        type: 'custom',
        help: 'Roles assigned when a login is created.',
        render: (value, onChange) => (
          <RoleMultiSelect value={(value as string[]) ?? []} onChange={(keys) => onChange(keys)} />
        ),
      },
    ],
    [],
  );

  const columns = useMemo<Column<StaffRow>[]>(
    () => [
      { key: 'lastName', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.firstName} {r.lastName}</span> },
      { key: 'employeeNo', header: 'Employee', render: (r) => <span className="font-mono text-text-secondary">{r.employeeNo ?? '—'}</span> },
      { key: 'departmentName', header: t('department'), render: (r) => <span className="text-text-muted">{r.departmentName ?? '—'}</span> },
      { key: 'designation', header: 'Designation', render: (r) => r.designation ?? '—' },
      {
        key: 'isTeaching',
        header: 'Type',
        render: (r) =>
          r.isTeaching ? <Badge tone="info">Teaching</Badge> : <Badge tone="neutral">Staff</Badge>,
      },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [t],
  );

  return (
    <ResourceManager<StaffRow>
      resource="staff"
      title={tp('staff')}
      noun={t('staff').toLowerCase()}
      columns={columns}
      fields={fields}
      createFields={createFields}
      filters={filters}
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
