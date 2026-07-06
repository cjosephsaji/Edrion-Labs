'use client';
import { useQuery } from '@tanstack/react-query';
import { useStudentClient } from '../student-client';

export type HistoryEntry = {
  day: string;
  kind: 'session' | 'quick' | 'practice' | 'mock' | 'debate';
  title: string;
  meta: string;
  reopen: { route: string };
  cursor: string;
};

export type HistoryDto = {
  groups: { day: string; items: HistoryEntry[] }[];
  nextCursor?: string;
};

export function useHistory(type?: string, q?: string, cursor?: string) {
  const client = useStudentClient();
  const params = new URLSearchParams();
  if (type) params.set('type', type);
  if (q) params.set('q', q);
  if (cursor) params.set('cursor', cursor);
  const qs = params.toString();
  return useQuery({
    queryKey: ['student', 'history', type ?? 'all', q ?? '', cursor ?? ''],
    queryFn: () => client.get<HistoryDto>(`/history${qs ? `?${qs}` : ''}`),
  });
}
