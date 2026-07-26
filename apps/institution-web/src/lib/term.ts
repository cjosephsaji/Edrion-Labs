'use client';
import { useMemo } from 'react';
import {
  NOMENCLATURE_PRESETS,
  type InstitutionType,
  type TermKey,
} from '@edrion/shared-types';
import { usePortalMe } from './hooks';

/**
 * Institution-type-aware labels (Years vs Grades, Programmes vs Departments, etc.).
 * Uses /portal/me — nomenclature and institution type are included for every signed-in user,
 * so this never calls the settings API (which needs institution_settings.view).
 */
export function useTerm() {
  const { data: me } = usePortalMe();

  return useMemo(() => {
    const type = (me?.institutionType ?? 'school') as InstitutionType;
    const map = me?.nomenclature ?? NOMENCLATURE_PRESETS[type] ?? NOMENCLATURE_PRESETS.school;

    function t(key: TermKey): string {
      return map[key]?.singular ?? key;
    }
    function tp(key: TermKey): string {
      return map[key]?.plural ?? key;
    }

    return { t, tp, type, map };
  }, [me?.institutionType, me?.nomenclature]);
}
