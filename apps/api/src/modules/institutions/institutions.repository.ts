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
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { ListInstitutionsQuery } from '@edrion/schemas';
import type { Institution, NewInstitution } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

const SORTABLE: Record<string, PgColumn> = {
  displayName: schema.institutions.displayName,
  status: schema.institutions.status,
  type: schema.institutions.type,
  country: schema.institutions.country,
  createdAt: schema.institutions.createdAt,
  updatedAt: schema.institutions.updatedAt,
};

/** Typed SQL only. No business rules — the service owns those. */
@Injectable()
export class InstitutionsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private buildwhere(q: ListInstitutionsQuery): SQL | undefined {
    const clauses: SQL[] = [];
    if (q.search) {
      const search = or(
        ilike(schema.institutions.displayName, `%${q.search}%`),
        ilike(schema.institutions.legalName, `%${q.search}%`),
        ilike(schema.institutions.publicId, `%${q.search}%`),
      );
      if (search) clauses.push(search);
    }
    if (q.status) clauses.push(eq(schema.institutions.status, q.status));
    if (q.type) clauses.push(eq(schema.institutions.type, q.type));
    if (q.country) clauses.push(eq(schema.institutions.country, q.country));
    if (q.onboardingStatus) clauses.push(eq(schema.institutions.onboardingStatus, q.onboardingStatus));
    if (q.ownerId) clauses.push(eq(schema.institutions.customerSuccessOwnerId, q.ownerId));
    if (q.riskOnly) clauses.push(sql`jsonb_array_length(${schema.institutions.riskFlags}) > 0`);
    return clauses.length ? and(...clauses) : undefined;
  }

  async list(q: ListInstitutionsQuery): Promise<{ items: Institution[]; total: number }> {
    const where = this.buildwhere(q);
    const sortCol = (q.sortBy && SORTABLE[q.sortBy]) || schema.institutions.updatedAt;
    const order = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

    const items = await this.db
      .select()
      .from(schema.institutions)
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db
      .select({ value: count() })
      .from(schema.institutions)
      .where(where);

    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  /** Status counts for the directory summary cards (single grouped query). */
  async summaryByStatus(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: schema.institutions.status, value: count() })
      .from(schema.institutions)
      .groupBy(schema.institutions.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
  }

  async findById(id: string): Promise<Institution | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.institutions)
      .where(eq(schema.institutions.id, id))
      .limit(1);
    return row;
  }

  async insert(values: NewInstitution): Promise<Institution> {
    const [row] = await this.db.insert(schema.institutions).values(values).returning();
    return row!;
  }

  /**
   * Optimistic-concurrency update: only applies when the stored version matches, and bumps
   * it. Returns undefined on a version mismatch so the service can surface a 409.
   */
  async updateWithVersion(
    id: string,
    expectedVersion: number,
    patch: Partial<NewInstitution>,
  ): Promise<Institution | undefined> {
    const [row] = await this.db
      .update(schema.institutions)
      .set({ ...patch, version: expectedVersion + 1, updatedAt: new Date() })
      .where(and(eq(schema.institutions.id, id), eq(schema.institutions.version, expectedVersion)))
      .returning();
    return row;
  }

  async nextPublicId(): Promise<string> {
    const rows = await this.db.select({ value: count() }).from(schema.institutions);
    return `INST-${String(1000 + Number(rows[0]?.value ?? 0) + 1).padStart(5, '0')}`;
  }
}
