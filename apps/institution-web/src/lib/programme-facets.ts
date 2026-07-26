'use client';
import { useEffect, useMemo, useState } from 'react';
import type { FilterDef } from '@/components/academics/resource-manager';
import {
  useDepartmentOptions,
  useProgrammeLevelOptions,
  useTermOptionsByProgrammeLevel,
} from './academics';
import { useTerm } from './term';

const PROGRAMME_INSTITUTION_TYPES = new Set(['college', 'university', 'training_center']);

/**
 * Cascading Programme → Year → Term toolbar facets for college/university/training institutions
 * that have programme-structure links. Returns empty filters for schools or when no links exist.
 */
export function useProgrammeFacetFilters() {
  const { tp, t, type } = useTerm();
  const { data: allLevels } = useProgrammeLevelOptions();
  const hasProgrammeLinks = (allLevels?.items?.length ?? 0) > 0;
  const showFacets = PROGRAMME_INSTITUTION_TYPES.has(type) && hasProgrammeLinks;

  const { data: departments } = useDepartmentOptions();
  const [departmentId, setDepartmentId] = useState('');
  const [programmeLevelId, setProgrammeLevelId] = useState('');
  const [termId, setTermId] = useState('');

  const { data: programmeLevels } = useProgrammeLevelOptions(departmentId || undefined);
  const { data: terms } = useTermOptionsByProgrammeLevel(programmeLevelId || undefined);
  const { data: allTerms } = useTermOptionsByProgrammeLevel();

  useEffect(() => {
    setProgrammeLevelId('');
    setTermId('');
  }, [departmentId]);

  useEffect(() => {
    setTermId('');
  }, [programmeLevelId]);

  const filters = useMemo<FilterDef[]>(() => {
    if (!showFacets) return [];
    const deptOpts = (departments?.items ?? []).map((d) => ({ value: d.id, label: d.name }));
    const levelOpts = (programmeLevels?.items ?? []).map((l) => ({
      value: l.id,
      label: l.gradeLevelName ?? l.durationLabel ?? t('gradeLevel'),
    }));
    const termOpts = (terms?.items ?? []).map((t) => ({ value: t.id, label: t.name }));
    return [
      { key: 'departmentId', label: `All ${tp('department')}`, options: deptOpts },
      { key: 'programmeLevelId', label: `All ${tp('gradeLevel')}`, options: levelOpts },
      { key: 'termId', label: `All ${tp('term')}`, options: termOpts },
    ];
  }, [showFacets, departments, programmeLevels, terms, tp, t]);

  const filterValues = useMemo(
    () => ({
      departmentId,
      programmeLevelId,
      termId,
    }),
    [departmentId, programmeLevelId, termId],
  );

  function onFilterChange(key: string, value: string) {
    if (key === 'departmentId') setDepartmentId(value);
    else if (key === 'programmeLevelId') setProgrammeLevelId(value);
    else if (key === 'termId') setTermId(value);
  }

  const termOptions = useMemo(
    () =>
      (programmeLevelId ? (terms?.items ?? []) : (allTerms?.items ?? [])).map((t) => ({
        value: t.id,
        label: t.name,
      })),
    [programmeLevelId, terms, allTerms],
  );

  const classFilters = useMemo(
    () => ({
      ...(departmentId ? { departmentId } : {}),
      ...(programmeLevelId ? { programmeLevelId } : {}),
      ...(termId ? { termId } : {}),
    }),
    [departmentId, programmeLevelId, termId],
  );

  return {
    showFacets,
    filters,
    filterValues,
    onFilterChange,
    termOptions,
    classFilters,
  };
}
