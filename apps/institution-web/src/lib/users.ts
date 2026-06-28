'use client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import { makeCrudHooks } from './admin';

/**
 * Scope-aware hooks for the institution user directory (Phase 11). `create` maps to the invite
 * endpoint (POST /portal/users); `update`/`remove` edit + delete a user. Role/campus-access + the
 * permission overrides are set through useSetUserAccess (a single version-guarded PUT).
 */
export const { useList: useUsersList, useMutations: useUsersMutations } = makeCrudHooks('users');

export function useSetUserAccess() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      roleKeys,
      campusIds,
      directGrants,
      directDenies,
      version,
    }: {
      id: string;
      roleKeys: string[];
      campusIds: string[];
      directGrants: string[];
      directDenies: string[];
      version: number;
    }) =>
      client.request(`/portal/users/${id}/access`, scope, {
        method: 'PUT',
        body: JSON.stringify({ roleKeys, campusIds, directGrants, directDenies, version }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export type { UserRow } from './admin-types';
