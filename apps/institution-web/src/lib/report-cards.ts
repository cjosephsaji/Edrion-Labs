'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import { useAcademicScopedParams } from './academic-context';
import type { Paged, ReportCardEntryRow, ReportCardRow } from './report-cards-types';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

export function useReportCardsList(_resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  const scoped = useAcademicScopedParams(params, params.academicScope ?? 'year');
  const { academicScope: _as, ...listParams } = scoped;
  return useQuery({
    queryKey: ['report-cards', scopeKey(scope), listParams],
    queryFn: async () => {
      const sp = new URLSearchParams();
      if (listParams.filters?.status) sp.set('status', listParams.filters.status);
      if (listParams.filters?.studentId) sp.set('studentId', listParams.filters.studentId);
      if (listParams.filters?.academicYearId) sp.set('academicYearId', listParams.filters.academicYearId);
      if (listParams.filters?.termId) sp.set('termId', listParams.filters.termId);
      const rows = await client.get<ReportCardRow[]>(`/portal/report-cards?${sp}`, scope);
      let items = [...rows];
      if (listParams.search) {
        const q = listParams.search.toLowerCase();
        items = items.filter((r) => r.termLabel.toLowerCase().includes(q));
      }
      const total = items.length;
      const start = (listParams.page - 1) * listParams.pageSize;
      return { items: items.slice(start, start + listParams.pageSize), total } satisfies Paged<ReportCardRow>;
    },
    placeholderData: keepPreviousData,
  });
}

export function useReportCardsMutations(_resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['report-cards'] });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      const payload = {
        studentId: body.studentId ? String(body.studentId) : undefined,
        classId: body.classId ? String(body.classId) : undefined,
        termId: body.termId ? String(body.termId) : undefined,
        termLabel: String(body.termLabel),
        kind: (body.kind as 'uploaded_pdf' | 'structured') ?? 'structured',
        academicYearId: body.academicYearId ? String(body.academicYearId) : undefined,
      };
      return client.post('/portal/report-cards', scope, payload);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async (_args: { id: string; body: Record<string, unknown> }) => {
      throw new Error('Edit report card metadata via create/supersede.');
    },
  });

  const remove = useMutation({
    mutationFn: async (_args: { id: string; version: number }) => {
      throw new Error('Report cards cannot be deleted.');
    },
  });

  return { create, update, remove };
}

export function useReportCardEntries(reportCardId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['report-cards', reportCardId, 'entries', scopeKey(scope)],
    queryFn: () => client.get<ReportCardEntryRow[]>(`/portal/report-cards/${reportCardId}/entries`, scope),
    enabled: !!reportCardId,
  });
}

export function useUpsertReportCardEntries(reportCardId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      entries: {
        subjectLabel: string;
        marks: number;
        maxMarks: number;
        gradeLetter?: string;
        sequence?: number;
      }[];
    }) =>
      client.put(`/portal/report-cards/${reportCardId}/entries`, scope, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['report-cards'] });
      qc.invalidateQueries({ queryKey: ['report-cards', reportCardId, 'entries'] });
    },
  });
}

export function useSubmitReportCardReview() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post(`/portal/report-cards/${id}/submit-review`, scope, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-cards'] }),
  });
}

export function usePublishReportCard() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post(`/portal/report-cards/${id}/publish`, scope, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['report-cards'] }),
  });
}
