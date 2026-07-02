'use client';
import { useMemo, useState } from 'react';
import { Users } from 'lucide-react';
import { StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { StudentGuardiansDrawer } from '@/components/people/student-guardians-drawer';
import { UserProfileDialog } from '@/components/people/user-profile-dialog';
import { useClassOptions, useGradeLevelOptions } from '@/lib/academics';
import { usePeopleList, usePeopleMutations, type StudentRow } from '@/lib/people';

const PERMISSIONS: ResourcePermissions = {
  view: 'students.view',
  create: 'students.create',
  update: 'students.update',
  delete: 'students.delete',
};

export default function StudentsPage() {
  const { data: grades } = useGradeLevelOptions();
  const { data: classes } = useClassOptions();
  const [guardiansFor, setGuardiansFor] = useState<StudentRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'admissionNo', label: 'Admission no.', type: 'text', required: true, placeholder: 'e.g. ADM-1024' },
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: [
          { value: 'enrolled', label: 'Enrolled' },
          { value: 'inactive', label: 'Inactive' },
          { value: 'graduated', label: 'Graduated' },
          { value: 'transferred', label: 'Transferred' },
          { value: 'alumni', label: 'Alumni' },
        ],
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
        render: (r) => <span className="font-medium">{r.firstName} {r.lastName}</span>,
      },
      { key: 'gradeLevelName', header: 'Grade', render: (r) => r.gradeLevelName ?? '—' },
      { key: 'className', header: 'Class', render: (r) => <span className="text-text-muted">{r.className ?? '—'}</span> },
      { key: 'rollNo', header: 'Roll', render: (r) => <span className="tabular-nums">{r.rollNo ?? '—'}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<StudentRow>
        resource="students"
        title="Students"
        noun="student"
        columns={columns}
        fields={fields}
        defaultSortBy="lastName"
        permissions={PERMISSIONS}
        useList={usePeopleList}
        useMutations={usePeopleMutations}
        rowLabel={(r) => `${r.firstName} ${r.lastName}`}
        renderDetail={(ctx) => <UserProfileDialog kind="student" {...ctx} />}
        toFormValues={(r) => ({
          admissionNo: r.admissionNo,
          firstName: r.firstName,
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
        extraActions={(row) => (
          <button
            type="button"
            aria-label="Manage guardians"
            title="Guardians"
            onClick={() => setGuardiansFor(row)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <Users className="h-4 w-4" />
          </button>
        )}
      />

      <StudentGuardiansDrawer
        studentId={guardiansFor?.id ?? null}
        studentName={guardiansFor ? `${guardiansFor.firstName} ${guardiansFor.lastName}` : ''}
        open={!!guardiansFor}
        onClose={() => setGuardiansFor(null)}
      />
    </>
  );
}
