'use client';
import { useQuery } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { PortalDashboardDto, PortalMeDto } from './types';

const INSTITUTION_SCOPE = { mode: 'institution' } as const;

/** The authenticated portal user + authorisation surface. Scope-independent. */
export function usePortalMe() {
  const client = usePortalClient();
  return useQuery({
    queryKey: ['portal', 'me'],
    queryFn: () => client.get<PortalMeDto>('/portal/me', INSTITUTION_SCOPE),
    staleTime: 5 * 60_000,
  });
}

/** The adaptive, scope-aware dashboard. Refetches when the active scope changes. */
export function usePortalDashboard() {
  const client = usePortalClient();
  const { scope } = useScope();
  const key = scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
  return useQuery({
    queryKey: ['portal', 'dashboard', key],
    queryFn: () => client.get<PortalDashboardDto>('/portal/dashboard', scope),
  });
}
