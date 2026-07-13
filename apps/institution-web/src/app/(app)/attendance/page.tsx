'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { AttendanceRecordsPanel } from '@/components/attendance/attendance-records-panel';
import { useClassOptions, useSubjectOptions } from '@/lib/academics';
import { useTeachingStaffOptions, teachingStaffSelectOptions } from '@/lib/people';
import { useAttendanceList, useAttendanceMutations, type AttendanceSessionRow } from '@/lib/attendance';
import { useAcademicContextFilters } from '@/lib/academic-context';
import { useTerm } from '@/lib/term';

const PERMISSIONS: ResourcePermissions = {
  view: 'attendance.view',
  create: 'attendance.manage',
  update: 'attendance.manage',
  delete: 'attendance.manage',
};

export default function AttendancePage() {
  const { t } = useTerm();
  const contextFilters = useAcademicContextFilters();
  const { data: classes } = useClassOptions();
  const { data: subjects } = useSubjectOptions();
  const { data: teachers } = useTeachingStaffOptions();

  const fields = useMemo<FieldDef[]>(
    () => [
      {
        name: 'classId',
        label: t('class'),
        type: 'select',
        required: true,
        options: (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name })),
      },
      { name: 'date', label: 'Date', type: 'date', required: true },
      { name: 'period', label: 'Period', type: 'text', required: true, placeholder: 'e.g. 1 or full_day', help: 'One register per class, date and period.' },
      {
        name: 'subjectId',
        label: t('subject'),
        type: 'select',
        nullable: true,
        options: (subjects?.items ?? []).map((s) => ({ value: s.id, label: s.name })),
      },
      {
        name: 'takenById',
        label: 'Taken by',
        type: 'select',
        nullable: true,
        options: teachingStaffSelectOptions(teachers),
      },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [classes, subjects, teachers, t],
  );

  const columns = useMemo<Column<AttendanceSessionRow>[]>(
    () => [
      { key: 'date', header: 'Date', sortable: true, render: (r) => <span className="tabular-nums font-medium">{r.date}</span> },
      { key: 'period', header: 'Period', sortable: true, render: (r) => <span className="text-text-muted">{r.period}</span> },
      { key: 'className', header: t('class'), render: (r) => r.className ?? '—' },
      { key: 'subjectName', header: t('subject'), render: (r) => <span className="text-text-muted">{r.subjectName ?? '—'}</span> },
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
    [t],
  );

  return (
    <ResourceManager<AttendanceSessionRow>
      resource="attendance/sessions"
      title="Attendance"
      noun="register"
      columns={columns}
      fields={fields}
      extraFilters={contextFilters}
      defaultSortBy="date"
      defaultSortDir="desc"
      searchable={false}
      permissions={PERMISSIONS}
      useList={useAttendanceList}
      useMutations={useAttendanceMutations}
      rowLabel={(r) => `${r.className ?? t('class')} · ${r.date} · ${r.period}`}
      renderDetailExtra={({ row }) => (
        <AttendanceRecordsPanel
          sessionId={row.id}
          classId={row.classId}
          className={row.className}
          date={row.date}
          period={row.period}
        />
      )}
      toFormValues={(r) => ({
        classId: r.classId,
        date: r.date,
        period: r.period,
        subjectId: r.subjectId ?? '',
        takenById: r.takenById ?? '',
        notes: r.notes ?? '',
      })}
    />
  );
}
