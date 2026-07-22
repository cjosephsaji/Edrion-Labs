'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PortalLearnPolicyDto, UpsertPortalLearnPolicyInput } from '@edrion/schemas';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import { usePermissions } from './permissions';

export function usePortalLearnPolicy() {
  const client = usePortalClient();
  const { scope } = useScope();
  const { can, ready } = usePermissions();
  return useQuery({
    queryKey: ['portal', 'learn-policy', scope.institutionId],
    queryFn: () => client.get<PortalLearnPolicyDto>('/portal/learn-policy', scope),
    enabled: ready && can('ai.configure'),
  });
}

export function useSavePortalLearnPolicy() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPortalLearnPolicyInput) =>
      client.put<PortalLearnPolicyDto>('/portal/learn-policy', scope, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['portal', 'learn-policy'] }),
  });
}
