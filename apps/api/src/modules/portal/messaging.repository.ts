import { Inject, Injectable } from '@nestjs/common';
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
  sql,
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { MessagePost, MessageThread, NewMessagePost, NewMessageThread } from '@edrion/database';
import type { MessageThreadsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

export interface MessageThreadRow extends MessageThread {
  postCount: number;
}

/**
 * Typed SQL for the institution-portal messaging tables (threads + posts). Same contract as the other
 * portal repos: every query is confined to one institution; campus-scoped thread reads also include
 * institution-owned (campus_id IS NULL) rows. Posts inherit the thread's campus and are only reachable
 * through a thread the caller can see; the service owns scope/version/audit.
 */
@Injectable()
export class MessagingRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private scopeConds(instCol: PgColumn, campusCol: PgColumn, institutionId: string, campusIds: CampusFilter): SQL[] {
    const conds: SQL[] = [eq(instCol, institutionId)];
    if (campusIds) {
      const inScope = or(isNull(campusCol), inArray(campusCol, campusIds));
      if (inScope) conds.push(inScope);
    }
    return conds;
  }

  private order(col: PgColumn | undefined, dir: 'asc' | 'desc', fallback: PgColumn): SQL {
    const c = col ?? fallback;
    return dir === 'asc' ? asc(c) : desc(c);
  }

  // --- threads ---------------------------------------------------------------

  async listThreads(institutionId: string, campusIds: CampusFilter, q: MessageThreadsListQuery): Promise<Page<MessageThreadRow>> {
    const t = schema.messageThreads;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = or(ilike(t.subject, `%${q.search}%`), ilike(t.referenceCode, `%${q.search}%`), ilike(t.category, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      subject: t.subject,
      referenceCode: t.referenceCode,
      status: t.status,
      createdAt: t.createdAt,
    };
    const postCount = sql<number>`(select count(*) from ${schema.messagePosts} mp where mp.thread_id = ${t.id})`;
    const rows = await this.db
      .select({ thread: t, postCount })
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return {
      items: rows.map((r) => ({ ...r.thread, postCount: Number(r.postCount ?? 0) })),
      total: Number(tot?.value ?? 0),
    };
  }

  async findThread(id: string, institutionId: string): Promise<MessageThread | undefined> {
    const t = schema.messageThreads;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async findThreadByCode(institutionId: string, referenceCode: string): Promise<MessageThread | undefined> {
    const t = schema.messageThreads;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.referenceCode, referenceCode)))
      .limit(1);
    return row;
  }

  async insertThread(values: NewMessageThread): Promise<MessageThread> {
    const [row] = await this.db.insert(schema.messageThreads).values(values).returning();
    return row!;
  }

  async updateThread(id: string, version: number, patch: Partial<NewMessageThread>): Promise<MessageThread | undefined> {
    const t = schema.messageThreads;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteThread(id: string, version: number): Promise<boolean> {
    const t = schema.messageThreads;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- posts (within a thread) -----------------------------------------------

  async listPosts(threadId: string): Promise<MessagePost[]> {
    const t = schema.messagePosts;
    return this.db.select().from(t).where(eq(t.threadId, threadId)).orderBy(asc(t.createdAt));
  }

  async findPost(id: string, threadId: string): Promise<MessagePost | undefined> {
    const t = schema.messagePosts;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.threadId, threadId))).limit(1);
    return row;
  }

  async insertPost(values: NewMessagePost): Promise<MessagePost> {
    const [row] = await this.db.insert(schema.messagePosts).values(values).returning();
    return row!;
  }

  async updatePost(id: string, version: number, patch: Partial<NewMessagePost>): Promise<MessagePost | undefined> {
    const t = schema.messagePosts;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deletePost(id: string): Promise<boolean> {
    const t = schema.messagePosts;
    const rows = await this.db.delete(t).where(eq(t.id, id)).returning({ id: t.id });
    return rows.length > 0;
  }
}
