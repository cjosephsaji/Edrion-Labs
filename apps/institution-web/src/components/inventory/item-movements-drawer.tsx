'use client';
import { Drawer } from '@edrion/ui';
import type { InventoryItemRow } from '@/lib/inventory-types';
import { ItemMovementsPanel } from './item-movements-panel';

/** @deprecated Prefer `ItemMovementsPanel` in the item detail popup. */
export function ItemMovementsDrawer({
  item,
  open,
  onClose,
}: {
  item: InventoryItemRow | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="Stock movements" description={item?.name ?? ''}>
      {item && (
        <ItemMovementsPanel
          itemId={item.id}
          name={item.name}
          quantity={item.quantity}
          reorderLevel={item.reorderLevel}
          sku={item.sku}
        />
      )}
    </Drawer>
  );
}

export { ItemMovementsPanel } from './item-movements-panel';
