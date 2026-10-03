'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useStudentApi } from './api-client';
import { clearQueuedNotes } from './petros-offline-notes';

export type StudentMe = {
  kind: 'institutional' | 'independent';
  fullName: string;
  email: string | null;
  studentId: string | null;
  institutionId: string | null;
  campusId: string | null;
  programmeName: string | null;
  className: string | null;
  sectionName: string | null;
  termName: string | null;
  academicYearName: string | null;
  permissions: string[];
  surfaces: Record<string, boolean>;
};

export type DashboardData = {
  me: StudentMe;
  priorityCards: StudentHomeCard[];
  ranking: {
    generatedAt: string;
    weights: Record<StudentHomeCardKind, number>;
  };
  todaySlots: Array<{
    id: string;
    start: string;
    end: string;
    subjectName: string;
    teacherName: string | null;
    roomName: string | null;
  }>;
  attendancePct: number | null;
  pendingAssignments: number;
  upcomingDeadlines: Array<{ id: string; title: string; dueAt: string; kind: 'assignment' | 'homework' }>;
  outstandingFees: { amount: number; currency: string; invoiceCount: number; overdueCount: number; nextDueDate: string | null } | null;
  recentAnnouncements: Array<{ id: string; title: string; summary: string | null; category: string | null; pinned: boolean; publishedAt: string }>;
  unreadNotifications: number;
  upcomingExams: Array<{ id: string; title: string; startsAt: string; status: string }>;
};

export type StudentHomeCardKind =
  | 'exam'
  | 'due_work'
  | 'learning'
  | 'fees'
  | 'attendance'
  | 'schedule'
  | 'announcement'
  | 'notification';

export type StudentHomeCard = {
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
  occurredAt?: string | null;
  source: 'institution' | 'program' | 'continuity';
  score: number;
  rank: number;
  priority: 'critical' | 'high' | 'normal' | 'low';
  prominence: 'featured' | 'high' | 'standard';
};

export function useStudentMe() {
  const api = useStudentApi();
  return useQuery({
    queryKey: ['student', 'me'],
    queryFn: () => api.get<StudentMe>('/student/me'),
    retry: false,
  });
}

export function useDashboard() {
  const api = useStudentApi();
  return useQuery({
    queryKey: ['student', 'home'],
    queryFn: () => api.get<DashboardData>('/student/home'),
    retry: false,
  });
}

export function useStudentLogin() {
  const api = useStudentApi();
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: (body: { identifier: string; password: string; institutionCode?: string }) =>
      api.post<{ authenticated: true }>('/student/auth/login', body),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['student'] });
      router.replace('/home');
    },
  });
}

export function useStudentLogout() {
  const api = useStudentApi();
  const qc = useQueryClient();
  const router = useRouter();
  return useMutation({
    mutationFn: () => api.post<{ loggedOut: true }>('/student/auth/logout'),
    onMutate: async () => {
      await clearQueuedNotes().catch(() => undefined);
    },
    onSuccess: () => {
      qc.clear();
      router.replace('/login');
    },
  });
}

export function useStudentList<T>(key: string | readonly unknown[], path: string, enabled = true) {
  const api = useStudentApi();
  return useQuery({
    queryKey: ['student', ...(typeof key === 'string' ? [key] : key)],
    queryFn: () => api.get<T>(path),
    enabled,
    retry: false,
  });
}
