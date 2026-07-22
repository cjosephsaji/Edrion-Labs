'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ExamBlueprint,
  ExamBlueprintDto,
  ExamListItem,
  ExamPaperPatternDto,
  ExamResults,
  MockExamDto,
  SaveExamAnswerInput,
} from '@edrion/schemas';
import { useStudentClient } from '../student-client';

/* ────────────────────────────── Query keys ────────────────────────────── */

const MOCK_ROOT = ['student', 'lab', 'mock'] as const;
const listKey = () => [...MOCK_ROOT, 'list'] as const;
const defaultsKey = () => [...MOCK_ROOT, 'defaults'] as const;
const patternsKey = () => [...MOCK_ROOT, 'patterns'] as const;
const examKey = (id: string | undefined) => [...MOCK_ROOT, 'exam', id] as const;
const blueprintKey = (id: string | undefined) => [...MOCK_ROOT, 'blueprint', id] as const;

/* ────────────────────────────── Wire types ────────────────────────────── */

export type MockExamDefaults = {
  subjectLabel: string;
  topics: string[];
  studiedTopics?: Array<{ label: string; topicId?: string | null }>;
};

export type MockExamsListResponse = {
  exams: ExamListItem[];
  blueprints?: ExamBlueprintDto[];
};

export type CheckTopicResult = { ok: true } | { ok: false; reason: string };

export type StartExamResult = { attemptId: string; endsAt: string };

export type PushRevisionResult = { ok: boolean; queued?: number };

/* ────────────────────────────── Queries ───────────────────────────────── */

/** Index: past exams (+ reusable blueprints when the API returns them). Tolerates a bare array. */
export function useMockExams() {
  const client = useStudentClient();
  return useQuery({
    queryKey: listKey(),
    queryFn: async () => {
      const raw = await client.get<MockExamsListResponse | ExamListItem[]>('/lab/mock-exams');
      if (Array.isArray(raw)) return { exams: raw } satisfies MockExamsListResponse;
      return { exams: raw?.exams ?? [], blueprints: raw?.blueprints } satisfies MockExamsListResponse;
    },
  });
}

export function useMockExamDefaults() {
  const client = useStudentClient();
  return useQuery({
    queryKey: defaultsKey(),
    queryFn: () => client.get<MockExamDefaults>('/lab/mock-exams/defaults'),
    staleTime: 60_000,
  });
}

export function useExamPaperPatterns() {
  const client = useStudentClient();
  return useQuery({
    queryKey: patternsKey(),
    queryFn: async () => {
      const raw = await client.get<{ patterns: ExamPaperPatternDto[] } | ExamPaperPatternDto[]>(
        '/lab/mock-exams/patterns',
      );
      return Array.isArray(raw) ? raw : (raw?.patterns ?? []);
    },
    staleTime: 5 * 60_000,
  });
}

/** Full exam DTO. Polls while generating so ready/failed states surface without SSE. */
export function useMockExam(id: string | undefined, opts?: { pollWhileGenerating?: boolean }) {
  const client = useStudentClient();
  const poll = opts?.pollWhileGenerating ?? true;
  return useQuery({
    queryKey: examKey(id),
    queryFn: () => client.get<MockExamDto>(`/lab/mock-exams/${id}`),
    enabled: !!id,
    refetchInterval: (query) => {
      if (!poll) return false;
      const status = query.state.data?.status;
      return status === 'generating' || status === 'draft' ? 2000 : false;
    },
  });
}

export function useExamBlueprint(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: blueprintKey(id),
    queryFn: () => client.get<ExamBlueprintDto>(`/lab/mock-exams/blueprints/${id}`),
    enabled: !!id,
  });
}

/* ────────────────────────────── Mutations ─────────────────────────────── */

export function useCreateBlueprint() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blueprint: ExamBlueprint) =>
      client.post<ExamBlueprintDto>('/lab/mock-exams/blueprints', { blueprint }),
    onSuccess: (data) => {
      qc.setQueryData(blueprintKey(data.id), data);
      qc.invalidateQueries({ queryKey: listKey() });
    },
  });
}

