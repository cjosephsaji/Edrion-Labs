'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { Paged } from './announcements-types';

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

/** Build a scope-aware list + create/update/delete hook pair bound to one query namespace. */
function makeResourceHooks(ns: string) {
  function useList<T>(resource: string, params: ListParams) {
    const client = usePortalClient();
    const { scope } = useScope();
    return useQuery({
      queryKey: [ns, resource, scopeKey(scope), params],
      queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
      placeholderData: keepPreviousData,
    });
  }
  function useMutations(resource: string) {
    const client = usePortalClient();
    const { scope } = useScope();
    const qc = useQueryClient();
    const invalidate = () => qc.invalidateQueries({ queryKey: [ns] });
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
  return { useList, useMutations };
}

// --- announcements -----------------------------------------------------------

const announcements = makeResourceHooks('announcements');
export const useAnnouncementsList = announcements.useList;
export const useAnnouncementsMutations = announcements.useMutations;

/** Publish a draft announcement (fans out a notification on the server). */
export function usePublishAnnouncement() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post(`/portal/announcements/${id}/publish`, scope, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['announcements'] });
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// --- notifications -----------------------------------------------------------

const notifications = makeResourceHooks('notifications');
export const useNotificationsList = notifications.useList;
export const useNotificationsMutations = notifications.useMutations;

/** Mark a notification read. */
export function useMarkNotificationRead() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => client.post(`/portal/notifications/${id}/read`, scope, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export type { AnnouncementRow, NotificationRow } from './announcements-types';
