'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';

export type GradingSchemeRow = {
  id: string;
  name: string;
  kind: string;
  bands: Array<{ grade: string; min_pct: number; grade_points: number | null; is_pass: boolean }>;
  gpaFormula: string;
  version: number;
  isDefault: boolean;
  isActive: boolean;
};

export type WeightMapRow = {
  id: string;
  subjectId: string;
  termId: string;
  classId: string | null;
  creditsOverride: string | null;
  components: Array<{
    key: string;
    label: string;
    weight_pct: number;
    assessments: Array<{ exam_id?: string } | { assessment_name: string }>;
    aggregation: 'sum' | 'average' | 'best_n';
    n?: number;
  }>;
  version: number;
};

export type TermRecomputeRow = {
  id: string;
  termId: string;
  schemeId: string;
  schemeVersion: number;
  reason: string;
  status: string;
  version: number;
};

export function useGradingSchemes() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['grading-schemes', scope],
    queryFn: () => client.get<GradingSchemeRow[]>('/portal/grading/schemes', scope),
  });
}

export function useGradingPresets() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['grading-presets', scope],
    queryFn: () => client.get<Array<{ key: string; name: string; kind: string }>>('/portal/grading/schemes/presets', scope),
  });
}

export function useGradingMutations() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['grading-schemes'] });

  const createPreset = useMutation({
    mutationFn: (kind: string) => client.post(`/portal/grading/schemes/presets/${kind}`, scope, {}),
    onSuccess: invalidate,
  });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post('/portal/grading/schemes', scope, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.put(`/portal/grading/schemes/${id}`, scope, body),
    onSuccess: invalidate,
  });
  return { createPreset, create, update };
}

export function useWeightMap(subjectId?: string, termId?: string, classId?: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  const params = new URLSearchParams();
  if (subjectId) params.set('subject_id', subjectId);
  if (termId) params.set('term_id', termId);
  if (classId) params.set('class_id', classId);
  return useQuery({
    queryKey: ['weight-map', subjectId, termId, classId, scope],
    queryFn: () => client.get<WeightMapRow | null>(`/portal/grading/weight-maps?${params}`, scope),
    enabled: Boolean(subjectId && termId),
  });
}

export function useWeightMapMutation() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => client.put('/portal/grading/weight-maps', scope, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['weight-map'] }),
  });
}

export function useTermRecomputeRequests(status = 'pending_approval') {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['term-recompute', status, scope],
    queryFn: () => client.get<TermRecomputeRow[]>(`/portal/grading/term-recompute?status=${status}`, scope),
  });
}

export function useTermRecomputeMutations() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['term-recompute'] });
  return {
    propose: useMutation({
      mutationFn: (body: Record<string, unknown>) => client.post('/portal/grading/term-recompute', scope, body),
      onSuccess: invalidate,
    }),
    approve: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
        client.post(`/portal/grading/term-recompute/${id}/approve`, scope, body),
      onSuccess: invalidate,
    }),
    reject: useMutation({
      mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
        client.post(`/portal/grading/term-recompute/${id}/reject`, scope, body),
      onSuccess: invalidate,
    }),
  };
}
