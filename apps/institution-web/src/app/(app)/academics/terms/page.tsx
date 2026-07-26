'use client';
import { useMemo } from 'react';
import { Badge, StatusBadge, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager, type FilterDef } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import type { AcademicTermRow } from '@/lib/academics-types';
import {
  useAcademicYearOptions,
  useDepartmentOptions,
  useGradeLevelOptions,
  useProgrammeLevelSelectOptions,
} from '@/lib/academics';
import { useTerm } from '@/lib/term';

const STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

/** Slot numbers offered by the cross-department facet. Matches the 1–20 range the API accepts. */
const SEQUENCE_CHOICES = [1, 2, 3, 4, 5, 6, 7, 8];

/** Institution types whose terms run institution-wide rather than per department. */
const INSTITUTION_WIDE_TERM_TYPES = ['school', 'training_center'];

export default function AcademicTermsPage() {
  const { t, tp, type } = useTerm();
  const { data: years } = useAcademicYearOptions();
  const { data: departments } = useDepartmentOptions();
  const { data: gradeLevels } = useGradeLevelOptions();
  const { options: levelOptions } = useProgrammeLevelSelectOptions();

  /** School/training terms span the whole institution, so they are never placed in a programme. */
  const termsAreInstitutionWide = INSTITUTION_WIDE_TERM_TYPES.includes(type);

  /**
   * Year facet keyed on the level *number*, not the row id. Each department owns a separate "Year 2"
   * row, so the ids differ while the number is shared — the number is what crosses departments.
   */
  const gradeLevelNumberOptions = useMemo(() => {
    const byNumber = new Map<number, string>();
    for (const g of gradeLevels?.items ?? []) if (!byNumber.has(g.level)) byNumber.set(g.level, g.name);
    return [...byNumber.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, name]) => ({ value: String(level), label: name }));
  }, [gradeLevels]);

  const filters = useMemo<FilterDef[]>(
    () => [
      { key: 'status', label: 'All statuses', options: STATUS_OPTIONS },
      {
        // Every department's "Semester N" shares this slot number, so picking one here and leaving
        // the department facet on "All" is what shows semester N across all departments at once.
        key: 'semesterSequence',
        label: `All ${tp('term').toLowerCase()}`,
        options: SEQUENCE_CHOICES.map((n) => ({ value: String(n), label: `${t('term')} ${n}` })),
      },
      {
        // Pairs with the slot facet above: `sequence` counts within a year, so "semester 5" of an
        // 8-semester programme is this facet on year 3 plus the slot facet on 1.
        key: 'gradeLevelNumber',
        label: `All ${tp('gradeLevel').toLowerCase()}`,
        options: gradeLevelNumberOptions,
      },
      {
        key: 'departmentId',
        label: `All ${tp('department')}`,
        options: (departments?.items ?? []).map((d) => ({ value: d.id, label: d.name })),
      },
      // Pins one department's year, so it is the opposite of the cross-department view; only useful
      // where terms are actually placed per programme.
      ...(termsAreInstitutionWide
        ? []
        : [
            {
              key: 'programmeLevelId',
              label: `All ${t('department').toLowerCase()} ${tp('gradeLevel').toLowerCase()}`,
              options: levelOptions,
            },
          ]),
      {
        key: 'academicYearId',
        label: `All ${tp('academicYear')}`,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      {
        key: 'isCurrent',
        label: 'Current term',
        options: [{ value: 'true', label: 'Current only' }],
      },
    ],
    [years, departments, levelOptions, gradeLevelNumberOptions, termsAreInstitutionWide, t, tp],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      ...(termsAreInstitutionWide
        ? []
        : [
            {
              name: 'programmeLevelId',
              label: `${t('department')} and ${t('gradeLevel').toLowerCase()}`,
              type: 'select',
              nullable: true,
              options: levelOptions,
              help: `Which ${t('gradeLevel').toLowerCase()} of which ${t('department').toLowerCase()} this ${t('term').toLowerCase()} belongs to. Leave empty and it won’t appear in the programme structure.`,
            } satisfies FieldDef,
          ]),
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
        help: `Position within the ${t('gradeLevel').toLowerCase()} (1 = first). Subjects are placed against this number, so it decides which curriculum this ${t('term').toLowerCase()} inherits — and it is what lines this ${t('term').toLowerCase()} up with the same ${t('term').toLowerCase()} in every other ${t('department').toLowerCase()}.`,
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
    [years, levelOptions, t, termsAreInstitutionWide],
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
        sortable: true,
        render: (r) =>
          r.departmentName ? (
            <span>{r.departmentName}</span>
          ) : termsAreInstitutionWide ? (
            // Institution-wide is the correct shape for a school, not something to warn about.
            <span className="text-text-muted">All {tp('department').toLowerCase()}</span>
          ) : (
            <Badge tone="warning">Unplaced</Badge>
          ),
      },
      {
        key: 'gradeLevelNumber',
        header: t('gradeLevel'),
        sortable: true,
        render: (r) => <span className="text-text-muted">{r.gradeLevelName ?? '—'}</span>,
      },
      { key: 'sequence', header: 'Seq.', sortable: true },
      { key: 'academicYearName', header: t('academicYear'), render: (r) => <span className="text-text-muted">{r.academicYearName ?? '—'}</span> },
      { key: 'subjectCount', header: tp('subject'), align: 'right', render: (r) => <span className="tabular-nums">{r.subjectCount ?? 0}</span> },
      { key: 'classCount', header: tp('class'), align: 'right', render: (r) => <span className="tabular-nums">{r.classCount ?? 0}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [t, tp, termsAreInstitutionWide],
  );

  const detail = useMemo(
    () =>
      (r: AcademicTermRow): DetailSection[] => [
        {
          title: 'Where it sits',
          fields: [
            {
              label: t('department'),
              value:
                r.departmentName ??
                (termsAreInstitutionWide
                  ? `All ${tp('department').toLowerCase()}`
                  : 'Not placed in a programme'),
            },
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
    [t, tp, termsAreInstitutionWide],
  );

  return (
    <ResourceManager<AcademicTermRow>
      resource="academic-terms"
      title={tp('term')}
      noun={t('term').toLowerCase()}
      columns={columns}
      fields={fields}
      filters={filters}
      detail={detail}
      defaultSortBy="gradeLevelNumber"
      createInitialValues={{ status: 'active' }}
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
