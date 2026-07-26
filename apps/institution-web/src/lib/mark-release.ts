'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';

export type MarkReleaseBatch = {
  id: string;
  status: 'draft' | 'pending_approval' | 'released' | 'retracted';
  version: number;
  termId: string;
  subjectId: string;
  scope: { exam_id?: string; assessment_name?: string; class_ids: string[] };
  releasedAt?: string | null;
  preview: {
    entered: number;
    mean: number;
    high: number;
    low: number;
    missing: number;
    mapped: boolean;
    retractable: boolean;
  };
};

export type ResultsSettings = {
  showClassAverage: boolean;
  missingEntryPolicy: 'block' | 'confirm';
  hodReleaseGate: boolean;
  revaluationRefundOnReject: boolean;
  version: number;
};

export function useMarkReleases(termId?: string, subjectId?: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const params = new URLSearchParams();
  if (termId) params.set('term_id', termId);
  if (subjectId) params.set('subject_id', subjectId);
  return useQuery({
    queryKey: ['mark-releases', termId, subjectId, scope],
    queryFn: () => client.get<MarkReleaseBatch[]>(`/portal/gradebook/releases?${params}`, scope),
    enabled: Boolean(termId && subjectId),
  });
}

export function useMarkReleaseMutations() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['mark-releases'] });

  const upsert = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.put<MarkReleaseBatch>('/portal/gradebook/releases', scope, body),
    onSuccess: invalidate,
  });
  const release = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.post<MarkReleaseBatch>(`/portal/gradebook/releases/${id}/release`, scope, body),
    onSuccess: invalidate,
  });
  const approve = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.post<MarkReleaseBatch>(`/portal/gradebook/releases/${id}/approve`, scope, body),
    onSuccess: invalidate,
  });
  const sendBack = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.post<MarkReleaseBatch>(`/portal/gradebook/releases/${id}/send-back`, scope, body),
    onSuccess: invalidate,
  });
  const retract = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.post<MarkReleaseBatch>(`/portal/gradebook/releases/${id}/retract`, scope, body),
    onSuccess: invalidate,
  });
  return { upsert, release, approve, sendBack, retract };
}

export function useResultsSettings() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['results-settings', scope],
    queryFn: () => client.get<ResultsSettings>('/portal/settings/results', scope),
  });
}

export function useResultsSettingsMutation() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: ResultsSettings) => client.put<ResultsSettings>('/portal/settings/results', scope, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['results-settings'] }),
  });
}

export function usePendingReleaseApprovals() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['mark-releases', 'pending-approval', scope],
    queryFn: async () => {
      const rows = await client.get<MarkReleaseBatch[]>('/portal/gradebook/releases', scope);
      return rows.filter((row) => row.status === 'pending_approval');
    },
  });
}
