'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Drawer, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useItemMovementMutations, useItemMovements } from '@/lib/inventory';
import type { InventoryItemRow } from '@/lib/inventory-types';
import { PortalClientError } from '@/lib/portal-client';

const TYPES = [
  { value: 'in', label: 'Stock in' },
  { value: 'out', label: 'Stock out' },
  { value: 'adjust', label: 'Adjust to' },
];
const typeLabel = (v: string) => TYPES.find((t) => t.value === v)?.label ?? v;

/**
 * Record + list stock movements against an item (the inventory bridge). Viewers see the movements;
 * `inventory.manage` is required to record or remove — the API re-checks and moves the item's running
 * quantity (in adds, out subtracts, adjust sets; a stock-out below zero is rejected).
 */
export function ItemMovementsDrawer({
  item,
  open,
  onClose,
}: {
  item: InventoryItemRow | null;
  open: boolean;
  onClose: () => void;
}) {
  const { can } = usePermissions();
  const canManage = can('inventory.manage');
  const { data: movements, isLoading } = useItemMovements(open ? item?.id ?? null : null);
  const { record, remove } = useItemMovementMutations(item?.id ?? '');

  const [movementType, setMovementType] = useState('in');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMovementType('in');
    setQuantity('');
    setReason('');
  }

  async function add() {
    if (!quantity) return;
    setError(null);
    try {
      await record.mutateAsync({ movementType, quantity: Number(quantity), reason: reason || null });
      reset();
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not record the movement.');
    }
  }

  async function drop(id: string) {
    setError(null);
    try {
      await remove.mutateAsync(id);
    } catch (err) {
      setError(err instanceof PortalClientError ? err.message : 'Could not remove the movement.');
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Stock movements" description={item?.name ?? ''}>
      <div className="flex flex-col gap-4">
        {item && (
          <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm">
            <div>
              <p className="text-xs text-text-muted">On hand</p>
              <p className="font-medium tabular-nums">{item.quantity}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">Reorder at</p>
              <p className="font-medium tabular-nums">{item.reorderLevel}</p>
            </div>
            <div>
              <p className="text-xs text-text-muted">SKU</p>
              <p className="truncate font-medium">{item.sku}</p>
            </div>
          </div>
        )}

        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {canManage && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="mv-type">Type</Label>
                <Select id="mv-type" value={movementType} onChange={(e) => setMovementType(e.target.value)} options={TYPES} />
              </div>
              <div>
                <Label htmlFor="mv-qty">Quantity</Label>
                <Input id="mv-qty" type="number" min={0} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label htmlFor="mv-reason">Reason</Label>
                <Input id="mv-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
              </div>
            </div>
            <Button onClick={add} loading={record.isPending} disabled={!quantity}>
              Record movement
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : (movements ?? []).length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">No stock movements recorded for this item yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {(movements ?? []).map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium tabular-nums text-text-primary">
                    {typeLabel(m.movementType)} · {m.quantity}
                  </p>
                  <p className="truncate text-xs text-text-muted">
                    {[m.movedDate, m.reason].filter(Boolean).join(' · ') || '—'}
                  </p>
                </div>
                {canManage && (
                  <button
                    type="button"
                    aria-label="Remove movement"
                    onClick={() => drop(m.id)}
                    className="rounded-md p-1.5 text-text-muted transition-colors hover:bg-background-secondary hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}
