'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import { useAcademicScopedParams } from './academic-context';
import type { FeePaymentRow, FeeStructureRow, Paged } from './fees-types';

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
  if (p.filters) for (const [k, v] of Object.entries(p.filters)) if (v) sp.set(k, v);
  return sp.toString();
}

/** Scope-aware, server-paginated fees list. `resource` is the path segment ("fees/structures"|"fees/invoices"). */
export function useFeesList<T>(resource: string, params: ListParams) {
  const client = usePortalClient();
  const { scope } = useScope();
  const scoped = useAcademicScopedParams(params, params.academicScope ?? 'year');
  const { academicScope: _as, ...listParams } = scoped;
  return useQuery({
    queryKey: ['fees', resource, scopeKey(scope), listParams],
    queryFn: () => client.get<Paged<T>>(`/portal/${resource}?${queryString(listParams)}`, scope),
    placeholderData: keepPreviousData,
  });
}

/** Create / update / delete for a fees resource (structures or invoices). */
export function useFeesMutations(resource: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['fees'] });

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

const OPTION_PARAMS: ListParams = { page: 1, pageSize: 100, sortDir: 'asc', sortBy: 'name' };

/** Fee-structure options for the invoice picker (first 100 in scope). */
export function useFeeStructureOptions() {
  return useFeesList<FeeStructureRow>('fees/structures', OPTION_PARAMS);
}

// --- payments (against an invoice) -------------------------------------------

export function useInvoicePayments(invoiceId: string | null) {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['fees', 'invoices', invoiceId, 'payments', scopeKey(scope)],
    queryFn: () => client.get<FeePaymentRow[]>(`/portal/fees/invoices/${invoiceId}/payments`, scope),
    enabled: !!invoiceId,
  });
}

export function useInvoicePaymentMutations(invoiceId: string) {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['fees', 'invoices', invoiceId, 'payments'] });
    qc.invalidateQueries({ queryKey: ['fees'] });
  };

  const record = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      client.post(`/portal/fees/invoices/${invoiceId}/payments`, scope, body),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (paymentId: string) =>
      client.del(`/portal/fees/invoices/${invoiceId}/payments/${paymentId}`, scope),
    onSuccess: invalidate,
  });
  return { record, remove };
}

export type { FeeInvoiceRow, FeePaymentRow, FeeStructureRow } from './fees-types';
