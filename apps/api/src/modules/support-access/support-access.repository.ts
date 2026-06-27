import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  lte,
  schema,
  type Database,
  type SQL,
} from '@edrion/database';
import type {
  Institution,
  NewSupportAccessSession,
  SupportAccessSession,
} from '@edrion/database';
import type { ListSupportSessionsQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';

/** A session row plus the institution display name, for directory + banner rendering. */
export interface SupportSessionRow extends SupportAccessSession {
  institutionName: string | null;
}

const ACTIVE_STATUSES = ['requested', 'approved', 'active'] as const;

/** Typed SQL only. No business rules — the service owns those. */
@Injectable()
export class SupportAccessRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private buildWhere(q: ListSupportSessionsQuery): SQL | undefined {
    const clauses: SQL[] = [];
    if (q.institutionId) clauses.push(eq(schema.supportAccessSessions.institutionId, q.institutionId));
    if (q.employeeId) clauses.push(eq(schema.supportAccessSessions.employeeId, q.employeeId));
    if (q.status) clauses.push(eq(schema.supportAccessSessions.status, q.status));
    if (q.activeOnly) clauses.push(eq(schema.supportAccessSessions.status, 'active'));
    return clauses.length ? and(...clauses) : undefined;
  }

  async list(q: ListSupportSessionsQuery): Promise<{ items: SupportSessionRow[]; total: number }> {
    const where = this.buildWhere(q);
    const rows = await this.db
      .select({
        session: schema.supportAccessSessions,
        institutionName: schema.institutions.displayName,
      })
      .from(schema.supportAccessSessions)
      .leftJoin(
        schema.institutions,
        eq(schema.institutions.id, schema.supportAccessSessions.institutionId),
      )
      .where(where)
      .orderBy(desc(schema.supportAccessSessions.requestedAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db
      .select({ value: count() })
      .from(schema.supportAccessSessions)
      .where(where);

    const items = rows.map((r) => ({ ...r.session, institutionName: r.institutionName }));
    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  async findById(id: string): Promise<SupportSessionRow | undefined> {
    const [row] = await this.db
      .select({
        session: schema.supportAccessSessions,
        institutionName: schema.institutions.displayName,
      })
      .from(schema.supportAccessSessions)
      .leftJoin(
        schema.institutions,
        eq(schema.institutions.id, schema.supportAccessSessions.institutionId),
      )
      .where(eq(schema.supportAccessSessions.id, id))
      .limit(1);
    return row ? { ...row.session, institutionName: row.institutionName } : undefined;
  }

  async findInstitution(id: string): Promise<Institution | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.institutions)
      .where(eq(schema.institutions.id, id))
      .limit(1);
    return row;
  }

  async insert(values: NewSupportAccessSession): Promise<SupportAccessSession> {
    const [row] = await this.db.insert(schema.supportAccessSessions).values(values).returning();
    return row!;
  }

  async update(
    id: string,
    patch: Partial<NewSupportAccessSession>,
  ): Promise<SupportAccessSession | undefined> {
    const [row] = await this.db
      .update(schema.supportAccessSessions)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(schema.supportAccessSessions.id, id))
      .returning();
    return row;
  }

  /** Live sessions whose hard expiry has passed — fed to the background sweep. */
  async findLapsed(now: Date): Promise<SupportAccessSession[]> {
    return this.db
      .select()
      .from(schema.supportAccessSessions)
      .where(
        and(
          inArray(schema.supportAccessSessions.status, [...ACTIVE_STATUSES]),
          lte(schema.supportAccessSessions.expiresAt, now),
        ),
      );
  }
}
