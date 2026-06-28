'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { GuardianRow, Paged, ParentRow, StaffRow, StudentRow, TeacherRow } from './people-types';

/** People resource path segment (matches the API routes under /portal/people/*). */
export type PeopleResource = 'students' | 'teachers' | 'staff' | 'parents';

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

/** A scope-aware, server-paginated list of one people resource. Refetches when scope changes. */
export function usePeopleList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['people', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/people/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for one resource. Invalidates that resource's lists on success. */
export function usePeopleMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['people', resource] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post(`/portal/people/${resource}`, scope, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.patch(`/portal/people/${resource}/${id}`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/people/${resource}/${id}`, scope, { version }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}

const OPTION_PARAMS: ListParams = { page: 1, pageSize: 100, sortDir: 'asc' };

/** Teacher options for the academics pickers (class teacher, dept head, subject teacher). */
export function useTeacherOptions() {
  return usePeopleList<TeacherRow>('teachers', { ...OPTION_PARAMS, sortBy: 'lastName' });
}
/** Parent options for the student guardian picker. */
export function useParentOptions() {
  return usePeopleList<ParentRow>('parents', { ...OPTION_PARAMS, sortBy: 'lastName' });
}
/** Student options for the gradebook student picker. */
export function useStudentOptions() {
  return usePeopleList<StudentRow>('students', { ...OPTION_PARAMS, sortBy: 'lastName' });
}
/** Staff options for the payroll employee picker. */
export function useStaffOptions() {
  return usePeopleList<StaffRow>('staff', { ...OPTION_PARAMS, sortBy: 'lastName' });
}

// --- student ↔ guardian links -----------------------------------------------

export function useGuardians(studentId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['people', 'students', studentId, 'guardians', scopeKey(scope)],
    queryFn: () => client.get<GuardianRow[]>(`/portal/people/students/${studentId}/guardians`, scope),
    enabled: !!studentId,
  });
}

export function useGuardianMutations(studentId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ['people', 'students', studentId, 'guardians'] });

  const assign = useMutation({
    mutationFn: (body: { parentId: string; relationship?: string; isPrimary?: boolean; isEmergencyContact?: boolean }) =>
      client.post(`/portal/people/students/${studentId}/guardians`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (linkId: string) =>
      client.del(`/portal/people/students/${studentId}/guardians/${linkId}`, scope),
    onSuccess: invalidate,
  });
  return { assign, remove };
}

export type { GuardianRow, ParentRow, StaffRow, StudentRow, TeacherRow } from './people-types';
