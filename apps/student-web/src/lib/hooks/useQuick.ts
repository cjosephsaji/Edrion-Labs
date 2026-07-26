'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { QuickAnswerDto, QuickAnswerInput } from '@edrion/schemas';
import { useStudentClient } from '../student-client';

const quickKey = (id: string) => ['student', 'learn', 'quick', id] as const;

export function useQuick(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: id ? quickKey(id) : ['student', 'learn', 'quick', 'none'],
    queryFn: () => client.get<QuickAnswerDto>(`/learn/quick/${id}`),
    enabled: !!id,
  });
}

export function useAskQuick() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: QuickAnswerInput) =>
      client.post<QuickAnswerDto>('/learn/quick', input),
    onSuccess: (data) => qc.setQueryData(quickKey(data.id), data),
  });
}

export function useAddToLearningList() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<QuickAnswerDto>(`/learn/quick/${id}/learning-list`),
    onSuccess: (data) => qc.setQueryData(quickKey(data.id), data),
  });
}
