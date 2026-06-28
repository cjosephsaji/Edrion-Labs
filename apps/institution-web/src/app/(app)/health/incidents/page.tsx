'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useHealthList, useHealthMutations } from '@/lib/staff-modules';
import type { MedicalIncidentRow } from '@/lib/staff-modules-types';

const KEY = 'medical_incidents.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const SEVERITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
];
const STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'resolved', label: 'Resolved' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function MedicalIncidentsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Sprained ankle' },
      { name: 'studentId', label: 'Student ID', type: 'text', nullable: true, placeholder: 'Optional (UUID)' },
      { name: 'severity', label: 'Severity', type: 'select', required: true, options: SEVERITIES },
      { name: 'location', label: 'Location', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'occurredAt', label: 'Occurred on', type: 'date', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<MedicalIncidentRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'severity', header: 'Severity', sortable: true, render: (r) => label(SEVERITIES, r.severity) },
      { key: 'location', header: 'Location', render: (r) => r.location ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<MedicalIncidentRow>
      resource="health/incidents"
      title="Medical Incidents"
      noun="incident"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useHealthList}
      useMutations={useHealthMutations}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        studentId: r.studentId ?? '',
        severity: r.severity,
        location: r.location ?? '',
        description: r.description ?? '',
        occurredAt: r.occurredAt ? r.occurredAt.slice(0, 10) : '',
        status: r.status,
      })}
    />
  );
}
