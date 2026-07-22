'use client';
import { useQuery } from '@tanstack/react-query';
import type { LearnSessionAggregateDto } from '@edrion/schemas';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';

export function useStudentLearnAggregate(studentId: string | undefined) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['portal', 'learn', studentId, 'aggregate'],
    queryFn: () =>
      client.get<LearnSessionAggregateDto>(`/portal/learn-policy/students/${studentId}/sessions/aggregate`, scope),
    enabled: !!studentId,
    retry: false,
  });
}

export function useStudentLearnSessions(studentId: string | undefined) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['portal', 'learn', studentId, 'sessions'],
    queryFn: () => client.get<string[]>(`/portal/learn-policy/students/${studentId}/sessions`, scope),
    enabled: !!studentId,
    retry: false,
  });
}
