'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { Paged } from './academics-types';

/** Serialise the active scope to a stable query-key fragment. */
export function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

export function queryString(p: ListParams): string {
  const sp = new URLSearchParams();
  sp.set('page', String(p.page));
  sp.set('pageSize', String(p.pageSize));
  sp.set('sortDir', p.sortDir);
  if (p.sortBy) sp.set('sortBy', p.sortBy);
  if (p.search) sp.set('search', p.search);
  return sp.toString();
}

/**
 * Factory for the standard scope-aware CRUD hooks the generalized ResourceManager expects
 * (useList + useMutations). Each Administration directory (settings, roles, users) shares the same
 * shape; per-domain extras (role permissions, user access, audit export) live in their own files.
 */
export function makeCrudHooks(domain: string) {
  function useList<T>(resource: string, params: ListParams) {
    const client = usePortalClient();
    const { scope } = useScope();
    return useQuery({
      queryKey: [domain, resource, scopeKey(scope), params],
      queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
      placeholderData: keepPreviousData,
    });
  }

  function useMutations(resource: string) {
    const client = usePortalClient();
    const { scope } = useScope();
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: [domain] });
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

  return { useList, useMutations };
}
