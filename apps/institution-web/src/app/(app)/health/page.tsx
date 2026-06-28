'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useHealthList, useHealthMutations } from '@/lib/staff-modules';
import type { HealthRecordRow } from '@/lib/staff-modules-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'health_records.view',
  create: 'health_records.create',
  update: 'health_records.update',
  delete: 'health_records.update',
};

const RECORD_TYPES = [
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
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Peanut allergy' },
      { name: 'recordType', label: 'Type', type: 'select', required: true, options: RECORD_TYPES },
      { name: 'studentId', label: 'Student ID', type: 'text', nullable: true, placeholder: 'Optional (UUID)' },
      { name: 'bloodGroup', label: 'Blood group', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'details', label: 'Details', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      { name: 'recordedAt', label: 'Recorded on', type: 'date', nullable: true },
    ],
    [],
  );

  const columns = useMemo<Column<HealthRecordRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'recordType', header: 'Type', render: (r) => label(RECORD_TYPES, r.recordType) },
      { key: 'bloodGroup', header: 'Blood group', render: (r) => r.bloodGroup ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

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
      toFormValues={(r) => ({
        title: r.title,
        recordType: r.recordType,
        studentId: r.studentId ?? '',
        bloodGroup: r.bloodGroup ?? '',
        details: r.details ?? '',
        status: r.status,
        recordedAt: r.recordedAt ?? '',
      })}
    />
  );
}
