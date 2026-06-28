'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { Paged, ReportRunRow } from './reports-types';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

function queryString(p: ListParams): string {
  const sp = new URLSearchParams();
  sp.set('page', String(p.page));
  sp.set('pageSize', String(p.pageSize));
  sp.set('sortDir', p.sortDir);
  if (p.sortBy) sp.set('sortBy', p.sortBy);
  if (p.search) sp.set('search', p.search);
  return sp.toString();
}

/** Scope-aware, server-paginated report-definition list. `resource` is the path segment ("reports"). */
export function useReportsList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['reports', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for report definitions. */
export function useReportsMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['reports'] });
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post(`/portal/${resource}`, scope, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.patch(`/portal/${resource}/${id}`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/${resource}/${id}`, scope, { version }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

// --- runs (exports of a definition; the export bridge) -----------------------

export function useReportRuns(reportId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['reports', reportId, 'runs', scopeKey(scope)],
    queryFn: () => client.get<ReportRunRow[]>(`/portal/reports/${reportId}/runs`, scope),
    enabled: !!reportId,
  });
}

export function useReportRunMutations(reportId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['reports', reportId, 'runs'] });
    qc.invalidateQueries({ queryKey: ['reports'] });
  };
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post(`/portal/reports/${reportId}/runs`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (runId: string) => client.del(`/portal/reports/${reportId}/runs/${runId}`, scope),
    onSuccess: invalidate,
  });
  return { create, remove };
}

export type { ReportDefinitionRow, ReportRunRow } from './reports-types';
