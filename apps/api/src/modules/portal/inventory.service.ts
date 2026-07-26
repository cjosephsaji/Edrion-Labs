import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  CreateInventoryItemInput,
  CreateInventoryMovementInput,
  InventoryItemsListQuery,
  UpdateInventoryItemInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { InventoryRepository } from './inventory.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-inventory';

/**
 * Institution-portal Inventory service (Phase 8). An item is campus-scoped and version-guarded; the
 * stock movements inherit the item's campus and are only reachable through an item the caller can see
 * (requireItemInScope). The SKU is unique within the institution (a friendly 409). Recording a movement
 * is the bridge that moves the item's running quantity: `in` adds, `out` subtracts (a stock-out below
 * zero is a friendly 400 INSUFFICIENT_STOCK), `adjust` sets it. All mutations are audited.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly repo: InventoryRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === items =================================================================

  async listItems(ctx: PortalActionContext, q: InventoryItemsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listItems(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createItem(ctx: PortalActionContext, input: CreateInventoryItemInput) {
    const sku = input.sku.trim();
    if (await this.repo.findItemBySku(ctx.principal.institutionId, sku)) {
      throw new ConflictException({ code: 'ITEM_EXISTS', message: `An item with SKU "${sku}" already exists.` });
    }
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertItem({
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      sku,
      category: input.category ?? null,
      unit: input.unit ?? null,
      quantity: input.quantity,
      reorderLevel: input.reorderLevel,
      unitValue: input.unitValue,
      status: input.status,
      description: input.description ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'inventory.item.create', 'inventory_item', row.id, campusId, {
      newState: { name: row.name, sku: row.sku, quantity: row.quantity },
    });
    return row;
  }

  async updateItem(ctx: PortalActionContext, id: string, input: UpdateInventoryItemInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findItem(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const nextSku = (input.sku ?? existing!.sku).trim();
    if (nextSku !== existing!.sku) {
      const dupe = await this.repo.findItemBySku(ctx.principal.institutionId, nextSku);
      if (dupe && dupe.id !== id) {
        throw new ConflictException({ code: 'ITEM_EXISTS', message: `An item with SKU "${nextSku}" already exists.` });
      }
    }
    const updated = await this.repo.updateItem(id, input.version, {
      name: input.name ?? existing!.name,
      sku: nextSku,
      category: input.category === undefined ? existing!.category : input.category,
      unit: input.unit === undefined ? existing!.unit : input.unit,
      reorderLevel: input.reorderLevel ?? existing!.reorderLevel,
      unitValue: input.unitValue ?? existing!.unitValue,
      status: input.status ?? existing!.status,
      description: input.description === undefined ? existing!.description : input.description,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'inventory.item.update', 'inventory_item', id, updated.campusId, {
      newState: { name: updated.name, sku: updated.sku, status: updated.status },
    });
    return updated;
  }

  async deleteItem(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findItem(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteItem(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'inventory.item.delete', 'inventory_item', id, existing!.campusId, {
      previousState: { name: existing!.name, sku: existing!.sku },
    });
    return { deleted: true };
  }

  // === movements (the quantity bridge) =======================================

  async listMovements(ctx: PortalActionContext, itemId: string) {
    await this.requireItemInScope(ctx, itemId);
    return this.repo.listMovements(itemId);
  }

  /** Record a movement and move the item's running quantity (in adds, out subtracts, adjust sets). */
  async createMovement(ctx: PortalActionContext, itemId: string, input: CreateInventoryMovementInput) {
    const item = await this.requireItemInScope(ctx, itemId);
    const nextQty = this.applyMovement(item.quantity, input.movementType, input.quantity);
    const movement = await this.repo.insertMovement({
      institutionId: ctx.principal.institutionId,
      itemId,
      movementType: input.movementType,
      quantity: input.quantity,
      reason: input.reason ?? null,
      reference: input.reference ?? null,
      movedDate: input.movedDate ?? null,
      notes: input.notes ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    const updatedItem = await this.repo.updateItem(itemId, item.version, {
      quantity: nextQty,
      updatedBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'inventory.movement.create', 'inventory_movement', movement.id, item.campusId, {
      newState: { itemId, movementType: movement.movementType, quantity: movement.quantity, balance: nextQty },
    });
    return { movement, item: updatedItem };
  }

  async removeMovement(ctx: PortalActionContext, itemId: string, movementId: string) {
    const item = await this.requireItemInScope(ctx, itemId);
    const movement = await this.repo.findMovement(movementId, itemId);
    if (!movement) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Movement not found' });
    await this.repo.deleteMovement(movementId);
    // Reverse the in/out effect (adjust can't be cleanly reversed, so leave the quantity as-is).
    let nextQty = item.quantity;
    if (movement.movementType === 'in') nextQty = Math.max(0, item.quantity - movement.quantity);
    else if (movement.movementType === 'out') nextQty = item.quantity + movement.quantity;
    const updatedItem =
      nextQty === item.quantity
        ? item
        : await this.repo.updateItem(itemId, item.version, { quantity: nextQty, updatedBy: ctx.principal.institutionUserId });
    await this.write(ctx, 'inventory.movement.remove', 'inventory_movement', movementId, item.campusId, {
      previousState: { itemId, movementType: movement.movementType, quantity: movement.quantity },
    });
    return { deleted: true, item: updatedItem };
  }

  /** in adds, out subtracts (never below zero — a friendly 400), adjust sets the absolute quantity. */
  private applyMovement(current: number, type: string, qty: number): number {
    if (type === 'out') {
      if (qty > current) {
        throw new BadRequestException({
          code: 'INSUFFICIENT_STOCK',
          message: `Cannot remove ${qty}; only ${current} in stock.`,
        });
      }
      return current - qty;
    }
    if (type === 'adjust') return qty;
    return current + qty;
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private createCampusId(scope: InstitutionScope): string | null {
    return scope.mode === 'campus' ? scope.campusId : null;
  }

  private assertInScope<T>(campusId: string | null, row: T | undefined, filter: ScopeFilter): asserts row is T {
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private async requireItemInScope(ctx: PortalActionContext, itemId: string) {
    const f = this.filter(ctx);
    const item = await this.repo.findItem(itemId, ctx.principal.institutionId);
    this.assertInScope(item?.campusId ?? null, item, f);
    return item;
  }

  private paginate<T>(page: Page<T>, q: { page: number; pageSize: number }): ListResult<T> {
    return { ...page, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityType: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
      campusId: campusId ?? undefined,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }
}
