'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { Paged, TransportAssignmentRow, TransportRouteRow } from './transport-types';

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

/** Scope-aware, server-paginated transport list. `resource` is "transport/routes" | "transport/vehicles". */
export function useTransportList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['transport', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for a transport resource (routes or vehicles). */
export function useTransportMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['transport'] });

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

const OPTION_PARAMS: ListParams = { page: 1, pageSize: 100, sortDir: 'asc', sortBy: 'name' };

/** Route options for the vehicle route picker (first 100 in scope). */
export function useTransportRouteOptions() {
  return useTransportList<TransportRouteRow>('transport/routes', OPTION_PARAMS);
}

// --- assignments (per student, against a route) ------------------------------

export function useRouteAssignments(routeId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['transport', 'routes', routeId, 'assignments', scopeKey(scope)],
    queryFn: () => client.get<TransportAssignmentRow[]>(`/portal/transport/routes/${routeId}/assignments`, scope),
    enabled: !!routeId,
  });
}

export function useRouteAssignmentMutations(routeId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['transport', 'routes', routeId, 'assignments'] });
    qc.invalidateQueries({ queryKey: ['transport'] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post(`/portal/transport/routes/${routeId}/assignments`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/transport/routes/${routeId}/assignments/${id}`, scope, { version }),
    onSuccess: invalidate,
  });
  return { create, remove };
}

export type { TransportAssignmentRow, TransportRouteRow, TransportVehicleRow } from './transport-types';
