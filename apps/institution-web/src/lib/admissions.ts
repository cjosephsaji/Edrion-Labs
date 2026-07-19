'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import { useAcademicScopedParams } from './academic-context';
import type { AdmissionDecision, Paged } from './admissions-types';

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
  if (p.filters) for (const [k, v] of Object.entries(p.filters)) if (v) sp.set(k, v);
  return sp.toString();
}

/** Scope-aware, server-paginated admissions list. `resource` is the path segment ("admissions"). */
export function useAdmissionsList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  const scoped = useAcademicScopedParams(params, params.academicScope ?? 'year');
  const { academicScope: _as, ...listParams } = scoped;
  return useQuery({
    queryKey: ['admissions', resource, scopeKey(scope), listParams],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(listParams)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for the admissions resource. Invalidates its lists on success. */
export function useAdmissionsMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['admissions'] });

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

/** Enrol an accepted applicant → creates the student and links it back. */
export function useEnrolAdmission() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: { admissionNo?: string; classId?: string | null } }) =>
      client.post(`/portal/admissions/${id}/enrol`, scope, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admissions'] });
      qc.invalidateQueries({ queryKey: ['people', 'students'] });
    },
  });
}

/** Record a decision (accept/reject/waitlist/request-info) with an optional note + guardian notify. */
export function useDecideAdmission() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { decision: AdmissionDecision; note?: string; notify?: boolean; version: number };
    }) => client.post(`/portal/admissions/${id}/decision`, scope, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admissions'] }),
  });
}

export type { AdmissionRow, AdmissionDecision } from './admissions-types';
