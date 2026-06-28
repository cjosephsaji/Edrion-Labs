'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { LibraryLoanRow, Paged } from './library-types';

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

/** Scope-aware, server-paginated library list. `resource` is the path segment ("library/books"). */
export function useLibraryList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['library', resource, scopeKey(scope), params],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(params)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for a library resource (books). */
export function useLibraryMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['library'] });

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

// --- loans (against a book; the issue→return bridge) -------------------------

export function useBookLoans(bookId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['library', 'books', bookId, 'loans', scopeKey(scope)],
    queryFn: () => client.get<LibraryLoanRow[]>(`/portal/library/books/${bookId}/loans`, scope),
    enabled: !!bookId,
  });
}

export function useBookLoanMutations(bookId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['library', 'books', bookId, 'loans'] });
    qc.invalidateQueries({ queryKey: ['library'] });
  };

  const issue = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post(`/portal/library/books/${bookId}/loans`, scope, body),
    onSuccess: invalidate,
  });
  const returnLoan = useMutation({
    mutationFn: ({ loanId, body }: { loanId: string; body: Record<string, unknown> }) =>
      client.post(`/portal/library/books/${bookId}/loans/${loanId}/return`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (loanId: string) =>
      client.del(`/portal/library/books/${bookId}/loans/${loanId}`, scope),
    onSuccess: invalidate,
  });
  return { issue, returnLoan, remove };
}

export type { LibraryBookRow, LibraryLoanRow } from './library-types';
