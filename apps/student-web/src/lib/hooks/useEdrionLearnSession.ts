'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateLearnSessionInput, LearnSessionV1Dto, SessionBlockV1Dto } from '@edrion/schemas';
import { useStudentClient, StudentSseError, type SseConnection, type SseErrorSource } from '../student-client';

const sessionKey = (id: string) => ['student', 'edrion-learn', 'session', id] as const;

const isDev = process.env.NODE_ENV !== 'production';

/**
 * Hyperspec 2 §1 — the calm card shown when the stream never starts. Reserved for
 * connectivity failures only; every other failure surfaces the server's own message.
 */
const STREAM_START_FAILED_COPY = "Couldn't start your lesson — check your connection";

export type LearnStreamError = {
  /** Which of the distinct failure modes this is (see `SseErrorSource`). */
  source: SseErrorSource | 'unknown';
  /** Backend error code where one exists, e.g. `PLANNER_TIMEOUT`. */
  code: string;
  /** What the student reads. */
  message: string;
  status?: number;
};

function toStreamError(err: unknown): LearnStreamError {
  if (err instanceof StudentSseError) {
    // Connectivity: the stream never started, or the socket dropped. Hyperspec copy.
    if (err.source === 'network') {
      return { source: 'network', code: err.code, message: STREAM_START_FAILED_COPY, status: err.status };
    }
    // Server-supplied failures (non-2xx body, in-stream error frame): show the real message.
    return { source: err.source, code: err.code, message: err.message, status: err.status };
  }
  return {
    source: 'unknown',
    code: 'UNKNOWN',
    message: err instanceof Error && err.message ? err.message : STREAM_START_FAILED_COPY,
  };
}

export function useEdrionLearnSession(sessionId: string | undefined) {
  const client = useStudentClient();
  const qc = useQueryClient();
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<LearnStreamError | null>(null);
  const connRef = useRef<SseConnection | null>(null);
  const pendingContinue = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startStreamRef = useRef<() => void>(() => {});

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

  /** Tear the current connection down and cancel any queued restart. */
  const stopStream = useCallback(() => {
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    pendingContinue.current = false;
    connRef.current?.close();
    connRef.current = null;
    setStreaming(false);
  }, []);

  /** Single-flighted restart: at most one pending timer, and only when nothing is open. */
  const scheduleRestart = useCallback(() => {
    if (restartTimer.current || connRef.current) return;
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null;
      startStreamRef.current();
    }, 100);
  }, []);

  const startStream = useCallback(() => {
    if (!sessionId) return;
    // Single-flight: a StrictMode double-mount (or a racing continue) must not open a
    // second server-side handler. `client.sse` returns synchronously, so this is safe.
    if (connRef.current) return;
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    setStreaming(true);
    setStreamError(null);
    const conn = client.sse(`/learn/sessions/${sessionId}/stream`, {
      onMessage: (frame) => {
        const data = frame.data;
        if (data === '[DONE]') {
          // The transport closes itself on [DONE]; drop our handle so a restart can open.
          connRef.current = null;
          setStreaming(false);
          if (pendingContinue.current) {
            pendingContinue.current = false;
            scheduleRestart();
          }
          return;
        }
        try {
          const event = (typeof data === 'string' ? JSON.parse(data) : data) as {
            type?: string;
            block?: Parameters<typeof applyBlock>[0]['block'];
          };
          // NOTE: `type === 'error'` never arrives here — StudentClient intercepts error
          // frames and routes them to `onError` below.
          if (event.type === 'block' && event.block) applyBlock(event);
        } catch (err) {
          if (isDev) console.error('[edrion-learn] unparseable stream frame', { sessionId, data, err });
        }
      },
      onError: (err) => {
        if (isDev) console.error('[edrion-learn] stream error', { sessionId, err });
        connRef.current = null;
        pendingContinue.current = false;
        setStreamError(toStreamError(err));
        setStreaming(false);
      },
    });
    connRef.current = conn;
  }, [applyBlock, client, scheduleRestart, sessionId]);

  startStreamRef.current = startStream;

  /** Explicit user-driven retry — force a teardown first so the guard can't block it. */
  const restartStream = useCallback(() => {
    stopStream();
    startStream();
  }, [startStream, stopStream]);

  /**
   * Called after an answer/interact/ask/commit. If a connection is still open we let its
   * own `[DONE]` handler do the restart — opening one here too would double-connect.
   */
  const continueStream = useCallback(() => {
    if (connRef.current) {
      pendingContinue.current = true;
      return;
    }
    scheduleRestart();
  }, [scheduleRestart]);

  useEffect(() => stopStream, [stopStream]);

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

  useEffect(() => {
    if (isDev && query.error) {
      console.error('[edrion-learn] session fetch failed', { sessionId, error: query.error });
    }
  }, [query.error, sessionId]);

  return {
    ...query,
    streaming,
    streamError,
    startStream,
    stopStream,
    restartStream,
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
