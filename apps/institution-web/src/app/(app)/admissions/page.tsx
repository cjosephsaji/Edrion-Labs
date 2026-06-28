'use client';
import { useMemo, useState } from 'react';
import { UserPlus } from 'lucide-react';
import { StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { AdmissionEnrolDrawer } from '@/components/admissions/admission-enrol-drawer';
import { useGradeLevelOptions } from '@/lib/academics';
import { usePermissions } from '@/lib/permissions';
import { useAdmissionsList, useAdmissionsMutations, type AdmissionRow } from '@/lib/admissions';

const PERMISSIONS: ResourcePermissions = {
  view: 'admissions.view',
  create: 'admissions.manage',
  update: 'admissions.manage',
  delete: 'admissions.manage',
};

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

export default function AdmissionsPage() {
  const { data: grades } = useGradeLevelOptions();
  const { can } = usePermissions();
  const canManage = can('admissions.manage');
  const [enrolFor, setEnrolFor] = useState<AdmissionRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'applicationNo', label: 'Application no.', type: 'text', required: true, placeholder: 'e.g. APP-2026-001' },
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
      {
        name: 'gradeLevelId',
        label: 'Applying for grade',
        type: 'select',
        nullable: true,
        options: (grades?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
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
      { name: 'appliedDate', label: 'Applied date', type: 'date', nullable: true },
      { name: 'previousSchool', label: 'Previous school', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'guardianName', label: 'Guardian name', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'guardianPhone', label: 'Guardian phone', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'guardianEmail', label: 'Guardian email', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'email', label: 'Applicant email', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'phone', label: 'Applicant phone', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'decisionNote', label: 'Decision note', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [grades],
  );

  const columns = useMemo<Column<AdmissionRow>[]>(
    () => [
      { key: 'applicationNo', header: 'Application', sortable: true, render: (r) => <span className="font-mono text-text-secondary">{r.applicationNo}</span> },
      { key: 'lastName', header: 'Applicant', sortable: true, render: (r) => <span className="font-medium">{r.firstName} {r.lastName}</span> },
      { key: 'gradeLevelName', header: 'Grade', render: (r) => r.gradeLevelName ?? '—' },
      { key: 'appliedDate', header: 'Applied', sortable: true, render: (r) => <span className="tabular-nums text-text-muted">{r.appliedDate ?? '—'}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<AdmissionRow>
        resource="admissions"
        title="Admissions"
        noun="application"
        columns={columns}
        fields={fields}
        defaultSortBy="appliedDate"
        defaultSortDir="desc"
        permissions={PERMISSIONS}
        useList={useAdmissionsList}
        useMutations={useAdmissionsMutations}
        rowLabel={(r) => `${r.firstName} ${r.lastName} (${r.applicationNo})`}
        toFormValues={(r) => ({
          applicationNo: r.applicationNo,
          firstName: r.firstName,
          lastName: r.lastName,
          status: r.status === 'enrolled' ? 'accepted' : r.status,
          gradeLevelId: r.gradeLevelId ?? '',
          gender: r.gender ?? '',
          dateOfBirth: r.dateOfBirth ?? '',
          appliedDate: r.appliedDate ?? '',
          previousSchool: r.previousSchool ?? '',
          guardianName: r.guardianName ?? '',
          guardianPhone: r.guardianPhone ?? '',
          guardianEmail: r.guardianEmail ?? '',
          email: r.email ?? '',
          phone: r.phone ?? '',
          decisionNote: r.decisionNote ?? '',
        })}
        extraActions={(row) =>
          canManage && row.status === 'accepted' && !row.enrolledStudentId ? (
            <button
              type="button"
              aria-label="Enrol applicant"
              title="Enrol"
              onClick={() => setEnrolFor(row)}
              className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
            >
              <UserPlus className="h-4 w-4" />
            </button>
          ) : null
        }
      />

      <AdmissionEnrolDrawer application={enrolFor} open={!!enrolFor} onClose={() => setEnrolFor(null)} />
    </>
  );
}
