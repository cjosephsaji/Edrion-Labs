'use client';
import { useMemo } from 'react';
import { Badge, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager } from '@/components/academics/resource-manager';
import { ClassRosterPanel } from '@/components/academics/class-roster-panel';
import { ClassSubjectsPanel } from '@/components/academics/class-subjects-panel';
import type { FieldDef } from '@/components/academics/resource-form';
import type { FilterDef } from '@/components/academics/resource-manager';
import { useAcademicContextFilters } from '@/lib/academic-context';
import {
  useAcademicYearOptions,
  useDepartmentOptions,
  useGradeLevelOptions,
  useProgrammeLevelSelectOptions,
  useTermSelectOptions,
  type ClassRow,
} from '@/lib/academics';
import { useTeachingStaffOptions, teachingStaffSelectOptions } from '@/lib/people';
import { useTerm } from '@/lib/term';

export default function ClassesPage() {
  const { t, tp } = useTerm();
  const contextFilters = useAcademicContextFilters();
  const { data: years } = useAcademicYearOptions();
  const { data: grades } = useGradeLevelOptions();
  const { data: departments } = useDepartmentOptions();
  const { data: teachers } = useTeachingStaffOptions();
  const { options: levelOptions } = useProgrammeLevelSelectOptions();
  const { options: termOptions } = useTermSelectOptions();

  const teacherOptions = teachingStaffSelectOptions(teachers);

  const filters = useMemo<FilterDef[]>(
    () => [
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
        key: 'termId',
        label: `All ${tp('term').toLowerCase()}`,
        options: termOptions,
      },
      {
        key: 'academicYearId',
        label: `All ${t('academicYear').toLowerCase()}s`,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
    ],
    [years, departments, levelOptions, termOptions, t, tp],
  );

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: `e.g. ${t('gradeLevel')} 1 – A` },
      {
        name: 'programmeLevelId',
        label: `${t('department')} and ${t('gradeLevel').toLowerCase()}`,
        type: 'select',
        nullable: true,
        options: levelOptions,
        help: `Which ${t('gradeLevel').toLowerCase()} of which ${t('department').toLowerCase()} this ${t('class').toLowerCase()} belongs to.`,
      },
      {
        name: 'termId',
        label: t('term'),
        type: 'select',
        nullable: true,
        options: termOptions,
        help: `The ${t('term').toLowerCase()} this ${t('class').toLowerCase()} is currently in. Its subjects come from the curriculum for that ${t('term').toLowerCase()}.`,
      },
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
    [years, grades, levelOptions, termOptions, teacherOptions, t],
  );

  const columns = useMemo<Column<ClassRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      {
        key: 'departmentName',
        header: t('department'),
        render: (r) =>
          r.departmentName ? <span>{r.departmentName}</span> : <Badge tone="warning">Unplaced</Badge>,
      },
      { key: 'gradeLevelName', header: t('gradeLevel'), render: (r) => r.gradeLevelName ?? '—' },
      {
        key: 'termName',
        header: t('term'),
        render: (r) =>
          r.termName ? (
            <span className="text-text-secondary">{r.termName}</span>
          ) : (
            <span className="text-xs text-text-muted">Not set</span>
          ),
      },
      { key: 'section', header: t('section'), render: (r) => r.section ?? '—' },
      { key: 'classTeacherName', header: `${t('class')} ${t('teacher').toLowerCase()}`, render: (r) => <span className="text-text-muted">{r.classTeacherName ?? 'Unassigned'}</span> },
      { key: 'subjectCount', header: tp('subject'), align: 'right', render: (r) => <span className="tabular-nums">{r.subjectCount ?? 0}</span> },
      {
        key: 'studentCount',
        header: 'Students',
        align: 'right',
        render: (r) => (
          <span className="tabular-nums">
            {r.studentCount ?? 0}
            {r.capacity != null && <span className="text-text-muted"> / {r.capacity}</span>}
          </span>
        ),
      },
    ],
    [t, tp],
  );

  const detail = useMemo(
    () =>
      (r: ClassRow): DetailSection[] => [
        {
          title: 'Where it sits',
          fields: [
            { label: t('department'), value: r.departmentName ?? 'Not placed in a programme' },
            { label: t('gradeLevel'), value: r.gradeLevelName ?? '—' },
            { label: t('term'), value: r.termName ?? 'Not set' },
            { label: t('academicYear'), value: r.academicYearName ?? '—' },
          ],
        },
        {
          title: 'Detail',
          fields: [
            { label: 'Name', value: r.name },
            { label: t('section'), value: r.section ?? '—' },
            { label: `${t('class')} ${t('teacher').toLowerCase()}`, value: r.classTeacherName ?? 'Unassigned' },
            { label: 'Room', value: r.room ?? '—' },
            { label: 'Capacity', value: r.capacity ?? '—' },
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
      renderDetailExtra={({ row }) => (
        <div className="flex flex-col gap-6">
          <ClassSubjectsPanel classId={row.id} className={row.name} />
          <ClassRosterPanel classId={row.id} className={row.name} capacity={row.capacity} />
        </div>
      )}
      toFormValues={(r) => ({
        name: r.name,
        programmeLevelId: r.programmeLevelId ?? '',
        termId: r.termId ?? '',
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
