'use client';
import { useMemo } from 'react';
import { StatusBadge, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager, type FilterDef, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { AdmissionWorkflowPanel } from '@/components/admissions/admission-workflow-panel';
import { useAcademicYearOptions, useGradeLevelOptions } from '@/lib/academics';
import { usePermissions } from '@/lib/permissions';
import { useAdmissionsList, useAdmissionsMutations, type AdmissionRow } from '@/lib/admissions';
import { formatPersonName } from '@/lib/person-name';
import { useTerm } from '@/lib/term';

const PERMISSIONS: ResourcePermissions = {
  view: 'admissions.view',
  create: 'admissions.manage',
  update: 'admissions.manage',
  delete: 'admissions.manage',
};

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under review' },
  { value: 'info_requested', label: 'Info requested' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'waitlisted', label: 'Waitlisted' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

/** How an application entered the system — a small colour-coded badge in the list. */
function SubmittedViaBadge({ via }: { via: AdmissionRow['submittedVia'] }) {
  const portal = via === 'portal';
  return (
    <span
      className={
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ' +
        (portal ? 'bg-primary/10 text-primary' : 'bg-background-secondary text-text-secondary')
      }
    >
      {portal ? 'Portal' : 'Staff'}
    </span>
  );
}

export default function AdmissionsPage() {
  const { t, tp } = useTerm();
  const { data: grades } = useGradeLevelOptions();
  const { data: years } = useAcademicYearOptions();
  const { can } = usePermissions();
  const canManage = can('admissions.manage');

  const yearOptions = useMemo(() => (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })), [years]);
  const gradeOptions = useMemo(() => (grades?.items ?? []).map((g) => ({ value: g.id, label: g.name })), [grades]);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'applicationNo', label: 'Application no.', type: 'text', required: true, placeholder: 'e.g. APP-2026-001' },
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'middleName', label: 'Middle name', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUS_OPTIONS },
      { name: 'gradeLevelId', label: `Applying for ${t('gradeLevel')}`, type: 'select', nullable: true, options: gradeOptions },
      { name: 'academicYearId', label: t('academicYear'), type: 'select', nullable: true, options: yearOptions },
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
      { name: 'guardianPhone', label: 'Guardian phone', type: 'phone', nullable: true },
      { name: 'guardianEmail', label: 'Guardian email', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'email', label: 'Applicant email', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'phone', label: 'Applicant phone', type: 'phone', nullable: true },
      { name: 'decisionNote', label: 'Decision note', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [gradeOptions, yearOptions, t],
  );

  const columns = useMemo<Column<AdmissionRow>[]>(
    () => [
      { key: 'applicationNo', header: 'Application', sortable: true, render: (r) => <span className="font-mono text-text-secondary">{r.applicationNo}</span> },
      { key: 'lastName', header: 'Applicant', sortable: true, render: (r) => <span className="font-medium">{formatPersonName(r)}</span> },
      { key: 'gradeLevelName', header: t('gradeLevel'), render: (r) => r.gradeLevelName ?? '—' },
      { key: 'academicYearName', header: t('academicYear'), render: (r) => r.academicYearName ?? '—' },
      { key: 'submittedVia', header: 'Source', render: (r) => <SubmittedViaBadge via={r.submittedVia} /> },
      { key: 'appliedDate', header: 'Applied', sortable: true, render: (r) => <span className="tabular-nums text-text-muted">{r.appliedDate ?? '—'}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [t],
  );

  const filters = useMemo<FilterDef[]>(
    () => [
      { key: 'status', label: 'All statuses', options: STATUS_OPTIONS },
      {
        key: 'submittedVia',
        label: 'All sources',
        options: [
          { value: 'portal', label: 'Portal' },
          { value: 'staff', label: 'Staff' },
        ],
      },
    ],
    [],
  );

  const detail = useMemo(
    () =>
      (r: AdmissionRow): DetailSection[] => [
        {
          title: 'Applicant',
          fields: [
            { label: 'Name', value: formatPersonName(r) },
            { label: 'Application no.', value: r.applicationNo },
            { label: 'Status', value: <StatusBadge status={r.status} /> },
            { label: 'Source', value: <SubmittedViaBadge via={r.submittedVia} /> },
            { label: t('gradeLevel'), value: r.gradeLevelName ?? '—' },
            { label: t('academicYear'), value: r.academicYearName ?? '—' },
            { label: 'Gender', value: r.gender ?? '—' },
            { label: 'Date of birth', value: r.dateOfBirth ?? '—' },
            { label: 'Previous school', value: r.previousSchool ?? '—' },
          ],
        },
        {
          title: 'Contact',
          fields: [
            { label: 'Applicant email', value: r.email ?? '—' },
            { label: 'Applicant phone', value: r.phone ?? '—' },
          ],
        },
        {
          title: 'Guardian',
          fields: [
            { label: 'Name', value: r.guardianName ?? '—' },
            { label: 'Email', value: r.guardianEmail ?? '—' },
            { label: 'Phone', value: r.guardianPhone ?? '—' },
          ],
        },
        ...(r.additionalInfo && Object.values(r.additionalInfo).some(Boolean)
          ? [
              {
                title: 'Health & additional info',
                fields: [
                  { label: 'Blood group', value: r.additionalInfo.bloodGroup === 'unknown' ? 'Not known' : r.additionalInfo.bloodGroup || '—' },
                  {
                    label: 'Emergency contact',
                    value: [r.additionalInfo.emergencyContactName, r.additionalInfo.emergencyContactPhone].filter(Boolean).join(' · ') || '—',
                  },
                  { label: 'Medical conditions', value: r.additionalInfo.medicalConditions ?? '—', full: true },
                  { label: 'Allergies', value: r.additionalInfo.allergies ?? '—', full: true },
                  { label: 'Medications', value: r.additionalInfo.medications ?? '—', full: true },
                  { label: 'Special needs', value: r.additionalInfo.specialNeeds ?? '—', full: true },
                  { label: 'Notes', value: r.additionalInfo.notes ?? '—', full: true },
                ],
              },
            ]
          : []),
        {
          title: 'Application',
          fields: [
            { label: 'Applied', value: r.appliedDate ?? '—' },
            { label: 'Decision date', value: r.decisionDate ?? '—' },
            { label: 'Decision note', value: r.decisionNote ?? '—', full: true },
          ],
        },
      ],
    [t],
  );

  return (
    <ResourceManager<AdmissionRow>
      resource="admissions"
      title={tp('admission')}
      noun={t('admission').toLowerCase()}
      columns={columns}
      fields={fields}
      filters={filters}
      detail={detail}
      defaultSortBy="appliedDate"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useAdmissionsList}
      useMutations={useAdmissionsMutations}
      rowLabel={(r) => `${formatPersonName(r)} (${r.applicationNo})`}
      renderDetailExtra={canManage ? ({ row }) => <AdmissionWorkflowPanel application={row} /> : undefined}
      toFormValues={(r) => ({
        applicationNo: r.applicationNo,
        firstName: r.firstName,
        middleName: r.middleName ?? '',
        lastName: r.lastName,
        status: r.status === 'enrolled' ? 'accepted' : r.status,
        gradeLevelId: r.gradeLevelId ?? '',
        academicYearId: r.academicYearId ?? '',
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
    />
  );
}
