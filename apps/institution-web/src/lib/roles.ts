'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import { makeCrudHooks } from './admin';
import type { PermissionDef } from './admin-types';

/** Scope-aware CRUD hooks for the institution roles editor (Phase 11). */
export const { useList: useRolesList, useMutations: useRolesMutations } = makeCrudHooks('roles');

/** The institution permission catalogue (grouped) — powers the permissions picker. */
export function useRoleCatalogue() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['roles', 'catalogue'],
    queryFn: () => client.get<{ permissions: PermissionDef[] }>(`/portal/roles/catalogue`, scope),
    staleTime: 5 * 60_000,
  });
}

/** Replace just the permission bag of a custom role (the permissions drawer). */
export function useSetRolePermissions() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, permissions, version }: { id: string; permissions: string[]; version: number }) =>
      client.request(`/portal/roles/${id}/permissions`, scope, {
        method: 'PUT',
        body: JSON.stringify({ permissions, version }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export type { RoleRow } from './admin-types';
