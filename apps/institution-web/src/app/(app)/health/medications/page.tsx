'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useHealthList, useHealthMutations } from '@/lib/staff-modules';
import type { MedicationLogRow } from '@/lib/staff-modules-types';

const KEY = 'medication_logs.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const STATUSES = [
  { value: 'administered', label: 'Administered' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'missed', label: 'Missed' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function MedicationLogsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'medication', label: 'Medication', type: 'text', required: true, placeholder: 'e.g. Ibuprofen 200mg' },
      { name: 'studentId', label: 'Student ID', type: 'text', nullable: true, placeholder: 'Optional (UUID)' },
      { name: 'dosage', label: 'Dosage', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'administeredAt', label: 'Administered on', type: 'date', nullable: true },
      { name: 'notes', label: 'Notes', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<MedicationLogRow>[]>(
    () => [
      { key: 'medication', header: 'Medication', sortable: true, render: (r) => <span className="font-medium">{r.medication}</span> },
      { key: 'dosage', header: 'Dosage', render: (r) => r.dosage ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

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
      toFormValues={(r) => ({
        medication: r.medication,
        studentId: r.studentId ?? '',
        dosage: r.dosage ?? '',
        administeredAt: r.administeredAt ? r.administeredAt.slice(0, 10) : '',
        notes: r.notes ?? '',
        status: r.status,
      })}
    />
  );
}
