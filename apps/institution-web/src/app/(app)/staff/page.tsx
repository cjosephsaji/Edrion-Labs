'use client';
import { useCallback, useMemo } from 'react';
import { Badge, StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { RoleMultiSelect } from '@/components/admin/role-multi-select';
import { PortalUserAccessPanel } from '@/components/admin/staff-portal-access-panel';
import { StaffPortalLoginSetup } from '@/components/admin/staff-portal-login-setup';
import { UserProfileDialog } from '@/components/people/user-profile-dialog';
import { useDepartmentOptions } from '@/lib/academics';
import { usePeopleList, usePeopleMutations, type StaffRow } from '@/lib/people';
import { usePortalMe } from '@/lib/hooks';
import { formatPersonName } from '@/lib/person-name';
import { usePermissions } from '@/lib/permissions';
import { useRolesList } from '@/lib/roles';
import { useSetUserAccess } from '@/lib/users';
import type { RoleRow } from '@/lib/admin-types';
import { useTerm } from '@/lib/term';

const ACCESS_KEYS = new Set(['roleKeys', 'campusIds', 'directGrants', 'directDenies', 'userVersion', 'createLogin']);

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
  const { data: me } = usePortalMe();
  const { can } = usePermissions();
  const canEditStaff = can('staff.manage');
  const canViewUsers = can('users.view');
  const canManageRoles = can('users.assign_scoped_roles') || can('users.manage_roles');
  const setAccess = useSetUserAccess();
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
        label: `All ${tp('department')}`,
        options: (departments?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
      },
      { key: 'roleKey', label: 'All roles', options: roleFilterOptions },
      {
        key: 'teaching',
        label: 'Teaching / non-teaching',
        options: [
          { value: 'true', label: 'Teaching' },
          { value: 'false', label: 'Non-teaching' },
        ],
      },
    ],
    [departments, roleFilterOptions, tp],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'middleName', label: 'Middle name', type: 'text', nullable: true, placeholder: 'Optional' },
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
        help: 'Turned on automatically when you add an email; you can turn it off.',
      },
      {
        name: 'roleKeys',
        label: 'Portal roles',
        type: 'custom',
        requiredWhen: { field: 'createLogin', equals: true },
        help: 'Required when creating a portal login.',
        render: (value, onChange, ctx) => (
          <RoleMultiSelect
            value={(value as string[]) ?? []}
            onChange={(keys) => onChange(keys)}
            disabled={ctx?.disabled}
          />
        ),
      },
    ],
    [],
  );

  const columns = useMemo<Column<StaffRow>[]>(
    () => [
      { key: 'lastName', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{formatPersonName(r)}</span> },
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

  const onSubmitUpdate = useCallback(
    async (row: StaffRow, body: Record<string, unknown>, { update }) => {
      const profile: Record<string, unknown> = { version: row.version };
      for (const [key, value] of Object.entries(body)) {
        if (!ACCESS_KEYS.has(key)) profile[key] = value;
      }

      if (body.createLogin && !row.institutionUserId) {
        profile.createLogin = true;
        profile.roleKeys = body.roleKeys ?? [];
      }

      const updatedStaff = (await update.mutateAsync({ id: row.id, body: profile })) as StaffRow;
      const institutionUserId = updatedStaff.institutionUserId ?? row.institutionUserId;
      const justCreatedLogin = Boolean(body.createLogin && !row.institutionUserId);
      const roleKeys = Array.isArray(body.roleKeys) ? (body.roleKeys as string[]) : [];

      // Roles are assigned during invite when createLogin is used; otherwise sync access when roles were picked.
      const editingSelf = Boolean(me?.institutionUserId && institutionUserId === me.institutionUserId);
      if (canManageRoles && institutionUserId && !justCreatedLogin && !editingSelf && roleKeys.length > 0) {
        await setAccess.mutateAsync({
          id: institutionUserId,
          roleKeys,
          campusIds: (body.campusIds as string[]) ?? [],
          directGrants: (body.directGrants as string[]) ?? [],
          directDenies: (body.directDenies as string[]) ?? [],
          version: body.userVersion as number | undefined,
        });
      }
    },
    [canManageRoles, me?.institutionUserId, setAccess],
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
      rowLabel={(r) => formatPersonName(r)}
      renderDetail={(ctx) => <UserProfileDialog kind="staff" {...ctx} />}
      editFormDescription="Scroll down for portal login and role access."
      editDrawerClassName="max-w-2xl"
      renderFormExtra={
        canEditStaff
          ? ({ row, setSubmitPayload, values }) => (
              <div className="flex flex-col gap-4">
                {row.institutionUserId ? (
                  canViewUsers ? (
                    <PortalUserAccessPanel
                      institutionUserId={row.institutionUserId}
                      canManage={canManageRoles}
                      setSubmitPayload={setSubmitPayload}
                    />
                  ) : (
                    <p className="text-sm text-text-muted">
                      Portal access details require the <span className="font-medium">users.view</span> permission.
                    </p>
                  )
                ) : canManageRoles ? (
                  <StaffPortalLoginSetup
                    email={
                      typeof values.email === 'string' && values.email.trim()
                        ? values.email
                        : row.email
                    }
                    canManage={canManageRoles}
                    setSubmitPayload={setSubmitPayload}
                  />
                ) : (
                  <p className="text-sm text-text-muted">This staff member has no portal login.</p>
                )}
              </div>
            )
          : undefined
      }
      onSubmitUpdate={canEditStaff ? onSubmitUpdate : undefined}
      toFormValues={(r) => ({
        firstName: r.firstName,
        middleName: r.middleName ?? '',
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
