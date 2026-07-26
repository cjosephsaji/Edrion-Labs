'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import { useAcademicScopedParams } from './academic-context';
import type { AttendanceRecordRow, AttendanceStatus, Paged } from './attendance-types';

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

/** Scope-aware, server-paginated session (register) list. `resource` = "attendance/sessions". */
export function useAttendanceList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  const scoped = useAcademicScopedParams(params, params.academicScope ?? 'year');
  const { academicScope: _as, ...listParams } = scoped;
  return useQuery({
    queryKey: ['attendance', resource, scopeKey(scope), listParams],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(listParams)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for attendance sessions. */
export function useAttendanceMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['attendance'] });

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

// --- records (per-student marks within a session) ----------------------------

export function useAttendanceRecords(sessionId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['attendance', 'sessions', sessionId, 'records', scopeKey(scope)],
    queryFn: () => client.get<AttendanceRecordRow[]>(`/portal/attendance/sessions/${sessionId}/records`, scope),
    enabled: !!sessionId,
  });
}

export interface MarkInput {
  studentId: string;
  status: AttendanceStatus;
  remarks?: string | null;
}

export function useAttendanceMarkMutations(sessionId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['attendance', 'sessions', sessionId, 'records'] });
    qc.invalidateQueries({ queryKey: ['attendance'] });
  };

  const mark = useMutation({
    mutationFn: (marks: MarkInput[]) =>
      client.post(`/portal/attendance/sessions/${sessionId}/records`, scope, { marks }),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (recordId: string) =>
      client.del(`/portal/attendance/sessions/${sessionId}/records/${recordId}`, scope),
    onSuccess: invalidate,
  });
  return { mark, remove };
}

export function useAttendanceAgenda(params: {
  date?: string;
  scope?: 'mine' | 'all';
  classId?: string;
}) {
  const client = usePortalClient();
  const { scope } = useScope();
  const sp = new URLSearchParams();
  if (params.date) sp.set('date', params.date);
  if (params.scope) sp.set('scope', params.scope);
  if (params.classId) sp.set('classId', params.classId);
  const qs = sp.toString();
  return useQuery({
    queryKey: ['attendance', 'agenda', scopeKey(scope), params],
    queryFn: () =>
      client.get<import('./attendance-types').AttendanceAgendaResponse>(
        `/portal/attendance/agenda${qs ? `?${qs}` : ''}`,
        scope,
      ),
    refetchInterval: 60_000,
  });
}

export function useOpenAttendanceSession() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      slotId?: string;
      classId?: string;
      date: string;
    }) =>
      client.post<import('./attendance-types').OpenAttendanceResult>(
        '/portal/attendance/sessions/open',
        scope,
        body,
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance'] });
    },
  });
}

export type {
  AttendanceRecordRow,
  AttendanceSessionRow,
  AttendanceStatus,
  AttendanceAgendaSlot,
  AttendanceAgendaResponse,
} from './attendance-types';
