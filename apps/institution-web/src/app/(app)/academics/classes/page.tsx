'use client';
import { useMemo, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager } from '@/components/academics/resource-manager';
import { ClassSubjectsDrawer } from '@/components/academics/class-subjects-drawer';
import type { FieldDef } from '@/components/academics/resource-form';
import { useAcademicYearOptions, useGradeLevelOptions, type ClassRow } from '@/lib/academics';
import { useTeacherOptions } from '@/lib/people';

export default function ClassesPage() {
  const { data: years } = useAcademicYearOptions();
  const { data: grades } = useGradeLevelOptions();
  const { data: teachers } = useTeacherOptions();
  const [subjectsFor, setSubjectsFor] = useState<ClassRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Grade 1 – A' },
      {
        name: 'gradeLevelId',
        label: 'Grade',
        type: 'select',
        required: true,
        options: (grades?.items ?? []).map((g) => ({ value: g.id, label: g.name })),
      },
      {
        name: 'academicYearId',
        label: 'Academic year',
        type: 'select',
        required: true,
        options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
      },
      {
        name: 'classTeacherId',
        label: 'Class teacher',
        type: 'select',
        nullable: true,
        options: (teachers?.items ?? []).map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName}` })),
      },
      { name: 'section', label: 'Section', type: 'text', nullable: true, placeholder: 'e.g. A' },
      { name: 'room', label: 'Room', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'capacity', label: 'Capacity', type: 'number', min: 0, nullable: true, placeholder: 'Optional' },
    ],
    [years, grades, teachers],
  );

  const columns = useMemo<Column<ClassRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'gradeLevelName', header: 'Grade', render: (r) => r.gradeLevelName ?? '—' },
      { key: 'academicYearName', header: 'Year', render: (r) => <span className="text-text-muted">{r.academicYearName ?? '—'}</span> },
      { key: 'section', header: 'Section', render: (r) => r.section ?? '—' },
      { key: 'classTeacherName', header: 'Class teacher', render: (r) => <span className="text-text-muted">{r.classTeacherName ?? 'Unassigned'}</span> },
      { key: 'capacity', header: 'Capacity', align: 'right', render: (r) => <span className="tabular-nums">{r.capacity ?? '—'}</span> },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<ClassRow>
        resource="classes"
        title="Classes"
        noun="class"
        columns={columns}
        fields={fields}
        defaultSortBy="name"
        toFormValues={(r) => ({
          name: r.name,
          gradeLevelId: r.gradeLevelId,
          academicYearId: r.academicYearId,
          classTeacherId: r.classTeacherId ?? '',
          section: r.section ?? '',
          room: r.room ?? '',
          capacity: r.capacity ?? '',
        })}
        extraActions={(row) => (
          <button
            type="button"
            aria-label="Manage subjects"
            title="Subjects"
            onClick={() => setSubjectsFor(row)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <BookOpen className="h-4 w-4" />
          </button>
        )}
      />

      <ClassSubjectsDrawer
        classId={subjectsFor?.id ?? null}
        className={subjectsFor?.name ?? ''}
        open={!!subjectsFor}
        onClose={() => setSubjectsFor(null)}
      />
    </>
  );
}
