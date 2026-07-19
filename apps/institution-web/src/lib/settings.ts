'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EffectiveSettings, EffectiveSettingsResponse, InstitutionProfile, NavigationLayout, NomenclatureOverrides, UpdateInstitutionProfileInput } from '@edrion/ui';
import { makeCrudHooks } from './admin';
import { usePortalMe } from './hooks';
import { usePermissions } from './permissions';
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
  const { can, ready } = usePermissions();
  return useQuery({
    queryKey: ['settings', 'effective', scopeKey(scope)],
    queryFn: () => client.get<EffectiveSettingsResponse>('/portal/settings/effective', scope),
    staleTime: 60_000,
    enabled: ready && can('institution_settings.view'),
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
  const { can, ready } = usePermissions();
  return useQuery({
    queryKey: ['settings', 'profile'],
    queryFn: () => client.get<InstitutionProfile>('/portal/settings/profile', scope),
    staleTime: 60_000,
    enabled: ready && can('institution_settings.view'),
  });
}

/**
 * ISO country for phone-input defaults. Prefers the editable profile (if the user can load it),
 * then falls back to `/portal/me` so onboarding and staff forms work before settings loads and
 * for users without `institution_settings.view`.
 */
export function useInstitutionCountry(): string | undefined {
  const { data: profile } = useInstitutionProfile();
  const { data: me } = usePortalMe();
  const code = (profile?.country ?? me?.institutionCountry)?.trim().toUpperCase();
  return code || undefined;
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'effective'] });
      // Nomenclature is embedded in /portal/me — refresh so labels update everywhere immediately.
      qc.invalidateQueries({ queryKey: ['portal', 'me'] });
    },
  });
}

export function useSaveNavigationLayout() {
  const client = usePortalClient();
  const { scope } = useScope();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (layout: NavigationLayout) =>
      client.post<EffectiveSettingsResponse>('/portal/settings/navigation', scope, { layout }),
    onSuccess: async (data) => {
      // Patch caches immediately, then await /portal/me refetch so the sidebar can't race
      // a stale response without navigation.
      qc.setQueryData(['settings', 'effective', scopeKey(scope)], data);
      qc.setQueryData(['portal', 'me'], (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        return {
          ...(old as Record<string, unknown>),
          navigation: data.navigation,
          nomenclature: data.nomenclature,
        };
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['settings', 'effective'] }),
        qc.invalidateQueries({ queryKey: ['portal', 'me'] }),
      ]);
    },
  });
}
