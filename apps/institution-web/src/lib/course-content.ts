'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

function queryString(p: ListParams & { contextType?: string; contextId?: string }): string {
  const sp = new URLSearchParams();
  sp.set('page', String(p.page));
  sp.set('pageSize', String(p.pageSize));
  sp.set('sortDir', p.sortDir);
  if (p.sortBy) sp.set('sortBy', p.sortBy);
  if (p.search) sp.set('search', p.search);
  if (p.contextType) sp.set('contextType', p.contextType);
  if (p.contextId) sp.set('contextId', p.contextId);
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
  title: string;
  description: string | null;
  kindLabel: string;
  weekNo: number | null;
  createdAt: string;
}

export function useStreamPosts(contextType: 'class' | 'course', contextId: string | undefined) {
  const client = usePortalClient();
  const { scope } = useScope();
  const params = { page: 1, pageSize: 50, sortDir: 'desc' as const, contextType, contextId };
  return useQuery({
    queryKey: ['course-content', 'stream', scopeKey(scope), contextType, contextId],
    queryFn: () =>
      client.get<{ items: StreamPostRow[]; total: number }>(
        `/portal/course-content/stream?${queryString(params)}`,
        scope,
      ),
    enabled: !!contextId,
    placeholderData: keepPreviousData,
  });
}

export function useClassMaterials(contextType: 'class' | 'course', contextId: string | undefined) {
  const client = usePortalClient();
  const { scope } = useScope();
  const params = { page: 1, pageSize: 50, sortDir: 'desc' as const, contextType, contextId };
  return useQuery({
    queryKey: ['course-content', 'materials', scopeKey(scope), contextType, contextId],
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
  const invalidate = () => qc.invalidateQueries({ queryKey: ['course-content'] });
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

export function useMaterialMutations() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['course-content'] });
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post('/portal/course-content/materials', scope, body),
    onSuccess: invalidate,
  });
}
