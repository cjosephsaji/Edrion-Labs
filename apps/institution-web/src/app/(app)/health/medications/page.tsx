'use client';
import { useMemo } from 'react';
import { StatusBadge, type Column, type DetailSection } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { EntityRef } from '@/components/common/entity-ref';
import { StudentCardHeader, studentContextFields } from '@/components/common/student-card';
import { usePermissions } from '@/lib/permissions';
import { useHealthList, useHealthMutations } from '@/lib/staff-modules';
import { useStudentDirectory, studentOptions } from '@/lib/directory';
import type { MedicationLogRow } from '@/lib/staff-modules-types';

const KEY = 'medication_logs.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const STATUSES = [
  { value: 'administered', label: 'Administered' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'missed', label: 'Missed' },
];

export default function MedicationLogsPage() {
  const { can } = usePermissions();
  const { data: students } = useStudentDirectory(can('student_basic_profile.view'));
  const studentOpts = useMemo(() => studentOptions(students?.items), [students]);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'medication', label: 'Medication', type: 'text', required: true, placeholder: 'e.g. Ibuprofen 200mg' },
      {
        name: 'studentId',
        label: 'Student',
        type: 'combobox',
        nullable: true,
        options: studentOpts,
        placeholder: 'Search a student…',
        searchPlaceholder: 'Search by name or admission no…',
        emptyText: 'No matching students',
      },
      { name: 'dosage', label: 'Dosage', type: 'text', nullable: true, placeholder: 'e.g. 1 tablet' },
      { name: 'administeredAt', label: 'Administered on', type: 'date', nullable: true },
      { name: 'administeredBy', label: 'Administered by', type: 'text', nullable: true, placeholder: 'e.g. Nurse Usha' },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [studentOpts],
  );

  const columns = useMemo<Column<MedicationLogRow>[]>(
    () => [
      { key: 'medication', header: 'Medication', sortable: true, render: (r) => <span className="font-medium">{r.medication}</span> },
      { key: 'student', header: 'Student', render: (r) => <EntityRef entity={r.student} /> },
      { key: 'dosage', header: 'Dosage', render: (r) => r.dosage ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => <StatusBadge status={r.status} /> },
    ],
    [],
  );

  const detail = (r: MedicationLogRow): DetailSection[] => [
    { title: 'Student', fields: studentContextFields(r.student) },
    {
      title: 'Medication',
      fields: [
        { label: 'Medication', value: r.medication },
        { label: 'Dosage', value: r.dosage },
        { label: 'Administered on', value: r.administeredAt ? r.administeredAt.slice(0, 16).replace('T', ' ') : null },
        { label: 'Administered by', value: r.administeredBy },
        { label: 'Status', value: <StatusBadge status={r.status} /> },
        { label: 'Notes', value: r.notes, full: true },
      ],
    },
  ];

  return (
    <ResourceManager<MedicationLogRow>
      resource="health/medications"
      title="Medication Logs"
      noun="medication log"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useHealthList}
      useMutations={useHealthMutations}
      rowLabel={(r) => r.medication}
      detail={detail}
      detailHeader={(r) => <StudentCardHeader student={r.student} />}
      toFormValues={(r) => ({
        medication: r.medication,
        studentId: r.studentId ?? '',
        dosage: r.dosage ?? '',
        administeredAt: r.administeredAt ? r.administeredAt.slice(0, 10) : '',
        administeredBy: r.administeredBy ?? '',
        notes: r.notes ?? '',
        status: r.status,
      })}
    />
  );
}
