'use client';
import { useMemo } from 'react';
import { Badge, StatusBadge, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager, type FilterDef } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import type { AcademicTermRow } from '@/lib/academics-types';
import { useAcademicYearOptions, useDepartmentOptions, useProgrammeLevelSelectOptions } from '@/lib/academics';
import { useAcademicContextFilters } from '@/lib/academic-context';
import { useTerm } from '@/lib/term';

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

export default function AcademicTermsPage() {
  const { t, tp } = useTerm();
  const { data: years } = useAcademicYearOptions();
  const { data: departments } = useDepartmentOptions();
  const { options: levelOptions } = useProgrammeLevelSelectOptions();
  const contextFilters = useAcademicContextFilters();

  const filters = useMemo<FilterDef[]>(
    () => [
      { key: 'status', label: 'All statuses', options: STATUS_OPTIONS },
      {
        key: 'departmentId',
        label: `All ${t('department').toLowerCase()}s`,
        options: (departments?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
      },
      {
        key: 'programmeLevelId',
        label: `All ${t('gradeLevel').toLowerCase()}s`,
        options: levelOptions,
      },
      {
        key: 'academicYearId',
        label: `All ${t('academicYear').toLowerCase()}s`,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      {
        key: 'isCurrent',
        label: 'Current term',
        options: [{ value: 'true', label: 'Current only' }],
      },
    ],
    [years, departments, levelOptions, t],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      {
        name: 'programmeLevelId',
        label: `${t('department')} and ${t('gradeLevel').toLowerCase()}`,
        type: 'select',
        nullable: true,
        options: levelOptions,
        help: `Which ${t('gradeLevel').toLowerCase()} of which ${t('department').toLowerCase()} this ${t('term').toLowerCase()} belongs to. Leave empty and it won’t appear in the programme structure.`,
      },
      {
        name: 'academicYearId',
        label: t('academicYear'),
        type: 'select',
        required: true,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: `e.g. ${t('term')} 1` },
      {
        name: 'kind',
        label: 'Kind',
        type: 'select',
        required: true,
        options: [
          { value: 'term', label: 'Term' },
          { value: 'semester', label: 'Semester' },
          { value: 'trimester', label: 'Trimester' },
          { value: 'quarter', label: 'Quarter' },
        ],
      },
      {
        name: 'sequence',
        label: 'Sequence',
        type: 'number',
        required: true,
        placeholder: '1',
        help: `Position within the ${t('gradeLevel').toLowerCase()} (1 = first). Subjects are placed against this number, so it decides which curriculum this ${t('term').toLowerCase()} inherits.`,
      },
      { name: 'startDate', label: 'Start date', type: 'date', required: true },
      { name: 'endDate', label: 'End date', type: 'date', required: true },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: STATUS_OPTIONS,
      },
      { name: 'isCurrent', label: `Mark as the current ${t('term').toLowerCase()}`, type: 'checkbox' },
    ],
    [years, levelOptions, t],
  );

  const columns: Column<AcademicTermRow>[] = useMemo(
    () => [
      {
        key: 'name',
        header: 'Name',
        sortable: true,
        render: (r) => (
          <span className="flex items-center gap-2">
            <span className="font-medium">{r.name}</span>
            {r.isCurrent && <Badge tone="primary">Current</Badge>}
          </span>
        ),
      },
      {
        key: 'departmentName',
        header: t('department'),
        render: (r) =>
          r.departmentName ? (
            <span>{r.departmentName}</span>
          ) : (
            <Badge tone="warning">Unplaced</Badge>
          ),
      },
      {
        key: 'gradeLevelName',
        header: t('gradeLevel'),
        render: (r) => <span className="text-text-muted">{r.gradeLevelName ?? '—'}</span>,
      },
      { key: 'sequence', header: 'Seq.', sortable: true },
      { key: 'academicYearName', header: t('academicYear'), render: (r) => <span className="text-text-muted">{r.academicYearName ?? '—'}</span> },
      { key: 'subjectCount', header: tp('subject'), align: 'right', render: (r) => <span className="tabular-nums">{r.subjectCount ?? 0}</span> },
      { key: 'classCount', header: tp('class'), align: 'right', render: (r) => <span className="tabular-nums">{r.classCount ?? 0}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [t, tp],
  );

  const detail = useMemo(
    () =>
      (r: AcademicTermRow): DetailSection[] => [
        {
          title: 'Where it sits',
          fields: [
            { label: t('department'), value: r.departmentName ?? 'Not placed in a programme' },
            { label: t('gradeLevel'), value: r.gradeLevelName ?? '—' },
            { label: 'Sequence', value: r.sequence },
            { label: t('academicYear'), value: r.academicYearName ?? '—' },
          ],
        },
        {
          title: 'Detail',
          fields: [
            { label: 'Name', value: r.name },
            { label: 'Kind', value: r.kind },
            { label: 'Starts', value: r.startDate },
            { label: 'Ends', value: r.endDate },
            { label: `Curriculum ${tp('subject').toLowerCase()}`, value: r.subjectCount ?? 0 },
            { label: tp('class'), value: r.classCount ?? 0 },
          ],
        },
      ],
    [t, tp],
  );

  return (
    <ResourceManager<AcademicTermRow>
      resource="academic-terms"
      title={tp('term')}
      noun={t('term').toLowerCase()}
      columns={columns}
      fields={fields}
      filters={filters}
      extraFilters={contextFilters}
      detail={detail}
      defaultSortBy="sequence"
      toFormValues={(r) => ({
        programmeLevelId: r.programmeLevelId ?? '',
        academicYearId: r.academicYearId,
        name: r.name,
        kind: r.kind,
        sequence: String(r.sequence),
        startDate: r.startDate,
        endDate: r.endDate,
        status: r.status,
        isCurrent: r.isCurrent,
      })}
    />
  );
}
