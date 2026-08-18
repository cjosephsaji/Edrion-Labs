'use client';
import { useMemo } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { AcademicScopeMode } from './academic-context';
import { useAcademicScopedParams, useAcademicContext } from './academic-context';
import type { InstitutionScope } from './types';
import type {
  AcademicYearRow,
  ClassCurriculumRow,
  ClassRow,
  ClassSubjectRow,
  DepartmentRow,
  GradeLevelRow,
  DepartmentGradeLevelRow,
  ProgrammeStructureDepartment,
  ProgrammeSubjectRow,
  Paged,
  RosterCandidate,
  SubjectPlacement,
  SubjectRow,
} from './academics-types';

export type { AcademicScopeMode };

/** Academic resource path segment (matches the API routes under /portal/academics/*). */
export type Resource =
  | 'academic-years'
  | 'departments'
  | 'grade-levels'
  | 'department-grade-levels'
  | 'subjects'
  | 'programme-subjects'
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
  enabled?: boolean;
  /**
   * Per-call-site academic scope override. Defaults to the resource policy map.
   * Use `'none'` to opt out (greppable escape hatch).
   */
  academicScope?: AcademicScopeMode;
}

/** Default academic-year/term scoping per academics resource. */
export const RESOURCE_ACADEMIC_SCOPE: Record<Resource, AcademicScopeMode> = {
  'academic-years': 'none',
  departments: 'none',
  'grade-levels': 'none',
  'department-grade-levels': 'none',
  subjects: 'none',
  'programme-subjects': 'none',
  // Year only — terms are often programme-specific UUIDs, so shell termId would hide
  // other programmes' sections. Page facets pass termId explicitly when the user picks one.
  classes: 'year',
  'academic-terms': 'year',
};

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
  const mode = params.academicScope ?? RESOURCE_ACADEMIC_SCOPE[resource] ?? 'none';
  const scoped = useAcademicScopedParams(params, mode);
  const { enabled = true, academicScope: _as, ...listParams } = scoped;
  return useQuery({
    queryKey: ['academics', resource, scopeKey(scope), listParams],
    queryFn: () => client.get<Paged<T>>(`/portal/academics/${resource}?${queryString(listParams)}`, scope),
    placeholderData: keepPreviousData,
    enabled,
  });
}

