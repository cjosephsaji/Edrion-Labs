'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useFacilitiesList, useFacilitiesMutations } from '@/lib/staff-modules';
import type { FacilityRow } from '@/lib/staff-modules-types';

const KEY = 'facilities.view';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const KINDS = [
  { value: 'building', label: 'Building' },
  { value: 'room', label: 'Room' },
  { value: 'utility', label: 'Utility' },
  { value: 'ground', label: 'Ground' },
];
const STATUSES = [
  { value: 'operational', label: 'Operational' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'closed', label: 'Closed' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function FacilitiesPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Main Hall' },
      { name: 'kind', label: 'Kind', type: 'select', required: true, options: KINDS },
      { name: 'location', label: 'Location', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<FacilityRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'kind', header: 'Kind', render: (r) => label(KINDS, r.kind) },
      { key: 'location', header: 'Location', render: (r) => r.location ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<FacilityRow>
      resource="facilities"
      title="Facilities"
      noun="facility"
      columns={columns}
      fields={fields}
      defaultSortBy="name"
      defaultSortDir="asc"
      permissions={PERMISSIONS}
      useList={useFacilitiesList}
      useMutations={useFacilitiesMutations}
      rowLabel={(r) => r.name}
      toFormValues={(r) => ({ name: r.name, kind: r.kind, location: r.location ?? '', status: r.status })}
    />
  );
}
