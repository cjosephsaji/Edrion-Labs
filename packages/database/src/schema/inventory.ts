import { date, index, integer, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { actorColumns, primaryId, timestamps } from './_helpers';
import { institutions } from './institutions';
import { campuses } from './campuses';

/**
 * INSTITUTION-PORTAL inventory (Phase 8). A two-level model (like exams) where the child lines move
 * the parent's running quantity:
 *   - inventory_items: a stocked item with a current `quantity`, campus-scoped + version-guarded.
 *     The SKU is unique within the institution (a friendly 409 instead of a unique-index 500).
 *   - inventory_movements: stock-in / stock-out / adjust lines. No campus column of its own — it
 *     inherits the item's campus and is only reachable through an item the caller can see (mirrors
 *     fee_payments / exam_schedules). Recording a movement adjusts the item's quantity (a bridge):
 *     `in` adds, `out` subtracts (a stock-out below zero is a friendly 400), `adjust` sets it.
 *
 * Same tenant convention. Money (unit value) is a whole-number integer in MINOR units.
 */
export const inventoryItems = pgTable(
  'inventory_items',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Stock-keeping unit, unique within the institution. */
    sku: text('sku').notNull(),
    category: text('category'),
    /** Unit of measure, e.g. "pieces", "boxes" (free-text). */
    unit: text('unit'),
    /** Current quantity on hand (maintained by the movement bridge). */
    quantity: integer('quantity').notNull().default(0),
    /** Reorder threshold. */
    reorderLevel: integer('reorder_level').notNull().default(0),
    /** Unit value, minor units. */
    unitValue: integer('unit_value').notNull().default(0),
    /** active | archived. */
    status: text('status').notNull().default('active'),
    description: text('description'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('inventory_items_institution_idx').on(t.institutionId),
    scopeIdx: index('inventory_items_institution_campus_idx').on(t.institutionId, t.campusId),
    statusIdx: index('inventory_items_status_idx').on(t.status),
    skuUniq: uniqueIndex('inventory_item_sku_uniq').on(t.institutionId, t.sku),
  }),
);

/** A stock movement against an item. Inherits the item's campus (no campus column of its own). */
export const inventoryMovements = pgTable(
  'inventory_movements',
  {
    id: primaryId(),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => institutions.id, { onDelete: 'cascade' }),
    itemId: uuid('item_id')
      .notNull()
      .references(() => inventoryItems.id, { onDelete: 'cascade' }),
    /** in | out | adjust. */
    movementType: text('movement_type').notNull().default('in'),
    /** Quantity moved (always a non-negative count; the type gives the direction). */
    quantity: integer('quantity').notNull().default(0),
    reason: text('reason'),
    reference: text('reference'),
    movedDate: date('moved_date'),
    notes: text('notes'),
    version: integer('version').notNull().default(0),
    ...actorColumns,
    ...timestamps,
  },
  (t) => ({
    instIdx: index('inventory_movements_institution_idx').on(t.institutionId),
    itemIdx: index('inventory_movements_item_idx').on(t.itemId),
  }),
);

export type InventoryItem = typeof inventoryItems.$inferSelect;
export type NewInventoryItem = typeof inventoryItems.$inferInsert;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type NewInventoryMovement = typeof inventoryMovements.$inferInsert;
