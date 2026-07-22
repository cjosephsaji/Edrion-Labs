'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HomeTileDto, StudentHomeDto, StudentMeDto, StudentPreferencesDto } from '@edrion/schemas';
import { useStudentClient } from './student-client';

const ME_KEY = ['student', 'me'] as const;
const HOME_KEY = ['student', 'home'] as const;
const PREFERENCES_KEY = ['student', 'preferences'] as const;

export function useStudentMe() {
  const client = useStudentClient();
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => client.get<StudentMeDto>('/me'),
    staleTime: 5 * 60_000,
    retry: (count, err) => {
      if (err && typeof err === 'object' && 'status' in err && (err as { status: number }).status === 401) {
        return false;
      }
      return count < 1;
    },
  });
}

export function usePreferences() {
  const client = useStudentClient();
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: PREFERENCES_KEY,
    queryFn: () => client.get<StudentPreferencesDto>('/preferences'),
    staleTime: 60_000,
  });
  const mutation = useMutation({
    mutationFn: (patch: Partial<StudentPreferencesDto>) =>
      client.patch<StudentPreferencesDto>('/preferences', patch),
    onSuccess: (data) => {
      qc.setQueryData(PREFERENCES_KEY, data);
      qc.invalidateQueries({ queryKey: ME_KEY });
    },
  });
  return { ...query, update: mutation };
}

export function useHomeTiles() {
  const client = useStudentClient();
  return useQuery({
    queryKey: HOME_KEY,
    queryFn: () => client.get<StudentHomeDto>('/home'),
    select: (data) => data.tiles as HomeTileDto[],
  });
}

export function useHome() {
  const client = useStudentClient();
  return useQuery({
    queryKey: HOME_KEY,
    queryFn: () => client.get<StudentHomeDto>('/home'),
  });
}

export * from './hooks/useEdrionLearnSession';
export * from './hooks/useIntent';
export * from './hooks/usePath';
export * from './hooks/useQuick';
export * from './hooks/useRevisionQueue';
export * from './hooks/useStreaks';
export * from './hooks/useHistory';
export * from './hooks/useAsk';
export * from './hooks/institutional';
export * from './hooks/library';
export * from './hooks/exam-engine';
export * from './hooks/useVisualStudio';
export * from './hooks/quiz-attempts';
