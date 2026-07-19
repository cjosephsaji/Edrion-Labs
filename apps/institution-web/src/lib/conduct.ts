'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import { scopeKey } from './admin';
import type { ListParams } from './academics';
import { useAcademicScopedParams } from './academic-context';
import type { Paged } from './academics-types';

/** A student conduct incident (behaviour or complaint) from GET /portal/conduct. */
export interface IncidentRow {
  id: string;
  version: number;
  studentId: string;
  studentName: string | null;
  admissionNo: string | null;
  category: string;
  title: string;
  description: string | null;
  severity: string;
  status: string;
  occurredOn: string | null;
  reporterName: string | null;
  notifyGuardians: boolean;
  resolutionNote: string | null;
  createdAt: string;
}

/** Serialise list params INCLUDING the conduct facet filters (category/severity/status/studentId). */
function queryString(p: ListParams & { studentId?: string }): string {
  const sp = new URLSearchParams();
  sp.set('page', String(p.page));
  sp.set('pageSize', String(p.pageSize));
  sp.set('sortDir', p.sortDir);
  if (p.sortBy) sp.set('sortBy', p.sortBy);
  if (p.search) sp.set('search', p.search);
  if (p.studentId) sp.set('studentId', p.studentId);
  if (p.filters) for (const [k, v] of Object.entries(p.filters)) if (v) sp.set(k, v);
  return sp.toString();
}

export function useConductList<T = IncidentRow>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  const scoped = useAcademicScopedParams(params, params.academicScope ?? 'year');
  const { academicScope: _as, ...listParams } = scoped;
  return useQuery({
    queryKey: ['conduct', resource, scopeKey(scope), listParams],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(listParams)}`, scope),
    placeholderData: keepPreviousData,
  });
}

export function useConductMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['conduct'] });
    qc.invalidateQueries({ queryKey: ['student-profile'] });
  };
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
