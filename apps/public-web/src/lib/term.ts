import {
  NOMENCLATURE_PRESETS,
  type InstitutionType,
  type ResolvedNomenclature,
  type TermKey,
} from '@edrion/shared-types';

/** Client-side term labels from institution type or API-provided nomenclature. */
export function termsFor(
  type: InstitutionType | string | undefined,
  nomenclature?: ResolvedNomenclature,
) {
  const map = nomenclature ?? NOMENCLATURE_PRESETS[(type as InstitutionType) ?? 'school'] ?? NOMENCLATURE_PRESETS.school;
  return {
    t: (key: TermKey) => map[key]?.singular ?? key,
    tp: (key: TermKey) => map[key]?.plural ?? key,
    map,
  };
}
