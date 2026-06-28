'use client';
import { useMemo, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { ExamSchedulesDrawer } from '@/components/exams/exam-schedules-drawer';
import { useAcademicYearOptions } from '@/lib/academics';
import { useExamsList, useExamsMutations } from '@/lib/exams';
import type { ExamRow } from '@/lib/exams-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'exams.view',
  create: 'exams.manage',
  update: 'exams.manage',
  delete: 'exams.manage',
};

const EXAM_TYPES = [
  { value: 'term', label: 'Term' },
  { value: 'midterm', label: 'Midterm' },
  { value: 'final', label: 'Final' },
  { value: 'unit_test', label: 'Unit test' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'practical', label: 'Practical' },
  { value: 'mock', label: 'Mock' },
];
const STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'completed', label: 'Completed' },
  { value: 'published', label: 'Published' },
  { value: 'cancelled', label: 'Cancelled' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function ExamsPage() {
  const { data: years } = useAcademicYearOptions();
  const [schedulesFor, setSchedulesFor] = useState<ExamRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Term 1 Finals' },
      { name: 'examType', label: 'Type', type: 'select', required: true, options: EXAM_TYPES },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
      { name: 'termLabel', label: 'Term', type: 'text', nullable: true, placeholder: 'e.g. Term 1' },
      {
        name: 'academicYearId',
        label: 'Academic year',
        type: 'select',
        nullable: true,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      { name: 'startDate', label: 'Start date', type: 'date', nullable: true },
      { name: 'endDate', label: 'End date', type: 'date', nullable: true },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [years],
  );

  const columns = useMemo<Column<ExamRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'examType', header: 'Type', sortable: true, render: (r) => <span className="text-text-muted">{label(EXAM_TYPES, r.examType)}</span> },
      { key: 'termLabel', header: 'Term', render: (r) => r.termLabel ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
      { key: 'startDate', header: 'Starts', sortable: true, render: (r) => <span className="tabular-nums">{r.startDate ?? '—'}</span> },
      {
        key: 'scheduleCount',
        header: 'Papers',
        align: 'right',
        render: (r) => <span className="tabular-nums">{r.scheduleCount || '—'}</span>,
      },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<ExamRow>
        resource="exams"
        title="Exams"
        noun="exam"
        columns={columns}
        fields={fields}
        defaultSortBy="startDate"
        defaultSortDir="desc"
        permissions={PERMISSIONS}
        useList={useExamsList}
        useMutations={useExamsMutations}
        rowLabel={(r) => r.name}
        toFormValues={(r) => ({
          name: r.name,
          examType: r.examType,
          status: r.status,
          termLabel: r.termLabel ?? '',
          academicYearId: r.academicYearId ?? '',
          startDate: r.startDate ?? '',
          endDate: r.endDate ?? '',
          description: r.description ?? '',
        })}
        extraActions={(row) => (
          <button
            type="button"
            aria-label="Exam papers"
            title="Exam papers"
            onClick={() => setSchedulesFor(row)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <CalendarClock className="h-4 w-4" />
          </button>
        )}
      />

      <ExamSchedulesDrawer exam={schedulesFor} open={!!schedulesFor} onClose={() => setSchedulesFor(null)} />
    </>
  );
}
