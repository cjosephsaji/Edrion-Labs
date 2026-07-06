'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import {
  useAcademicYearOptions,
  useClassOptions,
  useSubjectOptions,
} from '@/lib/academics';
import { useTeachingStaffOptions } from '@/lib/people';
import { useProgrammeFacetFilters } from '@/lib/programme-facets';
import { useAcademicContextFilters } from '@/lib/academic-context';
import { useTerm } from '@/lib/term';
import { useTimetableList, useTimetableMutations, type TimetableSlotRow } from '@/lib/timetable';

const PERMISSIONS: ResourcePermissions = {
  view: 'timetable.view',
  create: 'timetable.manage',
  update: 'timetable.manage',
  delete: 'timetable.manage',
};

const DAYS = [
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
  { value: '7', label: 'Sunday' },
];
const DAY_LABEL: Record<number, string> = {
  1: 'Monday',
  2: 'Tuesday',
  3: 'Wednesday',
  4: 'Thursday',
  5: 'Friday',
  6: 'Saturday',
  7: 'Sunday',
};

export default function TimetablePage() {
  const { t } = useTerm();
  const facets = useProgrammeFacetFilters();
  const contextFilters = useAcademicContextFilters();
  const { data: classes } = useClassOptions(facets.classFilters);
  const { data: subjects } = useSubjectOptions();
  const { data: teachers } = useTeachingStaffOptions();
  const { data: years } = useAcademicYearOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
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
        options: (teachers ?? []).map((te) => ({ value: te.id, label: `${te.firstName} ${te.lastName}` })),
      },
      { name: 'dayOfWeek', label: 'Day', type: 'select', required: true, options: DAYS },
      { name: 'startTime', label: 'Start (HH:MM)', type: 'text', required: true, placeholder: 'e.g. 09:00' },
      { name: 'endTime', label: 'End (HH:MM)', type: 'text', required: true, placeholder: 'e.g. 09:45' },
      {
        name: 'academicYearId',
        label: t('academicYear'),
        type: 'select',
        nullable: true,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      ...(facets.showFacets
        ? [
            {
              name: 'termId',
              label: t('term'),
              type: 'select' as const,
              nullable: true,
              options: facets.termOptions,
            },
          ]
        : []),
      { name: 'room', label: 'Room', type: 'text', nullable: true, placeholder: 'Optional' },
    ],
    [classes, subjects, teachers, years, facets.showFacets, facets.termOptions, t],
  );

  const columns = useMemo<Column<TimetableSlotRow>[]>(
    () => [
      { key: 'dayOfWeek', header: 'Day', sortable: true, render: (r) => <span className="font-medium">{DAY_LABEL[r.dayOfWeek] ?? r.dayOfWeek}</span> },
      {
        key: 'startTime',
        header: 'Time',
        sortable: true,
        render: (r) => <span className="tabular-nums">{r.startTime}–{r.endTime}</span>,
      },
      { key: 'className', header: t('class'), render: (r) => r.className ?? '—' },
      { key: 'subjectName', header: t('subject'), render: (r) => <span className="text-text-muted">{r.subjectName ?? '—'}</span> },
      { key: 'teacherName', header: t('teacher'), render: (r) => <span className="text-text-muted">{r.teacherName ?? 'Unassigned'}</span> },
      { key: 'room', header: 'Room', render: (r) => r.room ?? '—' },
    ],
    [t],
  );

  return (
    <ResourceManager<TimetableSlotRow>
      resource="timetable"
      title="Timetable"
      noun="slot"
      columns={columns}
      fields={fields}
      filters={facets.showFacets ? facets.filters : undefined}
      filterValues={facets.showFacets ? facets.filterValues : undefined}
      onFilterChange={facets.showFacets ? facets.onFilterChange : undefined}
      extraFilters={contextFilters}
      defaultSortBy="startTime"
      searchable={false}
      permissions={PERMISSIONS}
      useList={useTimetableList}
      useMutations={useTimetableMutations}
      rowLabel={(r) => `${DAY_LABEL[r.dayOfWeek] ?? r.dayOfWeek} ${r.startTime} · ${r.className ?? ''}`.trim()}
      toFormValues={(r) => ({
        classId: r.classId,
        subjectId: r.subjectId ?? '',
        teacherId: r.teacherId ?? '',
        dayOfWeek: String(r.dayOfWeek),
        startTime: r.startTime,
        endTime: r.endTime,
        academicYearId: r.academicYearId ?? '',
        termId: r.termId ?? '',
        room: r.room ?? '',
      })}
    />
  );
}
