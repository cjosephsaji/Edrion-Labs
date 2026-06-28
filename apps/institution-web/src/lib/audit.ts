'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import { scopeKey } from './admin';
import type { AuditRow } from './admin-types';
import type { Paged } from './academics-types';

export interface AuditListParams {
  page: number;
  pageSize: number;
  search?: string;
  module?: string;
  result?: string;
  riskLevel?: string;
  from?: string;
  to?: string;
}

function queryString(p: AuditListParams): string {
  const sp = new URLSearchParams();
  sp.set('page', String(p.page));
  sp.set('pageSize', String(p.pageSize));
  if (p.search) sp.set('search', p.search);
  if (p.module) sp.set('module', p.module);
  if (p.result) sp.set('result', p.result);
  if (p.riskLevel) sp.set('riskLevel', p.riskLevel);
  if (p.from) sp.set('from', p.from);
  if (p.to) sp.set('to', p.to);
  return sp.toString();
}

/** Read-only, server-paginated audit feed for the tenant (newest first). */
export function useAuditList(params: AuditListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['audit', scopeKey(scope), params],
    queryFn: () => client.get<Paged<AuditRow>>(`/portal/audit?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Distinct modules + summary counts for the viewer's filters/header. */
export function useAuditFilters() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['audit', 'filters', scopeKey(scope)],
    queryFn: () =>
      client.get<{ modules: string[]; summary: { total: number; failures: number; aiInvolved: number } }>(
        `/portal/audit/filters`,
        scope,
      ),
    staleTime: 60_000,
  });
}

export type { AuditRow } from './admin-types';
