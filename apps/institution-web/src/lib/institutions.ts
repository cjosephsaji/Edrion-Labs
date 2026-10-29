'use client';
import { useQuery } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';

export interface InstitutionMembership {
  institutionUserId: string;
  institutionId: string;
  institutionName: string;
  requiresPassword: boolean;
}

export interface InstitutionChoices {
  currentUserId: string | null;
  institutions: InstitutionMembership[];
}

export function useInstitutionChoices(enabled = true) {
  const client = usePortalClient();
  return useQuery({
    queryKey: ['portal', 'institutions'],
    queryFn: () =>
      client.get<InstitutionChoices>('/portal/auth/institutions', { mode: 'institution' }),
    enabled,
    retry: false,
    staleTime: 0,
  });
}
