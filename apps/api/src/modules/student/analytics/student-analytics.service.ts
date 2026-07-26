import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, schema, sql, type Database } from '@edrion/database';
import type { AnalyticsRange } from '@edrion/schemas';
import { STUDENT_NEVER_SHARED, STUDENT_SHARED_WITH_INSTITUTION } from '@edrion/shared-types';
import { DATABASE } from '../../../common/tokens';
import type { StudentPrincipal } from '../student.types';

@Injectable()
export class StudentAnalyticsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async getAnalytics(principal: StudentPrincipal, range: AnalyticsRange) {
    const since = this.rangeStart(range);
    const studentCond =
      principal.kind === 'institutional'
        ? eq(schema.learningEvents.studentId, principal.studentId)
        : eq(schema.learningEvents.independentUserId, principal.independentUserId);

    const [topics] = await this.db
      .select({ c: sql<number>`count(*)` })
      .from(schema.learningEvents)
      .where(and(studentCond, eq(schema.learningEvents.eventType, 'session.completed'), gte(schema.learningEvents.occurredAt, since)));

    const [practice] = await this.db
      .select({ c: sql<number>`count(*)` })
      .from(schema.learningEvents)
      .where(and(studentCond, eq(schema.learningEvents.eventType, 'session.practice_attempted'), gte(schema.learningEvents.occurredAt, since)));

    const stat = (value: number | string, from: string) => ({ value, from });

    const base = {
      range,
      statSlots: {
        topicsCompleted: stat(Number(topics?.c ?? 0), 'Learning events · session.completed'),
        practiceItems: stat(Number(practice?.c ?? 0), 'Learning events · session.practice_attempted'),
        timeOnLearning: stat(0, 'Learning events · session durations'),
        currentStreak: stat(0, 'Learning events · consecutive days'),
      },
      heatmap: [] as { date: string; count: number }[],
      trendBars: [] as { label: string; value: number }[],
      subjectChips: [] as { label: string; count: number }[],
      assignmentsRecord: {
        onTime: stat(0, 'Homework + assignments · on-time submissions'),
        late: stat(0, 'Homework + assignments · late submissions'),
        missed: stat(0, 'Homework + assignments · missed'),
      },
      markDots: [] as { label: string; marks: number; maxMarks: number; pct: number }[],
      revisionHealth: {
        due: stat(0, 'Revision states · due count'),
        refreshed: stat(0, 'Revision states · refreshed in range'),
      },
      insights: [] as { label: string; events: { label: string; meta: string | null }[] }[],
      transparency: {
        sharedWith: [...STUDENT_SHARED_WITH_INSTITUTION],
        neverShared: [...STUDENT_NEVER_SHARED],
      },
    };

    if (principal.kind === 'independent') return base;
    return { ...base, courseRows: [] };
  }

  private rangeStart(range: AnalyticsRange) {
    const d = new Date();
    if (range === 'week') d.setDate(d.getDate() - 7);
    else if (range === 'month') d.setMonth(d.getMonth() - 1);
    else d.setMonth(d.getMonth() - 4);
    return d;
  }
}