/** Create / update / delete for one resource. Invalidates that resource's lists on success. */
export function useAcademicMutations(resource: Resource) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    // Academic structure is a graph, not a set of independent directories. A term edit changes
    // class labels; a class edit changes rosters and counts; curriculum edits change both subjects
    // and class inheritance. Refresh the graph so a successful write is visible on every page.
    qc.invalidateQueries({ queryKey: ['academics'] });
    qc.invalidateQueries({ queryKey: ['people'] });

    // These active screens embed academic names/counts or use academic rows as pickers.
    for (const key of [
      'attendance',
      'timetable',
      'gradebook',
      'assignments',
      'exams',
      'fees',
      'reports',
      'recipients',
    ]) {
      qc.invalidateQueries({ queryKey: [key] });
    }
  };

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
export function useAcademicYearOptions(enabled = true) {
  return useAcademicList<AcademicYearRow>('academic-years', {
    ...OPTION_PARAMS,
    sortBy: 'startDate',
    sortDir: 'desc',
    enabled,
    // Provider loads years before mounting context — must not read academic context.
    academicScope: 'none',
  });
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

/**
 * Programme × year links as flat select options ("Applied Psychology · Year 1"). One control
 * instead of two dependent ones, and the label states the whole lineage — which is the point:
 * a semester or a class should never sit in the tree without saying which programme it belongs to.
 */
export function useProgrammeLevelSelectOptions(departmentId?: string) {
  const { data, isLoading } = useProgrammeLevelOptions(departmentId);
  const options = useMemo(
    () =>
      (data?.items ?? []).map((l) => ({
        value: l.id,
        label: [l.departmentName, l.gradeLevelName].filter(Boolean).join(' · ') || 'Unnamed',
      })),
    [data],
  );
  return { options, isLoading, items: data?.items ?? [] };
}

export function useProgrammeSlotSelectOptions(programmeLevelId?: string) {
  const { items: levelItems, isLoading: levelsLoading } = useProgrammeLevelSelectOptions();
  const departmentId = useMemo(
    () => levelItems.find((l) => l.id === programmeLevelId)?.departmentId,
    [levelItems, programmeLevelId],
  );
  const { data: structure, isLoading: structureLoading } = useProgrammeStructureDetail(departmentId);

  const options = useMemo(() => {
    if (!programmeLevelId || !structure) return [];
    const level = structure.levels.find((l) => l.id === programmeLevelId);
    return (level?.slots ?? []).map((s) => ({
      value: s.id,
      label: s.name,
    }));
  }, [structure, programmeLevelId]);

  return {
    options,
    isLoading: levelsLoading || structureLoading,
    hasStructure: options.length > 0,
  };
}

/** Human label for a curriculum placement — prefers the programme slot name over a raw sequence. */
export function placementTermLabel(
  placement: Pick<SubjectPlacement, 'slotName' | 'semesterSequence'>,
  termLabel: string,
): string {
  return placement.slotName ?? `${termLabel} ${placement.semesterSequence}`;
}

export function useTermOptionsByProgrammeLevel(
  programmeLevelId?: string,
  enabled = true,
  /** Explicit year — required when called from AcademicContextProvider (must not read context). */
  academicYearId?: string,
) {
  return useAcademicList<import('./academics-types').AcademicTermRow>('academic-terms', {
    ...OPTION_PARAMS,
    sortBy: 'sequence',
    filters: {
      ...(programmeLevelId ? { programmeLevelId } : {}),
      ...(academicYearId ? { academicYearId } : {}),
    },
    // Caller passes year explicitly; never auto-merge context (provider would recurse/throw).
    academicScope: 'none',
    enabled,
  });
}

/**
 * Semesters as select options labelled with their full lineage
 * ("Applied Psychology · Year 1 · Semester 1"), so picking one out of a flat list is unambiguous.
 * Terms with no programme link are labelled as such rather than hidden — that's how you spot them.
 */
export function useTermSelectOptions(programmeLevelId?: string) {
  const { academicYearId } = useAcademicContext();
  const { data, isLoading } = useTermOptionsByProgrammeLevel(
    programmeLevelId,
    true,
    academicYearId || undefined,
  );
  const options = useMemo(
    () =>
      (data?.items ?? []).map((t) => {
        const lineage = [t.departmentName, t.gradeLevelName].filter(Boolean).join(' · ');
        return {
          value: t.id,
          label: lineage ? `${lineage} · ${t.name}` : `${t.name} (no programme)`,
        };
      }),
    [data],
  );
  return { options, isLoading, items: data?.items ?? [] };
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

export interface ProgrammeStructureDetail {
  department: {
    id: string;
    name: string;
    code: string;
    termSystem: string;
    durationMonths: number | null;
    termsPerYear: number;
    structureLocked: boolean;
    version: number;
  };
  levels: {
    id: string;
    sequence: number;
    name: string;
    gradeLevelId: string;
    durationLabel: string | null;
    version: number;
    slots: {
      id: string;
      programmeLevelId: string;
      levelSequence: number;
      sequenceInYear: number;
      absoluteSequence: number;
      name: string;
      kind: string;
      durationMonths: number | null;
      isTerminal: boolean;
      subjectCount: number;
      subjects: {
        id: string;
        subjectId: string;
        subjectName: string | null;
        subjectCode: string | null;
        subjectKind: string | null;
        credits: number | null;
        isElective: boolean;
        sequence: number;
        version: number;
      }[];
      version: number;
    }[];
  }[];
  totals: { levels: number; slots: number };
}

export function useProgrammeStructureDetail(departmentId?: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['academics', 'programme-structure-detail', scopeKey(scope), departmentId],
    queryFn: () =>
      client.get<ProgrammeStructureDetail>(`/portal/academics/programmes/${departmentId}/structure`, scope),
    enabled: !!departmentId,
  });
}

export function usePreviewProgrammeStructure() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useMutation({
    mutationFn: ({
      departmentId: _d,
      ...body
    }: {
      departmentId?: string;
      termSystem: string;
      durationMonths?: number | null;
      termsPerYear?: number;
      gradeCount?: number;
      preset?: string;
      overrides?: unknown[];
    }) =>
      client.post<import('@edrion/shared-types').GeneratedStructure>(
        `/portal/academics/programmes/${_d ?? 'preview'}/structure/preview`,
        scope,
        body,
      ),
  });
}

export function useCommitProgrammeStructure() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      departmentId,
      body,
    }: {
      departmentId: string;
      body: Record<string, unknown>;
    }) =>
      client.post<ProgrammeStructureDetail>(
        `/portal/academics/programmes/${departmentId}/structure`,
        scope,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academics'] });
      qc.invalidateQueries({ queryKey: ['portal', 'onboarding'] });
      qc.invalidateQueries({ queryKey: ['academics', 'programme-structures-created'] });
    },
  });
}

