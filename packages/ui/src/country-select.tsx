'use client';
import { useMemo } from 'react';
import { COUNTRY_OPTIONS } from '@edrion/schemas';
import { Combobox, type ComboboxOption } from './combobox';

export interface CountrySelectProps {
  /** Stored ISO 3166-1 alpha-2 code. */
  value: string | null | undefined;
  onChange: (iso2: string) => void;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** Show the flag emoji as a leading glyph (off by default — emoji rendering varies). */
  showFlag?: boolean;
  /** Show the ISO code on the right of each row (and on the trigger). */
  showCode?: boolean;
  className?: string;
}

/**
 * Searchable country selector. Stores the ISO 3166-1 alpha-2 code; the display name
 * is always derived from the centralized reference data. Searchable by name, ISO2,
 * ISO3, native name, and calling code.
 */
export function CountrySelect({ showFlag, showCode, ...props }: CountrySelectProps) {
  const options = useMemo<ComboboxOption[]>(
    () =>
      COUNTRY_OPTIONS.map((c) => ({
        value: c.iso2,
        label: c.name,
        hint: showCode ? c.iso2 : undefined,
        leading: showFlag && c.flag ? <span aria-hidden>{c.flag}</span> : undefined,
        keywords: [c.iso2, c.iso3, c.nativeName ?? '', c.callingCode ? `+${c.callingCode}` : ''],
      })),
    [showFlag, showCode],
  );

  return (
    <Combobox
      {...props}
      options={options}
      placeholder={props.placeholder ?? 'Select a country…'}
      searchPlaceholder="Search countries…"
      emptyText="No matching country"
    />
  );
}
