'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { CourseSyllabusPanel } from '@/components/courses/course-syllabus-panel';
import { useAcademicList } from '@/lib/academics';
import type { AcademicTermRow } from '@/lib/academics-types';
import { useCoursesList, useCoursesMutations } from '@/lib/courses';
import type { CourseRow } from '@/lib/courses-types';
import { useTeachingStaffOptions } from '@/lib/people';
import { useTerm } from '@/lib/term';

const PERMISSIONS: ResourcePermissions = {
  view: 'courses.manage',
  create: 'courses.manage',
  update: 'courses.manage',
  delete: 'courses.impossible',
};

export default function CoursesPage() {
  const { t } = useTerm();
  const { data: termsData } = useAcademicList<AcademicTermRow>('academic-terms', {
    page: 1,
    pageSize: 100,
    sortDir: 'asc',
    sortBy: 'name',
  });
  const { data: professors } = useTeachingStaffOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'code', label: 'Course code', type: 'text', required: true, placeholder: 'e.g. CS101' },
      { name: 'name', label: 'Course name', type: 'text', required: true, placeholder: 'e.g. Introduction to Computing' },
      { name: 'credits', label: 'Credits', type: 'number', nullable: true, min: 0, max: 30 },
      {
        name: 'termId',
        label: t('term'),
        type: 'select',
        nullable: true,
        options: (termsData?.items ?? []).map((term) => ({ value: term.id, label: term.name })),
      },
      {
        name: 'professorTeacherId',
        label: 'Professor',
        type: 'select',
        nullable: true,
        options: (professors ?? []).map((p) => ({ value: p.id, label: `${p.firstName} ${p.lastName}` })),
      },
      { name: 'officeHours', label: 'Office hours', type: 'text', nullable: true },
      { name: 'attendanceRequiredPct', label: 'Attendance required %', type: 'number', required: true, min: 0, max: 100 },
    ],
    [termsData, professors, t],
  );

  const columns = useMemo<Column<CourseRow>[]>(
    () => [
      { key: 'code', header: 'Code', sortable: true, render: (r) => <span className="font-medium tabular-nums">{r.code}</span> },
      { key: 'name', header: 'Name', sortable: true, render: (r) => r.name },
      { key: 'credits', header: 'Credits', align: 'right', render: (r) => <span className="tabular-nums">{r.credits ?? '—'}</span> },
      { key: 'status', header: 'Status', render: (r) => <span className="capitalize text-text-secondary">{r.status}</span> },
    ],
    [],
  );

  return (
    <ResourceManager<CourseRow>
      resource="courses"
      title="Courses"
      noun="course"
      columns={columns}
      fields={fields}
      defaultSortBy="code"
      permissions={PERMISSIONS}
      useList={useCoursesList}
      useMutations={useCoursesMutations}
      rowLabel={(r) => `${r.code} — ${r.name}`}
      renderDetailExtra={({ row }) => <CourseSyllabusPanel course={row} />}
      toFormValues={(r) => ({
        code: r.code,
        name: r.name,
        credits: r.credits ?? '',
        termId: r.termId ?? '',
        professorTeacherId: r.professorTeacherId ?? '',
        officeHours: r.officeHours ?? '',
        attendanceRequiredPct: r.attendanceRequiredPct,
      })}
    />
  );
}
