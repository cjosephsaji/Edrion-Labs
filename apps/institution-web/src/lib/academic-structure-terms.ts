'use client';
import { NOMENCLATURE_PRESETS } from '@edrion/shared-types';
import { useTerm } from './term';

/** A structure's root is a course/programme, even when staff belong to departments/faculties. */
export function useAcademicStructureTerms() {
  const terms = useTerm();
  const defaultUnit =
    terms.type === 'school' || terms.type === 'training_center' ? 'Course' : 'Programme';
  const preset = NOMENCLATURE_PRESETS[terms.type];
  const unit =
    terms.t('department') === preset.department.singular ? defaultUnit : terms.t('department');
  const units =
    terms.tp('department') === preset.department.plural
      ? `${defaultUnit}s`
      : terms.tp('department');
  return {
    ...terms,
    t: (key: Parameters<typeof terms.t>[0]) => (key === 'department' ? unit : terms.t(key)),
    tp: (key: Parameters<typeof terms.tp>[0]) =>
      key === 'department'
        ? units
        : key === 'programmeStructure' && terms.tp(key) === preset.programmeStructure.plural
          ? `${unit} structures`
          : terms.tp(key),
  };
}
