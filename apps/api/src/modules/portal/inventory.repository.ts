import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
  or,
  schema,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { InventoryItem, InventoryMovement, NewInventoryItem, NewInventoryMovement } from '@edrion/database';
import type { InventoryItemsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

export interface InventoryItemRow extends InventoryItem {
  belowReorder: boolean;
}
export type InventoryMovementRow = InventoryMovement;

/**
 * Typed SQL for the institution-portal inventory tables (items + movements). Same contract as the
 * other portal repos: every query is confined to one institution; campus-scoped item reads also
 * include institution-owned (campus_id IS NULL) rows. The service owns scope/version/audit and the
 * movement bridge that adjusts an item's running quantity.
 */
@Injectable()
export class InventoryRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(instCol: PgColumn, campusCol: PgColumn, institutionId: string, campusIds: CampusFilter): SQL[] {
    const conds: SQL[] = [eq(instCol, institutionId)];
    if (campusIds) {
      const inScope = or(isNull(campusCol), inArray(campusCol, campusIds));
      if (inScope) conds.push(inScope);
    }
    return conds;
  }

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  // --- items -----------------------------------------------------------------

  async listItems(institutionId: string, campusIds: CampusFilter, q: InventoryItemsListQuery): Promise<Page<InventoryItemRow>> {
    const t = schema.inventoryItems;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.category) conds.push(eq(t.category, q.category));
    if (q.search) {
      const s = or(ilike(t.name, `%${q.search}%`), ilike(t.sku, `%${q.search}%`), ilike(t.category, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      name: t.name,
      sku: t.sku,
      quantity: t.quantity,
      unitValue: t.unitValue,
      status: t.status,
      createdAt: t.createdAt,
    };
    const rows = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.name))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({ ...r, belowReorder: r.quantity <= r.reorderLevel })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findItem(id: string, institutionId: string): Promise<InventoryItem | undefined> {
    const t = schema.inventoryItems;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  /** An item already exists with this SKU? (friendly 409 instead of a unique-index 500). */
  async findItemBySku(institutionId: string, sku: string): Promise<InventoryItem | undefined> {
    const t = schema.inventoryItems;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.sku, sku)))
      .limit(1);
    return row;
  }

  async insertItem(values: NewInventoryItem): Promise<InventoryItem> {
    const [row] = await this.db.insert(schema.inventoryItems).values(values).returning();
    return row!;
  }

  async updateItem(id: string, version: number, patch: Partial<NewInventoryItem>): Promise<InventoryItem | undefined> {
    const t = schema.inventoryItems;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteItem(id: string, version: number): Promise<boolean> {
    const t = schema.inventoryItems;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- movements (against an item) -------------------------------------------

  async listMovements(itemId: string): Promise<InventoryMovementRow[]> {
    const t = schema.inventoryMovements;
    return this.db.select().from(t).where(eq(t.itemId, itemId)).orderBy(desc(t.createdAt));
  }

  async findMovement(id: string, itemId: string): Promise<InventoryMovement | undefined> {
    const t = schema.inventoryMovements;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.itemId, itemId))).limit(1);
    return row;
  }

  async insertMovement(values: NewInventoryMovement): Promise<InventoryMovement> {
    const [row] = await this.db.insert(schema.inventoryMovements).values(values).returning();
    return row!;
  }

  async deleteMovement(id: string): Promise<boolean> {
    const t = schema.inventoryMovements;
    const rows = await this.db.delete(t).where(eq(t.id, id)).returning({ id: t.id });
    return rows.length > 0;
  }
}
