'use client';
import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { TIMEZONE_OPTIONS, timezonesForCountry, detectBrowserTimezone } from '@edrion/schemas';
import { Combobox, type ComboboxOption } from './combobox';

export interface TimezoneSelectProps {
  /** Stored IANA identifier, e.g. "Asia/Kolkata". */
  value: string | null | undefined;
  onChange: (tz: string) => void;
  /** Prioritise this country's zones at the top of the list. */
  countryCode?: string | null;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  id?: string;
  name?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  /** Offer the browser-detected zone as a one-click suggestion when empty. */
  suggestDetected?: boolean;
  className?: string;
}

/**
 * Searchable IANA timezone selector. Stores canonical identifiers (never abbreviations
 * or fixed offsets), is searchable by city/region/identifier/offset, and shows
 * DST-aware current offsets. Country zones are prioritised when a country is given.
 * Detection is offered only as a suggestion — it never silently overwrites a value.
 */
export function TimezoneSelect({
  countryCode,
  suggestDetected,
  value,
  onChange,
  ...props
}: TimezoneSelectProps) {
  const options = useMemo<ComboboxOption[]>(() => {
    const priority = countryCode ? timezonesForCountry(countryCode) : [];
    const prioritySet = new Set(priority.map((p) => p.value));
    const ordered = [...priority, ...TIMEZONE_OPTIONS.filter((t) => !prioritySet.has(t.value))];
    return ordered.map((t) => ({
      value: t.value,
      label: t.label,
      hint: t.offsetLabel,
      keywords: [t.value, t.offsetLabel, ...t.mainCities, ...t.countryCodes],
    }));
  }, [countryCode]);

  const detected = useMemo(
    () => (suggestDetected && !value ? detectBrowserTimezone() : null),
    [suggestDetected, value],
  );

  return (
    <div className="space-y-1.5">
      <Combobox
        {...props}
        value={value}
        onChange={onChange}
        options={options}
        placeholder={props.placeholder ?? 'Select a timezone…'}
        searchPlaceholder="Search city, region or offset…"
        emptyText="No matching timezone"
      />
      {detected && (
        <button
          type="button"
          onClick={() => onChange(detected)}
          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
        >
          <Clock className="h-3.5 w-3.5" aria-hidden />
          Use detected timezone: {detected}
        </button>
      )}
    </div>
  );
}
