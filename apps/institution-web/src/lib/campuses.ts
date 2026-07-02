'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import { scopeKey, queryString } from './admin';
import type { ListParams } from './academics';
import type { Paged } from './academics-types';

/** A campus row as returned by GET /portal/campuses. */
export interface CampusRow {
  id: string;
  version: number;
  name: string;
  code: string;
  address: { line1?: string | null; city?: string | null; region?: string | null; country?: string | null } | null;
  timezoneOverride: string | null;
  studentCapacity: number | null;
  isActive: boolean;
  billingStatus: string;
  createdAt: string;
}

/**
 * Scope-aware Campuses (Administration) hooks. Mutations invalidate the campus list AND the portal
 * `me` query, because the scope-switcher is fed by `me.campuses` — creating/renaming a campus must
 * refresh it immediately.
 */
export function useCampusesList<T = CampusRow>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['campuses', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

export function useCampusesMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['campuses'] });
    qc.invalidateQueries({ queryKey: ['portal', 'me'] });
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
