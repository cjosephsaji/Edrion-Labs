import type { PetrosMentorPlanInput, PetrosMentorPlanStep, PetrosMentorPriority, PetrosMentorState } from '@edrion/schemas';

const MINUTE = 60_000;
const DAY = 86_400_000;

export function localDateKey(at: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

/** Convert an institution's published wall-clock deadline, never the API host timezone. */
export function localDateTime(date: string, time: string, timeZone: string): Date {
  const desired = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  let instant = desired;
  for (let pass = 0; pass < 3; pass++) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(instant));
    const get = (key: string) => parts.find((part) => part.type === key)?.value;
    const wall = Date.parse(`${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}Z`);
    const correction = desired - wall;
    instant += correction;
    if (!correction) break;
  }
  return new Date(instant);
}

export type MentorCandidate = Omit<PetrosMentorPriority, 'score' | 'urgency' | 'factors' | 'previousDecision'> & {
  weight?: number | null;
  weakness?: number;
  prerequisites?: number;
  recentlyCompleted?: boolean;
};

export function rankMentorPriorities(candidates: MentorCandidate[], state: PetrosMentorState, now: Date, timeZone = 'UTC'): PetrosMentorPriority[] {
  const seen = new Set<string>();
  return candidates.flatMap((item): PetrosMentorPriority[] => {
    if (seen.has(item.key) || item.recentlyCompleted) return [];
    seen.add(item.key);
    const until = item.deadlineAt ? Date.parse(item.deadlineAt) - now.getTime() : null;
    if (item.kind === 'exam' && until !== null && until < 0) return [];
    const critical = until !== null && until >= 0 && until <= 60 * MINUTE && (item.kind === 'work' || item.kind === 'exam');
    const high = until !== null && until >= 0 && until <= DAY;
    const previous = [...state.history].reverse().find((entry) => entry.key === item.key);
    const sinceDecision = previous ? now.getTime() - Date.parse(previous.at) : Infinity;
    // Quieting a suggestion never erases a now-critical deadline.
    if (!critical && previous && ((previous.decision === 'postponed' && sinceDecision < 30 * MINUTE) || (previous.decision === 'skipped' && localDateKey(new Date(previous.at), timeZone) === localDateKey(now, timeZone)))) return [];
    const factors: string[] = [];
    let score = ({ exam: 300, work: 220, practice: 120, session: 110, review: 130, attendance: 100, planner: 90 })[item.kind];
    if (critical) { score += 1000; factors.push('Deadline within an hour'); }
    else if (high) { score += 650; factors.push('Within the next 24 hours'); }
    else if (until !== null && until >= 0 && until <= 3 * DAY) { score += 400; factors.push('Within the next three days'); }
    else if (until !== null && until >= 0 && until <= 7 * DAY) { score += 180; factors.push('Due this week'); }
    else if (until !== null && until < 0) { score += 250; factors.push('Already overdue; check what can still be submitted'); }
    if (item.weight) { score += Math.min(100, item.weight); factors.push(`${item.weight} published points`); }
    if (item.weakness) { score += Math.min(120, item.weakness); factors.push('Recent practice suggests a gap'); }
    if (item.prerequisites) { score += Math.min(60, item.prerequisites * 20); factors.push('Supports other topics'); }
    if (previous?.decision === 'postponed' || previous?.decision === 'skipped') factors.push('You put this off earlier');
    const { weight: _weight, weakness: _weakness, prerequisites: _prerequisites, recentlyCompleted: _completed, ...priority } = item;
    return [{ ...priority, score, urgency: critical ? 'critical' : high ? 'high' : score >= 250 ? 'normal' : 'low', factors, previousDecision: previous?.decision ?? null }];
  }).sort((a, b) => b.score - a.score || (a.deadlineAt ?? '9999').localeCompare(b.deadlineAt ?? '9999') || a.key.localeCompare(b.key));
}

/** An open tab is not evidence of continuous attention, particularly after an overnight gap. */
export function recentActiveMinutes(session: { elapsed: number; activeSince: Date | null; updatedAt: Date } | undefined, now: Date) {
  if (!session?.activeSince || now.getTime() - session.updatedAt.getTime() > 15 * MINUTE) return 0;
  const liveSeconds = Math.max(0, (now.getTime() - session.activeSince.getTime()) / 1000);
  // Very old unpaused clocks are unreliable even if a resumed page updates its timestamp.
  if (liveSeconds > 4 * 60 * 60) return 0;
  return Math.floor(Math.max(0, session.elapsed + liveSeconds) / 60);
}

/** A budgeted sequence of focus blocks, never a promise that a task will be finished. */
export function buildMentorPlan(priorities: PetrosMentorPriority[], input: PetrosMentorPlanInput, today: string, timeZone = 'UTC'): PetrosMentorPlanStep[] {
  const days = input.availability.length ? [...input.availability].filter((day) => day.date >= today).sort((a, b) => a.date.localeCompare(b.date)) : [{ date: today, minutes: input.minutes }];
  const result: PetrosMentorPlanStep[] = [];
  for (const day of days) {
    let remaining = day.minutes;
    let continuous = 0;
    let sequence = 0;
    const eligible = priorities.filter((item) => item.kind !== 'attendance' && item.kind !== 'planner' && (!item.deadlineAt || localDateKey(new Date(item.deadlineAt), timeZone) >= day.date || item.kind === 'work'));
    // One pass per day: leave spare time free rather than inventing extra work.
    for (let n = 0; n < eligible.length && remaining >= 5; n++) {
      const item = eligible[n]!;
      if (continuous >= 40 && remaining >= 10) {
        result.push({ key: `${day.date}:break:${sequence++}`, priorityKey: null, date: day.date, title: 'Step away for a short break', minutes: 5, kind: 'break', href: null });
        remaining -= 5;
        continuous = 0;
      }
      const minutes = Math.min(remaining, input.energy === 'low' ? 15 : item.minutes, 40);
      result.push({ key: `${day.date}:${item.key}`, priorityKey: item.key, date: day.date, title: item.title, minutes, kind: 'focus', href: item.href });
      remaining -= minutes;
      continuous += minutes;
    }
  }
  return result;
}

export function mentorMessage(priorities: PetrosMentorPriority[], energy: 'low' | 'normal', incomplete: boolean) {
  const lead = priorities[0];
  if (!lead) return incomplete ? 'I can’t check everything right now. I won’t call the day clear until the missing information is back.' : 'Nothing needs urgent attention in the records I can see. You can take a break, or choose something you want to learn.';
  const next = priorities.find((item) => item.key !== lead.key && item.kind !== 'session');
  const resistance = energy === 'low' ? `Let’s keep this small: ${Math.min(15, lead.minutes)} minutes on ${lead.title}. ` : `${lead.title} comes first. `;
  const continuity = lead.previousDecision === 'postponed' || lead.previousDecision === 'skipped' ? 'We put this off earlier. ' : '';
  const why = lead.factors[0] ? `${lead.factors[0]}. ` : `${lead.reason} `;
  return `${continuity}${resistance}${why}${next ? `After that, ${next.title} can be next.` : 'Then reassess; you don’t need to commit to a long session.'}`;
}
