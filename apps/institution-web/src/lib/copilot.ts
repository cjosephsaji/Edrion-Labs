'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { CopilotRun, CopilotRunContext, CopilotRunDetail, Paged } from './copilot-types';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

const KEY = 'copilot';

/** The institution's recent runs (most recent first). */
export function useCopilotRuns(params: { page: number; pageSize: number } = { page: 1, pageSize: 20 }) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: [KEY, 'runs', scopeKey(scope), params],
    queryFn: () =>
      client.get<Paged<CopilotRun>>(`/portal/copilot/runs?page=${params.page}&pageSize=${params.pageSize}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Full detail (tool calls + confirmations) for one run. */
export function useCopilotRun(id: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: [KEY, 'run', id, scopeKey(scope)],
    queryFn: () => client.get<CopilotRunDetail>(`/portal/copilot/runs/${id}`, scope),
    enabled: !!id,
  });
}

/** Start a run — prepares actions + shows exact impact. Executes nothing that changes state. */
export function useCreateRun() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { prompt: string; context?: CopilotRunContext }) =>
      client.post<CopilotRunDetail>('/portal/copilot/runs', scope, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

/** Confirm a prepared run → server re-evaluates guardrails → dispatches the real audited service. */
export function useConfirmRun() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason, confirmationText }: { id: string; reason: string; confirmationText?: string }) =>
      client.post<CopilotRunDetail>(`/portal/copilot/runs/${id}/confirm`, scope, { reason, confirmationText }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}

export function useRejectRun() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      client.post<CopilotRunDetail>(`/portal/copilot/runs/${id}/reject`, scope, { reason }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
  });
}
