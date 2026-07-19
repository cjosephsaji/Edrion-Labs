'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PortalClientError } from './portal-client';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import { makeCrudHooks, scopeKey } from './admin';
import type { PortalMeDto } from './types';

export const { useList: useUsersList, useMutations: useUsersMutations } = makeCrudHooks('users');

export function useSuspendUser() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, reason }: { id: string; version: number; reason: string }) =>
      client.post<import('./admin-types').UserRow>(`/portal/users/${id}/suspend`, scope, { version, reason }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['users', 'detail', variables.id] });
      qc.invalidateQueries({ queryKey: ['people'] });
    },
  });
}

export function useUnsuspendUser() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, reason }: { id: string; version: number; reason: string }) =>
      client.post<import('./admin-types').UserRow>(`/portal/users/${id}/unsuspend`, scope, { version, reason }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['users', 'detail', variables.id] });
      qc.invalidateQueries({ queryKey: ['people'] });
    },
  });
}

export function usePortalUser(institutionUserId: string | null | undefined) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['users', 'detail', institutionUserId, scopeKey(scope)],
    queryFn: () => client.get<import('./admin-types').UserRow>(`/portal/users/${institutionUserId}`, scope),
    enabled: Boolean(institutionUserId),
  });
}

export function useSetUserAccess() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
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
      version?: number;
    }) => {
      const keys = roleKeys ?? [];
      if (keys.length === 0) {
        throw new PortalClientError(400, 'VALIDATION_ERROR', 'Select at least one portal role.');
      }

      let resolvedVersion = version;
      if (!Number.isInteger(resolvedVersion)) {
        const fresh = await client.get<import('./admin-types').UserRow>(`/portal/users/${id}`, scope);
        resolvedVersion = fresh.version;
      }

      const payload = {
        roleKeys: keys,
        campusIds: campusIds ?? [],
        directGrants: directGrants ?? [],
        directDenies: directDenies ?? [],
        version: resolvedVersion,
      };

      const save = (v: number) =>
        client.request(`/portal/users/${id}/access`, scope, {
          method: 'PUT',
          body: JSON.stringify({ ...payload, version: v }),
        });

      try {
        return await save(resolvedVersion!);
      } catch (err) {
        if (err instanceof PortalClientError && err.code === 'VERSION_CONFLICT') {
          const fresh = await client.get<import('./admin-types').UserRow>(`/portal/users/${id}`, scope);
          return save(fresh.version);
        }
        throw err;
      }
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      qc.invalidateQueries({ queryKey: ['people'] });
      qc.invalidateQueries({ queryKey: ['users', 'detail', variables.id] });
      const me = qc.getQueryData<PortalMeDto>(['portal', 'me']);
      if (me?.institutionUserId === variables.id) {
        qc.invalidateQueries({ queryKey: ['portal', 'me'] });
      }
    },
  });
}

export type { UserRow } from './admin-types';
