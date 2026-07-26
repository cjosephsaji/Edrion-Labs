'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PortalClientError, usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { DashboardPrefs, PortalDashboardDto, PortalMeDto } from './types';

function isUnauthenticated(err: unknown): boolean {
  return err instanceof PortalClientError && err.status === 401;
}

const INSTITUTION_SCOPE = { mode: 'institution' } as const;

/** The authenticated portal user + authorisation surface. Scope-independent. */
export function usePortalMe() {
  const client = usePortalClient();
  return useQuery({
    queryKey: ['portal', 'me'],
    queryFn: () => client.get<PortalMeDto>('/portal/me', INSTITUTION_SCOPE),
    // Identity must track the live session cookie — never treat `/portal/me` as long-lived cache.
    staleTime: 0,
    retry: (failureCount, error) => !isUnauthenticated(error) && failureCount < 1,
  });
}

/** The composed, scope-aware dashboard. Refetches when the active scope changes. */
export function usePortalDashboard() {
  const client = usePortalClient();
  const { data: me, isError: meError } = usePortalMe();
  const { scope } = useScope();
  const key = scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
  return useQuery({
    queryKey: ['portal', 'dashboard', key],
    queryFn: () => client.get<PortalDashboardDto>('/portal/dashboard', scope),
    enabled: !!me && !meError,
    retry: (failureCount, error) => !isUnauthenticated(error) && failureCount < 1,
  });
}

/** This user's saved pin/hide layout. Scope-independent — a layout follows you across campuses. */
export function useDashboardPrefs() {
  const client = usePortalClient();
  return useQuery({
    queryKey: ['portal', 'dashboard', 'prefs'],
    queryFn: () => client.get<DashboardPrefs>('/portal/dashboard/prefs', INSTITUTION_SCOPE),
    staleTime: 5 * 60_000,
  });
}

/** Principal metric rollups for dashboard widgets. */
export function usePrincipalMetrics(asOf?: string) {
  const client = usePortalClient();
  const q = asOf ? `?as_of=${encodeURIComponent(asOf)}` : '';
  return useQuery({
    queryKey: ['portal', 'principal-metrics', asOf ?? 'today'],
    queryFn: () =>
      client.get<{ asOf: string; items: Array<{ key: string; value: Record<string, unknown> }> }>(
        `/portal/principal-metrics${q}`,
        INSTITUTION_SCOPE,
      ),
  });
}

/**
 * Save pin/hide. Optimistic, with rollback — the API rejects any widget the user isn't entitled to
 * (WIDGET_NOT_ENTITLED), so a rejected write must restore the previous layout rather than leave the
 * UI showing a state the server refused.
 */
export function useSaveDashboardPrefs() {
  const client = usePortalClient();
  const qc = useQueryClient();
  const key = ['portal', 'dashboard', 'prefs'] as const;

  return useMutation({
    mutationFn: (prefs: DashboardPrefs) =>
      client.put<DashboardPrefs>('/portal/dashboard/prefs', INSTITUTION_SCOPE, prefs),
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<DashboardPrefs>(key);
      qc.setQueryData(key, next);
      return { previous };
    },
    onError: (_err, _next, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => {
      // The dashboard payload itself changes (a hidden widget stops being hydrated), so refetch it.
      void qc.invalidateQueries({ queryKey: ['portal', 'dashboard'] });
    },
  });
}
