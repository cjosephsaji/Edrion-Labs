'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import { useAcademicScopedParams } from './academic-context';
import type { CourseRow, Paged, SyllabusModuleRow } from './courses-types';
import { CURRICULUM_ALIGNMENT_VERSION, readCurriculumCompatibility } from '@edrion/schemas';

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

export function useCoursesList<T = CourseRow>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  const scoped = useAcademicScopedParams(params, params.academicScope ?? 'year');
  const { academicScope: _as, ...listParams } = scoped;
  return useQuery({
    queryKey: ['courses', resource, scopeKey(scope), listParams],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(listParams)}`, scope),
    placeholderData: keepPreviousData,
  });
}

export function useCoursesMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['courses'] });

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
    mutationFn: async (_args: { id: string; version: number }) => {
      throw new Error('Courses cannot be deleted from this screen.');
    },
  });
  return { create, update, remove };
}

export function useCourseSyllabus(courseId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['courses', courseId, 'syllabus', scopeKey(scope)],
    queryFn: async () => {
      const response = await client.request<SyllabusModuleRow[] | { modules: SyllabusModuleRow[]; curriculum?: unknown;
        history?: Array<{ revision: number; reason: string; recordedAt: string }> }>(
        `/portal/courses/${courseId}/syllabus`, scope, { method: 'GET', headers: { 'x-petros-curriculum-alignment': CURRICULUM_ALIGNMENT_VERSION } });
      return Array.isArray(response) ? { modules: response, curriculum: null, history: [] } :
        { modules: response.modules, curriculum: readCurriculumCompatibility(response.curriculum), history: response.history ?? [] };
    },
    enabled: !!courseId,
  });
}

export function useUpsertSyllabus(courseId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { modules: SyllabusModuleRow[] }) =>
      client.post<SyllabusModuleRow[]>(`/portal/courses/${courseId}/syllabus`, scope, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['courses', courseId, 'syllabus'] }),
  });
}