export function useUpdateBlueprint(id: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blueprint, version }: { blueprint: ExamBlueprint; version: number }) =>
      client.patch<ExamBlueprintDto>(`/lab/mock-exams/blueprints/${id}`, { blueprint, version }),
    onSuccess: (data) => qc.setQueryData(blueprintKey(id), data),
  });
}

export function useCheckTopic() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (body: { topic: string; subjectLabel?: string }) =>
      client.post<CheckTopicResult>('/lab/mock-exams/check-topic', body),
  });
}

export function useGenerateExam() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (blueprintId: string) =>
      client.post<MockExamDto>('/lab/mock-exams/generate', { blueprintId }),
    onSuccess: (data) => {
      qc.setQueryData(examKey(data.id), data);
      qc.invalidateQueries({ queryKey: listKey() });
    },
  });
}

/** Legacy create used by older deep-links — server builds a chapter_test blueprint. */
export function useCreateMockExam() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      subjectLabel: string;
      topics: string[];
      context: {
        level: string;
        board: string;
        mix: string;
        difficulty: string;
        durationMin: number;
        hintsOff: true;
      };
      title?: string;
    }) => client.post<MockExamDto>('/lab/mock-exams', input),
    onSuccess: (data) => {
      qc.setQueryData(examKey(data.id), data);
      qc.invalidateQueries({ queryKey: listKey() });
    },
  });
}

export function useStartExam() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<StartExamResult>(`/lab/mock-exams/${id}/start`),
    onSuccess: (_data, id) => qc.invalidateQueries({ queryKey: examKey(id) }),
  });
}

