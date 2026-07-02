'use client';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';

/** One matched record, deep-linked to its module list pre-filtered by the match. */
export interface SearchHit {
  id: string;
  label: string;
  sublabel: string | null;
  href: string;
}

/** A group of hits of one kind (Students, Classes, …). Returned only when the user may view it. */
export interface SearchGroup {
  type: string;
  label: string;
  hits: SearchHit[];
}

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

/**
 * Scope-aware global search over the whole institution (people + academic structure). Fires once
 * the term is at least two characters; the API returns only the groups the user is allowed to see.
 */
export function useGlobalSearch(term: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const q = term.trim();
  return useQuery({
    queryKey: ['portal-search', scopeKey(scope), q],
    queryFn: () => client.get<{ groups: SearchGroup[] }>(`/portal/search?q=${encodeURIComponent(q)}`, scope),
    enabled: q.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}
