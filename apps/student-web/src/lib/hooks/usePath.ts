'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreatePathInput, LearningPathDto, PatchPathInput } from '@edrion/schemas';
import { useStudentClient } from '../student-client';

const PATH_KEY = ['student', 'learn', 'path'] as const;

export function usePath() {
  const client = useStudentClient();
  return useQuery({
    queryKey: PATH_KEY,
    queryFn: () => client.get<LearningPathDto | null>('/learn/path'),
  });
}

export function useCreatePath() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreatePathInput) =>
      client.post<LearningPathDto>('/learn/path', input),
    onSuccess: (data) => qc.setQueryData(PATH_KEY, data),
  });
}

export function usePatchPath() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PatchPathInput) =>
      client.patch<LearningPathDto>('/learn/path', input),
    onSuccess: (data) => qc.setQueryData(PATH_KEY, data),
  });
}
