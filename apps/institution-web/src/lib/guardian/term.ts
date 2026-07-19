'use client';
import { NOMENCLATURE_PRESETS, type TermKey } from '@edrion/shared-types';
import { useMe } from './hooks';

/** Institution-type-aware labels for the guardian view (from GET /parent/me). */
export function useTerm() {
  const { data } = useMe();
  const map = data?.institution?.nomenclature ?? NOMENCLATURE_PRESETS.school;

  function t(key: TermKey): string {
    return map[key]?.singular ?? key;
  }
  function tp(key: TermKey): string {
    return map[key]?.plural ?? key;
  }

  return { t, tp, type: data?.institution?.type ?? 'school', map };
}
