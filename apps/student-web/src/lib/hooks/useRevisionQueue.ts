'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LearnSessionDto } from '@edrion/schemas';
import { useStudentClient } from '../student-client';

export type RevisionQueueItem = {
  topicKey: string;
  title: string;
  freshness: 'fresh' | 'fading' | 'due';
  lastTouched: string;
  topicId: string;
};

export type RevisionQueueDto = {
  queue: RevisionQueueItem[];
  counts: { fresh: number; fading: number; due: number };
};

const REVISION_KEY = ['student', 'learn', 'revision'] as const;

export function useRevisionQueue() {
  const client = useStudentClient();
  return useQuery({
    queryKey: REVISION_KEY,
    queryFn: () => client.get<RevisionQueueDto>('/learn/revision'),
  });
}

export function useRevisionRefresh() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (topicId: string) =>
      client.post<LearnSessionDto>(`/learn/revision/${topicId}/refresh`),
    onSuccess: () => qc.invalidateQueries({ queryKey: REVISION_KEY }),
  });
}
