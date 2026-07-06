import { Inject, Injectable } from '@nestjs/common';
import { and, count, gte } from 'drizzle-orm';
import { schema, type Database } from '@edrion/database';
import {
  BADGE_FAMILIES,
  STUDENT_BADGE_CATALOGUE,
  type BadgeDefinition,
  type BadgePredicateContext,
  type BadgeTier,
} from '@edrion/shared-types';
import { DATABASE } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { ownerWhere } from '../core/owner-scope';

export const ACHIEVEMENTS_SWEEP_JOB = 'student.achievements.sweep';

@Injectable()
export class AchievementsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getOverview(principal: StudentPrincipal) {
    const awards = await this.db
      .select()
      .from(schema.achievementAwards)
      .where(ownerWhere(principal, schema.achievementAwards.studentId, schema.achievementAwards.independentUserId));

    const earnedByKey = new Map(awards.map((a) => [`${a.badgeKey}:${a.tier}`, a]));
    const ctx = await this.buildContext(principal);

    const families = Object.entries(BADGE_FAMILIES).map(([key, label]) => ({
      key,
      label,
      badges: STUDENT_BADGE_CATALOGUE.filter((b) => b.family === key).map((badge) =>
        this.badgeDto(badge, earnedByKey, ctx),
      ),
    }));

    const earnedCount = awards.length;
    const total = STUDENT_BADGE_CATALOGUE.reduce((n, b) => n + b.tiers.length, 0);
    return { families, earnedCount, total };
  }

  async evaluatePrincipal(principal: StudentPrincipal, writer: LearningEventsWriter) {
    const ctx = await this.buildContext(principal);
    const counts = await this.eventCounts(principal);
    const owner =
      principal.kind === 'institutional'
        ? { studentId: principal.studentId, independentUserId: null }
        : { studentId: null, independentUserId: principal.independentUserId };

    for (const badge of STUDENT_BADGE_CATALOGUE) {
      for (const tier of badge.tiers) {
        const count = this.badgeProgress(badge, tier.tier, counts, ctx);
        const qualifies = count >= tier.target && (!badge.predicate || badge.predicate(counts, ctx));
        if (!qualifies) continue;

        const inserted = await this.db
          .insert(schema.achievementAwards)
          .values({
            ...owner,
            badgeKey: badge.key,
            tier: tier.tier,
            evidenceNote: tier.evidenceTemplate(count),
            evidenceEventIds: [],
          })
          .onConflictDoNothing()
          .returning();

        if (inserted[0]) {
          await writer.log({
            eventType: 'achievement.unlocked',
            payload: { badgeKey: badge.key, tier: tier.tier },
            principal,
          });
        }
      }
    }
  }

  private badgeDto(
    badge: BadgeDefinition,
    earned: Map<string, (typeof schema.achievementAwards.$inferSelect)>,
    _ctx: BadgePredicateContext,
  ) {
    const earnedTiers = badge.tiers
      .map((t) => t.tier)
      .filter((t) => earned.has(`${badge.key}:${t}`));
    const topTier = earnedTiers.sort((a, b) => tierRank(b) - tierRank(a))[0] ?? null;
    const next = badge.tiers.find((t) => !earned.has(`${badge.key}:${t.tier}`));
    const award = topTier ? earned.get(`${badge.key}:${topTier}`) : undefined;
    return {
      key: badge.key,
      glyph: badge.glyph,
      name: badge.name,
      sub: award ? award.awardedAt.toISOString().slice(0, 10) : next ? `${0} of ${next.target}` : '',
      earned: !!topTier,
      tier: topTier,
      progress: next ? { done: 0, target: next.target } : undefined,
      note: award?.evidenceNote,
    };
  }

  private badgeProgress(
    badge: BadgeDefinition,
    tier: BadgeTier,
    counts: Record<string, number>,
    ctx: BadgePredicateContext,
  ) {
    if (badge.key === 'steady_week') {
      if (tier === 'bronze') return ctx.activeDaysThisWeek;
      if (tier === 'silver') return ctx.steadyWeeksLifetime;
      return ctx.steadyWeeksLifetime;
    }
    if (badge.key === 'back_for_more') return ctx.gapDaysBeforeReturn !== null && ctx.gapDaysBeforeReturn >= 7 ? 1 : 0;
    return badge.eventTypes.reduce((n, t) => n + (counts[t] ?? 0), 0);
  }

  private async eventCounts(principal: StudentPrincipal) {
    const rows = await this.db
      .select({ eventType: schema.learningEvents.eventType, n: count() })
      .from(schema.learningEvents)
      .where(ownerWhere(principal, schema.learningEvents.studentId, schema.learningEvents.independentUserId))
      .groupBy(schema.learningEvents.eventType);
    const out: Record<string, number> = {};
    for (const r of rows) out[r.eventType] = Number(r.n);
    return out;
  }

  private async buildContext(principal: StudentPrincipal): Promise<BadgePredicateContext> {
    const since = new Date(Date.now() - 90 * 86_400_000);
    const events = await this.db
      .select({ occurredAt: schema.learningEvents.occurredAt, eventType: schema.learningEvents.eventType })
      .from(schema.learningEvents)
      .where(
        and(
          ownerWhere(principal, schema.learningEvents.studentId, schema.learningEvents.independentUserId),
          gte(schema.learningEvents.occurredAt, since),
        ),
      )
      .orderBy(schema.learningEvents.occurredAt);

    const days = new Set(events.map((e) => e.occurredAt.toISOString().slice(0, 10)));
    let gapDaysBeforeReturn: number | null = null;
    if (events.length >= 2) {
      const last = events[events.length - 1]!.occurredAt.getTime();
      const prev = events[events.length - 2]!.occurredAt.getTime();
      gapDaysBeforeReturn = Math.floor((last - prev) / 86_400_000);
    }

    return {
      activeDaysThisWeek: days.size,
      steadyWeeksLifetime: Math.min(12, Math.floor(days.size / 5)),
      gapDaysBeforeReturn,
      distinctTopicsCompleted: events.filter((e) => e.eventType === 'session.completed').length,
      labVisits: events.filter((e) => ['mock.completed', 'debate.completed'].includes(e.eventType)).length,
    };
  }
}

function tierRank(t: BadgeTier): number {
  return t === 'gold' ? 3 : t === 'silver' ? 2 : 1;
}
