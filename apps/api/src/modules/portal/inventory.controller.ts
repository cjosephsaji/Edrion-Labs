import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  createInventoryItemSchema,
  createInventoryMovementSchema,
  inventoryItemsListQuerySchema,
  updateInventoryItemSchema,
  versionedDeleteSchema,
  type CreateInventoryItemInput,
  type CreateInventoryMovementInput,
  type InventoryItemsListQuery,
  type UpdateInventoryItemInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import { InventoryService } from './inventory.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Inventory API (Phase 8) — stocked items + stock movements. Same boundary as the
 * rest of the portal. Reads need inventory.view; mutations need inventory.manage. Movements are nested
 * under an item; recording one moves the item's running quantity.
 */
@ApiTags('portal-inventory')
@Controller('portal/inventory')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- items -----------------------------------------------------------------

  @Get('items')
  @RequireInstitutionPermissions('inventory.view')
  listItems(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(inventoryItemsListQuerySchema)) q: InventoryItemsListQuery,
  ) {
    return this.service.listItems(this.ctx(p, s, r), q);
  }

  @Post('items')
  @RequireInstitutionPermissions('inventory.manage')
  createItem(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createInventoryItemSchema)) body: CreateInventoryItemInput,
  ) {
    return this.service.createItem(this.ctx(p, s, r), body);
  }

  @Patch('items/:id')
  @RequireInstitutionPermissions('inventory.manage')
  updateItem(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateInventoryItemSchema)) body: UpdateInventoryItemInput,
  ) {
    return this.service.updateItem(this.ctx(p, s, r), id, body);
  }

  @Delete('items/:id')
  @RequireInstitutionPermissions('inventory.manage')
  deleteItem(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteItem(this.ctx(p, s, r), id, body.version);
  }

  // --- movements (against an item) -------------------------------------------

  @Get('items/:id/movements')
  @RequireInstitutionPermissions('inventory.view')
  listMovements(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listMovements(this.ctx(p, s, r), id);
  }

  @Post('items/:id/movements')
  @RequireInstitutionPermissions('inventory.manage')
  createMovement(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createInventoryMovementSchema)) body: CreateInventoryMovementInput,
  ) {
    return this.service.createMovement(this.ctx(p, s, r), id, body);
  }

  @Delete('items/:id/movements/:movementId')
  @RequireInstitutionPermissions('inventory.manage')
  removeMovement(
    @Param('id') id: string,
    @Param('movementId') movementId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removeMovement(this.ctx(p, s, r), id, movementId);
  }
}
