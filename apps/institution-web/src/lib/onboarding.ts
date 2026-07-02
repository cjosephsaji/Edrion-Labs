'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import type { OnboardingSummary } from './onboarding-types';
import type { Paged } from './academics-types';

const INSTITUTION_SCOPE = { mode: 'institution' } as const;
const SUMMARY_KEY = ['portal', 'onboarding'];
const listKey = (endpoint: string) => ['portal', 'onboarding-list', endpoint];

/** The onboarding wizard summary — the 6 data-driven steps + progress. Institution-scoped. */
export function useOnboarding() {
  const client = usePortalClient();
  return useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => client.get<OnboardingSummary>('/portal/onboarding', INSTITUTION_SCOPE),
  });
}

/** Recent records already added for a step, so each section shows what exists. */
export function useStepList<T = { id: string }>(endpoint: string) {
  const client = usePortalClient();
  return useQuery({
    queryKey: listKey(endpoint),
    queryFn: () => client.get<Paged<T>>(`/portal/${endpoint}`, INSTITUTION_SCOPE),
  });
}

/** Add a record to a step (posts to the module's own create endpoint), then refresh step + summary. */
export function useStepCreate(endpoint: string) {
  const client = usePortalClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post(`/portal/${endpoint}`, INSTITUTION_SCOPE, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      qc.invalidateQueries({ queryKey: listKey(endpoint) });
    },
  });
}

/** Take the institution live once every step has data. */
export function useCompleteOnboarding() {
  const client = usePortalClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => client.post<OnboardingSummary>('/portal/onboarding/complete', INSTITUTION_SCOPE, {}),
    onSuccess: (s) => {
      qc.setQueryData(SUMMARY_KEY, s);
      // Institution just went Active — refresh the shell's status gate (sidebar + redirect).
      qc.invalidateQueries({ queryKey: ['portal', 'me'] });
    },
  });
}
