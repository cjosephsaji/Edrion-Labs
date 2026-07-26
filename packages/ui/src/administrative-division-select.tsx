'use client';
import { useEffect, useMemo } from 'react';
import { getSubdivisions, subdivisionBelongsToCountry } from '@edrion/schemas';
import { Combobox, type ComboboxOption } from './combobox';

export interface AdministrativeDivisionSelectProps {
  /** Parent country (ISO 3166-1 alpha-2). The field is disabled until this is set. */
  countryCode: string | null | undefined;
  /** Stored ISO 3166-2 code, e.g. "IN-KL". */
  value: string | null | undefined;
  onChange: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  className?: string;
}

/**
 * Country-aware first-level administrative-division selector. Loads only the selected
 * country's divisions (cached), resets an incompatible value when the country changes,
 * and disables itself when no country is chosen or the country has no divisions.
 */
export function AdministrativeDivisionSelect({
  countryCode,
  value,
  onChange,
  disabled,
  ...props
}: AdministrativeDivisionSelectProps) {
  const subdivisions = useMemo(() => getSubdivisions(countryCode), [countryCode]);

  // Clear a stored value that doesn't belong to the (newly) selected country.
  useEffect(() => {
    if (value && countryCode && !subdivisionBelongsToCountry(value, countryCode)) {
      onChange('');
    }
    // Intentionally keyed on countryCode + value so a country switch re-checks.
  }, [countryCode, value, onChange]);

  const options = useMemo<ComboboxOption[]>(
    () =>
      subdivisions.map((s) => ({
        value: s.code,
        label: s.name,
        hint: s.code,
        keywords: [s.code, s.code.split('-')[1] ?? '', s.type ?? ''],
      })),
    [subdivisions],
  );

  const noCountry = !countryCode;
  const noDivisions = !noCountry && subdivisions.length === 0;

  return (
    <Combobox
      {...props}
      value={value}
      onChange={onChange}
      options={options}
      disabled={disabled || noCountry || noDivisions}
      placeholder={
        noCountry ? 'Select a country first' : noDivisions ? 'Not applicable' : props.placeholder ?? 'Select…'
      }
      searchPlaceholder="Search…"
      emptyText="No matching region"
    />
  );
}
