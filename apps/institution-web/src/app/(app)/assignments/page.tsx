'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { AssignmentQuestionEditor } from '@/components/assignments/assignment-question-editor';
import { AssignmentSubmissionsPanel } from '@/components/assignments/assignment-submissions-panel';
import { RecipientPicker } from '@/components/recipients/recipient-picker';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useTeachingStaffOptions, teachingStaffSelectOptions } from '@/lib/people';
import { useAssignmentsList, useAssignmentsMutations } from '@/lib/assignments';
import type { AssignmentRow } from '@/lib/assignments-types';
import type { Target } from '@/lib/recipients';
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
const DELIVERY_MODES = [
  { value: 'file', label: 'File submission' },
  { value: 'quiz', label: 'Online quiz' },
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
        options: teachingStaffSelectOptions(teachers),
      },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      {
        name: 'deliveryMode',
        label: 'Delivery mode',
        type: 'select',
        required: true,
        options: DELIVERY_MODES,
      },
      { name: 'dueDate', label: 'Due date', type: 'date', nullable: true },
      { name: 'durationMin', label: 'Duration (minutes)', type: 'number', nullable: true, min: 1, placeholder: 'Optional timed attempt' },
      {
        name: 'audience',
        label: 'Student audience',
        type: 'custom',
        render: (value, onChange) => (
          <RecipientPicker value={(value as Target[]) ?? []} onChange={onChange} studentsOnly />
        ),
        help: 'Defaults to the selected class when left empty.',
      },
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
      {
        key: 'deliveryMode',
        header: 'Mode',
        render: (r) => DELIVERY_MODES.find((o) => o.value === r.deliveryMode)?.label ?? r.deliveryMode,
      },
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
      renderFormExtra={({ row }) =>
        row.deliveryMode === 'quiz' ? (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-text-primary">Quiz questions</h3>
            <p className="text-xs text-text-muted">Questions for {row.title}.</p>
            <AssignmentQuestionEditor assignmentId={row.id} />
          </div>
        ) : null
      }
      toFormValues={(r) => ({
        title: r.title,
        classId: r.classId,
        subjectId: r.subjectId ?? '',
        teacherId: r.teacherId ?? '',
        status: r.status,
        deliveryMode: r.deliveryMode,
        dueDate: r.dueDate ?? '',
        durationMin: r.durationMin ?? '',
        audience: r.audience ?? [],
        maxPoints: r.maxPoints,
        instructions: r.instructions ?? '',
      })}
    />
  );
}
