import { z } from 'zod';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';

/**
 * Institution-Portal INVENTORY (Phase 8) request/response contracts: stocked items + the stock
 * movements recorded against them. Tenancy + the active campus scope are derived by the API, never
 * the body. Money (unit value) is a whole-number integer in MINOR units. Quantities are whole counts.
 */

const shortText = (max = 120) => z.string().trim().max(max).nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').nullish();
const money = z.coerce.number().int().min(0).max(1_000_000_000);
const count = z.coerce.number().int().min(0).max(10_000_000);

export const INVENTORY_ITEM_STATUSES = ['active', 'archived'] as const;
export const inventoryItemStatusSchema = z.enum(INVENTORY_ITEM_STATUSES);
export type InventoryItemStatus = (typeof INVENTORY_ITEM_STATUSES)[number];

export const INVENTORY_MOVEMENT_TYPES = ['in', 'out', 'adjust'] as const;
export const inventoryMovementTypeSchema = z.enum(INVENTORY_MOVEMENT_TYPES);
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

const withVersion = { version: versionSchema };

// --- items -------------------------------------------------------------------

export const inventoryItemsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  status: inventoryItemStatusSchema.optional(),
  category: z.string().trim().max(80).optional(),
});
export type InventoryItemsListQuery = z.infer<typeof inventoryItemsListQuerySchema>;

export const createInventoryItemSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(160),
  sku: z.string().trim().min(1, 'Required').max(60),
  category: shortText(80),
  unit: shortText(40),
  /** Opening stock; further changes go through movements. */
  quantity: count.default(0),
  reorderLevel: count.default(0),
  unitValue: money.default(0),
  status: inventoryItemStatusSchema.default('active'),
  description: shortText(500),
});
export type CreateInventoryItemInput = z.infer<typeof createInventoryItemSchema>;

export const updateInventoryItemSchema = z.object({
  name: z.string().trim().min(1).max(160).optional(),
  sku: z.string().trim().min(1).max(60).optional(),
  category: shortText(80),
  unit: shortText(40),
  reorderLevel: count.optional(),
  unitValue: money.optional(),
  status: inventoryItemStatusSchema.optional(),
  description: shortText(500),
  ...withVersion,
});
export type UpdateInventoryItemInput = z.infer<typeof updateInventoryItemSchema>;

// --- movements (against an item) ---------------------------------------------

/** Record a stock movement. The service adjusts the item's quantity (in adds, out subtracts, adjust sets). */
export const createInventoryMovementSchema = z.object({
  movementType: inventoryMovementTypeSchema.default('in'),
  quantity: count,
  reason: shortText(160),
  reference: shortText(120),
  movedDate: isoDate,
  notes: shortText(500),
});
export type CreateInventoryMovementInput = z.infer<typeof createInventoryMovementSchema>;
