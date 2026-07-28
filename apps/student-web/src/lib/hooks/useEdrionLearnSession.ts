'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createStore, get, set } from 'idb-keyval';
import type { CreateLearnSessionInput, LearnSessionV1Dto, SessionBlockV1Dto } from '@edrion/schemas';
import { useStudentClient, StudentSseError, type SseConnection, type SseErrorSource } from '../student-client';

const sessionKey = (id: string) => ['student', 'edrion-learn', 'session', id] as const;
const isDev = process.env.NODE_ENV !== 'production';
const STREAM_START_FAILED_COPY = "Couldn't start your lesson — check your connection";
const ANSWER_RETRY_MS = 30_000;
const learnOfflineStore = createStore('edrion-learn-offline', 'sessions');

async function cacheSessionOffline(session: LearnSessionV1Dto) {
  try {
    await set(`session:${session.id}`, session, learnOfflineStore);
  } catch {
    /* private mode / quota — reading still works online */
  }
}

async function readSessionOffline(id: string): Promise<LearnSessionV1Dto | undefined> {
  try {
    return await get<LearnSessionV1Dto>(`session:${id}`, learnOfflineStore);
  } catch {
    return undefined;
  }
}

export type LearnStreamError = {
  source: SseErrorSource | 'unknown';
  code: string;
  message: string;
  status?: number;
};

function toStreamError(err: unknown): LearnStreamError {
  if (err instanceof StudentSseError) {
    if (err.source === 'network') {
      return { source: 'network', code: err.code, message: STREAM_START_FAILED_COPY, status: err.status };
    }
    return { source: err.source, code: err.code, message: err.message, status: err.status };
  }
  return {
    source: 'unknown',
    code: 'UNKNOWN',
    message: err instanceof Error && err.message ? err.message : STREAM_START_FAILED_COPY,
  };
}

function stableIdempotencyKey(map: Map<string, string>, key: string): string {
  let existing = map.get(key);
  if (!existing) {
    existing = crypto.randomUUID();
    map.set(key, existing);
  }
  return existing;
}

