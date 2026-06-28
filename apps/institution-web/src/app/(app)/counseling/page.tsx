'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useCounselingList, useCounselingMutations } from '@/lib/staff-modules';
import type { CounselingRecordRow } from '@/lib/staff-modules-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'counseling.view',
  create: 'counseling.create',
  update: 'counseling.update',
  delete: 'counseling.update',
};

const SESSION_TYPES = [
  { value: 'individual', label: 'Individual' },
  { value: 'group', label: 'Group' },
  { value: 'family', label: 'Family' },
  { value: 'intake', label: 'Intake' },
];
const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'closed', label: 'Closed' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function CounselingNotesPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Intake session' },
      { name: 'sessionType', label: 'Session type', type: 'select', required: true, options: SESSION_TYPES },
      { name: 'studentId', label: 'Student ID', type: 'text', nullable: true, placeholder: 'Optional (UUID)' },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true, placeholder: 'Confidential notes' },
      { name: 'sessionAt', label: 'Session date', type: 'date', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<CounselingRecordRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'sessionType', header: 'Type', render: (r) => label(SESSION_TYPES, r.sessionType) },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<CounselingRecordRow>
      resource="counseling/records"
      title="Counseling Notes"
      noun="counseling note"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useCounselingList}
      useMutations={useCounselingMutations}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        sessionType: r.sessionType,
        studentId: r.studentId ?? '',
        notes: r.notes ?? '',
        sessionAt: r.sessionAt ? r.sessionAt.slice(0, 10) : '',
        status: r.status,
      })}
    />
  );
}
