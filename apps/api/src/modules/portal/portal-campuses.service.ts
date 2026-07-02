import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  inArray,
  or,
  schema,
  type Database,
  type SQL,
} from '@edrion/database';
import { resolveScopeFilter, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  CreatePortalCampusInput,
  PortalCampusesListQuery,
  UpdatePortalCampusInput,
} from '@edrion/schemas';
import type { Campus, NewCampus } from '@edrion/database';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { ListResult } from './academics.service';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';
import { buildCampusCode } from '../campuses/campus-code';

const MODULE = 'portal-campuses';

/**
 * Institution-portal Campuses service (Administration). The tenant manages its OWN campuses — the
 * platform CampusesService (control-plane) owns billing/charge logic; here creation just stamps a
 * unique, immutable code and a default `included` billing status. Reads need `campuses.view`; writes
 * the sensitive `campuses.manage`. Campus-confined principals only see/edit campuses in their scope.
 */
@Injectable()
export class PortalCampusesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: PortalCampusesListQuery): Promise<ListResult<Campus>> {
    const f = this.filter(ctx);
    const conds: SQL[] = [eq(schema.campuses.institutionId, ctx.principal.institutionId)];
    if (f.campusIds) conds.push(inArray(schema.campuses.id, f.campusIds.length ? f.campusIds : ['']));
    if (q.status === 'active') conds.push(eq(schema.campuses.isActive, true));
    if (q.status === 'inactive') conds.push(eq(schema.campuses.isActive, false));
    if (q.search) {
      const s = or(
        ilike(schema.campuses.name, `%${q.search}%`),
        ilike(schema.campuses.code, `%${q.search}%`),
      );
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortCol =
      q.sortBy === 'name'
        ? schema.campuses.name
        : q.sortBy === 'code'
          ? schema.campuses.code
          : schema.campuses.createdAt;
    const orderBy = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);
    const items = await this.db
      .select()
      .from(schema.campuses)
      .where(where)
      .orderBy(orderBy)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(schema.campuses).where(where);
    const total = Number(tot?.value ?? 0);
    return { items, total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < total };
  }

  async create(ctx: PortalActionContext, input: CreatePortalCampusInput): Promise<Campus> {
    const existingCodes = (
      await this.db
        .select({ code: schema.campuses.code })
        .from(schema.campuses)
        .where(eq(schema.campuses.institutionId, ctx.principal.institutionId))
    ).map((r) => r.code);
    const code = buildCampusCode(input.name, existingCodes);
    const values: NewCampus = {
      institutionId: ctx.principal.institutionId,
      name: input.name,
      code,
      address: this.buildAddress(input),
      timezoneOverride: input.timezoneOverride ?? null,
      studentCapacity: input.studentCapacity ?? null,
      isActive: input.status !== 'inactive',
      createdBy: ctx.principal.institutionUserId,
    };
    const [row] = await this.db.insert(schema.campuses).values(values).returning();
    await this.write(ctx, 'campus.create', row!.id, { newState: { name: row!.name, code: row!.code } });
    return row!;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdatePortalCampusInput): Promise<Campus> {
    const existing = await this.requireInScope(ctx, id);
    const { version, ...rest } = input;
    const patch: Partial<NewCampus> = {};
    if (rest.name !== undefined) patch.name = rest.name;
    if (rest.timezoneOverride !== undefined) patch.timezoneOverride = rest.timezoneOverride ?? null;
    if (rest.studentCapacity !== undefined) patch.studentCapacity = rest.studentCapacity ?? null;
    if (rest.status !== undefined) patch.isActive = rest.status !== 'inactive';
    // Rebuild the address jsonb only when any address field was supplied (merge over the existing).
    if (this.touchesAddress(rest)) patch.address = this.buildAddress(rest, existing.address);
    const [row] = await this.db
      .update(schema.campuses)
      .set({ ...patch, version: version + 1, updatedBy: ctx.principal.institutionUserId, updatedAt: new Date() })
      .where(and(eq(schema.campuses.id, id), eq(schema.campuses.version, version)))
      .returning();
    if (!row) throw this.versionConflict();
    await this.write(ctx, 'campus.update', id, { newState: { name: row.name, isActive: row.isActive } });
    return row;
  }

  async remove(ctx: PortalActionContext, id: string, version: number): Promise<{ deleted: true }> {
    const existing = await this.requireInScope(ctx, id);
    const rows = await this.db
      .delete(schema.campuses)
      .where(and(eq(schema.campuses.id, id), eq(schema.campuses.version, version)))
      .returning({ id: schema.campuses.id });
    if (rows.length === 0) throw this.versionConflict();
    await this.write(ctx, 'campus.delete', id, { previousState: { name: existing.name, code: existing.code } });
    return { deleted: true };
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private async requireInScope(ctx: PortalActionContext, id: string): Promise<Campus> {
    const [row] = await this.db
      .select()
      .from(schema.campuses)
      .where(and(eq(schema.campuses.id, id), eq(schema.campuses.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Campus not found' });
    const f = this.filter(ctx);
    if (f.campusIds !== null && !f.campusIds.includes(row.id)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
    return row;
  }

  private touchesAddress(input: Partial<CreatePortalCampusInput>): boolean {
    return (
      input.addressLine1 !== undefined ||
      input.addressCity !== undefined ||
      input.addressRegion !== undefined ||
      input.addressCountry !== undefined
    );
  }

  /** Assemble the flat address fields into the stored jsonb, or null when nothing is set. */
  private buildAddress(
    input: Partial<CreatePortalCampusInput>,
    fallback?: Record<string, unknown> | null,
  ): Record<string, unknown> | null {
    const base = (fallback ?? {}) as Record<string, unknown>;
    const line1 = input.addressLine1 ?? base.line1 ?? null;
    const city = input.addressCity ?? base.city ?? null;
    const region = input.addressRegion ?? base.region ?? null;
    const country = input.addressCountry ?? base.country ?? null;
    if (!line1 && !city && !region && !country) return null;
    return { line1, city, region, country };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityId: string,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType: 'campus',
      entityId,
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
