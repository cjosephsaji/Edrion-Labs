'use client';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';
import type { ListParams } from './academics';
import type { Paged } from './academics-types';

/**
 * Phase-13 functional-staff module data hooks. Each new area gets a scope-aware list +
 * create/update/delete hook pair bound to a query namespace, exactly like announcements.ts. The
 * `resource` passed in is the path after /portal (e.g. "health/records"); the API is authoritative.
 */
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

const health = makeResourceHooks('health');
export const useHealthList = health.useList;
export const useHealthMutations = health.useMutations;

const counseling = makeResourceHooks('counseling');
export const useCounselingList = counseling.useList;
export const useCounselingMutations = counseling.useMutations;

const labs = makeResourceHooks('labs');
export const useLabsList = labs.useList;
export const useLabsMutations = labs.useMutations;

const frontDesk = makeResourceHooks('front-desk');
export const useFrontDeskList = frontDesk.useList;
export const useFrontDeskMutations = frontDesk.useMutations;

const facilities = makeResourceHooks('facilities');
export const useFacilitiesList = facilities.useList;
export const useFacilitiesMutations = facilities.useMutations;

const security = makeResourceHooks('security');
export const useSecurityList = security.useList;
export const useSecurityMutations = security.useMutations;

const it = makeResourceHooks('it');
export const useItList = it.useList;
export const useItMutations = it.useMutations;
