'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { AssignmentSubmissionsPanel } from '@/components/assignments/assignment-submissions-panel';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useTeachingStaffOptions } from '@/lib/people';
import { useAssignmentsList, useAssignmentsMutations } from '@/lib/assignments';
import type { AssignmentRow } from '@/lib/assignments-types';
import { useTerm } from '@/lib/term';

const PERMISSIONS: ResourcePermissions = {
  view: 'assignments.view',
  create: 'assignments.manage',
  update: 'assignments.manage',
  delete: 'assignments.manage',
};

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'published', label: 'Published' },
  { value: 'closed', label: 'Closed' },
];
const label = (v: string) => STATUSES.find((o) => o.value === v)?.label ?? v;

export default function AssignmentsPage() {
  const { t } = useTerm();
  const { data: classes } = useClassOptions();
  const { data: subjects } = useSubjectOptions();
  const { data: teachers } = useTeachingStaffOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Chapter 3 Worksheet' },
      {
        name: 'classId',
        label: t('class'),
        type: 'select',
        required: true,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      {
        name: 'subjectId',
        label: t('subject'),
        type: 'select',
        nullable: true,
        options: (subjects?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
      },
      {
        name: 'teacherId',
        label: t('teacher'),
        type: 'select',
        nullable: true,
        options: (teachers ?? []).map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName}` })),
      },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      { name: 'dueDate', label: 'Due date', type: 'date', nullable: true },
      { name: 'maxPoints', label: 'Max points', type: 'number', required: true, min: 1 },
      { name: 'instructions', label: 'Instructions', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [classes, subjects, teachers, t],
  );

  const columns = useMemo<Column<AssignmentRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'className', header: t('class'), render: (r) => r.className ?? '—' },
      { key: 'subjectName', header: t('subject'), render: (r) => <span className="text-text-muted">{r.subjectName ?? '—'}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(r.status) },
      { key: 'dueDate', header: 'Due', sortable: true, render: (r) => <span className="tabular-nums">{r.dueDate ?? '—'}</span> },
      {
        key: 'submissionCount',
        header: 'Submissions',
        align: 'right',
        render: (r) => (
          <span className="tabular-nums">
            {r.submissionCount === 0 ? '—' : `${r.gradedCount}/${r.submissionCount} graded`}
          </span>
        ),
      },
    ],
    [t],
  );

  return (
    <ResourceManager<AssignmentRow>
      resource="assignments"
      title="Assignments"
      noun="assignment"
      columns={columns}
      fields={fields}
      defaultSortBy="dueDate"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useAssignmentsList}
      useMutations={useAssignmentsMutations}
      rowLabel={(r) => r.title}
      renderDetailExtra={({ row }) => (
        <AssignmentSubmissionsPanel
          assignmentId={row.id}
          classId={row.classId}
          title={row.title}
          className={row.className}
          maxPoints={row.maxPoints}
        />
      )}
      toFormValues={(r) => ({
        title: r.title,
        classId: r.classId,
        subjectId: r.subjectId ?? '',
        teacherId: r.teacherId ?? '',
        status: r.status,
        dueDate: r.dueDate ?? '',
        maxPoints: r.maxPoints,
        instructions: r.instructions ?? '',
      })}
    />
  );
}
