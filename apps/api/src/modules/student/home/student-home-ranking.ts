import {
  defaultStudentHomePriorities,
  type StudentHomePriorityKey,
} from '@edrion/schemas';

export type StudentHomeCardKind = StudentHomePriorityKey;
export type StudentHomeCardPriority = 'critical' | 'high' | 'normal' | 'low';
export type StudentHomeCardProminence = 'featured' | 'high' | 'standard';

export type StudentHomeCandidate = {
  id: string;
  kind: StudentHomeCardKind;
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  actionLabel: string;
  reason: string;
  metric?: string | null;
  meta?: string[];
  dynamicBoost: number;
  occurredAt?: string | null;
  source: 'institution' | 'program' | 'continuity';
};

export type StudentHomeCard = Omit<StudentHomeCandidate, 'dynamicBoost'> & {
  score: number;
  rank: number;
  priority: StudentHomeCardPriority;
  prominence: StudentHomeCardProminence;
};

export type StudentHomePriorityWeights = Record<StudentHomePriorityKey, number>;

export function normalizeStudentHomePriorities(
  input?: Partial<Record<StudentHomePriorityKey, number>> | null,
): StudentHomePriorityWeights {
  return Object.fromEntries(
    Object.entries(defaultStudentHomePriorities).map(([key, fallback]) => {
      const value = input?.[key as StudentHomePriorityKey];
      return [key, Number.isFinite(value) ? Math.max(0, Math.min(100, Math.round(value!))) : fallback];
    }),
  ) as StudentHomePriorityWeights;
}

function priorityFor(score: number): StudentHomeCardPriority {
  if (score >= 150) return 'critical';
  if (score >= 105) return 'high';
  if (score >= 70) return 'normal';
  return 'low';
}

export function rankStudentHomeCards(
  candidates: StudentHomeCandidate[],
  configuredWeights?: Partial<Record<StudentHomePriorityKey, number>> | null,
  limit = 8,
): StudentHomeCard[] {
  const weights = normalizeStudentHomePriorities(configuredWeights);
  return candidates
    .map((candidate) => ({
      ...candidate,
      score: weights[candidate.kind] + candidate.dynamicBoost,
      timestamp: candidate.occurredAt ? new Date(candidate.occurredAt).getTime() : 0,
    }))
    .sort((a, b) => b.score - a.score || b.timestamp - a.timestamp || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map(({ dynamicBoost: _dynamicBoost, timestamp: _timestamp, ...candidate }, index) => ({
      ...candidate,
      rank: index + 1,
      priority: priorityFor(candidate.score),
      prominence: index === 0 ? 'featured' : index < 3 ? 'high' : 'standard',
    }));
}
