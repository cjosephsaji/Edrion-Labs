import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, schema, sql, type Database } from '@edrion/database';
import { localStudyDate } from '@edrion/schemas';
import { DATABASE } from '../../../common/tokens';
import { ownerColumns } from '../core/owner-scope';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class StreakService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getSummary(principal: StudentPrincipal, timezone: string) {
    const row = await this.ensureStreak(principal);
    const studyDate = localStudyDate(new Date(), timezone);
    const owner = ownerColumns(principal);
    const [today] = await this.db
      .select()
      .from(schema.streakEvents)
      .where(
        and(
          owner.studentId
            ? eq(schema.streakEvents.studentId, owner.studentId)
            : eq(schema.streakEvents.independentUserId, owner.independentUserId!),
          eq(schema.streakEvents.date, studyDate),
        ),
      )
      .limit(1);
    const dots = await this.dotStrip(principal, timezone);
    return {
      current: row.current,
      best: row.best,
      freeze_tokens: row.freezeTokens,
      cleared_today: Boolean(today),
      dots,
    };
  }

  async dotStrip(principal: StudentPrincipal, timezone: string) {
    const studyToday = localStudyDate(new Date(), timezone);
    const start = new Date(`${studyToday}T12:00:00Z`);
    start.setUTCDate(start.getUTCDate() - 13);
    const owner = ownerColumns(principal);
    const events = await this.db
      .select()
      .from(schema.streakEvents)
      .where(
        and(
          owner.studentId
            ? eq(schema.streakEvents.studentId, owner.studentId)
            : eq(schema.streakEvents.independentUserId, owner.independentUserId!),
          gte(schema.streakEvents.date, start.toISOString().slice(0, 10)),
        ),
      );
    const credited = new Set(events.map((e) => e.date));
    const dots: Array<{ date: string; state: 'cleared' | 'neutral' | 'missed' }> = [];
    for (let i = 13; i >= 0; i -= 1) {
      const d = new Date(`${studyToday}T12:00:00Z`);
      d.setUTCDate(d.getUTCDate() - i);
      const date = d.toISOString().slice(0, 10);
      if (credited.has(date)) dots.push({ date, state: 'cleared' });
      else {
        const hadDue = await this.hadDueOnDate(principal, date);
        dots.push({ date, state: hadDue ? 'missed' : 'neutral' });
      }
    }
    return dots;
  }

  /** Called only from grading transaction when due queue hits zero (C-2). */
  async creditIfEligible(principal: StudentPrincipal, timezone: string): Promise<boolean> {
    const studyDate = localStudyDate(new Date(), timezone);
    const owner = ownerColumns(principal);
    const [existing] = await this.db
      .select()
      .from(schema.streakEvents)
      .where(
        and(
          owner.studentId
            ? eq(schema.streakEvents.studentId, owner.studentId)
            : eq(schema.streakEvents.independentUserId, owner.independentUserId!),
          eq(schema.streakEvents.date, studyDate),
        ),
      )
      .limit(1);
    if (existing) return false;

    const streak = await this.ensureStreak(principal);
    await this.db.transaction(async (tx) => {
      await tx.insert(schema.streakEvents).values({
        ...owner,
        date: studyDate,
        creditedBy: 'reviews',
      });
      await tx
        .update(schema.userStreaks)
        .set({
          current: streak.current + 1,
          best: Math.max(streak.best, streak.current + 1),
          freezeTokens: streak.current + 1 >= 7 && streak.freezeTokens < 2 ? streak.freezeTokens + 1 : streak.freezeTokens,
          updatedAt: new Date(),
        })
        .where(eq(schema.userStreaks.id, streak.id));
    });
    return true;
  }

  async finalizeDay(studyDate: string) {
    const streaks = await this.db.select().from(schema.userStreaks);
    let processed = 0;
    for (const streak of streaks) {
      const ownerId = streak.studentId ?? streak.independentUserId;
      if (!ownerId) continue;
      const [credited] = await this.db
        .select()
        .from(schema.streakEvents)
        .where(
          and(
            streak.studentId
              ? eq(schema.streakEvents.studentId, streak.studentId)
              : eq(schema.streakEvents.independentUserId, streak.independentUserId!),
            eq(schema.streakEvents.date, studyDate),
          ),
        )
        .limit(1);
      if (credited) continue;

      const hadDue = streak.studentId
        ? await this.hadDueForStudent(streak.studentId, studyDate)
        : await this.hadDueForIndependent(streak.independentUserId!, studyDate);
      if (!hadDue) continue;

      if (streak.freezeTokens > 0) {
        await this.db
          .update(schema.userStreaks)
          .set({ freezeTokens: streak.freezeTokens - 1, updatedAt: new Date() })
          .where(eq(schema.userStreaks.id, streak.id));
      } else if (streak.current > 0) {
        await this.db
          .update(schema.userStreaks)
          .set({ current: 0, updatedAt: new Date() })
          .where(eq(schema.userStreaks.id, streak.id));
      }
      processed += 1;
    }
    return processed;
  }

  private async hadDueOnDate(principal: StudentPrincipal, date: string) {
    if (principal.kind === 'institutional') return this.hadDueForStudent(principal.studentId, date);
    return this.hadDueForIndependent(principal.independentUserId, date);
  }

  private async hadDueForStudent(studentId: string, _date: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.flashcards)
      .innerJoin(schema.flashcardDecks, eq(schema.flashcards.deckId, schema.flashcardDecks.id))
      .where(eq(schema.flashcardDecks.studentId, studentId));
    return Number(row?.count ?? 0) > 0;
  }

  private async hadDueForIndependent(independentUserId: string, _date: string) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.flashcards)
      .innerJoin(schema.flashcardDecks, eq(schema.flashcards.deckId, schema.flashcardDecks.id))
      .where(eq(schema.flashcardDecks.independentUserId, independentUserId));
    return Number(row?.count ?? 0) > 0;
  }

  private async ensureStreak(principal: StudentPrincipal) {
    const owner = ownerColumns(principal);
    const where = owner.studentId
      ? eq(schema.userStreaks.studentId, owner.studentId)
      : eq(schema.userStreaks.independentUserId, owner.independentUserId!);
    const [row] = await this.db.select().from(schema.userStreaks).where(where).limit(1);
    if (row) return row;
    const [created] = await this.db.insert(schema.userStreaks).values({ ...owner }).returning();
    return created!;
  }
}
