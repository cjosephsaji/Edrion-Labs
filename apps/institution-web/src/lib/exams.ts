'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import { useAcademicScopedParams } from './academic-context';
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
  if (p.filters) for (const [k, v] of Object.entries(p.filters)) if (v) sp.set(k, v);
  return sp.toString();
}

/** Scope-aware, server-paginated exam list. `resource` is the path segment ("exams"). */
export function useExamsList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  const scoped = useAcademicScopedParams(params, params.academicScope ?? 'year');
  const { academicScope: _as, ...listParams } = scoped;
  return useQuery({
    queryKey: ['exams', resource, scopeKey(scope), listParams],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(listParams)}`, scope),
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

// --- paper questions ---------------------------------------------------------

import type { QuestionConfig, QuestionDraft, QuestionRow } from './question-types';
import type { Target } from './recipients';

export interface ExamAudiencePreview {
  count: number;
  sample: string[];
  studentCount: number;
}

export interface ExamFullQuestion extends QuestionRow {
  config?: QuestionConfig | null;
}

export interface ExamFullSchedule extends ExamScheduleRow {
  questions: ExamFullQuestion[];
}

export interface ExamFull extends ExamRow {
  schedules: ExamFullSchedule[];
}

export function useExamFull(examId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['exams', examId, 'full', scopeKey(scope)],
    queryFn: () => client.get<ExamFull>(`/portal/exams/${examId}/full`, scope),
    enabled: !!examId,
  });
}

export function useExamFullMutations() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['exams'] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post('/portal/exams', scope, body),
    onSuccess: invalidate,
  });
  const reconcile = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.put(`/portal/exams/${id}/full`, scope, body),
    onSuccess: invalidate,
  });
  return { create, reconcile };
}

export function useExamQuestions(examId: string | null, scheduleId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['exams', examId, 'schedules', scheduleId, 'questions', scopeKey(scope)],
    queryFn: () =>
      client.get<QuestionRow[]>(`/portal/exams/${examId}/schedules/${scheduleId}/questions`, scope),
    enabled: !!examId && !!scheduleId,
  });
}

export function useExamQuestionMutations(examId: string, scheduleId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['exams', examId, 'schedules', scheduleId, 'questions'] });
  };

  const create = useMutation({
    mutationFn: (body: QuestionDraft) =>
      client.post(`/portal/exams/${examId}/schedules/${scheduleId}/questions`, scope, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: QuestionDraft & { version: number } }) =>
      client.patch(`/portal/exams/${examId}/schedules/${scheduleId}/questions/${id}`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/exams/${examId}/schedules/${scheduleId}/questions/${id}`, scope, { version }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

export function useExamAudiencePreview(targets: Target[], enabled = true) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['exams', 'audience-preview', scopeKey(scope), targets],
    queryFn: () => client.post<ExamAudiencePreview>('/portal/exams/audience/preview', scope, { targets }),
    enabled: enabled && targets.length > 0,
    placeholderData: keepPreviousData,
  });
}

export type { ExamRow, ExamScheduleRow } from './exams-types';
