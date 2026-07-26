'use client';
import { useQuery } from '@tanstack/react-query';
import { useStudentClient } from '../student-client';

export type StreaksDto = {
  streakDays: number;
  weeklyGoal: { done: number; target: number };
  showStreak: boolean;
};

const STREAKS_KEY = ['student', 'learn', 'streaks'] as const;

export function useStreaks() {
  const client = useStudentClient();
  return useQuery({
    queryKey: STREAKS_KEY,
    queryFn: () => client.get<StreaksDto>('/learn/streaks'),
  });
}
