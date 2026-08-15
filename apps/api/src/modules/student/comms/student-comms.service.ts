import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  schema,
  type Database,
} from '@edrion/database';
import { DATABASE } from '../../../common/tokens';
import type { InstitutionalStudentPrincipal } from '../student.types';

@Injectable()
export class StudentCommsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async announcements(principal: InstitutionalStudentPrincipal) {
    const campusFilter = principal.campusId
      ? or(isNull(schema.announcements.campusId), eq(schema.announcements.campusId, principal.campusId))
      : undefined;
    const rows = await this.db
      .select()
      .from(schema.announcements)
      .where(
        and(
          eq(schema.announcements.institutionId, principal.institutionId),
          eq(schema.announcements.status, 'published'),
          isNotNull(schema.announcements.publishedAt),
          inArray(schema.announcements.audience, ['all', 'students']),
          campusFilter,
        ),
      )
      .orderBy(desc(schema.announcements.publishedAt))
      .limit(100);

    return {
      items: rows.map((a) => ({
        id: a.id,
        title: a.title,
        summary: a.body?.slice(0, 240) ?? null,
        body: a.body,
        category: a.category,
        pinned: a.pinned,
        publishedAt: a.publishedAt?.toISOString() ?? null,
      })),
    };
  }

  async notifications(principal: InstitutionalStudentPrincipal) {
    const prefs = await this.ensurePrefs(principal.studentId);
    const dismissed = new Set(prefs.ribbonDismissedIds ?? []);
    const rows = await this.db
      .select()
      .from(schema.feedEvents)
      .where(eq(schema.feedEvents.studentId, principal.studentId))
      .orderBy(desc(schema.feedEvents.occurredAt))
      .limit(50);

    return {
      items: rows.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        deepLink: n.deepLink,
        type: n.type,
        sourceModule: n.sourceModule,
        createdAt: n.occurredAt.toISOString(),
        readAt: dismissed.has(n.id) ? n.occurredAt.toISOString() : null,
      })),
    };
  }

  async readNotification(principal: InstitutionalStudentPrincipal, id: string) {
    const prefs = await this.ensurePrefs(principal.studentId);
    const dismissed = new Set(prefs.ribbonDismissedIds ?? []);
    dismissed.add(id);
    await this.db
      .update(schema.todayPreferences)
      .set({
        ribbonDismissedIds: [...dismissed],
        updatedAt: new Date(),
        version: prefs.version + 1,
      })
      .where(eq(schema.todayPreferences.id, prefs.id));
    return { ok: true };
  }

  async readAllNotifications(principal: InstitutionalStudentPrincipal) {
    const rows = await this.db
      .select({ id: schema.feedEvents.id })
      .from(schema.feedEvents)
      .where(eq(schema.feedEvents.studentId, principal.studentId));
    const prefs = await this.ensurePrefs(principal.studentId);
    const dismissed = new Set([...(prefs.ribbonDismissedIds ?? []), ...rows.map((r) => r.id)]);
    await this.db
      .update(schema.todayPreferences)
      .set({
        ribbonDismissedIds: [...dismissed],
        updatedAt: new Date(),
        version: prefs.version + 1,
      })
      .where(eq(schema.todayPreferences.id, prefs.id));
    return { ok: true };
  }

  private async ensurePrefs(studentId: string) {
    const [existing] = await this.db
      .select()
      .from(schema.todayPreferences)
      .where(eq(schema.todayPreferences.studentId, studentId))
      .limit(1);
    if (existing) return existing;
    const [created] = await this.db
      .insert(schema.todayPreferences)
      .values({ studentId })
      .returning();
    return created!;
  }
}
