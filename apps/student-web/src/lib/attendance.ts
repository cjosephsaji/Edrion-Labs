'use client';

import { get, set } from 'idb-keyval';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { AttendancePolicyValues } from '@edrion/schemas';
import { useStudentClient } from './student-client';

export type AttendanceZone = 'safe' | 'warning' | 'below' | 'unrecoverable';

export type AttendanceRollupLine = {
  subjectId: string | null;
  subjectName: string | null;
  attended: number;
  conducted: number;
  remaining: number;
  pct: number | null;
  zone: AttendanceZone;
  forecast: { branch: string; n: number; message: string };
  updatedAt?: string | null;
};

export type AttendanceDayStripEntry = {
  date: string;
  attended: number;
  conducted: number;
};

export type AttendanceSummary = {
  termId: string;
  policy: AttendancePolicyValues;
  overall: AttendanceRollupLine;
  subjects: AttendanceRollupLine[];
  pendingRequests: Array<{ id: string; type: string; humanCode: string; status: string }>;
  updatedAt: string | null;
  features: { dayView: boolean };
  dayStrip: AttendanceDayStripEntry[] | null;
};

export type AttendanceSession = {
  id: string;
  date: string;
  period: string;
  startTime: string | null;
  endTime: string | null;
  status: string | null;
  displayStatus: string;
  provenance: { kind: string; request_id: string; humanCode?: string } | null;
};

export type AttendanceSubjectDetail = {
  subjectId: string;
  subjectName: string;
  teacherName: string | null;
  rollup: AttendanceRollupLine;
  math: {
    attended: number;
    conducted: number;
    remaining: number;
    branch: string;
    n: number;
    nuances: string[];
  };
  sessions: AttendanceSession[];
  nextCursor: string | null;
};

type Cached<T> = { value: T; cachedAt: number };

const summaryCache = 'student:attendance:summary:v1';
const subjectCache = (subjectId: string) => `student:attendance:subject:${subjectId}:v1`;

const STALE_MS = 15 * 60 * 1000;

async function cacheFirst<T>(key: string, live: () => Promise<T>): Promise<{ value: T; cachedAt: number | null }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    const cached = await get<Cached<T>>(key);
    if (cached) return cached;
  }
  try {
    const value = await live();
    const cachedAt = Date.now();
    await set(key, { value, cachedAt } satisfies Cached<T>);
    return { value, cachedAt: null };
  } catch (error) {
    const cached = await get<Cached<T>>(key);
    if (cached) return cached;
    throw error;
  }
}

export function isAttendanceStale(updatedAt: string | null | undefined, cachedAt: number | null | undefined): boolean {
  if (cachedAt) return true;
  if (!updatedAt) return false;
  return Date.now() - Date.parse(updatedAt) > STALE_MS;
}

export function useAttendanceSummary() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ['student', 'attendance', 'summary'],
    queryFn: () => cacheFirst(summaryCache, () => client.get<AttendanceSummary>('/attendance/summary')),
    staleTime: 30_000,
  });
}

export function useAttendanceSubject(subjectId: string, enabled = true) {
  const client = useStudentClient();
  return useInfiniteQuery({
    queryKey: ['student', 'attendance', 'subject', subjectId],
    queryFn: async ({ pageParam }) => {
      const path = pageParam
        ? `/attendance/subjects/${subjectId}?cursor=${encodeURIComponent(pageParam)}`
        : `/attendance/subjects/${subjectId}`;
      if (!pageParam) {
        return cacheFirst(subjectCache(subjectId), () => client.get<AttendanceSubjectDetail>(path));
      }
      const value = await client.get<AttendanceSubjectDetail>(path);
      return { value, cachedAt: null };
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.value.nextCursor ?? undefined,
    enabled: Boolean(subjectId) && enabled,
  });
}
