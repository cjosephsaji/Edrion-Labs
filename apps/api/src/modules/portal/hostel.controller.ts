import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  allocateHostelRoomSchema,
  createHostelBlockSchema,
  createHostelRoomSchema,
  hostelBlocksListQuerySchema,
  hostelHostellersListQuerySchema,
  hostelRoomsListQuerySchema,
  updateHostelBlockSchema,
  updateHostelRoomSchema,
  vacateHostelRoomSchema,
  versionedDeleteSchema,
  type AllocateHostelRoomInput,
  type CreateHostelBlockInput,
  type CreateHostelRoomInput,
  type HostelBlocksListQuery,
  type HostelHostellersListQuery,
  type HostelRoomsListQuery,
  type UpdateHostelBlockInput,
  type UpdateHostelRoomInput,
  type VacateHostelRoomInput,
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
import { HostelService } from './hostel.service';
import type { PortalActionContext } from './portal-action-context';

/**
 * Institution-portal Hostel API (Phase 8) — blocks + rooms + per-student allocations. Same boundary as
 * the rest of the portal. Reads need hostel.view; mutations need hostel.manage. Allocations are nested
 * under a room; allocating/vacating re-derives the room's occupancy.
 */
@ApiTags('portal-hostel')
@Controller('portal/hostel')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class HostelController {
  constructor(private readonly service: HostelService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  // --- blocks ----------------------------------------------------------------

  @Get('blocks')
  @RequireInstitutionPermissions('hostel.view')
  listBlocks(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(hostelBlocksListQuerySchema)) q: HostelBlocksListQuery,
  ) {
    return this.service.listBlocks(this.ctx(p, s, r), q);
  }

  @Get('hostellers')
  @RequireInstitutionPermissions('hostel.view')
  listHostellers(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(hostelHostellersListQuerySchema)) q: HostelHostellersListQuery,
  ) {
    return this.service.listHostellers(this.ctx(p, s, r), q);
  }

  @Post('blocks')
  @RequireInstitutionPermissions('hostel.manage')
  createBlock(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createHostelBlockSchema)) body: CreateHostelBlockInput,
  ) {
    return this.service.createBlock(this.ctx(p, s, r), body);
  }

  @Patch('blocks/:id')
  @RequireInstitutionPermissions('hostel.manage')
  updateBlock(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateHostelBlockSchema)) body: UpdateHostelBlockInput,
  ) {
    return this.service.updateBlock(this.ctx(p, s, r), id, body);
  }

  @Delete('blocks/:id')
  @RequireInstitutionPermissions('hostel.manage')
  deleteBlock(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteBlock(this.ctx(p, s, r), id, body.version);
  }

  // --- rooms -----------------------------------------------------------------

  @Get('rooms')
  @RequireInstitutionPermissions('hostel.view')
  listRooms(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(hostelRoomsListQuerySchema)) q: HostelRoomsListQuery,
  ) {
    return this.service.listRooms(this.ctx(p, s, r), q);
  }

  @Post('rooms')
  @RequireInstitutionPermissions('hostel.manage')
  createRoom(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createHostelRoomSchema)) body: CreateHostelRoomInput,
  ) {
    return this.service.createRoom(this.ctx(p, s, r), body);
  }

  @Patch('rooms/:id')
  @RequireInstitutionPermissions('hostel.manage')
  updateRoom(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateHostelRoomSchema)) body: UpdateHostelRoomInput,
  ) {
    return this.service.updateRoom(this.ctx(p, s, r), id, body);
  }

  @Delete('rooms/:id')
  @RequireInstitutionPermissions('hostel.manage')
  deleteRoom(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.service.deleteRoom(this.ctx(p, s, r), id, body.version);
  }

  // --- allocations (against a room) ------------------------------------------

  @Get('rooms/:id/allocations')
  @RequireInstitutionPermissions('hostel.view')
  listAllocations(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.listAllocations(this.ctx(p, s, r), id);
  }

  @Post('rooms/:id/allocations')
  @RequireInstitutionPermissions('hostel.manage')
  allocate(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(allocateHostelRoomSchema)) body: AllocateHostelRoomInput,
  ) {
    return this.service.allocate(this.ctx(p, s, r), id, body);
  }

  @Post('rooms/:id/allocations/:allocationId/vacate')
  @RequireInstitutionPermissions('hostel.manage')
  vacate(
    @Param('id') id: string,
    @Param('allocationId') allocationId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(vacateHostelRoomSchema)) body: VacateHostelRoomInput,
  ) {
    return this.service.vacate(this.ctx(p, s, r), id, allocationId, body);
  }

  @Delete('rooms/:id/allocations/:allocationId')
  @RequireInstitutionPermissions('hostel.manage')
  removeAllocation(
    @Param('id') id: string,
    @Param('allocationId') allocationId: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
  ) {
    return this.service.removeAllocation(this.ctx(p, s, r), id, allocationId);
  }
}
