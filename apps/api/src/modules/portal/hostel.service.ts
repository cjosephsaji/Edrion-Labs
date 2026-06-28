import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  AllocateHostelRoomInput,
  CreateHostelBlockInput,
  CreateHostelRoomInput,
  HostelBlocksListQuery,
  HostelRoomsListQuery,
  UpdateHostelBlockInput,
  UpdateHostelRoomInput,
  VacateHostelRoomInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { HostelRepository, type HostelRefTable } from './hostel.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-hostel';

/**
 * Institution-portal Hostel service (Phase 8). Blocks + rooms are campus-scoped and version-guarded;
 * the per-student allocations inherit the room's campus and are only reachable through a room the caller
 * can see (requireRoomInScope). Allocating checks the room isn't full (friendly 400 ROOM_FULL) and that
 * the student isn't already allocated (friendly 409); vacating marks it vacated. After every allocation
 * change the room's occupancy is re-derived from the active allocation count (the bridge). All mutations
 * are audited.
 */
@Injectable()
export class HostelService {
  constructor(
    private readonly repo: HostelRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === blocks ================================================================

  async listBlocks(ctx: PortalActionContext, q: HostelBlocksListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listBlocks(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createBlock(ctx: PortalActionContext, input: CreateHostelBlockInput) {
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertBlock({
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      code: input.code ?? null,
      blockType: input.blockType,
      warden: input.warden ?? null,
      description: input.description ?? null,
      status: input.status,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'hostel.block.create', 'hostel_block', row.id, campusId, {
      newState: { name: row.name, blockType: row.blockType },
    });
    return row;
  }

  async updateBlock(ctx: PortalActionContext, id: string, input: UpdateHostelBlockInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findBlock(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const updated = await this.repo.updateBlock(id, input.version, {
      name: input.name ?? existing!.name,
      code: input.code === undefined ? existing!.code : input.code,
      blockType: input.blockType ?? existing!.blockType,
      warden: input.warden === undefined ? existing!.warden : input.warden,
      description: input.description === undefined ? existing!.description : input.description,
      status: input.status ?? existing!.status,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'hostel.block.update', 'hostel_block', id, updated.campusId, {
      newState: { name: updated.name, status: updated.status },
    });
    return updated;
  }

  async deleteBlock(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findBlock(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteBlock(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'hostel.block.delete', 'hostel_block', id, existing!.campusId, {
      previousState: { name: existing!.name },
    });
    return { deleted: true };
  }

  // === rooms =================================================================

  async listRooms(ctx: PortalActionContext, q: HostelRoomsListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listRooms(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createRoom(ctx: PortalActionContext, input: CreateHostelRoomInput) {
    await this.assertOptional(ctx, 'hostelBlocks', input.blockId, 'block');
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertRoom({
      institutionId: ctx.principal.institutionId,
      campusId,
      blockId: input.blockId ?? null,
      roomNo: input.roomNo,
      floor: input.floor ?? null,
      capacity: input.capacity,
      occupied: 0,
      roomType: input.roomType ?? null,
      status: input.status,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'hostel.room.create', 'hostel_room', row.id, campusId, {
      newState: { roomNo: row.roomNo, capacity: row.capacity },
    });
    return row;
  }

  async updateRoom(ctx: PortalActionContext, id: string, input: UpdateHostelRoomInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findRoom(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'hostelBlocks', input.blockId, 'block');
    const updated = await this.repo.updateRoom(id, input.version, {
      blockId: input.blockId === undefined ? existing!.blockId : input.blockId,
      roomNo: input.roomNo ?? existing!.roomNo,
      floor: input.floor === undefined ? existing!.floor : input.floor,
      capacity: input.capacity ?? existing!.capacity,
      roomType: input.roomType === undefined ? existing!.roomType : input.roomType,
      status: input.status ?? existing!.status,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'hostel.room.update', 'hostel_room', id, updated.campusId, {
      newState: { roomNo: updated.roomNo, status: updated.status },
    });
    return updated;
  }

  async deleteRoom(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findRoom(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteRoom(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'hostel.room.delete', 'hostel_room', id, existing!.campusId, {
      previousState: { roomNo: existing!.roomNo },
    });
    return { deleted: true };
  }

  // === allocations (the allocate→occupancy bridge) ===========================

  async listAllocations(ctx: PortalActionContext, roomId: string) {
    await this.requireRoomInScope(ctx, roomId);
    return this.repo.listAllocations(roomId);
  }

  /** Allocate a bed to a student. Checks capacity + no existing active allocation, then re-derives occupancy. */
  async allocate(ctx: PortalActionContext, roomId: string, input: AllocateHostelRoomInput) {
    const room = await this.requireRoomInScope(ctx, roomId);
    await this.assertRef(ctx, 'students', input.studentId, 'student');
    if (room.occupied >= room.capacity) {
      throw new BadRequestException({ code: 'ROOM_FULL', message: 'This room is already at full capacity.' });
    }
    if (await this.repo.findActiveAllocation(roomId, input.studentId)) {
      throw new ConflictException({ code: 'ALLOCATION_EXISTS', message: 'This student is already allocated to this room.' });
    }
    const allocation = await this.repo.insertAllocation({
      institutionId: ctx.principal.institutionId,
      roomId,
      studentId: input.studentId,
      bedNo: input.bedNo ?? null,
      fromDate: input.fromDate ?? null,
      toDate: input.toDate ?? null,
      status: 'active',
      notes: input.notes ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    const updatedRoom = await this.reconcile(ctx, roomId);
    await this.write(ctx, 'hostel.allocation.create', 'hostel_allocation', allocation.id, room.campusId, {
      newState: { roomId, studentId: allocation.studentId, occupied: updatedRoom?.occupied },
    });
    return { allocation, room: updatedRoom };
  }

  /** Vacate an active allocation, then re-derive the room's occupancy. */
  async vacate(ctx: PortalActionContext, roomId: string, allocationId: string, input: VacateHostelRoomInput) {
    const room = await this.requireRoomInScope(ctx, roomId);
    const allocation = await this.repo.findAllocation(allocationId, roomId);
    if (!allocation) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Allocation not found' });
    if (allocation.status === 'vacated') {
      throw new ConflictException({ code: 'ALREADY_VACATED', message: 'This allocation is already vacated.' });
    }
    const updated = await this.repo.updateAllocation(allocationId, allocation.version, {
      status: 'vacated',
      toDate: input.toDate ?? new Date().toISOString().slice(0, 10),
      notes: input.notes === undefined ? allocation.notes : input.notes,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    const updatedRoom = await this.reconcile(ctx, roomId);
    await this.write(ctx, 'hostel.allocation.vacate', 'hostel_allocation', allocationId, room.campusId, {
      newState: { roomId, status: updated.status, occupied: updatedRoom?.occupied },
    });
    return { allocation: updated, room: updatedRoom };
  }

  async removeAllocation(ctx: PortalActionContext, roomId: string, allocationId: string) {
    const room = await this.requireRoomInScope(ctx, roomId);
    const allocation = await this.repo.findAllocation(allocationId, roomId);
    if (!allocation) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Allocation not found' });
    await this.repo.deleteAllocation(allocationId);
    const updatedRoom = await this.reconcile(ctx, roomId);
    await this.write(ctx, 'hostel.allocation.remove', 'hostel_allocation', allocationId, room.campusId, {
      previousState: { roomId, studentId: allocation.studentId, status: allocation.status },
    });
    return { deleted: true, room: updatedRoom };
  }

  /** Re-derive a room's occupancy + status from the active allocation count (uses the room's current version). */
  private async reconcile(ctx: PortalActionContext, roomId: string) {
    const room = await this.repo.findRoom(roomId, ctx.principal.institutionId);
    if (!room) return undefined;
    const occupied = await this.repo.countActiveAllocations(roomId);
    const status =
      room.status === 'maintenance' ? 'maintenance' : occupied >= room.capacity ? 'full' : 'available';
    if (occupied === room.occupied && status === room.status) return room;
    return this.repo.updateRoom(roomId, room.version, { occupied, status, updatedBy: ctx.principal.institutionUserId });
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

  private async requireRoomInScope(ctx: PortalActionContext, roomId: string) {
    const f = this.filter(ctx);
    const room = await this.repo.findRoom(roomId, ctx.principal.institutionId);
    this.assertInScope(room?.campusId ?? null, room, f);
    return room;
  }

  private async assertRef(ctx: PortalActionContext, table: HostelRefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private async assertOptional(
    ctx: PortalActionContext,
    table: HostelRefTable,
    id: string | null | undefined,
    label: string,
  ): Promise<void> {
    if (!id) return;
    await this.assertRef(ctx, table, id, label);
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
