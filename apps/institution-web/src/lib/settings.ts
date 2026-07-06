'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EffectiveSettings, EffectiveSettingsResponse, InstitutionProfile, NomenclatureOverrides, UpdateInstitutionProfileInput } from '@edrion/ui';
import { makeCrudHooks } from './admin';
import { usePortalClient } from './portal-client';
import { useScope } from './scope';
import type { InstitutionScope } from './types';

/** Scope-aware CRUD hooks for the legacy institution settings tree (Phase 11; retained for audit). */
export const { useList: useSettingsList, useMutations: useSettingsMutations } = makeCrudHooks('settings');

export type { SettingRow } from './admin-types';

function scopeKey(scope: InstitutionScope): string {
  return scope.mode === 'campus' ? `campus:${scope.campusId}` : 'institution';
}

/** The resolved canonical global settings (registry defaults + stored overrides). */
export function useEffectiveSettings() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['settings', 'effective', scopeKey(scope)],
    queryFn: () => client.get<EffectiveSettingsResponse>('/portal/settings/effective', scope),
    staleTime: 60_000,
  });
}

export function useSaveEffectiveSettings() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: EffectiveSettings) => client.post<EffectiveSettingsResponse>('/portal/settings/effective', scope, { values }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'effective'] }),
  });
}

/** The institution's own editable profile (identity, location, primary contact, derived currency). */
export function useInstitutionProfile() {
  const client = usePortalClient();
  const { scope } = useScope();
  return useQuery({
    queryKey: ['settings', 'profile'],
    queryFn: () => client.get<InstitutionProfile>('/portal/settings/profile', scope),
    staleTime: 60_000,
  });
}

export function useSaveInstitutionProfile() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateInstitutionProfileInput) =>
      client.put<InstitutionProfile>('/portal/settings/profile', scope, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'profile'] });
      // The operating currency is mirrored into finance.currency, so refresh effective settings too.
      qc.invalidateQueries({ queryKey: ['settings', 'effective'] });
    },
  });
}

export function useSaveNomenclatureOverrides() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (overrides: NomenclatureOverrides) =>
      client.post<EffectiveSettingsResponse>('/portal/settings/nomenclature', scope, { overrides }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings', 'effective'] }),
  });
}
