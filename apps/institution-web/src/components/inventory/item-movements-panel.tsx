'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, Input, Label, Select, Skeleton } from '@edrion/ui';
import { usePermissions } from '@/lib/permissions';
import { useItemMovementMutations, useItemMovements } from '@/lib/inventory';
import { PortalClientError } from '@/lib/portal-client';

const TYPES = [
  { value: 'in', label: 'Stock in' },
  { value: 'out', label: 'Stock out' },
  { value: 'adjust', label: 'Adjust to' },
];
const typeLabel = (v: string) => TYPES.find((t) => t.value === v)?.label ?? v;

/** Inline stock movements — shown in the inventory item detail popup. */
export function ItemMovementsPanel({
  itemId,
  name,
  quantity,
  reorderLevel,
  sku,
}: {
  itemId: string;
  name: string;
  quantity: number;
  reorderLevel: number;
  sku: string;
}) {
  const { can } = usePermissions();
  const canManage = can('inventory.manage');
  const { data: movements, isLoading } = useItemMovements(itemId);
  const { record, remove } = useItemMovementMutations(itemId);

  const [movementType, setMovementType] = useState('in');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setMovementType('in');
    setQty('');
    setReason('');
  }

  async function add() {
    if (!qty) return;
    setError(null);
    try {
      await record.mutateAsync({ movementType, quantity: Number(qty), reason: reason || null });
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
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-text-primary">Stock movements</h3>
      <p className="text-xs text-text-muted">Movement history for {name}.</p>

      <div className="grid grid-cols-3 gap-2 rounded-md border border-border p-3 text-sm">
        <div>
          <p className="text-xs text-text-muted">On hand</p>
          <p className="font-medium tabular-nums">{quantity}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">Reorder at</p>
          <p className="font-medium tabular-nums">{reorderLevel}</p>
        </div>
        <div>
          <p className="text-xs text-text-muted">SKU</p>
          <p className="truncate font-medium">{sku}</p>
        </div>
      </div>

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
              <Input id="mv-qty" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Label htmlFor="mv-reason">Reason</Label>
              <Input id="mv-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <Button onClick={add} loading={record.isPending} disabled={!qty}>
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
        <p className="py-4 text-center text-sm text-text-muted">No stock movements recorded for this item yet.</p>
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
  );
}
