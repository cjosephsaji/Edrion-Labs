import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Inject,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { and, count, desc, eq, ilike, inArray, isNull, or, schema, type Database, type SQL } from '@edrion/database';
import { resolveScopeFilter } from '@edrion/auth';
import type { InstitutionPrincipal, InstitutionScope } from '@edrion/auth';
import {
  createRecipientGroupSchema,
  previewRecipientsSchema,
  recipientGroupsListQuerySchema,
  updateRecipientGroupSchema,
  versionedDeleteSchema,
  type CreateRecipientGroupInput,
  type PreviewRecipientsInput,
  type RecipientGroupsListQuery,
  type UpdateRecipientGroupInput,
  type VersionedDeleteInput,
} from '@edrion/schemas';
import { Public } from '../../common/guards/auth.guard';
import { ReqContext, SkipRateLimit } from '../../common/decorators';
import type { EdrionRequestContext } from '../../common/request-context';
import { zodBody } from '../../common/zod-validation.pipe';
import { DATABASE } from '../../common/tokens';
import { InstitutionAuthGuard } from './portal-auth.guard';
import { InstitutionPermissionsGuard } from './portal-permissions.guard';
import { CurrentInstitutionPrincipal, CurrentScope, RequireInstitutionPermissions } from './portal.decorators';
import type { PortalActionContext } from './portal-action-context';
import { RecipientResolver } from './recipient-resolver.service';

/**
 * Saved/custom recipient groups + the pre-send recipient preview (admin-redesign Phase 3). A group is a
 * named bundle of targets (see schema/recipients.ts). Reads need announcements.view; mutations +
 * preview need announcements.send. Scope-confined like every other portal resource.
 */
