'use client';
import { useMemo } from 'react';
import { StatusBadge, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { EntityRef } from '@/components/common/entity-ref';
import { StudentCardHeader, studentContextFields } from '@/components/common/student-card';
import { usePermissions } from '@/lib/permissions';
import { useHealthList, useHealthMutations } from '@/lib/staff-modules';
import { useStudentDirectory, studentOptions } from '@/lib/directory';
import type { HealthRecordRow } from '@/lib/staff-modules-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'health_records.view',
  create: 'health_records.create',
  update: 'health_records.update',
  delete: 'health_records.update',
};

const RECORD_TYPES = [
  { value: 'visit', label: 'Nurse visit' },
  { value: 'allergy', label: 'Allergy' },
  { value: 'condition', label: 'Condition' },
  { value: 'vaccination', label: 'Vaccination' },
  { value: 'note', label: 'Note' },
];
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'archived', label: 'Archived' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function HealthRecordsPage() {
  const { can } = usePermissions();
  const { data: students } = useStudentDirectory(can('student_basic_profile.view'));
  const studentOpts = useMemo(() => studentOptions(students?.items), [students]);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Fever & headache' },
      {
        name: 'studentId',
        label: 'Student',
        type: 'combobox',
        nullable: true,
        options: studentOpts,
        placeholder: 'Search a student…',
        searchPlaceholder: 'Search by name or admission no…',
        emptyText: 'No matching students',
      },
      { name: 'recordType', label: 'Type', type: 'select', required: true, options: RECORD_TYPES },
      { name: 'reason', label: 'Reason for visit', type: 'text', nullable: true, placeholder: 'e.g. Complained of stomach ache' },
      { name: 'symptoms', label: 'Symptoms / complaint', type: 'textarea', nullable: true },
      { name: 'actionTaken', label: 'Action taken', type: 'textarea', nullable: true },
      { name: 'treatment', label: 'Medication / treatment given', type: 'textarea', nullable: true },
      { name: 'attendedBy', label: 'Attended by', type: 'text', nullable: true, placeholder: 'e.g. Nurse Usha' },
      { name: 'bloodGroup', label: 'Blood group', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'details', label: 'Additional details', type: 'textarea', nullable: true },
      { name: 'followUpRequired', label: 'Follow-up required', type: 'checkbox' },
      { name: 'followUpAt', label: 'Follow-up on', type: 'date', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      { name: 'recordedAt', label: 'Recorded on', type: 'date', nullable: true },
    ],
    [studentOpts],
  );

  const columns = useMemo<Column<HealthRecordRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'student', header: 'Student', render: (r) => <EntityRef entity={r.student} /> },
      { key: 'recordType', header: 'Type', render: (r) => label(RECORD_TYPES, r.recordType) },
      { key: 'recordedAt', header: 'Recorded', sortable: true, render: (r) => r.recordedAt ?? '—' },
      {
        key: 'followUp',
        header: 'Follow-up',
        render: (r) => (r.followUpRequired ? <StatusBadge status={r.followUpAt ?? 'required'} /> : '—'),
      },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [],
  );

  const detail = (r: HealthRecordRow): DetailSection[] => [
    { title: 'Student', fields: studentContextFields(r.student) },
    {
      title: 'Record',
      fields: [
        { label: 'Title', value: r.title },
        { label: 'Type', value: label(RECORD_TYPES, r.recordType) },
        { label: 'Reason', value: r.reason, full: true },
        { label: 'Symptoms', value: r.symptoms, full: true },
        { label: 'Action taken', value: r.actionTaken, full: true },
        { label: 'Treatment', value: r.treatment, full: true },
        { label: 'Attended by', value: r.attendedBy },
        { label: 'Blood group', value: r.bloodGroup },
        { label: 'Recorded on', value: r.recordedAt },
        { label: 'Status', value: <StatusBadge status={r.status} /> },
        { label: 'Follow-up required', value: r.followUpRequired ? 'Yes' : 'No' },
        { label: 'Follow-up on', value: r.followUpAt },
        { label: 'Additional details', value: r.details, full: true },
      ],
    },
  ];

  return (
    <ResourceManager<HealthRecordRow>
      resource="health/records"
      title="Health Records"
      noun="health record"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useHealthList}
      useMutations={useHealthMutations}
      rowLabel={(r) => r.title}
      detail={detail}
      detailHeader={(r) => <StudentCardHeader student={r.student} />}
      toFormValues={(r) => ({
        title: r.title,
        studentId: r.studentId ?? '',
        recordType: r.recordType,
        reason: r.reason ?? '',
        symptoms: r.symptoms ?? '',
        actionTaken: r.actionTaken ?? '',
        treatment: r.treatment ?? '',
        attendedBy: r.attendedBy ?? '',
        bloodGroup: r.bloodGroup ?? '',
        details: r.details ?? '',
        followUpRequired: r.followUpRequired,
        followUpAt: r.followUpAt ?? '',
        status: r.status,
        recordedAt: r.recordedAt ?? '',
      })}
    />
  );
}
