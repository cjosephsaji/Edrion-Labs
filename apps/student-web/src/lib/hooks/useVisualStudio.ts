'use client';



import { useCallback, useEffect, useRef, useState } from 'react';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {

  VisualArchetype,

  VisualCanvasDto,

  VisualCanvasListResponse,

  VisualCanvasPatchInput,

  VisualCanvasPatchResponse,

  VisualCanvasCreateInput,

  VisualExpandInput,

  VisualGenerateInput,

  VisualGraphEdge,

  VisualGraphNode,

  VisualGraphPatch,

  VisualJobAccepted,

  VisualMemoryCheckInput,

  MemoryGraphDiff,

  VisualMemoryTopicsResponse,

  VisualProposalInput,

  VisualProposalResponse,

  VisualQuizSubmitInput,

  VisualQuizSubmitResponse,

  VisualQuotaResponse,

  VisualRevisionListResponse,

  VisualRevisionQueueInput,

  VisualRevisionQueueResponse,

  VisualLegacyLookupResponse,

  VisualSseEvent,

} from '@edrion/schemas';

import { useStudentClient, StudentClientError } from '../student-client';



const QUOTA_KEY = ['student', 'visual', 'quota'] as const;

const CANVASES_KEY = ['student', 'visual', 'canvases'] as const;

const MEMORY_TOPICS_KEY = ['student', 'visual', 'memory-topics'] as const;



export function canvasKey(id: string) {

  return ['student', 'visual', 'canvas', id] as const;

}



export function canvasRevisionsKey(id: string) {

  return ['student', 'visual', 'canvas', id, 'revisions'] as const;

}



export function useVisualQuota() {

  const client = useStudentClient();

  return useQuery({

    queryKey: QUOTA_KEY,

    queryFn: () => client.get<VisualQuotaResponse>('/visual/quota'),

    staleTime: 60_000,

  });

}



export function useVisualPropose() {

  const client = useStudentClient();

  const qc = useQueryClient();

  return useMutation({

    mutationFn: (body: VisualProposalInput) =>

      client.post<VisualProposalResponse>('/visual/propose', body),

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: QUOTA_KEY });

    },

  });

}



export function useVisualGenerate() {

  const client = useStudentClient();

  const qc = useQueryClient();

  return useMutation({

    mutationFn: (body: VisualGenerateInput) =>

      client.post<VisualJobAccepted>('/visual/generate', body),

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: QUOTA_KEY });

    },

  });

}



export function useVisualCheckMemory() {

  const client = useStudentClient();

  const qc = useQueryClient();

  return useMutation({

    mutationFn: (body: VisualMemoryCheckInput) =>

      client.post<VisualJobAccepted>('/visual/check-memory', body),

    onSuccess: () => {

      qc.invalidateQueries({ queryKey: QUOTA_KEY });

    },

  });

}



export type VisualJobStreamState = {

  phase: 'queued' | 'structuring' | 'placing';

  nodes: VisualGraphNode[];

  edges: VisualGraphEdge[];

  totalNodes?: number;

  totalEdges?: number;

  lastSequence: number;

  error: string | null;

};



