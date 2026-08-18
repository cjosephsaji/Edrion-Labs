'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { ListParams } from './academics';
import { useAcademicScopedParams, useAcademicContextKey } from './academic-context';
import type {
  ClassRosterEntry,
  GuardianRow,
  Paged,
  ParentProfile,
  ParentRow,
  StaffProfile,
  StaffRow,
  StudentRow,
  TeachingStaffOption,
} from './people-types';
import { formatPersonName, namedPersonLabel } from './person-name';
import { scopeKey } from './admin';

/** Combobox options for teaching staff pickers. */
export function teachingStaffSelectOptions(teachers: TeachingStaffOption[] | undefined) {
  return (teachers ?? []).map((t) => ({ value: t.id, label: formatPersonName(t) }));
}

/** Combobox options for student pickers (includes admission number). */
export function studentRowSelectOptions(students: StudentRow[] | undefined) {
  return (students ?? []).map((s) => ({ value: s.id, label: namedPersonLabel(s, s.admissionNo) }));
}

/** Combobox options for staff pickers. */
export function staffRowSelectOptions(staff: StaffRow[] | undefined) {
  return (staff ?? []).map((s) => ({ value: s.id, label: formatPersonName(s) }));
}

/** People resource path segment (matches the API routes under /portal/people/*). */
export type PeopleResource = 'students' | 'staff' | 'parents';

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

/** A scope-aware, server-paginated list of one people resource. Refetches when scope changes. */
const PEOPLE_ACADEMIC_SCOPE: Record<string, 'year+term' | 'year' | 'none'> = {
  students: 'year',
  staff: 'year',
  parents: 'none',
};

export function usePeopleList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  const mode = params.academicScope ?? PEOPLE_ACADEMIC_SCOPE[resource] ?? 'year';
  const scoped = useAcademicScopedParams(params, mode);
  const { academicScope: _as, ...listParams } = scoped;
  return useQuery({
    queryKey: ['people', resource, scopeKey(scope), listParams],
    queryFn: () => client.get<Paged<T>>(`/portal/people/${resource}?${queryString(listParams)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for one resource. Invalidates that resource's lists on success. */
export function usePeopleMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['people'] });

    // Students and staff are embedded throughout the academic graph (rosters, class counts,
    // class teachers and subject teachers), so directory writes must refresh those consumers too.
    if (resource === 'students' || resource === 'staff') {
      qc.invalidateQueries({ queryKey: ['academics'] });
      qc.invalidateQueries({ queryKey: ['class-roster'] });
      qc.invalidateQueries({ queryKey: ['attendance'] });
      qc.invalidateQueries({ queryKey: ['timetable'] });
      qc.invalidateQueries({ queryKey: ['gradebook'] });
      qc.invalidateQueries({ queryKey: ['reports'] });
      qc.invalidateQueries({ queryKey: ['recipients'] });
    }
    if (resource === 'students') qc.invalidateQueries({ queryKey: ['fees'] });
    if (resource === 'staff') qc.invalidateQueries({ queryKey: ['payroll'] });
  };

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

/** Teaching staff options for academics pickers (class teacher, dept head, subject teacher). */
export function useTeachingStaffOptions() {
  const client = usePortalClient();
  const { scope } = useScope();
  const academicKey = useAcademicContextKey();
  const scoped = useAcademicScopedParams(
    { page: 1, pageSize: 100, sortDir: 'asc' as const, filters: {} },
    'year',
  );
  const filters = (scoped.filters ?? {}) as { academicYearId?: string; termId?: string };
  const qs = new URLSearchParams();
  if (filters.academicYearId) qs.set('academicYearId', filters.academicYearId);
  if (filters.termId) qs.set('termId', filters.termId);
  const q = qs.toString();
  return useQuery({
    queryKey: ['people', 'staff', 'teaching-options', scopeKey(scope), academicKey],
    queryFn: async () => {
      const res = await client.get<{ items: TeachingStaffOption[]; total: number }>(
        `/portal/people/staff/teaching-options${q ? `?${q}` : ''}`,
        scope,
      );
      return res.items ?? [];
    },
    staleTime: 60_000,
  });
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

export function useStaffProfile(staffId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['staff-profile', scopeKey(scope), staffId],
    queryFn: () => client.get<StaffProfile>(`/portal/people/staff/${staffId}/profile`, scope),
    enabled: !!staffId,
  });
}

export function useParentProfile(parentId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['parent-profile', scopeKey(scope), parentId],
    queryFn: () => client.get<ParentProfile>(`/portal/people/parents/${parentId}/profile`, scope),
    enabled: !!parentId,
  });
}

export function useClassRoster(classId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['class-roster', scopeKey(scope), classId],
    queryFn: () => client.get<ClassRosterEntry[]>(`/portal/academics/classes/${classId}/roster`, scope),
    enabled: !!classId,
  });
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

export type {
  ClassRosterEntry,
  GuardianRow,
  ParentProfile,
  ParentRow,
  StaffProfile,
  StaffRow,
  StudentRow,
  TeachingStaffOption,
} from './people-types';
