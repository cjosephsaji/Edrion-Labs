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
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import { resolveScopeFilter, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { AUDIT_WRITER, DATABASE } from '../../common/tokens';
import type { ListResult } from './academics.service';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';
import { PortalEntityResolver, type RefType, type ResolveRequest } from './portal-entity-resolver';

/** Declares an FK column that should be resolved to a readable {@link EntityDisplay} on read. */
export interface RefSpec {
  /** Row property holding the UUID, e.g. 'studentId'. */
  column: string;
  /** What kind of entity the UUID points at. */
  type: RefType;
  /** Row property to attach the resolved display under, e.g. 'student'. */
  as: string;
}

/** Maps a RefType to the resolver-request bucket that collects its ids. */
const REF_BUCKET: Record<RefType, keyof ResolveRequest> = {
  student: 'studentIds',
  teacher: 'teacherIds',
  staff: 'staffIds',
  parent: 'parentIds',
  class: 'classIds',
  gradeLevel: 'gradeLevelIds',
  department: 'departmentIds',
  subject: 'subjectIds',
  campus: 'campusIds',
  user: 'userIds',
};

/** The standard portal columns every Phase-13 table carries (see schema/_helpers + announcements). */
export interface CrudColumns {
  id: PgColumn;
  institutionId: PgColumn;
  campusId: PgColumn;
  version: PgColumn;
  createdAt: PgColumn;
  status?: PgColumn;
}

export interface CrudConfig {
  /** The Drizzle pgTable. Loosely typed so one engine serves every flat resource. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  columns: CrudColumns;
  /** Audit module, e.g. 'portal-health'. */
  module: string;
  /** Audit entity type, e.g. 'health_record'. */
  entityType: string;
  /** Audit action prefix, e.g. 'health.record' → health.record.create/update/delete/view. */
  actionPrefix: string;
  /** Columns matched by the `search` query param (ilike OR). */
  search: PgColumn[];
  /** Sortable columns keyed by the wire `sortBy` value. */
  sortable: Record<string, PgColumn>;
  /** Build the audit before/after snapshot from a row. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  snapshot?: (row: any) => Record<string, unknown>;
  /** When true, a GET-by-id writes a read audit event (e.g. sensitive counseling notes). */
  auditReads?: boolean;
  /**
   * Declarative FK→display enrichment applied on every list/get. Each spec resolves a UUID column
   * to a readable {@link EntityDisplay} (batched, no N+1) and attaches it under `as`. The raw id
   * column is left untouched, so the web can show a name and still edit by id.
   */
  refs?: RefSpec[];
  /**
   * Bespoke enrichment escape-hatch, run after `refs`. Receives the (already ref-enriched) page and
   * returns it with any extra derived fields (e.g. a student's guardian + age for Health). Must be
   * batched by the implementer. Mutating the rows in place and returning them is fine.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrich?: (rows: any[], ctx: PortalActionContext) => Promise<any[]>;
}

export interface CrudListQuery {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  search?: string;
  status?: string;
}

/**
 * Generic, scope-aware CRUD engine for the Phase-13 functional staff modules. Every flat,
 * campus-scoped, version-guarded portal table shares the exact same invariants the bespoke Phase 2–9
 * services hand-roll (institution + campus scope confinement, optimistic-concurrency, campus
 * stamping on create, and an audit event per mutation). Rather than copy that ~150-line shape into
 * 20 new repositories, the new modules describe their table with a CrudConfig and delegate here. The
 * server permission guard still gates every endpoint; this engine only enforces tenancy + scope.
 */
@Injectable()
export class PortalCrudEngine {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
    private readonly resolver: PortalEntityResolver,
  ) {}

  async list<TRow>(cfg: CrudConfig, ctx: PortalActionContext, q: CrudListQuery): Promise<ListResult<TRow>> {
    const f = this.filter(ctx);
    const c = cfg.columns;
    const conds: SQL[] = [eq(c.institutionId, ctx.principal.institutionId)];
    if (f.campusIds) {
      const inScope = or(isNull(c.campusId), inArray(c.campusId, f.campusIds));
      if (inScope) conds.push(inScope);
    }
    if (q.status && c.status) conds.push(eq(c.status, q.status));
    if (q.search && cfg.search.length > 0) {
      const s = or(...cfg.search.map((col) => ilike(col, `%${q.search}%`)));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortCol = (q.sortBy ? cfg.sortable[q.sortBy] : undefined) ?? c.createdAt;
    const orderBy = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);
    const rows = await this.db
      .select()
      .from(cfg.table)
      .where(where)
      .orderBy(orderBy)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(cfg.table).where(where);
    const total = Number(tot?.value ?? 0);
    const items = await this.enrichRows(cfg, ctx, rows);
    return { items: items as TRow[], total, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < total };
  }

  /** Fetch one row by id, asserting it is inside the request scope. Optionally audits the read. */
  async get<TRow>(cfg: CrudConfig, ctx: PortalActionContext, id: string): Promise<TRow> {
    const row = await this.requireInScope(cfg, ctx, id);
    if (cfg.auditReads) {
      await this.write(cfg, ctx, `${cfg.actionPrefix}.view`, id, row.campusId ?? null, {});
    }
    const [enriched] = await this.enrichRows(cfg, ctx, [row]);
    return enriched as TRow;
  }

  async create<TRow>(cfg: CrudConfig, ctx: PortalActionContext, values: Record<string, unknown>): Promise<TRow> {
    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const [row] = await this.db
      .insert(cfg.table)
      .values({
        ...this.clean(values),
        institutionId: ctx.principal.institutionId,
        campusId,
        createdBy: ctx.principal.institutionUserId,
      })
      .returning();
    await this.write(cfg, ctx, `${cfg.actionPrefix}.create`, row.id, row.campusId ?? null, {
      newState: cfg.snapshot ? cfg.snapshot(row) : undefined,
    });
    return row as TRow;
  }

  async update<TRow>(
    cfg: CrudConfig,
    ctx: PortalActionContext,
    id: string,
    version: number,
    patch: Record<string, unknown>,
  ): Promise<TRow> {
    await this.requireInScope(cfg, ctx, id);
    const [row] = await this.db
      .update(cfg.table)
      .set({
        ...this.clean(patch),
        version: version + 1,
        updatedBy: ctx.principal.institutionUserId,
        updatedAt: new Date(),
      })
      .where(and(eq(cfg.columns.id, id), eq(cfg.columns.version, version)))
      .returning();
    if (!row) throw this.versionConflict();
    await this.write(cfg, ctx, `${cfg.actionPrefix}.update`, id, row.campusId ?? null, {
      newState: cfg.snapshot ? cfg.snapshot(row) : undefined,
    });
    return row as TRow;
  }

  async remove(cfg: CrudConfig, ctx: PortalActionContext, id: string, version: number): Promise<{ deleted: true }> {
    const existing = await this.requireInScope(cfg, ctx, id);
    const rows = await this.db
      .delete(cfg.table)
      .where(and(eq(cfg.columns.id, id), eq(cfg.columns.version, version)))
      .returning({ id: cfg.columns.id });
    if (rows.length === 0) throw this.versionConflict();
    await this.write(cfg, ctx, `${cfg.actionPrefix}.delete`, id, existing.campusId ?? null, {
      previousState: cfg.snapshot ? cfg.snapshot(existing) : undefined,
    });
    return { deleted: true };
  }

  // === helpers ===============================================================

  /**
   * Turn FK UUIDs into readable {@link EntityDisplay} objects (declarative `refs`, one batched query
   * per referenced kind), then run the optional bespoke `enrich`. Leaves the raw id columns in place
   * so the web can render a name and still edit/delete by id. No-op when a config declares neither.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async enrichRows(cfg: CrudConfig, ctx: PortalActionContext, rows: any[]): Promise<any[]> {
    if (rows.length > 0 && cfg.refs && cfg.refs.length > 0) {
      const req: ResolveRequest = {};
      const bucket = (key: keyof ResolveRequest) => ((req[key] ??= new Set<string>()) as Set<string>);
      for (const spec of cfg.refs) {
        const set = bucket(REF_BUCKET[spec.type]);
        for (const row of rows) {
          const v = row[spec.column];
          if (typeof v === 'string' && v) set.add(v);
        }
      }
      const resolved = await this.resolver.resolve(ctx.principal.institutionId, req);
      for (const row of rows) {
        for (const spec of cfg.refs) {
          const v = row[spec.column];
          row[spec.as] = typeof v === 'string' && v ? (resolved[spec.type]?.[v] ?? null) : null;
        }
      }
    }
    if (cfg.enrich) return cfg.enrich(rows, ctx);
    return rows;
  }

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  /** Drop undefined keys so a partial PATCH never clobbers a column with `undefined`. */
  private clean(values: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async findById(cfg: CrudConfig, institutionId: string, id: string): Promise<any | undefined> {
    const [row] = await this.db
      .select()
      .from(cfg.table)
      .where(and(eq(cfg.columns.id, id), eq(cfg.columns.institutionId, institutionId)))
      .limit(1);
    return row;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async requireInScope(cfg: CrudConfig, ctx: PortalActionContext, id: string): Promise<any> {
    const f = this.filter(ctx);
    const row = await this.findById(cfg, ctx.principal.institutionId, id);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found' });
    const campusId = (row.campusId ?? null) as string | null;
    if (campusId !== null && f.campusIds !== null && !f.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
    return row;
  }

  private async write(
    cfg: CrudConfig,
    ctx: PortalActionContext,
    action: string,
    entityId: string,
    campusId: string | null,
    extra: Partial<AuditEventInput>,
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: cfg.module,
      entityType: cfg.entityType,
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
