'use client';
import { useQuery } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';

export type AttentionSeverity = 'high' | 'medium' | 'low';

export interface AttentionItem {
  id: string;
  title: string;
  subtitle?: string | null;
  severity: AttentionSeverity;
  meta?: Record<string, unknown>;
}

export interface AttentionCategory {
  key: string;
  label: string;
  description: string;
  /** ok = real signals; not_yet_available = analytics placeholder; no_access = caller lacks permission. */
  status: 'ok' | 'not_yet_available' | 'no_access';
  count: number;
  items: AttentionItem[];
  message?: string;
}

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

/** The Attention / Command Centre payload: categories of things needing action, scope-aware. */
export function useAttention() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['attention', scopeKey(scope)],
    queryFn: () => client.get<{ categories: AttentionCategory[] }>('/portal/attention', scope),
    refetchInterval: 60000,
  });
}
