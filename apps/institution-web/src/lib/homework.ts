'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type {
  HomeworkDetailRow,
  HomeworkRow,
  HomeworkSubmissionDetailRow,
  HomeworkSubmissionRow,
  Paged,
} from './homework-types';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

function toDatetime(dateStr: string): string {
  if (!dateStr) return new Date().toISOString();
  if (dateStr.includes('T')) return dateStr;
  return new Date(`${dateStr}T23:59:00`).toISOString();
}

/** Homework list — API returns a flat array; paginate client-side. */
export function useHomeworkList(_resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['homework', scopeKey(scope), params],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (params.filters?.classId) sp.set('classId', params.filters.classId);
      if (params.filters?.status) sp.set('status', params.filters.status);
      const rows = await client.get<HomeworkRow[]>(`/portal/homework?${sp}`, scope);
      let items = [...rows];
      if (params.search) {
        const q = params.search.toLowerCase();
        items = items.filter((h) => h.title.toLowerCase().includes(q));
      }
      if (params.sortBy === 'dueAt') {
        items.sort((a, b) => {
          const cmp = a.dueAt.localeCompare(b.dueAt);
          return params.sortDir === 'desc' ? -cmp : cmp;
        });
      }
      const total = items.length;
      const start = (params.page - 1) * params.pageSize;
      return { items: items.slice(start, start + params.pageSize), total } satisfies Paged<HomeworkRow>;
    },
    placeholderData: keepPreviousData,
  });
}

export function useHomeworkMutations(_resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['homework'] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      const questions = (body.questions as { promptText?: string; maxMarks?: number }[]) ?? [
        { promptText: String(body.questionPrompt ?? 'Question 1'), maxMarks: 10 },
      ];
      const payload = {
        classId: String(body.classId),
        subjectId: body.subjectId ? String(body.subjectId) : undefined,
        title: String(body.title),
        instructions: body.instructions ? String(body.instructions) : undefined,
        dueAt: toDatetime(String(body.dueAt)),
        aiPolicy: (body.aiPolicy as 'off' | 'hints_only' | 'full') ?? 'off',
        questions,
      };
      return client.post<HomeworkRow>('/portal/homework', scope, payload);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.patch(`/portal/homework/${id}`, scope, {
        title: body.title,
        instructions: body.instructions || null,
        dueAt: body.dueAt ? toDatetime(String(body.dueAt)) : undefined,
        aiPolicy: body.aiPolicy,
        version: body.version,
      }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (_args: { id: string; version: number }) => {
      throw new Error('Homework cannot be deleted from the portal.');
    },
  });

  return { create, update, remove };
}

export function useHomeworkDetail(homeworkId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['homework', homeworkId, 'detail', scopeKey(scope)],
    queryFn: () => client.get<HomeworkDetailRow>(`/portal/homework/${homeworkId}`, scope),
    enabled: !!homeworkId,
  });
}

export function useHomeworkSubmissionDetail(homeworkId: string, submissionId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['homework', homeworkId, 'submissions', submissionId, scopeKey(scope)],
    queryFn: () =>
      client.get<HomeworkSubmissionDetailRow>(
        `/portal/homework/${homeworkId}/submissions/${submissionId}`,
        scope,
      ),
    enabled: !!homeworkId && !!submissionId,
  });
}

export function useHomeworkSubmissions(homeworkId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['homework', homeworkId, 'submissions', scopeKey(scope)],
    queryFn: () => client.get<HomeworkSubmissionRow[]>(`/portal/homework/${homeworkId}/submissions`, scope),
    enabled: !!homeworkId,
  });
}

export function useAssignHomework() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post(`/portal/homework/${id}/assign`, scope, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['homework'] }),
  });
}

export function useCloseHomework() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post(`/portal/homework/${id}/close`, scope, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['homework'] }),
  });
}

export function useReturnHomeworkSubmission(homeworkId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ submissionId, body }: { submissionId: string; body: {
      answers: { questionId: string; teacherMarks?: number; teacherFeedback?: string }[];
      totalMarks?: number;
      totalMax?: number;
      teacherNote?: string;
    } }) =>
      client.post(`/portal/homework/${homeworkId}/submissions/${submissionId}/return`, scope, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['homework', homeworkId, 'submissions'] });
      qc.invalidateQueries({ queryKey: ['homework'] });
    },
  });
}
