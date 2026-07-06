import { Inject, Injectable } from '@nestjs/common';
import { STREAK_ACTIVITY_EVENT_TYPES, WEEKLY_GOAL_EVENT_TYPES } from '@edrion/schemas';
import { LEARNING_EVENTS_WRITER } from '../../../common/tokens';
import type { LearningEventsWriter } from '../ledger/learning-events.writer';
import type { StudentPrincipal } from '../student.types';
import { LearnRepository } from './learn.repository';

function isoWeekStart(d = new Date()): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class StreaksService {
  constructor(
    private readonly repo: LearnRepository,
    @Inject(LEARNING_EVENTS_WRITER) private readonly ledger: LearningEventsWriter,
  ) {}

  async get(principal: StudentPrincipal) {
    const since = new Date();
    since.setDate(since.getDate() - 60);
    const events = await this.repo.listLearningEvents(principal, [...STREAK_ACTIVITY_EVENT_TYPES], since);

    const activeDays = new Set(
      events.map((e) => dayKey(e.occurredAt)),
    );

    const today = dayKey(new Date());
    const yesterday = dayKey(new Date(Date.now() - 86400000));
    let streakDays = 0;
    let cursor = activeDays.has(today) ? today : activeDays.has(yesterday) ? yesterday : null;
    if (cursor) {
      let d = new Date(cursor);
      while (activeDays.has(dayKey(d))) {
        streakDays++;
        d = new Date(d.getTime() - 86400000);
      }
    }

    const weekStart = isoWeekStart();
    const weekEvents = await this.repo.listLearningEvents(principal, [...WEEKLY_GOAL_EVENT_TYPES]);
    const done = weekEvents.filter((e) => e.occurredAt.toISOString().slice(0, 10) >= weekStart).length;
    const target = await this.repo.loadPreferencesWeeklyGoal(principal);

    if (done >= target) {
      await this.ledger.log({
        principal,
        eventType: 'goal.weekly_met',
        payload: { weekStart, target, done },
      });
    }

    return {
      streakDays,
      weeklyGoal: { done, target },
      showStreak: streakDays > 0,
    };
  }
}
