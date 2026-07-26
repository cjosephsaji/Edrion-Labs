'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { InventoryMovementRow, Paged } from './inventory-types';

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

/** Scope-aware, server-paginated inventory list. `resource` is the path segment ("inventory/items"). */
export function useInventoryList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['inventory', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for an inventory resource (items). */
export function useInventoryMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['inventory'] });

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

// --- movements (against an item; the quantity bridge) ------------------------

export function useItemMovements(itemId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['inventory', 'items', itemId, 'movements', scopeKey(scope)],
    queryFn: () => client.get<InventoryMovementRow[]>(`/portal/inventory/items/${itemId}/movements`, scope),
    enabled: !!itemId,
  });
}

export function useItemMovementMutations(itemId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['inventory', 'items', itemId, 'movements'] });
    qc.invalidateQueries({ queryKey: ['inventory'] });
  };

  const record = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post(`/portal/inventory/items/${itemId}/movements`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (movementId: string) =>
      client.del(`/portal/inventory/items/${itemId}/movements/${movementId}`, scope),
    onSuccess: invalidate,
  });
  return { record, remove };
}

export type { InventoryItemRow, InventoryMovementRow } from './inventory-types';
