'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useStudentClient } from '../student-client';

const ROOT = ['student', 'debate', 'p1'] as const;

export type DebateRoundSummary = {
  id: string;
  status: string;
  formatKey?: string;
  mode?: string;
};

export type DebateRoundDetail = {
  debate: Record<string, unknown>;
  turns: Array<Record<string, unknown>>;
  participants: Array<Record<string, unknown>>;
};

export type DebateFormatOption = { key: string; name: string };
export type DebateMotionOption = { id: string; text: string };

export type DebateReportPayload = {
  verdict?: { winner?: string; reasoning?: string } | null;
  report?: { roundSummary?: string; perSpeaker?: unknown[] } | null;
  score?: { score?: string; bandLabel?: string } | null;
};

export function useDebateFormats() {
  const client = useStudentClient();
  return useQuery({
    queryKey: [...ROOT, 'formats'],
    queryFn: () => client.get<DebateFormatOption[]>('/debate/formats?buildable=true'),
  });
}

export function useDebateMotionBank(q?: string) {
  const client = useStudentClient();
  return useQuery({
    queryKey: [...ROOT, 'motions', q ?? ''],
    queryFn: () =>
      client.get<DebateMotionOption[]>(`/debate/motions${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  });
}

export function useDebateRound(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: [...ROOT, 'round', id],
    queryFn: () => client.get<DebateRoundDetail>(`/debate/rounds/${id}`),
    enabled: Boolean(id),
    refetchInterval: (q) => {
      const status = (q.state.data?.debate as { status?: string } | undefined)?.status;
      if (status === 'adjudicating' || status === 'speaking') return 3000;
      return false;
    },
  });
}

export function useCreateDebateRound() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post<DebateRoundSummary>('/debate/rounds', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...ROOT] }),
  });
}

export function useDebateConsent() {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: unknown }) =>
      client.post(`/debate/rounds/${id}/consent`, body),
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: [...ROOT, 'round', v.id] }),
  });
}

export function useDebatePrepNotes(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: [...ROOT, 'prep', id],
    queryFn: () => client.get(`/debate/rounds/${id}/prep-notes`),
    enabled: Boolean(id),
  });
}

export function useSaveDebatePrepNotes(id: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => client.put(`/debate/rounds/${id}/prep-notes`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...ROOT, 'prep', id] }),
  });
}

export function useAdvanceDebateRound(id: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post(`/debate/rounds/${id}/advance`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...ROOT, 'round', id] }),
  });
}

export function useDebateReport(id: string | undefined) {
  const client = useStudentClient();
  return useQuery({
    queryKey: [...ROOT, 'report', id],
    queryFn: () => client.get<DebateReportPayload>(`/debate/rounds/${id}/report`),
    enabled: Boolean(id),
  });
}

export function useFinaliseDebateTurn(roundId: string) {
  const client = useStudentClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (turnId: string) => client.post(`/debate/rounds/${roundId}/turns/${turnId}/finalise`),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...ROOT, 'round', roundId] }),
  });
}
