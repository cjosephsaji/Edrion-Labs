'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { MessagePostRow, Paged } from './messaging-types';

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

/** Scope-aware, server-paginated thread list. `resource` is the path segment ("messages/threads"). */
export function useMessagesList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['messages', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for message threads. */
export function useMessagesMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['messages'] });
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

// --- posts (within a thread) -------------------------------------------------

export function useThreadPosts(threadId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['messages', 'threads', threadId, 'posts', scopeKey(scope)],
    queryFn: () => client.get<MessagePostRow[]>(`/portal/messages/threads/${threadId}/posts`, scope),
    enabled: !!threadId,
  });
}

export function useThreadPostMutations(threadId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['messages', 'threads', threadId, 'posts'] });
    qc.invalidateQueries({ queryKey: ['messages'] });
  };
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => client.post(`/portal/messages/threads/${threadId}/posts`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/messages/threads/${threadId}/posts/${id}`, scope, { version }),
    onSuccess: invalidate,
  });
  return { create, remove };
}

export type { MessageThreadRow, MessagePostRow } from './messaging-types';
