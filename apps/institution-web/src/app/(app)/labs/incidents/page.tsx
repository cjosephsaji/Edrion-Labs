'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useLabsList, useLabsMutations } from '@/lib/staff-modules';
import type { LabIncidentRow } from '@/lib/staff-modules-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'labs.view',
  create: 'labs.report_incidents',
  update: 'labs.report_incidents',
  delete: 'labs.report_incidents',
};

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

export default function LabIncidentsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Spilled reagent' },
      { name: 'severity', label: 'Severity', type: 'select', required: true, options: SEVERITIES },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
      { name: 'occurredAt', label: 'Occurred on', type: 'date', nullable: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<LabIncidentRow>[]>(
    () => [
      { key: 'title', header: 'Title', sortable: true, render: (r) => <span className="font-medium">{r.title}</span> },
      { key: 'severity', header: 'Severity', sortable: true, render: (r) => label(SEVERITIES, r.severity) },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<LabIncidentRow>
      resource="labs/incidents"
      title="Lab Incidents"
      noun="incident"
      columns={columns}
      fields={fields}
      defaultSortBy="createdAt"
      defaultSortDir="desc"
      permissions={PERMISSIONS}
      useList={useLabsList}
      useMutations={useLabsMutations}
      rowLabel={(r) => r.title}
      toFormValues={(r) => ({
        title: r.title,
        severity: r.severity,
        description: r.description ?? '',
        occurredAt: r.occurredAt ? r.occurredAt.slice(0, 10) : '',
        status: r.status,
      })}
    />
  );
}
