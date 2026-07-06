'use client';
import { useMemo } from 'react';
import { Button, StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { HomeworkQuestionsField } from '@/components/homework/homework-questions-field';
import { HomeworkSubmissionsPanel } from '@/components/homework/homework-submissions-panel';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import {
  useAssignHomework,
  useCloseHomework,
  useHomeworkList,
  useHomeworkMutations,
} from '@/lib/homework';
import type { HomeworkQuestionInput, HomeworkRow } from '@/lib/homework-types';
import { useTerm } from '@/lib/term';

const PERMISSIONS: ResourcePermissions = {
  view: 'homework.manage',
  create: 'homework.manage',
  update: 'homework.manage',
  delete: 'homework.impossible',
};

const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'assigned', label: 'Assigned' },
  { value: 'closed', label: 'Closed' },
];

const AI_POLICIES = [
  { value: 'off', label: 'Off (default)' },
  { value: 'hints_only', label: 'Hints only' },
  { value: 'full', label: 'Full help' },
];

function dueLabel(iso: string): string {
  return iso.slice(0, 10);
}

export default function HomeworkPage() {
  const { t } = useTerm();
  const { data: classes } = useClassOptions();
  const { data: subjects } = useSubjectOptions();
  const assign = useAssignHomework();
  const close = useCloseHomework();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Chapter 4 exercises' },
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
      { name: 'dueAt', label: 'Due date', type: 'date', required: true },
      { name: 'instructions', label: 'Instructions', type: 'textarea', nullable: true },
      {
        name: 'aiPolicy',
        label: 'Petros on this homework',
        type: 'select',
        required: true,
        options: AI_POLICIES,
      },
      {
        name: 'questions',
        label: 'Questions',
        type: 'custom',
        render: (value, onChange) => (
          <HomeworkQuestionsField
            value={(value as HomeworkQuestionInput[]) ?? [{ promptText: '', maxMarks: 10 }]}
            onChange={onChange}
          />
        ),
      },
    ],
    [classes, subjects, t],
  );

  const createFields = useMemo<FieldDef[]>(
    () => fields.filter((f) => f.name !== 'questions').concat(fields.filter((f) => f.name === 'questions')),
    [fields],
  );

  const columns = useMemo<Column<HomeworkRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'dueAt', header: 'Due', sortable: true, render: (r) => <span className="tabular-nums">{dueLabel(r.dueAt)}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
      { key: 'aiPolicy', header: 'AI policy', render: (r) => <span className="text-text-secondary">{r.aiPolicy.replace('_', ' ')}</span> },
    ],
    [],
  );

  return (
    <ResourceManager<HomeworkRow>
      resource="homework"
      title="Homework"
      noun="homework"
      columns={columns}
      fields={fields.filter((f) => f.name !== 'questions')}
      createFields={createFields}
      defaultSortBy="dueAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useHomeworkList}
      useMutations={useHomeworkMutations}
      filters={[
        { key: 'status', label: 'All statuses', options: STATUSES },
        {
          key: 'classId',
          label: 'All classes',
          options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
        },
      ]}
      rowLabel={(r) => r.title}
      detailActions={({ row }) => (
        <>
          {row.status === 'draft' && (
            <Button size="sm" variant="secondary" onClick={() => void assign.mutateAsync(row.id)} disabled={assign.isPending}>
              Assign to class
            </Button>
          )}
          {row.status === 'assigned' && (
            <Button size="sm" variant="secondary" onClick={() => void close.mutateAsync(row.id)} disabled={close.isPending}>
              Close
            </Button>
          )}
        </>
      )}
      renderDetailExtra={({ row }) => (
        <HomeworkSubmissionsPanel homeworkId={row.id} classId={row.classId} title={row.title} />
      )}
      toFormValues={(r) => ({
        title: r.title,
        classId: r.classId,
        subjectId: r.subjectId ?? '',
        dueAt: dueLabel(r.dueAt),
        instructions: r.instructions ?? '',
        aiPolicy: r.aiPolicy,
      })}
    />
  );
}
