'use client';
import { useMemo } from 'react';
import {
  NOMENCLATURE_PRESETS,
  type InstitutionType,
  type TermKey,
} from '@edrion/shared-types';
import { useEffectiveSettings, useInstitutionProfile } from './settings';

/**
 * Institution-type-aware labels (Years vs Grades, Programmes vs Departments, etc.).
 * Reads resolved nomenclature from effective settings; falls back to the type preset.
 */
export function useTerm() {
  const { data: settings } = useEffectiveSettings();
  const { data: profile } = useInstitutionProfile();

  return useMemo(() => {
    const type = (profile?.type ?? 'school') as InstitutionType;
    const map = settings?.nomenclature ?? NOMENCLATURE_PRESETS[type] ?? NOMENCLATURE_PRESETS.school;

    function t(key: TermKey): string {
      return map[key]?.singular ?? key;
    }
    function tp(key: TermKey): string {
      return map[key]?.plural ?? key;
    }

    return { t, tp, type, map };
  }, [settings?.nomenclature, profile?.type]);
}
