import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gte,
  ilike,
  lt,
  or,
  schema,
  sql,
  type Database,
  type SQL,
} from '@edrion/database';
import type { ListActivityQuery, ListAuditQuery } from '@edrion/schemas';
import type { AuditEvent } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

/** Opaque cursor: occurredAt + id, base64-encoded, for stable keyset pagination. */
interface DecodedCursor {
  occurredAt: string;
  id: string;
}

function encodeCursor(occurredAt: Date, id: string): string {
  return Buffer.from(`${occurredAt.toISOString()}|${id}`, 'utf8').toString('base64url');
}

function decodeCursor(cursor: string): DecodedCursor | null {
  try {
    const [occurredAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
    if (!occurredAt || !id) return null;
    return { occurredAt, id };
  } catch {
    return null;
  }
}

/** Typed SQL only. Append-only tables — reads only, never writes here. */
@Injectable()
export class AuditRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private auditWhere(q: ListAuditQuery): SQL | undefined {
    const clauses: SQL[] = [];
    if (q.search) {
      const s = or(
        ilike(schema.auditEvents.action, `%${q.search}%`),
        ilike(schema.auditEvents.actorName, `%${q.search}%`),
        ilike(schema.auditEvents.institutionName, `%${q.search}%`),
      );
      if (s) clauses.push(s);
    }
    if (q.module) clauses.push(eq(schema.auditEvents.module, q.module));
    if (q.action) clauses.push(ilike(schema.auditEvents.action, `%${q.action}%`));
    if (q.actorId) clauses.push(eq(schema.auditEvents.actorId, q.actorId));
    if (q.institutionId) clauses.push(eq(schema.auditEvents.institutionId, q.institutionId));
    if (q.entityType) clauses.push(eq(schema.auditEvents.entityType, q.entityType));
    if (q.entityId) clauses.push(eq(schema.auditEvents.entityId, q.entityId));
    if (q.riskLevel) clauses.push(eq(schema.auditEvents.riskLevel, q.riskLevel));
    if (q.result) clauses.push(eq(schema.auditEvents.result, q.result));
    if (q.supportSessionId) clauses.push(eq(schema.auditEvents.supportSessionId, q.supportSessionId));
    if (q.from) clauses.push(gte(schema.auditEvents.occurredAt, new Date(q.from)));
    if (q.to) clauses.push(lt(schema.auditEvents.occurredAt, new Date(q.to)));
    return clauses.length ? and(...clauses) : undefined;
  }

  /** Cursor-paginated audit list (keyset on occurredAt+id, newest first). */
  async listAudit(q: ListAuditQuery): Promise<{ items: AuditEvent[]; nextCursor: string | null; hasMore: boolean }> {
    const base = this.auditWhere(q);
    const clauses: SQL[] = base ? [base] : [];
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (c) {
        clauses.push(
          sql`(${schema.auditEvents.occurredAt}, ${schema.auditEvents.id}) < (${new Date(c.occurredAt)}, ${c.id})`,
        );
      }
    }
    const where = clauses.length ? and(...clauses) : undefined;

    const rows = await this.db
      .select()
      .from(schema.auditEvents)
      .where(where)
      .orderBy(desc(schema.auditEvents.occurredAt), desc(schema.auditEvents.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    const last = items[items.length - 1];
    const nextCursor = hasMore && last ? encodeCursor(last.occurredAt, last.id) : null;
    return { items, nextCursor, hasMore };
  }

  /** Same filter set without cursor — bounded export (capped by the service). */
  exportAudit(q: ListAuditQuery, cap: number): Promise<AuditEvent[]> {
    const where = this.auditWhere({ ...q, cursor: undefined });
    return this.db
      .select()
      .from(schema.auditEvents)
      .where(where)
      .orderBy(desc(schema.auditEvents.occurredAt), desc(schema.auditEvents.id))
      .limit(cap);
  }

  findAuditById(id: string): Promise<AuditEvent | undefined> {
    return this.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.id, id))
      .limit(1)
      .then((r) => r[0]);
  }

  async listActivity(q: ListActivityQuery) {
    const clauses: SQL[] = [];
    if (q.category) clauses.push(eq(schema.activityEvents.category, q.category));
    if (q.institutionId) clauses.push(eq(schema.activityEvents.institutionId, q.institutionId));
    if (q.riskLevel) clauses.push(eq(schema.activityEvents.riskLevel, q.riskLevel));
    if (q.cursor) {
      const c = decodeCursor(q.cursor);
      if (c) {
        clauses.push(
          sql`(${schema.activityEvents.occurredAt}, ${schema.activityEvents.id}) < (${new Date(c.occurredAt)}, ${c.id})`,
        );
      }
    }
    const where = clauses.length ? and(...clauses) : undefined;

    const rows = await this.db
      .select()
      .from(schema.activityEvents)
      .where(where)
      .orderBy(desc(schema.activityEvents.occurredAt), desc(schema.activityEvents.id))
      .limit(q.limit + 1);

    const hasMore = rows.length > q.limit;
    const items = hasMore ? rows.slice(0, q.limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last ? encodeCursor(last.occurredAt, last.id) : null;
    return { items, nextCursor, hasMore };
  }
}