@Injectable()
export class RecipientsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly resolver: RecipientResolver,
  ) {}

  private campusIds(ctx: PortalActionContext) {
    return resolveScopeFilter(ctx.principal, ctx.scope).campusIds;
  }

  async listGroups(ctx: PortalActionContext, q: RecipientGroupsListQuery) {
    const g = schema.recipientGroups;
    const campusIds = this.campusIds(ctx);
    const conds: SQL[] = [eq(g.institutionId, ctx.principal.institutionId)];
    if (campusIds) {
      const s = or(isNull(g.campusId), inArray(g.campusId, campusIds));
      if (s) conds.push(s);
    }
    if (q.search) {
      const s = ilike(g.name, `%${q.search}%`);
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const rows = await this.db
      .select()
      .from(g)
      .where(where)
      .orderBy(desc(g.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(g).where(where);
    const withMembers = await this.attachMembers(ctx.principal.institutionId, rows);
    return { items: withMembers, total: Number(tot?.value ?? 0), page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < Number(tot?.value ?? 0) };
  }

  private async attachMembers<T extends { id: string }>(institutionId: string, groups: T[]) {
    if (groups.length === 0) return [] as Array<T & { members: Array<{ kind: string; refId: string | null; label: string }> }>;
    const m = schema.recipientGroupMembers;
    const memberRows = await this.db
      .select({ groupId: m.groupId, kind: m.kind, refId: m.refId })
      .from(m)
      .where(and(eq(m.institutionId, institutionId), inArray(m.groupId, groups.map((x) => x.id))));
    const flat = memberRows.map((r) => ({ groupId: r.groupId, kind: r.kind, refId: r.refId }));
    const described = await this.resolver.describeTargets(institutionId, flat.map((f) => ({ kind: f.kind, refId: f.refId })));
    const byGroup = new Map<string, Array<{ kind: string; refId: string | null; label: string }>>();
    flat.forEach((f, i) => {
      const arr = byGroup.get(f.groupId) ?? [];
      arr.push(described[i]!);
      byGroup.set(f.groupId, arr);
    });
    return groups.map((grp) => ({ ...grp, members: byGroup.get(grp.id) ?? [] }));
  }

  async createGroup(ctx: PortalActionContext, input: CreateRecipientGroupInput) {
    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const [row] = await this.db
      .insert(schema.recipientGroups)
      .values({ institutionId: ctx.principal.institutionId, campusId, name: input.name, description: input.description ?? null, createdBy: ctx.principal.institutionUserId })
      .returning();
    await this.setMembers(row!.id, ctx.principal.institutionId, input.members);
    return (await this.attachMembers(ctx.principal.institutionId, [row!]))[0];
  }

  async updateGroup(ctx: PortalActionContext, id: string, input: UpdateRecipientGroupInput) {
    const existing = await this.requireGroup(ctx, id);
    const [row] = await this.db
      .update(schema.recipientGroups)
      .set({
        name: input.name ?? existing.name,
        description: input.description === undefined ? existing.description : input.description,
        version: input.version + 1,
        updatedBy: ctx.principal.institutionUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(schema.recipientGroups.id, id), eq(schema.recipientGroups.version, input.version)))
      .returning();
    if (!row) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'This group changed since you loaded it. Reload and try again.' });
    if (input.members !== undefined) await this.setMembers(id, ctx.principal.institutionId, input.members);
    return (await this.attachMembers(ctx.principal.institutionId, [row]))[0];
  }

  async removeGroup(ctx: PortalActionContext, id: string, version: number) {
    await this.requireGroup(ctx, id);
    const rows = await this.db
      .delete(schema.recipientGroups)
      .where(and(eq(schema.recipientGroups.id, id), eq(schema.recipientGroups.version, version)))
      .returning({ id: schema.recipientGroups.id });
    if (rows.length === 0) throw new ConflictException({ code: 'VERSION_CONFLICT', message: 'This group changed since you loaded it. Reload and try again.' });
    return { deleted: true };
  }

  async preview(ctx: PortalActionContext, input: PreviewRecipientsInput) {
    return this.resolver.resolve(ctx.principal.institutionId, this.campusIds(ctx), input.targets);
  }

  private async requireGroup(ctx: PortalActionContext, id: string) {
    const [row] = await this.db
      .select()
      .from(schema.recipientGroups)
      .where(and(eq(schema.recipientGroups.id, id), eq(schema.recipientGroups.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Group not found' });
    const campusIds = this.campusIds(ctx);
    if (row.campusId !== null && campusIds !== null && !campusIds.includes(row.campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Group not found in the current scope' });
    }
    return row;
  }

  private async setMembers(groupId: string, institutionId: string, members: Array<{ kind: string; refId?: string | null }>) {
    const m = schema.recipientGroupMembers;
    await this.db.delete(m).where(and(eq(m.groupId, groupId), eq(m.institutionId, institutionId)));
    if (members.length === 0) return;
    await this.db.insert(m).values(members.map((x) => ({ institutionId, groupId, kind: x.kind, refId: x.refId ?? null })));
  }
}

@ApiTags('portal-recipients')
@Controller('portal')
@Public()
@SkipRateLimit()
@UseGuards(InstitutionAuthGuard, InstitutionPermissionsGuard)
export class RecipientsController {
  constructor(private readonly svc: RecipientsService) {}

  private ctx(p: InstitutionPrincipal, s: InstitutionScope, r: EdrionRequestContext): PortalActionContext {
    return { principal: p, scope: s, request: r };
  }

  @Get('recipient-groups')
  @RequireInstitutionPermissions('announcements.view')
  listGroups(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Query(zodBody(recipientGroupsListQuerySchema)) q: RecipientGroupsListQuery,
  ) {
    return this.svc.listGroups(this.ctx(p, s, r), q);
  }

  @Post('recipient-groups')
  @RequireInstitutionPermissions('announcements.send')
  createGroup(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(createRecipientGroupSchema)) body: CreateRecipientGroupInput,
  ) {
    return this.svc.createGroup(this.ctx(p, s, r), body);
  }

  @Patch('recipient-groups/:id')
  @RequireInstitutionPermissions('announcements.send')
  updateGroup(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(updateRecipientGroupSchema)) body: UpdateRecipientGroupInput,
  ) {
    return this.svc.updateGroup(this.ctx(p, s, r), id, body);
  }

  @Delete('recipient-groups/:id')
  @RequireInstitutionPermissions('announcements.send')
  removeGroup(
    @Param('id') id: string,
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(versionedDeleteSchema)) body: VersionedDeleteInput,
  ) {
    return this.svc.removeGroup(this.ctx(p, s, r), id, body.version);
  }

  @Post('recipients/preview')
  @RequireInstitutionPermissions('announcements.send')
  preview(
    @CurrentInstitutionPrincipal() p: InstitutionPrincipal,
    @CurrentScope() s: InstitutionScope,
    @ReqContext() r: EdrionRequestContext,
    @Body(zodBody(previewRecipientsSchema)) body: PreviewRecipientsInput,
  ) {
    return this.svc.preview(this.ctx(p, s, r), body);
  }
}
