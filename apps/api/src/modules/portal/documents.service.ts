import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
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
  type SQL,
} from '@edrion/database';
import { resolveScopeFilter, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type {
  CreatePortalDocumentInput,
  PortalDocumentsListQuery,
  UpdatePortalDocumentInput,
} from '@edrion/schemas';
import type { InstitutionDocument, NewInstitutionDocument } from '@edrion/database';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { ListResult } from './academics.service';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-documents';

/**
 * Institution-portal Documents & Policies service (Administration). Campus-scoped (campus_id null =
 * institution-wide), version-guarded. Adds domain filters (category, published) on top of the shared
 * CRUD invariants. Reads need `documents.view`; writes the sensitive `documents.manage`.
 */
@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async list(ctx: PortalActionContext, q: PortalDocumentsListQuery): Promise<ListResult<InstitutionDocument>> {
    const f = this.filter(ctx);
    const t = schema.institutionDocuments;
    const conds: SQL[] = [eq(t.institutionId, ctx.principal.institutionId)];
    if (f.campusIds) {
      const inScope = or(isNull(t.campusId), inArray(t.campusId, f.campusIds));
      if (inScope) conds.push(inScope);
    }
    if (q.category) conds.push(eq(t.category, q.category));
    if (q.published) conds.push(eq(t.published, q.published === 'true'));
    if (q.search) {
      const s = or(ilike(t.title, `%${q.search}%`), ilike(t.description, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortCol = q.sortBy === 'title' ? t.title : q.sortBy === 'category' ? t.category : t.createdAt;
    const orderBy = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);
    const items = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(orderBy)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    const total = Number(tot?.value ?? 0);
    return { items, total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < total };
  }

  async create(ctx: PortalActionContext, input: CreatePortalDocumentInput): Promise<InstitutionDocument> {
    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const values: NewInstitutionDocument = {
      institutionId: ctx.principal.institutionId,
      campusId,
      title: input.title,
      category: input.category,
      description: input.description ?? null,
      url: input.url,
      requiresAck: input.requiresAck,
      published: input.published,
      createdBy: ctx.principal.institutionUserId,
    };
    const [row] = await this.db.insert(schema.institutionDocuments).values(values).returning();
    await this.write(ctx, 'document.create', row!.id, row!.campusId, {
      newState: { title: row!.title, category: row!.category, published: row!.published },
    });
    return row!;
  }

  async update(ctx: PortalActionContext, id: string, input: UpdatePortalDocumentInput): Promise<InstitutionDocument> {
    await this.requireInScope(ctx, id);
    const { version, ...rest } = input;
    const patch: Partial<NewInstitutionDocument> = {};
    if (rest.title !== undefined) patch.title = rest.title;
    if (rest.category !== undefined) patch.category = rest.category;
    if (rest.description !== undefined) patch.description = rest.description ?? null;
    if (rest.url !== undefined) patch.url = rest.url;
    if (rest.requiresAck !== undefined) patch.requiresAck = rest.requiresAck;
    if (rest.published !== undefined) patch.published = rest.published;
    const [row] = await this.db
      .update(schema.institutionDocuments)
      .set({ ...patch, version: version + 1, updatedBy: ctx.principal.institutionUserId, updatedAt: new Date() })
      .where(and(eq(schema.institutionDocuments.id, id), eq(schema.institutionDocuments.version, version)))
      .returning();
    if (!row) throw this.versionConflict();
    await this.write(ctx, 'document.update', id, row.campusId, {
      newState: { title: row.title, category: row.category, published: row.published },
    });
    return row;
  }

  async remove(ctx: PortalActionContext, id: string, version: number): Promise<{ deleted: true }> {
    const existing = await this.requireInScope(ctx, id);
    const rows = await this.db
      .delete(schema.institutionDocuments)
      .where(and(eq(schema.institutionDocuments.id, id), eq(schema.institutionDocuments.version, version)))
      .returning({ id: schema.institutionDocuments.id });
    if (rows.length === 0) throw this.versionConflict();
    await this.write(ctx, 'document.delete', id, existing.campusId, { previousState: { title: existing.title } });
    return { deleted: true };
  }

  // === helpers ===============================================================

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private async requireInScope(ctx: PortalActionContext, id: string): Promise<InstitutionDocument> {
    const [row] = await this.db
      .select()
      .from(schema.institutionDocuments)
      .where(and(eq(schema.institutionDocuments.id, id), eq(schema.institutionDocuments.institutionId, ctx.principal.institutionId)))
      .limit(1);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Document not found' });
    const f = this.filter(ctx);
    const campusId = row.campusId ?? null;
    if (campusId !== null && f.campusIds !== null && !f.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
    return row;
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType: 'institution_document',
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
