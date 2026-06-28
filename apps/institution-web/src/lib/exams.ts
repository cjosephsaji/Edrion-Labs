'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { ExamRow, ExamScheduleRow, Paged } from './exams-types';

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

/** Scope-aware, server-paginated exam list. `resource` is the path segment ("exams"). */
export function useExamsList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['exams', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for exams. */
export function useExamsMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['exams'] });

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

const OPTION_PARAMS: ListParams = { page: 1, pageSize: 100, sortDir: 'desc', sortBy: 'startDate' };

/** Exam options for the gradebook exam picker (first 100 in scope). */
export function useExamOptions() {
  return useExamsList<ExamRow>('exams', OPTION_PARAMS);
}

// --- schedules (papers within an exam) ---------------------------------------

export function useExamSchedules(examId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['exams', examId, 'schedules', scopeKey(scope)],
    queryFn: () => client.get<ExamScheduleRow[]>(`/portal/exams/${examId}/schedules`, scope),
    enabled: !!examId,
  });
}

export function useExamScheduleMutations(examId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['exams', examId, 'schedules'] });
    qc.invalidateQueries({ queryKey: ['exams'] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post(`/portal/exams/${examId}/schedules`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/exams/${examId}/schedules/${id}`, scope, { version }),
    onSuccess: invalidate,
  });
  return { create, remove };
}

export type { ExamRow, ExamScheduleRow } from './exams-types';
