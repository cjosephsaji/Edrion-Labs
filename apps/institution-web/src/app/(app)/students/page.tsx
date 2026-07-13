'use client';
import { useMemo } from 'react';
import { StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { StudentGuardiansPanel } from '@/components/people/student-guardians-panel';
import { StudentPortalInviteDialog } from '@/components/students/student-portal-invite-dialog';
import { UserProfileDialog } from '@/components/people/user-profile-dialog';
import { usePermissions } from '@/lib/permissions';
import { useClassOptions, useGradeLevelOptions } from '@/lib/academics';
import { usePeopleList, usePeopleMutations, type StudentRow } from '@/lib/people';
import { formatPersonName } from '@/lib/person-name';
import { useTerm } from '@/lib/term';

const PERMISSIONS: ResourcePermissions = {
  view: 'students.view',
  create: 'students.create',
  update: 'students.update',
  delete: 'students.delete',
};

const STATUS_OPTIONS = [
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'alumni', label: 'Alumni' },
];

export default function StudentsPage() {
  const { t, tp } = useTerm();
  const { can } = usePermissions();
  const canInvitePortal = can('student_portal.manage');
  const { data: grades } = useGradeLevelOptions();
  const { data: classes } = useClassOptions();

  const filters = useMemo<FilterDef[]>(
    () => [
      { key: 'status', label: 'All statuses', options: STATUS_OPTIONS },
      {
        key: 'gradeLevelId',
        label: `All ${t('gradeLevel').toLowerCase()}s`,
        options: (grades?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
      },
      {
        key: 'classId',
        label: `All ${t('class').toLowerCase()}es`,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      {
        key: 'gender',
        label: 'All genders',
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
          { value: 'other', label: 'Other' },
        ],
      },
    ],
    [grades, classes, t],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'admissionNo', label: 'Admission no.', type: 'text', required: true, placeholder: 'e.g. ADM-1024' },
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'middleName', label: 'Middle name', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: STATUS_OPTIONS,
      },
      {
        name: 'gender',
        label: 'Gender',
        type: 'select',
        nullable: true,
        options: [
          { value: 'male', label: 'Male' },
          { value: 'female', label: 'Female' },
          { value: 'other', label: 'Other' },
        ],
      },
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date', nullable: true },
      {
        name: 'gradeLevelId',
        label: 'Grade',
        type: 'select',
        nullable: true,
        options: (grades?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
      },
      {
        name: 'classId',
        label: 'Class',
        type: 'select',
        nullable: true,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      { name: 'rollNo', label: 'Roll no.', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'enrollmentDate', label: 'Enrolment date', type: 'date', nullable: true },
      { name: 'email', label: 'Email', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'phone', label: 'Phone', type: 'phone', nullable: true },
      { name: 'address', label: 'Address', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [grades, classes],
  );

  const columns = useMemo<Column<StudentRow>[]>(
    () => [
      { key: 'admissionNo', header: 'Admission', sortable: true, render: (r) => <span className="font-mono text-text-secondary">{r.admissionNo}</span> },
      {
        key: 'lastName',
        header: 'Name',
        sortable: true,
        render: (r) => <span className="font-medium">{formatPersonName(r)}</span>,
      },
      { key: 'gradeLevelName', header: 'Grade', render: (r) => r.gradeLevelName ?? '—' },
      { key: 'className', header: 'Class', render: (r) => <span className="text-text-muted">{r.className ?? '—'}</span> },
      { key: 'rollNo', header: 'Roll', render: (r) => <span className="tabular-nums">{r.rollNo ?? '—'}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [],
  );

  return (
    <ResourceManager<StudentRow>
      resource="students"
      title={tp('student')}
      noun={t('student').toLowerCase()}
      columns={columns}
      fields={fields}
      filters={filters}
      defaultSortBy="lastName"
      permissions={PERMISSIONS}
      useList={usePeopleList}
      useMutations={usePeopleMutations}
      rowLabel={(r) => formatPersonName(r)}
      renderDetail={(ctx) => <UserProfileDialog kind="student" {...ctx} />}
      renderFormExtra={({ row }) => (
        <>
          {canInvitePortal && (
            <div className="mb-6 rounded-lg border border-border bg-surface-muted/30 p-4">
              <h3 className="mb-2 text-sm font-medium text-text-primary">Student portal</h3>
              <StudentPortalInviteDialog
                studentId={row.id}
                studentName={formatPersonName(row)}
                studentEmail={row.email}
                guardians={[]}
              />
            </div>
          )}
          <StudentGuardiansPanel studentId={row.id} studentName={formatPersonName(row)} />
        </>
      )}
      toFormValues={(r) => ({
        admissionNo: r.admissionNo,
        firstName: r.firstName,
        middleName: r.middleName ?? '',
        lastName: r.lastName,
        status: r.status,
        gender: r.gender ?? '',
        dateOfBirth: r.dateOfBirth ?? '',
        gradeLevelId: r.gradeLevelId ?? '',
        classId: r.classId ?? '',
        rollNo: r.rollNo ?? '',
        enrollmentDate: r.enrollmentDate ?? '',
        email: r.email ?? '',
        phone: r.phone ?? '',
        address: r.address ?? '',
      })}
    />
  );
}
