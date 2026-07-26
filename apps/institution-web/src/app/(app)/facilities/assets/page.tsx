'use client';
import { useMemo } from 'react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { useFacilitiesList, useFacilitiesMutations } from '@/lib/staff-modules';
import type { FacilityAssetRow } from '@/lib/staff-modules-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'assets.view',
  create: 'inventory.request',
  update: 'inventory.request',
  delete: 'inventory.request',
};

const STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'retired', label: 'Retired' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function FacilityAssetsPage() {
  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Lawn mower' },
      { name: 'category', label: 'Category', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'location', label: 'Location', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'status', label: 'Status', type: 'select', required: true, options: STATUSES },
    ],
    [],
  );

  const columns = useMemo<Column<FacilityAssetRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'category', header: 'Category', render: (r) => r.category ?? '—' },
      { key: 'location', header: 'Location', render: (r) => r.location ?? '—' },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(STATUSES, r.status) },
    ],
    [],
  );

  return (
    <ResourceManager<FacilityAssetRow>
      resource="facilities/assets"
      title="Assets"
      noun="asset"
      columns={columns}
      fields={fields}
      defaultSortBy="name"
      defaultSortDir="asc"
      permissions={PERMISSIONS}
      useList={useFacilitiesList}
      useMutations={useFacilitiesMutations}
      rowLabel={(r) => r.name}
      toFormValues={(r) => ({ name: r.name, category: r.category ?? '', location: r.location ?? '', status: r.status })}
    />
  );
}