export function useVisualJobStream(

  jobId: string | null,

  opts?: {

    onGraphReady?: (canvasId: string) => void;

    onPatchProposal?: (proposal: VisualGraphPatch) => void;

    onMemoryDiffReady?: (diff: MemoryGraphDiff) => void;

    onQuizReady?: (quiz: {
      quiz_id: string;
      canvas_id: string;
      node_id: string;
      questions: Array<{
        id: string;
        prompt: string;
        options: Array<{ key: 'a' | 'b' | 'c' | 'd'; label: string }>;
      }>;
      expires_at: string;
    }) => void;

    onError?: (message: string) => void;

    onDone?: () => void;

  },

) {

  const client = useStudentClient();

  const optsRef = useRef(opts);

  optsRef.current = opts;

  const [state, setState] = useState<VisualJobStreamState>({

    phase: 'queued',

    nodes: [],

    edges: [],

    lastSequence: 0,

    error: null,

  });

  const lastSequenceRef = useRef(0);

  const connectionRef = useRef<{ close: () => void } | null>(null);

  const backoffRef = useRef(1000);

  const reconnectAttemptsRef = useRef(0);

  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startedRef = useRef<number | null>(null);

  const cancelledRef = useRef(false);



  const applyEvent = useCallback(

    (event: VisualSseEvent) => {

      if (event.sequence <= lastSequenceRef.current) return;

      lastSequenceRef.current = event.sequence;

      setState((prev) => {

        const next = { ...prev, lastSequence: event.sequence };

        if (event.type === 'queued') {

          next.phase = 'queued';

        } else if (event.type === 'started') {

          next.phase = 'structuring';

          next.totalNodes = event.estimated_nodes;

        } else if (event.type === 'node_batch') {

          next.phase = 'placing';

          next.nodes = [...prev.nodes, ...event.nodes];

          next.totalNodes = event.total;

        } else if (event.type === 'edge_batch') {

          next.edges = [...prev.edges, ...event.edges];

          next.totalEdges = event.total;

        } else if (event.type === 'error') {

          next.error = event.message;

          optsRef.current?.onError?.(event.message);

        } else if (event.type === 'graph_ready') {

          optsRef.current?.onGraphReady?.(event.canvas_id);

        } else if (event.type === 'patch_proposal_ready') {

          optsRef.current?.onPatchProposal?.(event.proposal);

        } else if (event.type === 'memory_diff_ready') {

          optsRef.current?.onMemoryDiffReady?.(event.diff);

        } else if (event.type === 'quiz_ready') {

          optsRef.current?.onQuizReady?.(event.quiz);

        } else if (event.type === 'done') {

          optsRef.current?.onDone?.();

        }

        return next;

      });

    },

    [],

  );



  const cancel = useCallback(() => {

    cancelledRef.current = true;

    connectionRef.current?.close();

    connectionRef.current = null;

    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

  }, []);



  const connect = useCallback(() => {

    if (!jobId || cancelledRef.current) return;

    if (!startedRef.current) startedRef.current = Date.now();

    if (startedRef.current && Date.now() - startedRef.current > 10 * 60 * 1000) return;



    connectionRef.current?.close();

    const after = lastSequenceRef.current;

    const path = after > 0 ? `/visual/jobs/${jobId}/events?after=${after}` : `/visual/jobs/${jobId}/events`;



    const connection = client.sse(path, {

      onMessage: (frame) => {

        backoffRef.current = 1000;

        const data = frame.data as VisualSseEvent;

        if (!data || typeof data !== 'object' || !('type' in data)) return;

        applyEvent(data);

        if (data.type === 'done' || data.type === 'error') {

          connection.close();

        }

      },

      onError: (err) => {

        connection.close();

        if (cancelledRef.current) return;

        const message =
          err instanceof StudentClientError
            ? err.message
            : err instanceof Error
              ? err.message
              : 'Lost connection to canvas generation.';

        const status = err instanceof StudentClientError ? err.status : 0;

        if ((status >= 400 && status < 500) || reconnectAttemptsRef.current >= 4) {
          setState((prev) => ({ ...prev, error: message }));
          optsRef.current?.onError?.(message);
          return;
        }

        reconnectAttemptsRef.current += 1;

        const delay = backoffRef.current;

        backoffRef.current = Math.min(delay * 2, 15_000);

        reconnectTimerRef.current = setTimeout(() => connect(), delay);

      },

    });

    connectionRef.current = connection;

  }, [applyEvent, client, jobId]);



  const connectRef = useRef(connect);

  connectRef.current = connect;

  const cancelRef = useRef(cancel);

  cancelRef.current = cancel;

  useEffect(() => {

    cancelledRef.current = false;

    startedRef.current = null;

    backoffRef.current = 1000;

    reconnectAttemptsRef.current = 0;

    lastSequenceRef.current = 0;

    setState({ phase: 'queued', nodes: [], edges: [], lastSequence: 0, error: null });

    if (!jobId) return undefined;

    connectRef.current();

    return () => {

      cancelRef.current();

    };

  }, [jobId]);



  return { ...state, cancel };

}



export function useVisualCanvases(params?: {

  limit?: number;

  cursor?: string;

  source_id?: string;

  topic_id?: string;

}) {

  const client = useStudentClient();

  const search = new URLSearchParams();

  if (params?.limit) search.set('limit', String(params.limit));

  if (params?.cursor) search.set('cursor', params.cursor);

  if (params?.source_id) search.set('source_id', params.source_id);

  if (params?.topic_id) search.set('topic_id', params.topic_id);

  const qs = search.toString();



  return useQuery({

    queryKey: [...CANVASES_KEY, params ?? {}],

    queryFn: () =>

      client.get<VisualCanvasListResponse>(qs ? `/visual/canvases?${qs}` : '/visual/canvases'),

  });

}



export function useVisualCanvas(id: string | undefined) {

  const client = useStudentClient();

  return useQuery({

    queryKey: canvasKey(id ?? ''),

    queryFn: () => client.get<VisualCanvasDto>(`/visual/canvases/${id}`),

    enabled: !!id,

  });

}



