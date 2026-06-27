import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  asc,
  count,
  desc,
  eq,
  ilike,
  schema,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { ListSupportCasesQuery } from '@edrion/schemas';
import type { NewSupportCase, NewSupportMessage, SupportCase, SupportMessage } from '@edrion/database';
import { DATABASE } from '../../common/tokens';

const SORTABLE: Record<string, PgColumn> = {
  subject: schema.supportCases.subject,
  status: schema.supportCases.status,
  priority: schema.supportCases.priority,
  createdAt: schema.supportCases.createdAt,
  updatedAt: schema.supportCases.updatedAt,
};

@Injectable()
export class SupportCasesRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private where(q: ListSupportCasesQuery): SQL | undefined {
    const clauses: SQL[] = [];
    if (q.search) {
      const s = ilike(schema.supportCases.subject, `%${q.search}%`);
      if (s) clauses.push(s);
    }
    if (q.status) clauses.push(eq(schema.supportCases.status, q.status));
    if (q.priority) clauses.push(eq(schema.supportCases.priority, q.priority));
    if (q.institutionId) clauses.push(eq(schema.supportCases.institutionId, q.institutionId));
    if (q.assignedEmployeeId) clauses.push(eq(schema.supportCases.assignedEmployeeId, q.assignedEmployeeId));
    return clauses.length ? and(...clauses) : undefined;
  }

  async list(q: ListSupportCasesQuery): Promise<{ items: SupportCase[]; total: number }> {
    const where = this.where(q);
    const sortCol = (q.sortBy && SORTABLE[q.sortBy]) || schema.supportCases.updatedAt;
    const order = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);
    const items = await this.db
      .select()
      .from(schema.supportCases)
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const totalRows = await this.db.select({ value: count() }).from(schema.supportCases).where(where);
    return { items, total: Number(totalRows[0]?.value ?? 0) };
  }

  async summaryByStatus(): Promise<Record<string, number>> {
    const rows = await this.db
      .select({ status: schema.supportCases.status, value: count() })
      .from(schema.supportCases)
      .groupBy(schema.supportCases.status);
    return Object.fromEntries(rows.map((r) => [r.status, Number(r.value)]));
  }

  async findById(id: string): Promise<SupportCase | undefined> {
    const [row] = await this.db.select().from(schema.supportCases).where(eq(schema.supportCases.id, id)).limit(1);
    return row;
  }

  async messagesForCase(caseId: string): Promise<SupportMessage[]> {
    return this.db
      .select()
      .from(schema.supportMessages)
      .where(eq(schema.supportMessages.caseId, caseId))
      .orderBy(asc(schema.supportMessages.createdAt));
  }

  async insertCase(values: NewSupportCase): Promise<SupportCase> {
    const [row] = await this.db.insert(schema.supportCases).values(values).returning();
    return row!;
  }

  async insertMessage(values: NewSupportMessage): Promise<SupportMessage> {
    const [row] = await this.db.insert(schema.supportMessages).values(values).returning();
    return row!;
  }

  async updateCase(id: string, patch: Partial<SupportCase>, actorId: string): Promise<SupportCase | undefined> {
    const [row] = await this.db
      .update(schema.supportCases)
      .set({ ...patch, updatedBy: actorId, updatedAt: new Date() })
      .where(eq(schema.supportCases.id, id))
      .returning();
    return row;
  }
}
