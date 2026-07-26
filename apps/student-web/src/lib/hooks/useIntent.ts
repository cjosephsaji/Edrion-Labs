'use client';
import { useMutation } from '@tanstack/react-query';
import type { IntentInput, IntentResponseDto } from '@edrion/schemas';
import { useStudentClient } from '../student-client';

export function useIntent() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (input: IntentInput) =>
      client.post<IntentResponseDto>('/learn/intent', input),
  });
}
