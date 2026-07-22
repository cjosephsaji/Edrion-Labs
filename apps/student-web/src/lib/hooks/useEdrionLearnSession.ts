'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateLearnSessionInput, LearnSessionV1Dto, SessionBlockV1Dto } from '@edrion/schemas';
import { useStudentClient, type SseConnection } from '../student-client';

const sessionKey = (id: string) => ['student', 'edrion-learn', 'session', id] as const;

export function useEdrionLearnSession(sessionId: string | undefined) {
  const client = useStudentClient();
  const qc = useQueryClient();
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const connRef = useRef<SseConnection | null>(null);
  const pendingContinue = useRef(false);

  const query = useQuery({
    queryKey: sessionKey(sessionId ?? ''),
    queryFn: () => client.get<LearnSessionV1Dto>(`/learn/sessions/${sessionId}`),
    enabled: !!sessionId,
    refetchInterval: (q) => {
      const s = q.state.data;
      if (!s || s.orchestratorStatus === 'closed') return false;
      if (s.orchestratorStatus === 'active' && !streaming) return 3000;
      return false;
    },
  });

  const applyBlock = useCallback(
    (event: {
      block?: {
        id: string;
        streamSeq?: number;
        moveType?: string;
        block: SessionBlockV1Dto['block'];
        reasoning?: string | null;
        degraded?: boolean;
        renderStatus?: string;
      };
    }) => {
      if (!sessionId || !event.block) return;
      qc.setQueryData<LearnSessionV1Dto>(sessionKey(sessionId), (prev) => {
        if (!prev) return prev;
        const blocks = [...prev.blocks];
        const mapped: SessionBlockV1Dto = {
          id: event.block!.id,
          sessionId,
          sequence: event.block!.streamSeq ?? blocks.length + 1,
          streamSeq: event.block!.streamSeq,
          moveType: event.block!.moveType,
          block: event.block!.block,
          blockSchemaVersion: 1,
          reasoning: event.block!.reasoning,
          degraded: event.block!.degraded ?? false,
          interactionState: {},
          renderStatus: event.block!.renderStatus,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const idx = blocks.findIndex((b) => b.id === mapped.id);
        if (idx >= 0) blocks[idx] = mapped;
        else blocks.push(mapped);
        return { ...prev, blocks, orchestratorStatus: prev.orchestratorStatus };
      });
    },
    [qc, sessionId],
  );

  const startStream = useCallback(() => {
    if (!sessionId) return;
    setStreaming(true);
    setStreamError(null);
    connRef.current?.close();
    const conn = client.sse(`/learn/sessions/${sessionId}/stream`, {
      onMessage: (frame) => {
        const data = frame.data;
        if (data === '[DONE]') {
          setStreaming(false);
          if (pendingContinue.current) {
            pendingContinue.current = false;
            setTimeout(() => startStream(), 100);
          }
          return;
        }
        try {
          const event = (typeof data === 'string' ? JSON.parse(data) : data) as {
            type?: string;
            message?: string;
            block?: Parameters<typeof applyBlock>[0]['block'];
          };
          if (event.type === 'error') {
            setStreamError(event.message ?? 'Stream failed');
            setStreaming(false);
            return;
          }
          if (event.type === 'block' && event.block) applyBlock(event);
        } catch {
          /* ignore */
        }
      },
      onError: () => {
        setStreamError("Couldn't start your lesson — check your connection");
        setStreaming(false);
      },
    });
    connRef.current = conn;
  }, [applyBlock, client, sessionId]);

  const continueStream = useCallback(() => {
    pendingContinue.current = true;
    connRef.current?.close();
    setStreaming(false);
    startStream();
  }, [startStream]);

  useEffect(() => () => connRef.current?.close(), []);

  const answer = useMutation({
    mutationFn: (input: { blockId: string; questionId: string; response: unknown }) =>
      client.post<{ session: LearnSessionV1Dto; evaluation: { correct?: boolean | null; feedback?: string } }>(
        `/learn/sessions/${sessionId}/blocks/${input.blockId}/answer`,
        {
          questionId: input.questionId,
          response: input.response,
          idempotencyKey: crypto.randomUUID(),
        },
      ),
    onSuccess: (res) => {
      qc.setQueryData(sessionKey(sessionId!), res.session);
      continueStream();
    },
  });

  const interact = useMutation({
    mutationFn: (input: { blockId: string; action: string; data?: Record<string, unknown>; version: number }) =>
      client.post<{ session: LearnSessionV1Dto }>(`/learn/sessions/${sessionId}/blocks/${input.blockId}/interact`, {
        action: input.action,
        data: input.data,
        expectedInteractionVersion: input.version,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (res) => {
      qc.setQueryData(sessionKey(sessionId!), res.session);
      continueStream();
    },
  });

  const ask = useMutation({
    mutationFn: (text: string) =>
      client.post<{ session: LearnSessionV1Dto }>(`/learn/sessions/${sessionId}/ask`, {
        text,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (res) => {
      qc.setQueryData(sessionKey(sessionId!), res.session);
      continueStream();
    },
  });

  const commitArtifacts = useMutation({
    mutationFn: (cardSelections: string[]) =>
      client.post<{ session: LearnSessionV1Dto; deckId: string }>(`/learn/sessions/${sessionId}/commit-artifacts`, {
        cardSelections,
        includeCanvas: false,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (res) => {
      qc.setQueryData(sessionKey(sessionId!), res.session);
      continueStream();
    },
  });

  const pause = useMutation({
    mutationFn: () => client.post<LearnSessionV1Dto>(`/learn/sessions/${sessionId}/pause`),
    onSuccess: (data) => qc.setQueryData(sessionKey(sessionId!), data),
  });

  const end = useMutation({
    mutationFn: (saveToLibrary = false) =>
      client.post<LearnSessionV1Dto>(`/learn/sessions/${sessionId}/end`, {
        saveToLibrary,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (data) => qc.setQueryData(sessionKey(sessionId!), data),
  });

  return {
    ...query,
    streaming,
    streamError,
    startStream,
    continueStream,
    answer,
    interact,
    ask,
    commitArtifacts,
    pause,
    end,
  };
}

export function useCreateEdrionLearnSession() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: async (input: CreateLearnSessionInput) => {
      const res = await client.post<{ session: LearnSessionV1Dto; streamUrl: string }>('/learn/sessions', input);
      return res.session;
    },
  });
}

export const useCreateSession = useCreateEdrionLearnSession;