export function useVisualCanvasRevisions(id: string | undefined) {

  const client = useStudentClient();

  return useQuery({

    queryKey: canvasRevisionsKey(id ?? ''),

    queryFn: () => client.get<VisualRevisionListResponse>(`/visual/canvases/${id}/revisions`),

    enabled: !!id,

  });

}



export function useVisualMemoryTopics() {

  const client = useStudentClient();

  return useQuery({

    queryKey: MEMORY_TOPICS_KEY,

    queryFn: () => client.get<VisualMemoryTopicsResponse>('/visual/memory/topics'),

  });

}



export function useCreateVisualCanvas() {

  const client = useStudentClient();

  const qc = useQueryClient();

  return useMutation({

    mutationFn: (body: VisualCanvasCreateInput) =>

      client.post<VisualCanvasDto>('/visual/canvases', body),

    onSuccess: (data) => {

      qc.invalidateQueries({ queryKey: CANVASES_KEY });

      qc.setQueryData(canvasKey(data.id), data);

    },

  });

}



export function usePatchVisualCanvas(canvasId: string) {

  const client = useStudentClient();

  const qc = useQueryClient();

  return useMutation({

    mutationFn: (body: VisualCanvasPatchInput) =>

      client.patch<VisualCanvasPatchResponse>(`/visual/canvases/${canvasId}`, body),

    onSuccess: (data) => {

      qc.setQueryData(canvasKey(canvasId), data.canvas);

      qc.invalidateQueries({ queryKey: CANVASES_KEY });

      qc.invalidateQueries({ queryKey: canvasRevisionsKey(canvasId) });

    },

  });

}



export function useDeleteVisualCanvas() {

  const client = useStudentClient();

  const qc = useQueryClient();

  return useMutation({

    mutationFn: ({ id, version }: { id: string; version: number }) =>

      client.request<void>(`/visual/canvases/${id}`, {

        method: 'DELETE',

        headers: { 'If-Match': String(version) },

      }),

    onSuccess: (_data, { id }) => {

      qc.removeQueries({ queryKey: canvasKey(id) });

      qc.invalidateQueries({ queryKey: CANVASES_KEY });

    },

  });

}



export function useRestoreVisualRevision(canvasId: string) {

  const client = useStudentClient();

  const qc = useQueryClient();

  return useMutation({

    mutationFn: (body: { base_version: number; client_mutation_id: string; revisionId: string }) =>

      client.post<VisualCanvasDto>(

        `/visual/canvases/${canvasId}/revisions/${body.revisionId}/restore`,

        { base_version: body.base_version, client_mutation_id: body.client_mutation_id },

      ),

    onSuccess: (data) => {

      qc.setQueryData(canvasKey(canvasId), data);

      qc.invalidateQueries({ queryKey: canvasRevisionsKey(canvasId) });

    },

  });

}



export function useVisualRevisionQueue(canvasId: string) {

  const client = useStudentClient();

  return useMutation({

    mutationFn: (body: VisualRevisionQueueInput) =>

      client.post<VisualRevisionQueueResponse>(`/visual/canvases/${canvasId}/revision-queue`, body),

  });

}



export function useVisualExpand() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VisualExpandInput) => client.post<VisualJobAccepted>('/visual/expand', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUOTA_KEY }),
  });
}



export function useVisualAlternative() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VisualExpandInput) =>
      client.post<VisualJobAccepted>('/visual/alternative', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUOTA_KEY }),
  });
}



export function useVisualNodeQuiz() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: VisualExpandInput) => client.post<VisualJobAccepted>('/visual/node-quiz', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: QUOTA_KEY }),
  });
}



export function useSubmitVisualQuiz(quizId: string) {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (body: VisualQuizSubmitInput) =>
      client.post<VisualQuizSubmitResponse>(`/visual/node-quiz/${quizId}/submit`, body),
  });
}



export function useApplyVisualProposal(canvasId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { proposal_id: string; base_version: number; client_mutation_id: string }) =>
      client.post(`/visual/canvases/${canvasId}/apply-proposal`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: canvasKey(canvasId) });
      qc.invalidateQueries({ queryKey: canvasRevisionsKey(canvasId) });
    },
  });
}



export function useVisualLegacyLookup(artifactId: string | undefined) {

  const client = useStudentClient();

  return useQuery({

    queryKey: ['student', 'visual', 'legacy', artifactId],

    queryFn: () => client.get<VisualLegacyLookupResponse>(`/visual/legacy/${artifactId}`),

    enabled: !!artifactId,

    retry: false,

  });

}



export type { VisualArchetype };