export function useEdrionLearnSession(sessionId: string | undefined) {
  const client = useStudentClient();
  const qc = useQueryClient();
  const [streaming, setStreaming] = useState(false);
  const [streamError, setStreamError] = useState<LearnStreamError | null>(null);
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [streamingText, setStreamingText] = useState<{ blockId: string; text: string } | null>(null);
  const [streamingMoveType, setStreamingMoveType] = useState<string | null>(null);
  const connRef = useRef<SseConnection | null>(null);
  const pendingContinue = useRef(false);
  const restartTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startStreamRef = useRef<() => void>(() => {});
  const lastSeqRef = useRef(0);
  const idempotencyKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const query = useQuery({
    queryKey: sessionKey(sessionId ?? ''),
    queryFn: async () => {
      try {
        const fresh = await client.get<LearnSessionV1Dto>(`/learn/sessions/${sessionId}`);
        await cacheSessionOffline(fresh);
        return fresh;
      } catch (err) {
        const cached = sessionId ? await readSessionOffline(sessionId) : undefined;
        if (cached) return cached;
        throw err;
      }
    },
    enabled: !!sessionId,
    refetchInterval: (q) => {
      const s = q.state.data;
      if (!s || s.orchestratorStatus === 'closed') return false;
      if (s.orchestratorStatus === 'active' && !streaming) return 3000;
      return false;
    },
  });

  useEffect(() => {
    if (query.data) void cacheSessionOffline(query.data);
  }, [query.data]);

  useEffect(() => {
    const blocks = query.data?.blocks ?? [];
    const maxSeq = blocks.reduce((m, b) => Math.max(m, b.streamSeq ?? b.sequence ?? 0), 0);
    if (maxSeq > lastSeqRef.current) lastSeqRef.current = maxSeq;
  }, [query.data?.blocks]);

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
        interactionState?: Record<string, unknown>;
      };
    }) => {
      if (!sessionId || !event.block) return;
      if (event.block.streamSeq && event.block.streamSeq > lastSeqRef.current) {
        lastSeqRef.current = event.block.streamSeq;
      }
      setStreamingText(null);
      setStreamingMoveType(null);
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
          // F4: preserve interactionState from the SSE payload (never hardcode {}).
          interactionState: event.block!.interactionState ?? {},
          renderStatus: event.block!.renderStatus,
          version: 1,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const idx = blocks.findIndex((b) => b.id === mapped.id);
        if (idx >= 0) {
          // Merge: keep prior interactionState if the event omitted it.
          const prior = blocks[idx]!;
          blocks[idx] = {
            ...mapped,
            interactionState:
              Object.keys(mapped.interactionState).length > 0
                ? mapped.interactionState
                : prior.interactionState,
          };
        } else blocks.push(mapped);
        return { ...prev, blocks };
      });
    },
    [qc, sessionId],
  );

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

  const scheduleRestart = useCallback(() => {
    if (restartTimer.current || connRef.current) return;
    restartTimer.current = setTimeout(() => {
      restartTimer.current = null;
      startStreamRef.current();
    }, 100);
  }, []);

  const startStream = useCallback(() => {
    if (!sessionId) return;
    if (connRef.current) return;
    if (restartTimer.current) {
      clearTimeout(restartTimer.current);
      restartTimer.current = null;
    }
    setStreaming(true);
    setStreamError(null);
    // F5: send last_seq so the server can replay without gaps/duplicates.
    const qs = lastSeqRef.current > 0 ? `?lastSeq=${lastSeqRef.current}` : '';
    const conn = client.sse(`/learn/sessions/${sessionId}/stream${qs}`, {
      onMessage: (frame) => {
        const data = frame.data;
        if (data === '[DONE]') {
          connRef.current = null;
          setStreaming(false);
          setStreamingText(null);
      setStreamingMoveType(null);
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
            blockId?: string;
            text?: string;
            seq?: number;
            moveType?: string;
            eventType?: string;
            payload?: { block_id?: string; stream_seq?: number };
          };
          if (event.type === 'heartbeat') return;
          if (event.type === 'block_delta' && event.blockId && typeof event.text === 'string') {
            setStreamingText({ blockId: event.blockId, text: event.text });
            return;
          }
          if (event.type === 'block_start' && typeof event.seq === 'number') {
            if (event.seq > lastSeqRef.current) lastSeqRef.current = event.seq;
            if (event.moveType) setStreamingMoveType(event.moveType);
            return;
          }
          if (event.type === 'replay') {
            // Reconstruct from replay payloads when they carry block content; otherwise
            // the accompanying block re-emit (F5 server fix) fills the gap.
            if (typeof event.seq === 'number' && event.seq > lastSeqRef.current) {
              lastSeqRef.current = event.seq;
            }
            return;
          }
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
        // Auto-resume with last_seq when connectivity returns.
        if (err instanceof StudentSseError && err.source === 'network') {
          scheduleRestart();
        }
      },
    });
    connRef.current = conn;
  }, [applyBlock, client, scheduleRestart, sessionId]);

  startStreamRef.current = startStream;

  const restartStream = useCallback(() => {
    stopStream();
    startStream();
  }, [startStream, stopStream]);

  const continueStream = useCallback(() => {
    if (connRef.current) {
      pendingContinue.current = true;
      return;
    }
    scheduleRestart();
  }, [scheduleRestart]);

  useEffect(() => stopStream, [stopStream]);

  useEffect(() => {
    if (!offline && streamError?.source === 'network') {
      restartStream();
    }
  }, [offline, restartStream, streamError?.source]);

  const answer = useMutation({
    mutationFn: async (input: { blockId: string; questionId: string; response: unknown; hintsUsed?: number }) => {
      const key = stableIdempotencyKey(idempotencyKeys.current, `${input.blockId}:${input.questionId}`);
      const post = () =>
        client.post<{
          session: LearnSessionV1Dto;
          evaluation: { correct?: boolean | null; feedback?: string };
          duplicate?: boolean;
        }>(`/learn/sessions/${sessionId}/blocks/${input.blockId}/answer`, {
          questionId: input.questionId,
          response: input.response,
          hintsUsed: input.hintsUsed ?? 0,
          idempotencyKey: key,
        });
      // G6: 30s idempotent answer retry on transient failure.
      try {
        return await post();
      } catch (err) {
        await new Promise((r) => setTimeout(r, ANSWER_RETRY_MS));
        return post();
      }
    },
    onSuccess: (res) => {
      qc.setQueryData(sessionKey(sessionId!), res.session);
      continueStream();
    },
  });

  const interact = useMutation({
    mutationFn: (input: { blockId: string; action: string; data?: Record<string, unknown>; version: number }) => {
      const key = stableIdempotencyKey(
        idempotencyKeys.current,
        `interact:${input.blockId}:${input.action}:${input.version}`,
      );
      return client.post<{ session: LearnSessionV1Dto }>(
        `/learn/sessions/${sessionId}/blocks/${input.blockId}/interact`,
        {
          action: input.action,
          data: input.data,
          expectedInteractionVersion: input.version,
          idempotencyKey: key,
        },
      );
    },
    onSuccess: (res, variables) => {
      qc.setQueryData(sessionKey(sessionId!), res.session);
      const nonAdvancing = variables.action === 'expand_deeper' || variables.action === 'dwell';
      if (!nonAdvancing) continueStream();
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
      client.post<{ session: LearnSessionV1Dto; deckId: string }>(
        `/learn/sessions/${sessionId}/commit-artifacts`,
        {
          cardSelections,
          includeCanvas: false,
          idempotencyKey: crypto.randomUUID(),
        },
      ),
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
    mutationFn: (saveToLibrary: boolean) =>
      client.post<LearnSessionV1Dto>(`/learn/sessions/${sessionId}/end`, {
        saveToLibrary,
        idempotencyKey: crypto.randomUUID(),
      }),
    onSuccess: (data) => qc.setQueryData(sessionKey(sessionId!), data),
  });

  return {
    ...query,
    streaming,
    streamingText,
    streamingMoveType,
    streamError,
    offline,
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

/** Alias used by Learn home / path entry points. */
export const useCreateSession = useCreateEdrionLearnSession;
