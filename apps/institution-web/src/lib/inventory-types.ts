/** Client-side mirrors of the portal Inventory DTOs (Phase 8). The API is authoritative. */
import type { Paged } from './academics-types';

export type { Paged };

export type InventoryItemStatus = 'active' | 'archived';
export type InventoryMovementType = 'in' | 'out' | 'adjust';

export interface InventoryItemRow {
  id: string;
  institutionId: string;
  campusId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
  name: string;
  sku: string;
  category: string | null;
  unit: string | null;
  quantity: number;
  reorderLevel: number;
  unitValue: number;
  status: InventoryItemStatus;
  description: string | null;
  belowReorder: boolean;
}

export interface InventoryMovementRow {
  id: string;
  institutionId: string;
  itemId: string;
  movementType: InventoryMovementType;
  quantity: number;
  reason: string | null;
  reference: string | null;
  movedDate: string | null;
  notes: string | null;
  version: number;
  createdAt: string;
}
