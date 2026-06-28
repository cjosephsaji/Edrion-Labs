import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { resolveScopeFilter, type InstitutionScope, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  CreateTransportAssignmentInput,
  CreateTransportRouteInput,
  CreateTransportVehicleInput,
  TransportRoutesListQuery,
  TransportVehiclesListQuery,
  UpdateTransportAssignmentInput,
  UpdateTransportRouteInput,
  UpdateTransportVehicleInput,
} from '@edrion/schemas';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { TransportRepository, type TransportRefTable } from './transport.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-transport';

/**
 * Institution-portal Transport service (Phase 8). Routes + vehicles are campus-scoped and
 * version-guarded; the per-student assignments inherit the route's campus and are only reachable
 * through a route the caller can see (requireRouteInScope). FKs (a vehicle's route, an assignment's
 * student) are pre-checked for friendly 400s; a duplicate (route, student) assignment is a friendly
 * 409. All mutations are audited.
 */
@Injectable()
export class TransportService {
  constructor(
    private readonly repo: TransportRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // === routes ================================================================

  async listRoutes(ctx: PortalActionContext, q: TransportRoutesListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listRoutes(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createRoute(ctx: PortalActionContext, input: CreateTransportRouteInput) {
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertRoute({
      institutionId: ctx.principal.institutionId,
      campusId,
      name: input.name,
      code: input.code ?? null,
      description: input.description ?? null,
      fare: input.fare,
      status: input.status,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'transport.route.create', 'transport_route', row.id, campusId, {
      newState: { name: row.name, fare: row.fare },
    });
    return row;
  }

  async updateRoute(ctx: PortalActionContext, id: string, input: UpdateTransportRouteInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findRoute(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const updated = await this.repo.updateRoute(id, input.version, {
      name: input.name ?? existing!.name,
      code: input.code === undefined ? existing!.code : input.code,
      description: input.description === undefined ? existing!.description : input.description,
      fare: input.fare ?? existing!.fare,
      status: input.status ?? existing!.status,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'transport.route.update', 'transport_route', id, updated.campusId, {
      newState: { name: updated.name, status: updated.status },
    });
    return updated;
  }

  async deleteRoute(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findRoute(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteRoute(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'transport.route.delete', 'transport_route', id, existing!.campusId, {
      previousState: { name: existing!.name },
    });
    return { deleted: true };
  }

  // === vehicles ==============================================================

  async listVehicles(ctx: PortalActionContext, q: TransportVehiclesListQuery) {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listVehicles(ctx.principal.institutionId, f.campusIds, q), q);
  }

  async createVehicle(ctx: PortalActionContext, input: CreateTransportVehicleInput) {
    await this.assertOptional(ctx, 'transportRoutes', input.routeId, 'route');
    const campusId = this.createCampusId(ctx.scope);
    const row = await this.repo.insertVehicle({
      institutionId: ctx.principal.institutionId,
      campusId,
      registrationNo: input.registrationNo,
      model: input.model ?? null,
      capacity: input.capacity,
      routeId: input.routeId ?? null,
      driverName: input.driverName ?? null,
      driverPhone: input.driverPhone ?? null,
      status: input.status,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'transport.vehicle.create', 'transport_vehicle', row.id, campusId, {
      newState: { registrationNo: row.registrationNo, capacity: row.capacity },
    });
    return row;
  }

  async updateVehicle(ctx: PortalActionContext, id: string, input: UpdateTransportVehicleInput) {
    const f = this.filter(ctx);
    const existing = await this.repo.findVehicle(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    await this.assertOptional(ctx, 'transportRoutes', input.routeId, 'route');
    const updated = await this.repo.updateVehicle(id, input.version, {
      registrationNo: input.registrationNo ?? existing!.registrationNo,
      model: input.model === undefined ? existing!.model : input.model,
      capacity: input.capacity ?? existing!.capacity,
      routeId: input.routeId === undefined ? existing!.routeId : input.routeId,
      driverName: input.driverName === undefined ? existing!.driverName : input.driverName,
      driverPhone: input.driverPhone === undefined ? existing!.driverPhone : input.driverPhone,
      status: input.status ?? existing!.status,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'transport.vehicle.update', 'transport_vehicle', id, updated.campusId, {
      newState: { registrationNo: updated.registrationNo, status: updated.status },
    });
    return updated;
  }

  async deleteVehicle(ctx: PortalActionContext, id: string, version: number) {
    const f = this.filter(ctx);
    const existing = await this.repo.findVehicle(id, ctx.principal.institutionId);
    this.assertInScope(existing?.campusId ?? null, existing, f);
    const ok = await this.repo.deleteVehicle(id, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'transport.vehicle.delete', 'transport_vehicle', id, existing!.campusId, {
      previousState: { registrationNo: existing!.registrationNo },
    });
    return { deleted: true };
  }

  // === assignments (per student, against a route) ============================

  async listAssignments(ctx: PortalActionContext, routeId: string) {
    await this.requireRouteInScope(ctx, routeId);
    return this.repo.listAssignments(routeId);
  }

  async createAssignment(ctx: PortalActionContext, routeId: string, input: CreateTransportAssignmentInput) {
    const route = await this.requireRouteInScope(ctx, routeId);
    await this.assertRef(ctx, 'students', input.studentId, 'student');
    if (await this.repo.findAssignmentByStudent(routeId, input.studentId)) {
      throw new ConflictException({ code: 'ASSIGNMENT_EXISTS', message: 'This student is already assigned to this route.' });
    }
    const row = await this.repo.insertAssignment({
      institutionId: ctx.principal.institutionId,
      routeId,
      studentId: input.studentId,
      stopName: input.stopName ?? null,
      pickupTime: input.pickupTime ?? null,
      dropTime: input.dropTime ?? null,
      status: input.status,
      notes: input.notes ?? null,
      createdBy: ctx.principal.institutionUserId,
    });
    await this.write(ctx, 'transport.assignment.create', 'transport_assignment', row.id, route.campusId, {
      newState: { routeId, studentId: row.studentId },
    });
    return row;
  }

  async updateAssignment(ctx: PortalActionContext, routeId: string, assignmentId: string, input: UpdateTransportAssignmentInput) {
    const route = await this.requireRouteInScope(ctx, routeId);
    const existing = await this.repo.findAssignment(assignmentId, routeId);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });
    if (input.studentId && input.studentId !== existing.studentId) {
      await this.assertRef(ctx, 'students', input.studentId, 'student');
      const dupe = await this.repo.findAssignmentByStudent(routeId, input.studentId);
      if (dupe && dupe.id !== assignmentId) {
        throw new ConflictException({ code: 'ASSIGNMENT_EXISTS', message: 'This student is already assigned to this route.' });
      }
    }
    const updated = await this.repo.updateAssignment(assignmentId, input.version, {
      studentId: input.studentId ?? existing.studentId,
      stopName: input.stopName === undefined ? existing.stopName : input.stopName,
      pickupTime: input.pickupTime === undefined ? existing.pickupTime : input.pickupTime,
      dropTime: input.dropTime === undefined ? existing.dropTime : input.dropTime,
      status: input.status ?? existing.status,
      notes: input.notes === undefined ? existing.notes : input.notes,
      updatedBy: ctx.principal.institutionUserId,
    });
    if (!updated) throw this.versionConflict();
    await this.write(ctx, 'transport.assignment.update', 'transport_assignment', assignmentId, route.campusId, {
      newState: { routeId, studentId: updated.studentId, status: updated.status },
    });
    return updated;
  }

  async deleteAssignment(ctx: PortalActionContext, routeId: string, assignmentId: string, version: number) {
    const route = await this.requireRouteInScope(ctx, routeId);
    const existing = await this.repo.findAssignment(assignmentId, routeId);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });
    const ok = await this.repo.deleteAssignment(assignmentId, version);
    if (!ok) throw this.versionConflict();
    await this.write(ctx, 'transport.assignment.delete', 'transport_assignment', assignmentId, route.campusId, {
      previousState: { routeId, studentId: existing.studentId },
    });
    return { deleted: true };
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

  private async requireRouteInScope(ctx: PortalActionContext, routeId: string) {
    const f = this.filter(ctx);
    const route = await this.repo.findRoute(routeId, ctx.principal.institutionId);
    this.assertInScope(route?.campusId ?? null, route, f);
    return route;
  }

  private async assertRef(ctx: PortalActionContext, table: TransportRefTable, id: string, label: string): Promise<void> {
    const ok = await this.repo.existsInInstitution(table, id, ctx.principal.institutionId);
    if (!ok) throw new BadRequestException({ code: 'INVALID_REFERENCE', message: `Unknown ${label}` });
  }

  private async assertOptional(
    ctx: PortalActionContext,
    table: TransportRefTable,
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
