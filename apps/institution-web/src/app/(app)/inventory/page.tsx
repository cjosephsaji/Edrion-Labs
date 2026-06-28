'use client';
import { useMemo, useState } from 'react';
import { ArrowLeftRight } from 'lucide-react';
import { type Column } from '@edrion/ui';
import { ResourceManager, type ResourcePermissions } from '@/components/academics/resource-manager';
import type { FieldDef } from '@/components/academics/resource-form';
import { ItemMovementsDrawer } from '@/components/inventory/item-movements-drawer';
import { useInventoryList, useInventoryMutations } from '@/lib/inventory';
import type { InventoryItemRow } from '@/lib/inventory-types';

const PERMISSIONS: ResourcePermissions = {
  view: 'inventory.view',
  create: 'inventory.manage',
  update: 'inventory.manage',
  delete: 'inventory.manage',
};

const ITEM_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];
const label = (opts: { value: string; label: string }[], v: string) => opts.find((o) => o.value === v)?.label ?? v;

export default function InventoryPage() {
  const [movementsFor, setMovementsFor] = useState<InventoryItemRow | null>(null);

  const fields = useMemo<FieldDef[]>(
    () => [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Whiteboard marker' },
      { name: 'sku', label: 'SKU', type: 'text', required: true, placeholder: 'e.g. STA-001' },
      { name: 'category', label: 'Category', type: 'text', nullable: true, placeholder: 'Optional' },
      { name: 'unit', label: 'Unit', type: 'text', nullable: true, placeholder: 'e.g. pieces' },
      { name: 'quantity', label: 'Opening quantity', type: 'number', required: true, min: 0, help: 'Further changes go through movements.' },
      { name: 'reorderLevel', label: 'Reorder level', type: 'number', required: true, min: 0 },
      { name: 'unitValue', label: 'Unit value (minor units)', type: 'number', required: true, min: 0 },
      { name: 'status', label: 'Status', type: 'select', required: true, options: ITEM_STATUSES },
      { name: 'description', label: 'Description', type: 'textarea', nullable: true, placeholder: 'Optional' },
    ],
    [],
  );

  const columns = useMemo<Column<InventoryItemRow>[]>(
    () => [
      { key: 'name', header: 'Name', sortable: true, render: (r) => <span className="font-medium">{r.name}</span> },
      { key: 'sku', header: 'SKU', sortable: true, render: (r) => <span className="text-text-muted">{r.sku}</span> },
      { key: 'category', header: 'Category', render: (r) => r.category ?? '—' },
      {
        key: 'quantity',
        header: 'On hand',
        align: 'right',
        sortable: true,
        render: (r) => <span className={'tabular-nums font-medium ' + (r.belowReorder ? 'text-danger' : '')}>{r.quantity}</span>,
      },
      { key: 'reorderLevel', header: 'Reorder at', align: 'right', render: (r) => <span className="tabular-nums">{r.reorderLevel}</span> },
      { key: 'status', header: 'Status', sortable: true, render: (r) => label(ITEM_STATUSES, r.status) },
    ],
    [],
  );

  return (
    <>
      <ResourceManager<InventoryItemRow>
        resource="inventory/items"
        title="Inventory"
        noun="item"
        columns={columns}
        fields={fields}
        defaultSortBy="name"
        permissions={PERMISSIONS}
        useList={useInventoryList}
        useMutations={useInventoryMutations}
        rowLabel={(r) => r.name}
        toFormValues={(r) => ({
          name: r.name,
          sku: r.sku,
          category: r.category ?? '',
          unit: r.unit ?? '',
          quantity: r.quantity,
          reorderLevel: r.reorderLevel,
          unitValue: r.unitValue,
          status: r.status,
          description: r.description ?? '',
        })}
        extraActions={(row) => (
          <button
            type="button"
            aria-label="Movements"
            title="Movements"
            onClick={() => setMovementsFor(row)}
            className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-primary"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </button>
        )}
      />

      <ItemMovementsDrawer item={movementsFor} open={!!movementsFor} onClose={() => setMovementsFor(null)} />
    </>
  );
}
