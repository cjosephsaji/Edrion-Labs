'use client';
import { useMemo } from 'react';
import { type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager } from '@/components/academics/resource-manager';
import { ClassRosterPanel } from '@/components/academics/class-roster-panel';
import { ClassSubjectsPanel } from '@/components/academics/class-subjects-panel';
import type { FieldDef } from '@/components/academics/resource-form';
import type { FilterDef } from '@/components/academics/resource-manager';
import { useAcademicContextFilters } from '@/lib/academic-context';
import { useAcademicYearOptions, useGradeLevelOptions, type ClassRow } from '@/lib/academics';
import { useTeachingStaffOptions } from '@/lib/people';
import { useTerm } from '@/lib/term';

export default function ClassesPage() {
  const { t, tp } = useTerm();
  const contextFilters = useAcademicContextFilters();
  const { data: years } = useAcademicYearOptions();
  const { data: grades } = useGradeLevelOptions();
  const { data: teachers } = useTeachingStaffOptions();

  const teacherOptions = (teachers ?? []).map((t) => ({
    value: t.id,
    label: `${t.firstName} ${t.lastName}`,
  }));

  const filters = useMemo<FilterDef[]>(
    () => [
      {
        key: 'academicYearId',
        label: `All ${t('academicYear').toLowerCase()}s`,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      {
        key: 'gradeLevelId',
        label: `All ${t('gradeLevel').toLowerCase()}s`,
        options: (grades?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
      },
    ],
    [years, grades, t],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: `e.g. ${t('gradeLevel')} 1 – A` },
      {
        name: 'gradeLevelId',
        label: t('gradeLevel'),
        type: 'select',
        required: true,
        options: (grades?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
      },
      {
        name: 'academicYearId',
        label: t('academicYear'),
        type: 'select',
        required: true,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      {
        name: 'classTeacherId',
        label: `${t('class')} ${t('teacher').toLowerCase()}`,
        type: 'select',
        nullable: true,
        options: teacherOptions,
      },
      { name: 'section', label: t('section'), type: 'text', nullable: true, placeholder: 'e.g. A' },
      { name: 'room', label: 'Room', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'capacity', label: 'Capacity', type: 'number', min: 0, nullable: true, placeholder: 'Optional' },
    ],
    [years, grades, teacherOptions, t],
  );

  const columns = useMemo<Column<ClassRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'gradeLevelName', header: t('gradeLevel'), render: (r) => r.gradeLevelName ?? '—' },
      { key: 'academicYearName', header: t('academicYear'), render: (r) => <span className="text-text-muted">{r.academicYearName ?? '—'}</span> },
      { key: 'section', header: t('section'), render: (r) => r.section ?? '—' },
      { key: 'classTeacherName', header: `${t('class')} ${t('teacher').toLowerCase()}`, render: (r) => <span className="text-text-muted">{r.classTeacherName ?? 'Unassigned'}</span> },
      { key: 'studentCount', header: 'Students', align: 'right', render: (r) => <span className="tabular-nums">{r.studentCount ?? 0}</span> },
      { key: 'capacity', header: 'Capacity', align: 'right', render: (r) => <span className="tabular-nums">{r.capacity ?? '—'}</span> },
    ],
    [t],
  );

  const detail = useMemo(
    () =>
      (r: ClassRow): DetailSection[] => [
        {
          title: 'Overview',
          fields: [
            { label: 'Name', value: r.name },
            { label: t('gradeLevel'), value: r.gradeLevelName ?? '—' },
            { label: t('academicYear'), value: r.academicYearName ?? '—' },
            { label: t('section'), value: r.section ?? '—' },
            { label: `${t('class')} ${t('teacher').toLowerCase()}`, value: r.classTeacherName ?? 'Unassigned' },
            { label: 'Students', value: r.studentCount ?? 0 },
            { label: 'Capacity', value: r.capacity ?? '—' },
            { label: 'Room', value: r.room ?? '—' },
          ],
        },
      ],
    [t],
  );

  return (
    <ResourceManager<ClassRow>
      resource="classes"
      title={tp('class')}
      noun={t('class').toLowerCase()}
      columns={columns}
      fields={fields}
      filters={filters}
      extraFilters={contextFilters}
      detail={detail}
      defaultSortBy="name"
      renderFormExtra={({ row }) => <ClassSubjectsPanel classId={row.id} className={row.name} />}
      renderDetailExtra={({ row }) => <ClassRosterPanel classId={row.id} className={row.name} />}
      toFormValues={(r) => ({
        name: r.name,
        gradeLevelId: r.gradeLevelId,
        academicYearId: r.academicYearId,
        classTeacherId: r.classTeacherId ?? '',
        section: r.section ?? '',
        room: r.room ?? '',
        capacity: r.capacity ?? '',
      })}
    />
  );
}
