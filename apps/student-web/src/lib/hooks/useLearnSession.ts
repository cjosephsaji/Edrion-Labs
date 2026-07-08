'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateSessionInput,
  LearnSessionDto,
  PracticeAnswerInput,
  SessionBlockDto,
} from '@edrion/schemas';
import type { BlockAnswerResult } from '../learn-session-types';
import { useStudentClient, type SseConnection } from '../student-client';

const sessionKey = (id: string) => ['student', 'learn', 'session', id] as const;

export function useLearnSession(sessionId: string | undefined) {
  const client = useStudentClient();
  const qc = useQueryClient();
  const [streaming, setStreaming] = useState(false);
  const esRef = useRef<SseConnection | null>(null);

  const query = useQuery({
    queryKey: sessionId ? sessionKey(sessionId) : ['student', 'learn', 'session', 'none'],
    queryFn: () => client.get<LearnSessionDto>(`/learn/sessions/${sessionId}`),
    enabled: !!sessionId,
  });

  const invalidate = useCallback(() => {
    if (sessionId) void qc.invalidateQueries({ queryKey: sessionKey(sessionId) });
  }, [qc, sessionId]);

  const startStream = useCallback(() => {
    if (!sessionId || esRef.current) return;
    setStreaming(true);
    const es = client.sse(`/learn/sessions/${sessionId}/stream`, {
      onMessage: (data) => {
        if (data === '[DONE]') {
          setStreaming(false);
          esRef.current?.close();
          esRef.current = null;
          invalidate();
          return;
        }
        const event = data as { type?: string; block?: SessionBlockDto };
        if (event.type === 'block.done' || event.type === 'session.done') {
          invalidate();
        }
      },
      onError: () => {
        setStreaming(false);
        esRef.current = null;
      },
    });
    esRef.current = es;
  }, [client, sessionId, invalidate]);

  useEffect(() => {
    return () => {
      esRef.current?.close();
      esRef.current = null;
    };
  }, [sessionId]);

  const answer = useMutation({
    mutationFn: ({ blockId, body }: { blockId: string; body: Record<string, unknown> }) =>
      client.post<BlockAnswerResult>(`/learn/sessions/${sessionId}/blocks/${blockId}/answer`, body),
    onSuccess: (data) => {
      if (sessionId) qc.setQueryData(sessionKey(sessionId), data.session);
    },
  });

  const hint = useMutation({
    mutationFn: ({ blockId, rung }: { blockId: string; rung: 2 | 3 }) =>
      client.post<{ rung: number; hint: string }>(
        `/learn/sessions/${sessionId}/blocks/${blockId}/hint`,
        { rung },
      ),
  });

  const pause = useMutation({
    mutationFn: () => client.post(`/learn/sessions/${sessionId}/pause`),
    onSuccess: invalidate,
  });

  const resume = useMutation({
    mutationFn: () => client.post(`/learn/sessions/${sessionId}/resume`),
    onSuccess: invalidate,
  });

  const finish = useMutation({
    mutationFn: () => client.post<LearnSessionDto>(`/learn/sessions/${sessionId}/finish`),
    onSuccess: (data) => {
      if (sessionId) qc.setQueryData(sessionKey(sessionId), data);
    },
  });

  const continueBlock = useMutation({
    mutationFn: (blockId: string) =>
      client.post<{ session: LearnSessionDto }>(
        `/learn/sessions/${sessionId}/blocks/${blockId}/continue`,
      ),
    onSuccess: (data) => {
      if (sessionId) qc.setQueryData(sessionKey(sessionId), data.session);
    },
  });

  return {
    ...query,
    streaming,
    startStream,
    answer,
    hint,
    pause,
    resume,
    finish,
    continueBlock,
    invalidate,
  };
}

export function useCreateSession() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSessionInput) =>
      client.post<LearnSessionDto>('/learn/sessions', input),
    onSuccess: (data) => {
      qc.setQueryData(sessionKey(data.id), data);
    },
  });
}

export function usePracticeAnswer(sessionId: string, blockId: string) {
  const { answer } = useLearnSession(sessionId);
  return useMutation({
    mutationFn: (input: PracticeAnswerInput & { hintsUsed?: number }) =>
      answer.mutateAsync({ blockId, body: { ...input, hintsUsed: input.hintsUsed ?? 0 } }),
  });
}
