'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type {
  AcademicYearRow,
  ClassRow,
  ClassSubjectRow,
  DepartmentRow,
  GradeLevelRow,
  DepartmentGradeLevelRow,
  ProgrammeStructureDepartment,
  Paged,
  SubjectRow,
} from './academics-types';

/** Academic resource path segment (matches the API routes under /portal/academics/*). */
export type Resource =
  | 'academic-years'
  | 'departments'
  | 'grade-levels'
  | 'department-grade-levels'
  | 'subjects'
  | 'classes'
  | 'academic-terms';

export interface ListParams {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir: 'asc' | 'desc';
  search?: string;
  /** Optional extra query facets (e.g. status, submittedVia). Empty values are dropped. */
  filters?: Record<string, string | undefined>;
}

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

/** A scope-aware, server-paginated list of one academic resource. Refetches when scope changes. */
export function useAcademicList<T>(resource: Resource, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['academics', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/academics/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for one resource. Invalidates that resource's lists on success. */
export function useAcademicMutations(resource: Resource) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['academics', resource] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post(`/portal/academics/${resource}`, scope, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.patch(`/portal/academics/${resource}/${id}`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/academics/${resource}/${id}`, scope, { version }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

const OPTION_PARAMS: ListParams = { page: 1, pageSize: 100, sortDir: 'asc' };

/** Lightweight option lists for form selects (first 100 rows in scope). */
export function useDepartmentOptions() {
  return useAcademicList<DepartmentRow>('departments', { ...OPTION_PARAMS, sortBy: 'name' });
}
export function useAcademicYearOptions() {
  return useAcademicList<AcademicYearRow>('academic-years', { ...OPTION_PARAMS, sortBy: 'startDate', sortDir: 'desc' });
}
export function useGradeLevelOptions() {
  return useAcademicList<GradeLevelRow>('grade-levels', { ...OPTION_PARAMS, sortBy: 'level' });
}
export function useSubjectOptions() {
  return useAcademicList<SubjectRow>('subjects', { ...OPTION_PARAMS, sortBy: 'name' });
}
export function useClassOptions(filters?: Record<string, string | undefined>) {
  return useAcademicList<ClassRow>('classes', { ...OPTION_PARAMS, sortBy: 'name', filters });
}

export function useProgrammeLevelOptions(departmentId?: string) {
  return useAcademicList<DepartmentGradeLevelRow>('department-grade-levels', {
    ...OPTION_PARAMS,
    sortBy: 'sequence',
    filters: departmentId ? { departmentId } : undefined,
  });
}

export function useTermOptionsByProgrammeLevel(programmeLevelId?: string) {
  return useAcademicList<import('./academics-types').AcademicTermRow>('academic-terms', {
    ...OPTION_PARAMS,
    sortBy: 'sequence',
    filters: programmeLevelId ? { programmeLevelId } : undefined,
  });
}

export function useSectionOptionsByProgrammeLevel(programmeLevelId?: string, termId?: string) {
  return useAcademicList<ClassRow>('classes', {
    ...OPTION_PARAMS,
    sortBy: 'name',
    filters: {
      ...(programmeLevelId ? { programmeLevelId } : {}),
      ...(termId ? { termId } : {}),
    },
  });
}

export function useProgrammeStructure(departmentId?: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qs = departmentId ? `?departmentId=${departmentId}` : '';
  return useQuery({
    queryKey: ['academics', 'programme-structure', scopeKey(scope), departmentId ?? 'all'],
    queryFn: () =>
      client.get<ProgrammeStructureDepartment[]>(`/portal/academics/programme-structure${qs}`, scope),
  });
}

// --- class ↔ subject assignments --------------------------------------------

export function useClassSubjects(classId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['academics', 'classes', classId, 'subjects', scopeKey(scope)],
    queryFn: () => client.get<ClassSubjectRow[]>(`/portal/academics/classes/${classId}/subjects`, scope),
    enabled: !!classId,
  });
}

export function useClassSubjectMutations(classId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['academics', 'classes', classId, 'subjects'] });

  const assign = useMutation({
    mutationFn: (body: { subjectId: string; teacherId?: string | null }) =>
      client.post(`/portal/academics/classes/${classId}/subjects`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (assignmentId: string) =>
      client.del(`/portal/academics/classes/${classId}/subjects/${assignmentId}`, scope),
    onSuccess: invalidate,
  });
  return { assign, remove };
}

export type {
  AcademicYearRow,
  ClassRow,
  ClassSubjectRow,
  DepartmentRow,
  GradeLevelRow,
  SubjectRow,
} from './academics-types';
