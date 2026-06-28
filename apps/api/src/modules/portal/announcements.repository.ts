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
  type Database,
  type PgColumn,
  type SQL,
} from '@edrion/database';
import type { Announcement, NewAnnouncement, NewNotification, Notification } from '@edrion/database';
import type { AnnouncementsListQuery, NotificationsListQuery } from '@edrion/schemas';
import { DATABASE } from '../../common/tokens';
import type { CampusFilter, Page } from './academics.repository';

/**
 * Typed SQL for the institution-portal announcements + notifications tables. Same contract as the other
 * portal repos: every query is confined to one institution; campus-scoped reads also include
 * institution-owned (campus_id IS NULL) rows. The service owns scope/version/FK/audit + the publish→notify
 * bridge.
 */
@Injectable()
export class AnnouncementsRepository {
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

  // --- announcements ---------------------------------------------------------

  async listAnnouncements(institutionId: string, campusIds: CampusFilter, q: AnnouncementsListQuery): Promise<Page<Announcement>> {
    const t = schema.announcements;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = or(ilike(t.title, `%${q.search}%`), ilike(t.referenceCode, `%${q.search}%`), ilike(t.category, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      title: t.title,
      referenceCode: t.referenceCode,
      status: t.status,
      audience: t.audience,
      publishedAt: t.publishedAt,
      createdAt: t.createdAt,
    };
    const rows = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items: rows, total: Number(tot?.value ?? 0) };
  }

  async findAnnouncement(id: string, institutionId: string): Promise<Announcement | undefined> {
    const t = schema.announcements;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async findAnnouncementByCode(institutionId: string, referenceCode: string): Promise<Announcement | undefined> {
    const t = schema.announcements;
    const [row] = await this.db
      .select()
      .from(t)
      .where(and(eq(t.institutionId, institutionId), eq(t.referenceCode, referenceCode)))
      .limit(1);
    return row;
  }

  async insertAnnouncement(values: NewAnnouncement): Promise<Announcement> {
    const [row] = await this.db.insert(schema.announcements).values(values).returning();
    return row!;
  }

  async updateAnnouncement(id: string, version: number, patch: Partial<NewAnnouncement>): Promise<Announcement | undefined> {
    const t = schema.announcements;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteAnnouncement(id: string, version: number): Promise<boolean> {
    const t = schema.announcements;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }

  // --- notifications ---------------------------------------------------------

  async listNotifications(institutionId: string, campusIds: CampusFilter, q: NotificationsListQuery): Promise<Page<Notification>> {
    const t = schema.notifications;
    const conds = this.scopeConds(t.institutionId, t.campusId, institutionId, campusIds);
    if (q.status) conds.push(eq(t.status, q.status));
    if (q.search) {
      const s = or(ilike(t.title, `%${q.search}%`), ilike(t.kind, `%${q.search}%`));
      if (s) conds.push(s);
    }
    const where = and(...conds);
    const sortable: Record<string, PgColumn> = {
      title: t.title,
      kind: t.kind,
      status: t.status,
      createdAt: t.createdAt,
    };
    const rows = await this.db
      .select()
      .from(t)
      .where(where)
      .orderBy(this.order(q.sortBy ? sortable[q.sortBy] : undefined, q.sortDir, t.createdAt))
      .limit(q.pageSize)
      .offset((q.page - 1) * q.pageSize);
    const [tot] = await this.db.select({ value: count() }).from(t).where(where);
    return { items: rows, total: Number(tot?.value ?? 0) };
  }

  async findNotification(id: string, institutionId: string): Promise<Notification | undefined> {
    const t = schema.notifications;
    const [row] = await this.db.select().from(t).where(and(eq(t.id, id), eq(t.institutionId, institutionId))).limit(1);
    return row;
  }

  async insertNotification(values: NewNotification): Promise<Notification> {
    const [row] = await this.db.insert(schema.notifications).values(values).returning();
    return row!;
  }

  async updateNotification(id: string, version: number, patch: Partial<NewNotification>): Promise<Notification | undefined> {
    const t = schema.notifications;
    const [row] = await this.db
      .update(t)
      .set({ ...patch, version: version + 1, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.version, version)))
      .returning();
    return row;
  }

  async deleteNotification(id: string, version: number): Promise<boolean> {
    const t = schema.notifications;
    const rows = await this.db.delete(t).where(and(eq(t.id, id), eq(t.version, version))).returning({ id: t.id });
    return rows.length > 0;
  }
}
