import { describe, expect, it } from 'vitest';
import { petrosMentorPlanInputSchema, petrosMentorStateSchema } from '@edrion/schemas';
import { buildMentorPlan, localDateKey, localDateTime, mentorMessage, rankMentorPriorities, recentActiveMinutes, type MentorCandidate } from './petros-mentor.engine';

const now = new Date('2026-08-31T12:00:00Z');
const state = petrosMentorStateSchema.parse({});
const candidate = (key: string, patch: Partial<MentorCandidate> = {}): MentorCandidate => ({ key, kind: 'work', title: key, reason: 'Published work', href: '/assignments/1', entityType: 'assignment', entityId: key, deadlineAt: null, subject: 'Computing', minutes: 25, ...patch });

describe('academic mentor decisions', () => {
  it('puts tomorrow’s exam ahead of a new assignment due next week and an open session', () => {
    const ranked = rankMentorPriorities([
      candidate('new assignment', { deadlineAt: '2026-09-07T12:00:00Z', weight: 100 }),
      candidate('old open session', { kind: 'session' }),
      candidate('exam', { kind: 'exam', deadlineAt: '2026-09-01T10:00:00Z' }),
    ], state, now);
    expect(ranked.map((item) => item.key)).toEqual(['exam', 'new assignment', 'old open session']);
  });

  it('a submission closing in 47 minutes beats an exam tomorrow, even if skipped', () => {
    const ranked = rankMentorPriorities([
      candidate('exam', { kind: 'exam', deadlineAt: '2026-09-01T10:00:00Z' }),
      candidate('closing', { deadlineAt: '2026-08-31T12:47:00Z' }),
    ], { ...state, history: [{ key: 'closing', decision: 'skipped', at: now.toISOString() }] }, now);
    expect(ranked[0]).toMatchObject({ key: 'closing', urgency: 'critical', previousDecision: 'skipped' });
  });

  it('respects postponement, then returns the task with continuity', () => {
    const choices = { ...state, history: [{ key: 'work', decision: 'postponed' as const, at: now.toISOString() }] };
    expect(rankMentorPriorities([candidate('work')], choices, now)).toEqual([]);
    const next = rankMentorPriorities([candidate('work')], choices, new Date(now.getTime() + 31 * 60_000));
    expect(next[0]?.previousDecision).toBe('postponed');
    expect(mentorMessage(next, 'low', false)).toContain('We put this off earlier');
  });

  it('expires skip-for-today at the institution’s midnight, not after 24 hours', () => {
    const choices = { ...state, history: [{ key: 'work', decision: 'skipped' as const, at: '2026-08-31T18:20:00Z' }] };
    expect(rankMentorPriorities([candidate('work')], choices, new Date('2026-08-31T18:25:00Z'), 'Asia/Kolkata')).toEqual([]);
    expect(rankMentorPriorities([candidate('work')], choices, new Date('2026-08-31T18:31:00Z'), 'Asia/Kolkata')).toHaveLength(1);
  });

  it('does not reoffer completed work or preparation for past exams', () => {
    expect(rankMentorPriorities([candidate('done', { recentlyCompleted: true }), candidate('past', { kind: 'exam', deadlineAt: '2026-08-30T12:00:00Z' })], state, now)).toEqual([]);
  });

  it('uses practice evidence and prerequisite value to distinguish equal deadlines', () => {
    const ranked = rankMentorPriorities([candidate('untried', { kind: 'practice' }), candidate('gap', { kind: 'practice', weakness: 120, prerequisites: 2 })], state, now);
    expect(ranked[0]?.key).toBe('gap');
    expect(ranked[1]?.factors).not.toContain('Recent practice suggests a gap');
  });

  it('never calls incomplete records an all-clear', () => {
    expect(mentorMessage([], 'low', true)).toContain('can’t check everything');
    expect(mentorMessage([], 'low', false)).toContain('take a break');
  });
});

describe('realistic study time', () => {
  const priorities = rankMentorPriorities(Array.from({ length: 8 }, (_, index) => candidate(`topic${index}`)), state, now);

  it('budgets breaks within the hour and never creates a block below five minutes', () => {
    const plan = buildMentorPlan(priorities, { minutes: 60, energy: 'normal', availability: [] }, '2026-08-31');
    expect(plan.reduce((sum, block) => sum + block.minutes, 0)).toBeLessThanOrEqual(60);
    expect(plan.some((block) => block.kind === 'break')).toBe(true);
    expect(plan.every((block) => block.minutes >= 5)).toBe(true);
  });

  it('keeps low-energy blocks at fifteen minutes and honours each day independently', () => {
    const plan = buildMentorPlan(priorities, { minutes: 45, energy: 'low', availability: [{ date: '2026-08-31', minutes: 40 }, { date: '2026-09-01', minutes: 75 }] }, '2026-08-31');
    expect(plan.every((block) => block.minutes <= 15)).toBe(true);
    for (const [date, budget] of [['2026-08-31', 40], ['2026-09-01', 75]] as const) expect(plan.filter((block) => block.date === date).reduce((sum, block) => sum + block.minutes, 0)).toBeLessThanOrEqual(budget);
  });

  it('uses local exam dates when placing final preparation blocks', () => {
    const exam = rankMentorPriorities([candidate('exam', { kind: 'exam', deadlineAt: '2026-09-01T00:30:00Z' })], state, now);
    const plan = buildMentorPlan(exam, { minutes: 45, energy: 'normal', availability: [{ date: '2026-09-01', minutes: 45 }] }, '2026-08-31', 'America/New_York');
    expect(plan).toEqual([]);
  });

  it('rejects duplicate dates instead of doubling the available time', () => {
    expect(petrosMentorPlanInputSchema.safeParse({ availability: [{ date: '2026-09-01', minutes: 60 }, { date: '2026-09-01', minutes: 60 }] }).success).toBe(false);
  });

  it('converts published deadlines without relying on the server timezone', () => {
    expect(localDateTime('2026-09-01', '09:00', 'Asia/Kolkata').toISOString()).toBe('2026-09-01T03:30:00.000Z');
    expect(localDateTime('2026-07-01', '09:00', 'America/New_York').toISOString()).toBe('2026-07-01T13:00:00.000Z');
    expect(localDateTime('2026-12-01', '09:00', 'America/New_York').toISOString()).toBe('2026-12-01T14:00:00.000Z');
    expect(localDateKey(new Date('2026-08-31T20:00:00Z'), 'Asia/Kolkata')).toBe('2026-09-01');
  });

  it('does not mistake an abandoned open session for days of studying', () => {
    expect(recentActiveMinutes({ elapsed: 600, activeSince: new Date('2026-08-20T00:00:00Z'), updatedAt: new Date('2026-08-20T00:00:00Z') }, now)).toBe(0);
    expect(recentActiveMinutes({ elapsed: 600, activeSince: new Date(now.getTime() - 90 * 60_000), updatedAt: now }, now)).toBe(100);
  });
});
