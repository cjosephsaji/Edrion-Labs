'use client';
import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { AssignmentSubmissionsDrawer } from '@/components/assignments/assignment-submissions-drawer';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useTeacherOptions } from '@/lib/people';
import { useAssignmentsList, useAssignmentsMutations } from '@/lib/assignments';
import type { AssignmentRow } from '@/lib/assignments-types';

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
  const { data: classes } = useClassOptions();
  const { data: subjects } = useSubjectOptions();
  const { data: teachers } = useTeacherOptions();
  const [submissionsFor, setSubmissionsFor] = useState<AssignmentRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Chapter 3 Worksheet' },
      {
        name: 'classId',
        label: 'Class',
        type: 'select',
        required: true,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      {
        name: 'subjectId',
        label: 'Subject',
        type: 'select',
        nullable: true,
        options: (subjects?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
      },
      {
        name: 'teacherId',
        label: 'Teacher',
        type: 'select',
        nullable: true,
        options: (teachers?.items ?? []).map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName}` })),
      },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      { name: 'dueDate', label: 'Due date', type: 'date', nullable: true },
      { name: 'maxPoints', label: 'Max points', type: 'number', required: true, min: 1 },
      { name: 'instructions', label: 'Instructions', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [classes, subjects, teachers],
  );

  const columns = useMemo<Column<AssignmentRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'className', header: 'Class', render: (r) => r.className ?? '—' },
      { key: 'subjectName', header: 'Subject', render: (r) => <span className="text-text-muted">{r.subjectName ?? '—'}</span> },
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
    [],
  );

  return (
    <>
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
        extraActions={(row) => (
          <button
            type="button"
            aria-label="Submissions"
            title="Submissions"
            onClick={() => setSubmissionsFor(row)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <ClipboardCheck className="h-4 w-4" />
          </button>
        )}
      />

      <AssignmentSubmissionsDrawer assignment={submissionsFor} open={!!submissionsFor} onClose={() => setSubmissionsFor(null)} />
    </>
  );
}
