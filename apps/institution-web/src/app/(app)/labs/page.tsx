'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useLabsList, useLabsMutations } from '@/lib/staff-modules';
import type { LabAssetRow } from '@/lib/staff-modules-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'labs.view',
  create: 'labs.manage_inventory',
  update: 'labs.manage_inventory',
  delete: 'labs.manage_inventory',
};

const KINDS = [
  { value: 'inventory', label: 'Inventory' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'consumable', label: 'Consumable' },
];
const STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'in_use', label: 'In use' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'retired', label: 'Retired' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function LabAssetsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Microscope' },
      { name: 'kind', label: 'Kind', type: 'select', required: true, options: KINDS },
      { name: 'quantity', label: 'Quantity', type: 'number', min: 0 },
      { name: 'unit', label: 'Unit', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'location', label: 'Location', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<LabAssetRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'kind', header: 'Kind', render: (r) => label(KINDS, r.kind) },
      { key: 'quantity', header: 'Qty', sortable: true, render: (r) => <span className="tabular-nums">{r.quantity}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<LabAssetRow>
      resource="labs/assets"
      title="Labs"
      noun="lab asset"
      columns={columns}
      fields={fields}
      defaultSortBy="name"
      defaultSortDir="asc"
      permissions={PERMISSIONS}
      useList={useLabsList}
      useMutations={useLabsMutations}
      rowLabel={(r) => r.name}
      toFormValues={(r) => ({
        name: r.name,
        kind: r.kind,
        quantity: r.quantity,
        unit: r.unit ?? '',
        location: r.location ?? '',
        status: r.status,
      })}
    />
  );
}
