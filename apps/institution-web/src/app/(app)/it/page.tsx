'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useItList, useItMutations } from '@/lib/staff-modules';
import type { DeviceRow } from '@/lib/staff-modules-types';

const KEY = 'devices.manage';
const PERMISSIONS: ResourcePermissions = { view: KEY, create: KEY, update: KEY, delete: KEY };

const KINDS = [
  { value: 'laptop', label: 'Laptop' },
  { value: 'desktop', label: 'Desktop' },
  { value: 'printer', label: 'Printer' },
  { value: 'projector', label: 'Projector' },
  { value: 'network', label: 'Network' },
  { value: 'other', label: 'Other' },
];
const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'repair', label: 'Repair' },
  { value: 'retired', label: 'Retired' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function DevicesPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Lab PC 12' },
      { name: 'kind', label: 'Kind', type: 'select', required: true, options: KINDS },
      { name: 'assetTag', label: 'Asset tag', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'assignedTo', label: 'Assigned to', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<DeviceRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'kind', header: 'Kind', render: (r) => label(KINDS, r.kind) },
      { key: 'assetTag', header: 'Asset tag', render: (r) => r.assetTag ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<DeviceRow>
      resource="it/devices"
      title="Devices"
      noun="device"
      columns={columns}
      fields={fields}
      defaultSortBy="name"
      defaultSortDir="asc"
      permissions={PERMISSIONS}
      useList={useItList}
      useMutations={useItMutations}
      rowLabel={(r) => r.name}
      toFormValues={(r) => ({
        name: r.name,
        kind: r.kind,
        assetTag: r.assetTag ?? '',
        assignedTo: r.assignedTo ?? '',
        status: r.status,
      })}
    />
  );
}