/** Programmes that already have a committed slot structure (onboarding + academics). */
export function useCreatedProgrammeStructures() {
  const client = usePortalClient();
  const { scope } = useScope();
  const { data: depts } = useDepartmentOptions();
  const deptIds = (depts?.items ?? []).map((d) => d.id).join(',');

  return useQuery({
    queryKey: ['academics', 'programme-structures-created', scopeKey(scope), deptIds],
    queryFn: async () => {
      const items = depts?.items ?? [];
      if (items.length === 0) return [] as ProgrammeStructureDetail[];

      const results = await Promise.all(
        items.map(async (d) => {
          const detail = await client.get<ProgrammeStructureDetail>(
            `/portal/academics/programmes/${d.id}/structure`,
            scope,
          );
          return detail.totals.slots > 0 ? detail : null;
        }),
      );
      return results.filter((r): r is ProgrammeStructureDetail => r != null);
    },
    enabled: (depts?.items?.length ?? 0) > 0,
  });
}

export function useScheduleAcademicYear() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      academicYearId,
      replaceExisting = false,
    }: {
      academicYearId: string;
      replaceExisting?: boolean;
    }) =>
      client.post(`/portal/academics/academic-years/${academicYearId}/schedule`, scope, {
        replaceExisting,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academics'] });
      qc.invalidateQueries({ queryKey: ['people'] });
    },
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
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['academics'] });
    qc.invalidateQueries({ queryKey: ['people'] });
    qc.invalidateQueries({ queryKey: ['timetable'] });
    qc.invalidateQueries({ queryKey: ['attendance'] });
  };

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

// --- curriculum (programme × year × semester → subject) ----------------------

/** Curriculum rows for one programme year, optionally narrowed to a single semester slot. */
export function useProgrammeSubjects(programmeLevelId?: string, semesterSequence?: number) {
  return useAcademicList<ProgrammeSubjectRow>('programme-subjects', {
    page: 1,
    pageSize: 200,
    sortDir: 'asc',
    sortBy: 'semesterSequence',
    filters: {
      ...(programmeLevelId ? { programmeLevelId } : {}),
      ...(semesterSequence ? { semesterSequence: String(semesterSequence) } : {}),
    },
  });
}

/** Every curriculum placement of one subject — what the Subjects list shows as chips. */
export function useSubjectPlacements(subjectId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['academics', 'programme-subjects', 'by-subject', subjectId, scopeKey(scope)],
    queryFn: () =>
      client.get<Paged<ProgrammeSubjectRow>>(
        `/portal/academics/programme-subjects?subjectId=${subjectId}&page=1&pageSize=100&sortDir=asc&sortBy=semesterSequence`,
        scope,
      ),
    enabled: !!subjectId,
  });
}

/** The curriculum a class inherits, each row flagged with whether the class already teaches it. */
export function useClassCurriculum(classId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['academics', 'classes', classId, 'curriculum', scopeKey(scope)],
    queryFn: () =>
      client.get<ClassCurriculumRow[]>(`/portal/academics/classes/${classId}/curriculum`, scope),
    enabled: !!classId,
  });
}

export function useApplyCurriculum(classId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { programmeSubjectIds?: string[] } = {}) =>
      client.post<{ added: number; subjects: string[] }>(
        `/portal/academics/classes/${classId}/curriculum/apply`,
        scope,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academics', 'classes', classId] });
      qc.invalidateQueries({ queryKey: ['academics', 'classes'] });
    },
  });
}

// --- class roster (bulk student ↔ class) -------------------------------------

export function useRosterCandidates(
  classId: string | null,
  opts: { search?: string; includeAssigned?: boolean } = {},
) {
  const client = usePortalClient();
  const { scope } = useScope();
  const sp = new URLSearchParams();
  if (opts.search) sp.set('search', opts.search);
  if (opts.includeAssigned) sp.set('includeAssigned', 'true');
  const qs = sp.toString();
  return useQuery({
    queryKey: ['academics', 'classes', classId, 'roster-candidates', scopeKey(scope), qs],
    queryFn: () =>
      client.get<RosterCandidate[]>(
        `/portal/academics/classes/${classId}/roster/candidates${qs ? `?${qs}` : ''}`,
        scope,
      ),
    enabled: !!classId,
    placeholderData: keepPreviousData,
  });
}

/** Bulk add/remove students on a class. Invalidates the roster, candidates and class counts. */
export function useClassRosterMutation(classId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { add?: string[]; remove?: string[] }) =>
      client.patch<{ added: number; removed: number }>(
        `/portal/academics/classes/${classId}/roster`,
        scope,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['academics', 'classes'] });
      qc.invalidateQueries({ queryKey: ['class-roster'] });
      qc.invalidateQueries({ queryKey: ['people'] });
    },
  });
}

export type {
  AcademicYearRow,
  ClassCurriculumRow,
  ClassRow,
  ClassSubjectRow,
  DepartmentRow,
  GradeLevelRow,
  ProgrammeSubjectRow,
  RosterCandidate,
  SubjectRow,
} from './academics-types';