export function useSaveExamAnswer() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: ({
      examId,
      questionId,
      body,
    }: {
      examId: string;
      questionId: string;
      body: SaveExamAnswerInput;
    }) =>
      client.request<void>(`/lab/mock-exams/${examId}/answers/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify(body),
      }),
  });
}

export function useWizardBlueprints() {
  const client = useStudentClient();
  return useQuery({
    queryKey: [...MOCK_ROOT, 'wizard-blueprints'],
    queryFn: () =>
      client.get<{
        personal: ExamBlueprintDto[];
        institution: ExamBlueprintDto[];
        quickMock: ExamBlueprint;
      }>('/lab/mock-exams/wizard/blueprints'),
  });
}

export function useCreateMockFromWizard() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => client.post<MockExamDto>('/lab/mock-exams/wizard', body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: listKey() });
    },
  });
}

export function usePauseExam() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<MockExamDto>(`/lab/mock-exams/${id}/pause`),
    onSuccess: (_data, id) => qc.invalidateQueries({ queryKey: examKey(id) }),
  });
}

export function useFinishExam() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<MockExamDto>(`/lab/mock-exams/${id}/finish`),
    onSuccess: (data) => {
      if (data?.id) qc.setQueryData(examKey(data.id), data);
    },
  });
}

export function useRetakeWeak() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post<MockExamDto>(`/lab/mock-exams/${id}/retake-weak`),
    onSuccess: (data) => {
      if (data?.id) qc.setQueryData(examKey(data.id), data);
      qc.invalidateQueries({ queryKey: listKey() });
    },
  });
}

export function usePushRevision() {
  const client = useStudentClient();
  return useMutation({
    mutationFn: (body: { attemptId: string; topicLabels: string[] }) =>
      client.post<PushRevisionResult>('/lab/mock-exams/push-revision', {
        ...body,
        confirmed: true as const,
      }),
  });
}

/* ────────────────────────────── SSE: generation ───────────────────────── */

export type GenerationEvent =
  | { type: 'start'; total?: number; title?: string }
  | { type: 'section'; sectionId?: string; name?: string; index?: number; total?: number }
  | { type: 'question'; index?: number; total?: number; topic?: string; qtype?: string }
  | { type: 'degraded'; reason?: string; message?: string }
  | { type: 'saved'; examId?: string }
  | { type: 'error'; code?: string; message?: string };

export type GenerationStreamStatus = 'idle' | 'streaming' | 'saved' | 'error';

export function useExamGenerationStream(examId: string | undefined) {
  const client = useStudentClient();
  const qc = useQueryClient();
  const [events, setEvents] = useState<GenerationEvent[]>([]);
  const [status, setStatus] = useState<GenerationStreamStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [degraded, setDegraded] = useState<string | null>(null);
  const connRef = useRef<{ close: () => void } | null>(null);

  const stop = useCallback(() => {
    connRef.current?.close();
    connRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!examId) return;
    stop();
    setEvents([]);
    setError(null);
    setDegraded(null);
    setStatus('streaming');
    connRef.current = client.sse(
      `/lab/mock-exams/${examId}/generate/stream`,
      {
        onMessage: (frame) => {
          if (frame.data === '[DONE]') return;
          const ev = frame.data as GenerationEvent;
          if (!ev || typeof ev !== 'object' || !('type' in ev)) return;
          setEvents((prev) => [...prev, ev]);
          if (ev.type === 'degraded') setDegraded(ev.message ?? ev.reason ?? 'Generation degraded');
          if (ev.type === 'saved') {
            setStatus('saved');
            qc.invalidateQueries({ queryKey: examKey(examId) });
            qc.invalidateQueries({ queryKey: listKey() });
          }
          if (ev.type === 'error') {
            setError(ev.message ?? 'Generation failed');
            setStatus('error');
          }
        },
        onError: (err) => {
          setError((err as Error)?.message ?? 'Stream failed');
          setStatus('error');
        },
      },
      { method: 'POST', body: {} },
    );
  }, [client, examId, qc, stop]);

  useEffect(() => () => stop(), [stop]);

  return { events, status, error, degraded, start, stop };
}

/* ────────────────────────────── SSE: grading ──────────────────────────── */

export type GradingEvent =
  | { type: 'start'; total?: number }
  | { type: 'question'; questionId?: string; index?: number; total?: number; awardedMarks?: number }
  | { type: 'section'; sectionId?: string; name?: string }
  | { type: 'patterns'; observations?: unknown[] }
  | { type: 'done'; results?: ExamResults }
  | { type: 'error'; code?: string; message?: string };

export type GradingStreamStatus = 'idle' | 'streaming' | 'done' | 'error';

export function useExamGradingStream(examId: string | undefined) {
  const client = useStudentClient();
  const qc = useQueryClient();
  const [events, setEvents] = useState<GradingEvent[]>([]);
  const [status, setStatus] = useState<GradingStreamStatus>('idle');
  const [results, setResults] = useState<ExamResults | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const connRef = useRef<{ close: () => void } | null>(null);

  const stop = useCallback(() => {
    connRef.current?.close();
    connRef.current = null;
  }, []);

  const start = useCallback(() => {
    if (!examId) return;
    stop();
    setEvents([]);
    setResults(null);
    setError(null);
    setProgress({ done: 0, total: 0 });
    setStatus('streaming');
    connRef.current = client.sse(
      `/lab/mock-exams/${examId}/grade/stream`,
      {
        onMessage: (frame) => {
          if (frame.data === '[DONE]') return;
          const ev = frame.data as GradingEvent;
          if (!ev || typeof ev !== 'object' || !('type' in ev)) return;
          setEvents((prev) => [...prev, ev]);
          if (ev.type === 'start' && typeof ev.total === 'number') {
            setProgress({ done: 0, total: ev.total });
          }
          if (ev.type === 'question') {
            setProgress((p) => ({
              done: typeof ev.index === 'number' ? ev.index : p.done + 1,
              total: typeof ev.total === 'number' ? ev.total : p.total,
            }));
          }
          if (ev.type === 'done') {
            if (ev.results) setResults(ev.results);
            setStatus('done');
            qc.invalidateQueries({ queryKey: examKey(examId) });
            qc.invalidateQueries({ queryKey: listKey() });
          }
          if (ev.type === 'error') {
            setError(ev.message ?? 'Grading failed');
            setStatus('error');
          }
        },
        onError: (err) => {
          setError((err as Error)?.message ?? 'Stream failed');
          setStatus('error');
        },
      },
      { method: 'GET' },
    );
  }, [client, examId, qc, stop]);

  useEffect(() => () => stop(), [stop]);

  return { events, status, results, error, progress, start, stop };
}
