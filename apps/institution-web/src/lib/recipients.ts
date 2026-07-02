'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';

/** A recipient target: a kind + optional anchor id (mirror of the API's target spec). */
export interface Target {
  kind: string;
  refId?: string | null;
}

/** A target resolved to a human label (returned inside announcements + groups). */
export interface DescribedTarget {
  kind: string;
  refId: string | null;
  label: string;
}

/** Result of previewing a target list: how many people + a few sample names + a summary line. */
export interface RecipientPreview {
  studentIds: string[];
  parentIds: string[];
  teacherIds: string[];
  staffIds: string[];
  count: number;
  byKind: { students: number; parents: number; teachers: number; staff: number };
  sample: string[];
  summary: string;
}

export interface RecipientGroupRow {
  id: string;
  name: string;
  description: string | null;
  version: number;
  members: DescribedTarget[];
}

interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

/**
 * Live recipient preview: resolves a target list to a count + sample, scoped to the active campus.
 * Modeled as a query (keyed on the targets) so it caches + refetches as the selection changes; the
 * endpoint is a POST but idempotent (reads only).
 */
export function useRecipientPreview(targets: Target[], enabled = true) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['recipients', 'preview', scopeKey(scope), targets],
    queryFn: () => client.post<RecipientPreview>('/portal/recipients/preview', scope, { targets }),
    enabled: enabled && targets.length > 0,
    placeholderData: keepPreviousData,
  });
}

/** Saved recipient groups (with resolved member labels). */
export function useRecipientGroups() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['recipients', 'groups', scopeKey(scope)],
    queryFn: () => client.get<Paged<RecipientGroupRow>>('/portal/recipient-groups?pageSize=100', scope),
  });
}

export function useRecipientGroupMutations() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['recipients', 'groups'] });
  const create = useMutation({
    mutationFn: (body: { name: string; description?: string | null; members: Target[] }) =>
      client.post('/portal/recipient-groups', scope, body),
    onSuccess: invalidate,
  });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      client.patch(`/portal/recipient-groups/${id}`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) =>
      client.del(`/portal/recipient-groups/${id}`, scope, { version }),
    onSuccess: invalidate,
  });
  return { create, update, remove };
}
