'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

function queryString(
  p: ListParams & {
    contextType?: string;
    contextId?: string;
    contextIds?: string[];
    subjectId?: string;
    includeUnfiled?: boolean;
  },
): string {
  const sp = new URLSearchParams();
  sp.set('page', String(p.page));
  sp.set('pageSize', String(p.pageSize));
  sp.set('sortDir', p.sortDir);
  if (p.sortBy) sp.set('sortBy', p.sortBy);
  if (p.search) sp.set('search', p.search);
  if (p.contextType) sp.set('contextType', p.contextType);
  if (p.contextId) sp.set('contextId', p.contextId);
  if (p.subjectId) sp.set('subjectId', p.subjectId);
  if (p.includeUnfiled) sp.set('includeUnfiled', 'true');
  if (p.contextIds?.length) sp.set('contextIds', p.contextIds.join(','));
  return sp.toString();
}

export interface StreamPostRow {
  id: string;
  version: number;
  kind: string;
  title: string | null;
  body: string | null;
  topicKey: string | null;
  requiresAck: boolean;
  postedAt: string;
}

export interface ClassMaterialRow {
  id: string;
  version: number;
  subjectId: string | null;
  title: string;
  description: string | null;
  kindLabel: string;
  weekNo: number | null;
  createdAt: string;
}

export function useStreamPosts(
  contextType: 'class' | 'course',
  contextId: string | undefined,
  subjectId?: string,
  contextIds?: string[],
) {
  const client = usePortalClient();
  const { scope } = useScope();
  const params = { page: 1, pageSize: 50, sortDir: 'desc' as const, contextType, contextId, contextIds, subjectId, includeUnfiled: true };
  return useQuery({
    queryKey: ['course-content', 'stream', scopeKey(scope), contextType, contextId, subjectId, contextIds?.join(',')],
    queryFn: () =>
      client.get<{ items: StreamPostRow[]; total: number }>(
        `/portal/course-content/stream?${queryString(params)}`,
        scope,
      ),
    enabled: !!contextId,
    placeholderData: keepPreviousData,
  });
}

export function useClassMaterials(
  contextType: 'class' | 'course',
  contextId: string | undefined,
  subjectId?: string,
  contextIds?: string[],
) {
  const client = usePortalClient();
  const { scope } = useScope();
  const params = { page: 1, pageSize: 50, sortDir: 'desc' as const, contextType, contextId, contextIds, subjectId, includeUnfiled: true };
  return useQuery({
    queryKey: ['course-content', 'materials', scopeKey(scope), contextType, contextId, subjectId, contextIds?.join(',')],
    queryFn: () =>
      client.get<{ items: ClassMaterialRow[]; total: number }>(
        `/portal/course-content/materials?${queryString(params)}`,
        scope,
      ),
    enabled: !!contextId,
    placeholderData: keepPreviousData,
  });
}

export function useStreamMutations() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['course-content'] });
    void qc.invalidateQueries({ queryKey: ['teaching'] });
  };
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post('/portal/course-content/stream', scope, body),
    onSuccess: invalidate,
  });
}

export function useUploadClassMaterial() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useMutation({
    mutationFn: (file: File) =>
      client.upload<{ id: string; filename: string }>(
        `/portal/course-content/materials/upload?filename=${encodeURIComponent(file.name)}`,
        scope,
        file,
      ),
  });
}

export function useDeleteMaterial() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/course-content/materials/${id}`, scope, { version }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['course-content'] });
      void qc.invalidateQueries({ queryKey: ['teaching'] });
    },
  });
}

export function useMaterialMutations() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['course-content'] });
    void qc.invalidateQueries({ queryKey: ['teaching'] });
  };
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post('/portal/course-content/materials', scope, body),
    onSuccess: invalidate,
  });
}

export interface ClassNoteRow {
  id: string;
  version: number;
  subjectId: string | null;
  title: string;
  summary: string | null;
  body: string;
  topicKey: string | null;
  weekNo: number | null;
  status: 'draft' | 'published' | 'archived';
  publishedAt: string | null;
  updatedAt: string;
}

export function useClassNotes(
  contextType: 'class' | 'course',
  contextId: string | undefined,
  subjectId?: string,
  contextIds?: string[],
) {
  const client = usePortalClient();
  const { scope } = useScope();
  const params = { page: 1, pageSize: 50, sortDir: 'desc' as const, sortBy: 'updatedAt', contextType, contextId, contextIds, subjectId, includeUnfiled: true };
  return useQuery({
    queryKey: ['course-content', 'notes', scopeKey(scope), contextType, contextId, subjectId, contextIds?.join(',')],
    queryFn: () =>
      client.get<{ items: ClassNoteRow[]; total: number }>(
        `/portal/course-content/notes?${queryString(params)}`,
        scope,
      ),
    enabled: !!contextId,
    placeholderData: keepPreviousData,
  });
}

export function useNoteMutations() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['course-content'] });
    void qc.invalidateQueries({ queryKey: ['teaching'] });
  };

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post('/portal/course-content/notes', scope, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Record<string, unknown>) =>
      client.patch(`/portal/course-content/notes/${id}`, scope, body),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, ...body }: { id: string; version: number; status: ClassNoteRow['status'] }) =>
      client.post(`/portal/course-content/notes/${id}/status`, scope, body),
    onSuccess: invalidate,
  });

  return { create, update, setStatus };
}
