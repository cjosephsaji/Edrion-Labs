'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { AssignmentSubmissionRow, Paged, SubmissionStatus } from './assignments-types';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

function queryString(p: ListParams): string {
  const sp = new URLSearchParams();
  sp.set('page', String(p.page));
  sp.set('pageSize', String(p.pageSize));
  sp.set('sortDir', p.sortDir);
  if (p.sortBy) sp.set('sortBy', p.sortBy);
  if (p.search) sp.set('search', p.search);
  return sp.toString();
}

/** Scope-aware, server-paginated assignment list. `resource` is the path segment ("assignments"). */
export function useAssignmentsList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['assignments', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for assignments. */
export function useAssignmentsMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['assignments'] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post(`/portal/${resource}`, scope, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.patch(`/portal/${resource}/${id}`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/${resource}/${id}`, scope, { version }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

// --- submissions (per-student within an assignment) --------------------------

export function useAssignmentSubmissions(assignmentId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['assignments', assignmentId, 'submissions', scopeKey(scope)],
    queryFn: () => client.get<AssignmentSubmissionRow[]>(`/portal/assignments/${assignmentId}/submissions`, scope),
    enabled: !!assignmentId,
  });
}

export interface SubmissionInput {
  studentId: string;
  status: SubmissionStatus;
  submittedDate?: string | null;
  pointsAwarded?: number | null;
  feedback?: string | null;
}

export function useAssignmentGradeMutations(assignmentId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['assignments', assignmentId, 'submissions'] });
    qc.invalidateQueries({ queryKey: ['assignments'] });
  };

  const grade = useMutation({
    mutationFn: (submissions: SubmissionInput[]) =>
      client.post(`/portal/assignments/${assignmentId}/submissions`, scope, { submissions }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (submissionId: string) =>
      client.del(`/portal/assignments/${assignmentId}/submissions/${submissionId}`, scope),
    onSuccess: invalidate,
  });
  return { grade, remove };
}

export type { AssignmentRow, AssignmentSubmissionRow, SubmissionStatus } from './assignments-types';
