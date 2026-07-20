'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';

export type RequestStatus =
  | 'submitted'
  | 'in_review'
  | 'needs_info'
  | 'approved'
  | 'rejected'
  | 'fulfilled'
  | 'cancelled'
  | 'expired';

export interface RequestEvent {
  id: string;
  seq: number;
  eventType: string;
  actorKind: 'student' | 'staff' | 'system';
  actorRole: string | null;
  note: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface PortalRequest {
  id: string;
  humanCode: string;
  type: string;
  typeLabel: string;
  category: string;
  summary: string;
  studentName?: string;
  payload: Record<string, unknown>;
  attachments: Array<{ storage_object_id: string; filename: string; mime: string; bytes: number }>;
  status: RequestStatus;
  assignedRole: string;
  assignedUserId: string | null;
  decisionNote: string | null;
  needsInfoQuestion: string | null;
  submittedAt: string;
  slaDueAt: string | null;
  slaBreached: boolean;
  version: number;
  producesDocument: boolean;
  canCancel: boolean;
  events?: RequestEvent[];
  context?: Record<string, unknown>;
}

export interface IssuanceItem {
  vault: { id: string; title: string; docType: string; issuedAt: string; revokedAt: string | null } | null;
  request: PortalRequest;
  render: { id: string; status: string; storagePath: string | null; errorDetail: string | null } | null;
  studentName: string;
}

const scopeKey = (scope: InstitutionScope) =>
  scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';

export function usePortalRequests(filters: { status?: string; type?: string; sla?: boolean; mine?: boolean }, enabled = true) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qs = new URLSearchParams({ limit: '50' });
  if (filters.status) qs.set('status', filters.status);
  if (filters.type) qs.set('type', filters.type);
  if (filters.sla) qs.set('sla', 'breached');
  if (filters.mine) qs.set('mine', 'true');
  return useQuery({
    queryKey: ['requests', 'inbox', scopeKey(scope), filters],
    queryFn: () => client.get<{ items: PortalRequest[]; nextCursor: string | null }>(`/portal/requests?${qs}`, scope),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
    enabled,
  });
}

export function usePortalRequest(id: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['requests', 'detail', scopeKey(scope), id],
    queryFn: () => client.get<PortalRequest>(`/portal/requests/${id}`, scope),
    enabled: Boolean(id),
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
}

export function useRequestAction() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: Record<string, unknown> }) =>
      client.post<PortalRequest>(`/portal/requests/${id}/${action}`, scope, body ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}

export function useIssuance() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['requests', 'issuance', scopeKey(scope)],
    queryFn: () => client.get<{ items: IssuanceItem[]; issued: IssuanceItem[] }>('/portal/requests/issuance', scope),
    staleTime: 0,
    refetchOnWindowFocus: true,
  });
}

export function useIssuanceAction() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ vaultId, action, body }: { vaultId: string; action: 'deliver' | 'send-back' | 'revoke'; body?: Record<string, unknown> }) =>
      client.post(`/portal/requests/issuance/${vaultId}/${action}`, scope, body ?? {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}

export function useRetryIssuanceRender() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (renderId: string) => client.post(`/portal/requests/issuance/render/${renderId}/retry`, scope, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['requests'] }),
  });
}

export interface RequestTypeOverride {
  id: string;
  typeKey: string;
  enabled: boolean;
  routingRoleOverride: string | null;
  slaDaysOverride: number | null;
  labelOverride: string | null;
  version: number;
}

export interface BaseRequestType {
  key: string;
  label: string;
  category: string;
  slaDays: number;
  enabled: boolean;
}

export function useRequestTypeConfig() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['request-type-config', scopeKey(scope)],
    queryFn: () => client.get<{ baseTypes: BaseRequestType[]; overrides: { items: RequestTypeOverride[] } }>('/portal/request-type-config?page=1&pageSize=50&sortDir=asc', scope),
  });
}

export function useRequestTypeConfigMutation() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id?: string; body: Record<string, unknown> }) =>
      input.id
        ? client.patch(`/portal/request-type-config/${input.id}`, scope, input.body)
        : client.post('/portal/request-type-config', scope, input.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['request-type-config'] }),
  });
}
