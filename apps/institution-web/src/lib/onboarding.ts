'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import type { OnboardingSummary } from './onboarding-types';
import type { Paged } from './academics-types';

const INSTITUTION_SCOPE = { mode: 'institution' } as const;
const SUMMARY_KEY = ['portal', 'onboarding'];
const listKey = (endpoint: string, params?: Record<string, string>) => [
  'portal',
  'onboarding-list',
  endpoint,
  params ?? {},
];

function listQuery(params?: Record<string, string>): string {
  if (!params || Object.keys(params).length === 0) return '';
  return `?${new URLSearchParams(params).toString()}`;
}

/** The onboarding wizard summary — step progress and go-live readiness. Institution-scoped. */
export function useOnboarding() {
  const client = usePortalClient();
  return useQuery({
    queryKey: SUMMARY_KEY,
    queryFn: () => client.get<OnboardingSummary>('/portal/onboarding', INSTITUTION_SCOPE),
  });
}

/** Recent records already added for a step, so each section shows what exists. */
export function useStepList<T = { id: string }>(endpoint: string, params?: Record<string, string>) {
  const client = usePortalClient();
  return useQuery({
    queryKey: listKey(endpoint, params),
    queryFn: () =>
      client.get<Paged<T>>(`/portal/${endpoint}${listQuery(params)}`, INSTITUTION_SCOPE),
  });
}

/** Add a record to a step (posts to the module's own create endpoint), then refresh step + summary. */
export function useStepCreate(endpoint: string, listParams?: Record<string, string>) {
  const client = usePortalClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post(`/portal/${endpoint}`, INSTITUTION_SCOPE, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      qc.invalidateQueries({ queryKey: listKey(endpoint, listParams) });
      qc.invalidateQueries({ queryKey: ['academics'] });
    },
  });
}

/** Inline editing uses the same version-guarded module endpoints as the directories. */
export function useOnboardingRecordMutations(endpoint: string) {
  const client = usePortalClient();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: SUMMARY_KEY });
    qc.invalidateQueries({ queryKey: ['portal', 'onboarding-list'] });
    qc.invalidateQueries({ queryKey: ['academics'] });
    qc.invalidateQueries({ queryKey: ['people'] });
  };
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.patch(`/portal/${endpoint}/${id}`, INSTITUTION_SCOPE, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/${endpoint}/${id}`, INSTITUTION_SCOPE, { version }),
    onSuccess: invalidate,
  });
  return { update, remove };
}

/** Steps that need more than one API call, or a different list endpoint than the create path. */
export function useOnboardingStepSubmit(
  stepKey: string,
  endpoint: string,
  listEndpoint = endpoint,
) {
  const client = usePortalClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      body,
      values,
    }: {
      body: Record<string, unknown>;
      values: Record<string, unknown>;
    }) => {
      if (stepKey === 'programmeLevels') {
        const departmentId = String(values.departmentId ?? '');
        const name = String(values.name ?? '').trim();
        const sequence = Number(values.sequence) || 1;
        const grade = await client.post<{ id: string }>(
          '/portal/academics/grade-levels',
          INSTITUTION_SCOPE,
          {
            name,
            level: sequence,
            departmentId,
          },
        );
        return client.post('/portal/academics/department-grade-levels', INSTITUTION_SCOPE, {
          departmentId,
          gradeLevelId: grade.id,
          sequence,
        });
      }

      if (stepKey === 'subjects') {
        const subject = await client.post<{ id: string }>(
          `/portal/${endpoint}`,
          INSTITUTION_SCOPE,
          body,
        );
        const programmeLevelId = values.programmeLevelId;
        if (programmeLevelId) {
          await client.post('/portal/academics/programme-subjects', INSTITUTION_SCOPE, {
            subjectId: subject.id,
            programmeLevelId,
            semesterSequence: Number(values.semesterSequence) || 1,
          });
        }
        return subject;
      }

      return client.post(`/portal/${endpoint}`, INSTITUTION_SCOPE, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SUMMARY_KEY });
      qc.invalidateQueries({ queryKey: ['portal', 'onboarding-list', listEndpoint] });
      qc.invalidateQueries({ queryKey: ['academics'] });
      qc.invalidateQueries({ queryKey: ['people'] });
      if (stepKey === 'subjects') {
        qc.invalidateQueries({ queryKey: listKey('academics/programme-subjects') });
      }
    },
  });
}

/** Take the institution live once every step has data. */
export function useCompleteOnboarding() {
  const client = usePortalClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      client.post<OnboardingSummary>('/portal/onboarding/complete', INSTITUTION_SCOPE, {}),
    onSuccess: (s) => {
      qc.setQueryData(SUMMARY_KEY, s);
      // Institution just went Active — refresh the shell's status gate (sidebar + redirect).
      qc.invalidateQueries({ queryKey: ['portal', 'me'] });
    },
  });
}
