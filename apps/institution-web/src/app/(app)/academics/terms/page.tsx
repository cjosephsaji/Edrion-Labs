'use client';
import { useMemo } from 'react';
import { Badge, StatusBadge, type Column } from '@edrion/ui';
import { ResourceManager, type FilterDef } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import type { AcademicTermRow } from '@/lib/academics-types';
import { useAcademicYearOptions } from '@/lib/academics';
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
  const contextFilters = useAcademicContextFilters();

  const filters = useMemo<FilterDef[]>(
    () => [
      { key: 'status', label: 'All statuses', options: STATUS_OPTIONS },
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
    [years, t],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
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
      { name: 'sequence', label: 'Sequence', type: 'number', required: true, placeholder: '1' },
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
    [years, t],
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
      { key: 'academicYearName', header: t('academicYear'), render: (r) => <span className="text-text-muted">{r.academicYearName ?? '—'}</span> },
      { key: 'kind', header: 'Kind', sortable: true, render: (r) => <span className="capitalize text-text-secondary">{r.kind}</span> },
      { key: 'sequence', header: 'Seq.', sortable: true },
      { key: 'startDate', header: 'Starts', sortable: true },
      { key: 'endDate', header: 'Ends' },
      { key: 'classCount', header: 'Classes', align: 'right', render: (r) => <span className="tabular-nums">{r.classCount ?? '—'}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [t],
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
      defaultSortBy="sequence"
      toFormValues={(r) => ({
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
