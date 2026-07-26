'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { HostelAllocationRow, HostelBlockRow, Paged } from './hostel-types';

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

/** Scope-aware, server-paginated hostel list. `resource` is "hostel/blocks" | "hostel/rooms". */
export function useHostelList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['hostel', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for a hostel resource (blocks or rooms). */
export function useHostelMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['hostel'] });

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

/** Block options for the room block picker (first 100 in scope). */
export function useHostelBlockOptions() {
  return useHostelList<HostelBlockRow>('hostel/blocks', OPTION_PARAMS);
}

// --- allocations (per student, against a room; the allocate→occupancy bridge) -

export function useRoomAllocations(roomId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['hostel', 'rooms', roomId, 'allocations', scopeKey(scope)],
    queryFn: () => client.get<HostelAllocationRow[]>(`/portal/hostel/rooms/${roomId}/allocations`, scope),
    enabled: !!roomId,
  });
}

export function useRoomAllocationMutations(roomId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['hostel', 'rooms', roomId, 'allocations'] });
    qc.invalidateQueries({ queryKey: ['hostel'] });
  };

  const allocate = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post(`/portal/hostel/rooms/${roomId}/allocations`, scope, body),
    onSuccess: invalidate,
  });
  const vacate = useMutation({
    mutationFn: ({ allocationId, body }: { allocationId: string; body: Record<string, unknown> }) =>
      client.post(`/portal/hostel/rooms/${roomId}/allocations/${allocationId}/vacate`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (allocationId: string) =>
      client.del(`/portal/hostel/rooms/${roomId}/allocations/${allocationId}`, scope),
    onSuccess: invalidate,
  });
  return { allocate, vacate, remove };
}

export type { HostelAllocationRow, HostelBlockRow, HostelRoomRow } from './hostel-types';
