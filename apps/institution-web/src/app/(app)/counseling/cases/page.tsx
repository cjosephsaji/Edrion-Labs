'use client';
import { useMemo } from 'react';
import { StatusBadge, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { EntityRef } from '@/components/common/entity-ref';
import { StudentCardHeader, studentContextFields, useStudentContextLabels } from '@/components/common/student-card';
import { usePermissions } from '@/lib/permissions';
import { useCounselingList, useCounselingMutations } from '@/lib/staff-modules';
import { useStudentDirectory, studentOptions } from '@/lib/directory';
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

export default function CounselingCasesPage() {
  const studentLabels = useStudentContextLabels();
  const { can } = usePermissions();
  const { data: students } = useStudentDirectory(can('student_basic_profile.view'));
  const studentOpts = useMemo(() => studentOptions(students?.items), [students]);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Attendance support' },
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
      { name: 'priority', label: 'Priority', type: 'select', required: true, options: PRIORITIES },
      { name: 'summary', label: 'Summary', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [studentOpts],
  );

  const columns = useMemo<Column<CounselingCaseRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'student', header: 'Student', render: (r) => <EntityRef entity={r.student} /> },
      { key: 'priority', header: 'Priority', sortable: true, render: (r) => <StatusBadge status={r.priority} /> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [],
  );

  const detail = (r: CounselingCaseRow): DetailSection[] => [
    { title: 'Student', fields: studentContextFields(r.student, studentLabels) },
    {
      title: 'Case',
      fields: [
        { label: 'Title', value: r.title },
        { label: 'Priority', value: <StatusBadge status={r.priority} /> },
        { label: 'Status', value: <StatusBadge status={r.status} /> },
        { label: 'Summary', value: r.summary, full: true },
      ],
    },
  ];

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
      detail={detail}
      detailHeader={(r) => <StudentCardHeader student={r.student} />}
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
