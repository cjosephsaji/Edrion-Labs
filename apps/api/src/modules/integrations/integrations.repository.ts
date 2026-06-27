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
import type { ListEndpointsQuery } from '@edrion/schemas';
import type {
  NewWebhookDelivery,
  NewWebhookEndpoint,
  WebhookDelivery,
  WebhookEndpoint,
} from '@edrion/database';
import { DATABASE } from '../../common/tokens';

const SORTABLE: Record<string, PgColumn> = {
  url: schema.webhookEndpoints.url,
  active: schema.webhookEndpoints.active,
  createdAt: schema.webhookEndpoints.createdAt,
  updatedAt: schema.webhookEndpoints.updatedAt,
};

export interface EndpointListRow extends WebhookEndpoint {
  deliveryCount: number;
}

@Injectable()
export class IntegrationsRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private where(q: ListEndpointsQuery): SQL | undefined {
    const clauses: SQL[] = [];
    if (q.search) {
      const s = or(
        ilike(schema.webhookEndpoints.url, `%${q.search}%`),
        ilike(schema.webhookEndpoints.description, `%${q.search}%`),
      );
      if (s) clauses.push(s);
    }
    if (q.active !== undefined) clauses.push(eq(schema.webhookEndpoints.active, q.active));
    if (q.institutionId) clauses.push(eq(schema.webhookEndpoints.institutionId, q.institutionId));
    return clauses.length ? and(...clauses) : undefined;
  }

  async list(q: ListEndpointsQuery): Promise<{ items: EndpointListRow[]; total: number }> {
    const where = this.where(q);
    const sortCol = (q.sortBy && SORTABLE[q.sortBy]) || schema.webhookEndpoints.createdAt;
    const order = q.sortDir === 'asc' ? asc(sortCol) : desc(sortCol);

    const items = await this.db
      .select({
        endpoint: schema.webhookEndpoints,
        deliveryCount: sql<number>`(select count(*)::int from ${schema.webhookDeliveries} wd where wd.endpoint_id = ${schema.webhookEndpoints.id})`,
      })
      .from(schema.webhookEndpoints)
      .where(where)
      .orderBy(order)
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);

    const totalRows = await this.db
      .select({ value: count() })
      .from(schema.webhookEndpoints)
      .where(where);

    return {
      items: items.map((r) => ({ ...r.endpoint, deliveryCount: Number(r.deliveryCount ?? 0) })),
      total: Number(totalRows[0]?.value ?? 0),
    };
  }

  async findById(id: string): Promise<WebhookEndpoint | undefined> {
    const [row] = await this.db
      .select()
      .from(schema.webhookEndpoints)
      .where(eq(schema.webhookEndpoints.id, id))
      .limit(1);
    return row;
  }

  async insert(values: NewWebhookEndpoint): Promise<WebhookEndpoint> {
    const [row] = await this.db.insert(schema.webhookEndpoints).values(values).returning();
    return row!;
  }

  async updateWithVersion(
    id: string,
    version: number,
    patch: Partial<WebhookEndpoint>,
    actorId: string,
  ): Promise<WebhookEndpoint | null> {
    const [row] = await this.db
      .update(schema.webhookEndpoints)
      .set({ ...patch, version: version + 1, updatedBy: actorId, updatedAt: new Date() })
      .where(and(eq(schema.webhookEndpoints.id, id), eq(schema.webhookEndpoints.version, version)))
      .returning();
    return row ?? null;
  }

  /** Append-only insert of one delivery attempt. */
  async insertDelivery(values: NewWebhookDelivery): Promise<WebhookDelivery> {
    const [row] = await this.db.insert(schema.webhookDeliveries).values(values).returning();
    return row!;
  }

  async recentDeliveries(endpointId: string, limit = 20): Promise<WebhookDelivery[]> {
    return this.db
      .select()
      .from(schema.webhookDeliveries)
      .where(eq(schema.webhookDeliveries.endpointId, endpointId))
      .orderBy(desc(schema.webhookDeliveries.createdAt))
      .limit(limit);
  }
}
