'use client';
import { useMutation } from '@tanstack/react-query';
import type { AskInput, AskResponseDto, PinAskInput } from '@edrion/schemas';
import { useStudentClient, type SseHandlers } from '../student-client';

export function useAsk() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (input: AskInput) => client.post<AskResponseDto>('/learn/ask', input),
  });
}

export function usePinAsk() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (input: PinAskInput) => client.post('/learn/ask/pin', input),
  });
}

export function useAskStreamClient() {
  const client = useStudentClient();
  return {
    streamAsk: (input: AskInput, handlers: SseHandlers) =>
      client.sse('/learn/ask/stream', handlers, { method: 'POST', body: input }),
  };
}
