'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useCounselingList, useCounselingMutations } from '@/lib/staff-modules';
import type { CounselingCaseRow } from '@/lib/staff-modules-types';

const KEY = 'counseling_cases.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'closed', label: 'Closed' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function CounselingCasesPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Attendance support' },
      { name: 'studentId', label: 'Student ID', type: 'text', nullable: true, placeholder: 'Optional (UUID)' },
      { name: 'priority', label: 'Priority', type: 'select', required: true, options: PRIORITIES },
      { name: 'summary', label: 'Summary', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<CounselingCaseRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'priority', header: 'Priority', sortable: true, render: (r) => label(PRIORITIES, r.priority) },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<CounselingCaseRow>
      resource="counseling/cases"
      title="Counseling Cases"
      noun="case"
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
        studentId: r.studentId ?? '',
        priority: r.priority,
        summary: r.summary ?? '',
        status: r.status,
      })}
    />
  );
}
