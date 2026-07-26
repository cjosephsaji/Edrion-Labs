import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  or,
  schema,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { ListIndependentUsersQuery } from '@edrion/schemas';
import type { IndependentUser } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

const SORTABLE: Record<string, PgColumn> = {
  fullName: schema.independentUsers.fullName,
  email: schema.independentUsers.email,
  status: schema.independentUsers.status,
  country: schema.independentUsers.country,
  lastActivityAt: schema.independentUsers.lastActivityAt,
  createdAt: schema.independentUsers.createdAt,
};

/** Typed SQL only. No business rules — the service owns those. */
@Injectable()
export class IndependentUsersRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private where(q: ListIndependentUsersQuery): SQL | undefined {
    const clauses: SQL[] = [];
    if (q.search) {
      const s = or(
        ilike(schema.independentUsers.fullName, `%${q.search}%`),
        ilike(schema.independentUsers.email, `%${q.search}%`),
      );
      if (s) clauses.push(s);
    }
    if (q.status) clauses.push(eq(schema.independentUsers.status, q.status));
    if (q.country) clauses.push(eq(schema.independentUsers.country, q.country));
    return clauses.length ? and(...clauses) : undefined;
  }

  async list(q: ListIndependentUsersQuery): Promise<{ items: IndependentUser[]; total: number }> {
    const where = this.where(q);
    const sortCol = (q.sortBy && SORTABLE[q.sortBy]) || schema.independentUsers.createdAt;
    const order = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

    const items = await this.db
      .select()
      .from(schema.independentUsers)
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db
      .select({ value: count() })
      .from(schema.independentUsers)
      .where(where);
    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  async summaryByStatus(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: schema.independentUsers.status, value: count() })
      .from(schema.independentUsers)
      .groupBy(schema.independentUsers.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
  }

  async findById(id: string): Promise<IndependentUser | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.independentUsers)
      .where(eq(schema.independentUsers.id, id))
      .limit(1);
    return row;
  }

  /** Optimistic update: only writes when the stored version matches. Returns the new row or null. */
  async updateWithVersion(
    id: string,
    version: number,
    patch: Partial<IndependentUser>,
    actorId: string,
  ): Promise<IndependentUser | null> {
    const [row] = await this.db
      .update(schema.independentUsers)
      .set({ ...patch, version: version + 1, updatedBy: actorId, updatedAt: new Date() })
      .where(and(eq(schema.independentUsers.id, id), eq(schema.independentUsers.version, version)))
      .returning();
    return row ?? null;
  }
}
