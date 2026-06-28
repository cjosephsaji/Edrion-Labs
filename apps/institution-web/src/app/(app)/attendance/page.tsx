'use client';
import { useMemo, useState } from 'react';
import { ClipboardCheck } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { AttendanceRecordsDrawer } from '@/components/attendance/attendance-records-drawer';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useTeacherOptions } from '@/lib/people';
import { useAttendanceList, useAttendanceMutations, type AttendanceSessionRow } from '@/lib/attendance';

const PERMISSIONS: ResourcePermissions = {
  view: 'attendance.view',
  create: 'attendance.manage',
  update: 'attendance.manage',
  delete: 'attendance.manage',
};

export default function AttendancePage() {
  const { data: classes } = useClassOptions();
  const { data: subjects } = useSubjectOptions();
  const { data: teachers } = useTeacherOptions();
  const [recordsFor, setRecordsFor] = useState<AttendanceSessionRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      {
        name: 'classId',
        label: 'Class',
        type: 'select',
        required: true,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'period', label: 'Period', type: 'text', required: true, placeholder: 'e.g. 1 or full_day', help: 'One register per class, date and period.' },
      {
        name: 'subjectId',
        label: 'Subject',
        type: 'select',
        nullable: true,
        options: (subjects?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
      },
      {
        name: 'takenById',
        label: 'Taken by',
        type: 'select',
        nullable: true,
        options: (teachers?.items ?? []).map((t) => ({ value: t.id, label: `${t.firstName} ${t.lastName}` })),
      },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [classes, subjects, teachers],
  );

  const columns = useMemo<Column<AttendanceSessionRow>[]>(
    () => [
      { key: 'date', header: 'Date', sortable: true, render: (r) => <span className="tabular-nums font-medium">{r.date}</span> },
      { key: 'period', header: 'Period', sortable: true, render: (r) => <span className="text-text-muted">{r.period}</span> },
      { key: 'className', header: 'Class', render: (r) => r.className ?? '—' },
      { key: 'subjectName', header: 'Subject', render: (r) => <span className="text-text-muted">{r.subjectName ?? '—'}</span> },
      { key: 'takenByName', header: 'Taken by', render: (r) => <span className="text-text-muted">{r.takenByName ?? '—'}</span> },
      {
        key: 'presentCount',
        header: 'Marked',
        align: 'right',
        render: (r) => (
          <span className="tabular-nums">
            {r.recordCount === 0 ? '—' : `${r.presentCount}/${r.recordCount} present`}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<AttendanceSessionRow>
        resource="attendance/sessions"
        title="Attendance"
        noun="register"
        columns={columns}
        fields={fields}
        defaultSortBy="date"
        defaultSortDir="desc"
        searchable={false}
        permissions={PERMISSIONS}
        useList={useAttendanceList}
        useMutations={useAttendanceMutations}
        rowLabel={(r) => `${r.className ?? 'Class'} · ${r.date} · ${r.period}`}
        toFormValues={(r) => ({
          classId: r.classId,
          date: r.date,
          period: r.period,
          subjectId: r.subjectId ?? '',
          takenById: r.takenById ?? '',
          notes: r.notes ?? '',
        })}
        extraActions={(row) => (
          <button
            type="button"
            aria-label="Mark register"
            title="Mark register"
            onClick={() => setRecordsFor(row)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <ClipboardCheck className="h-4 w-4" />
          </button>
        )}
      />

      <AttendanceRecordsDrawer session={recordsFor} open={!!recordsFor} onClose={() => setRecordsFor(null)} />
    </>
  );
}
