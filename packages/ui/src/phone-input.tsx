'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  COUNTRY_OPTIONS,
  callingCodeForCountry,
  formatAsYouType,
  normalizePhone,
  getCountry,
} from '@edrion/schemas';
import { Combobox, type ComboboxOption } from './combobox';
import { cn } from './cn';

export interface InternationalPhoneInputProps {
  /** Stored value — E.164 when valid (e.g. "+919947273256"). */
  value: string | null | undefined;
  /** Emits E.164 when the number is valid; otherwise emits the raw input so the
   *  form's validation surfaces the error rather than silently dropping it. */
  onChange: (value: string) => void;
  /** Initial / fallback phone country (e.g. the address country). NEVER hard-locked. */
  defaultCountry?: string | null;
  /** Notified whenever the selected phone country changes (for a phoneCountryCode field). */
  onCountryChange?: (iso2: string) => void;
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

const DEFAULT_COUNTRY = 'US';

function nationalFromE164(e164: string, iso2: string): string {
  const cc = callingCodeForCountry(iso2);
  const national = cc && e164.startsWith(`+${cc}`) ? e164.slice(cc.length + 1) : e164.replace(/^\+/, '');
  return formatAsYouType(national, iso2);
}

/**
 * International phone input: a searchable country (calling-code) selector plus a
 * national-number field that formats as you type. The calling code is owned by the
 * selector and cannot be edited as part of the local number. Valid numbers are
 * normalized to E.164. Pasting a full "+cc…" number re-detects the country.
 */
export function InternationalPhoneInput({
  value,
  onChange,
  defaultCountry,
  onCountryChange,
  placeholder,
  disabled,
  readOnly,
  invalid,
  id,
  name,
  className,
  ...aria
}: InternationalPhoneInputProps) {
  const initialCountry = useMemo(() => {
    if (value) {
      const res = normalizePhone(value);
      if (res.country) return res.country;
    }
    const dc = defaultCountry?.trim().toUpperCase();
    return dc && getCountry(dc) ? dc : DEFAULT_COUNTRY;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [country, setCountry] = useState(initialCountry);
  const [text, setText] = useState(() => (value ? nationalFromE164(value, initialCountry) : ''));
  const lastEmitted = useRef<string>(value ?? '');

  // Re-hydrate when the stored value changes externally (e.g. loading a record to edit).
  useEffect(() => {
    const v = value ?? '';
    if (v === lastEmitted.current) return;
    lastEmitted.current = v;
    if (!v) {
      setText('');
      return;
    }
    const res = normalizePhone(v);
    const c = res.country ?? country;
    setCountry(c);
    setText(nationalFromE164(v, c));
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const emit = useCallback(
    (raw: string, c: string) => {
      const res = normalizePhone(raw, c);
      if (res.ok && res.e164) {
        // Pasted international number can imply a different country.
        if (res.country && res.country !== c) {
          setCountry(res.country);
          onCountryChange?.(res.country);
          setText(nationalFromE164(res.e164, res.country));
        }
        lastEmitted.current = res.e164;
        onChange(res.e164);
      } else {
        lastEmitted.current = raw;
        onChange(raw);
      }
    },
    [onChange, onCountryChange],
  );

  const onInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setText(formatAsYouType(raw, country));
    emit(raw, country);
  };

  const onPickCountry = (iso2: string) => {
    setCountry(iso2);
    onCountryChange?.(iso2);
    setText((t) => formatAsYouType(t, iso2));
    emit(text, iso2);
  };

  const countryOptions = useMemo<ComboboxOption[]>(
    () =>
      COUNTRY_OPTIONS.filter((c) => c.callingCode).map((c) => ({
        value: c.iso2,
        label: `${c.name} (+${c.callingCode})`,
        hint: `+${c.callingCode}`,
        keywords: [c.iso2, c.iso3, `+${c.callingCode}`, c.callingCode!, c.nativeName ?? ''],
      })),
    [],
  );

  const callingCode = callingCodeForCountry(country);

  return (
    <div
      className={cn(
        'flex items-stretch gap-2',
        className,
      )}
    >
      <div className="w-[8.5rem] shrink-0">
        <Combobox
          options={countryOptions}
          value={country}
          onChange={onPickCountry}
          disabled={disabled}
          readOnly={readOnly}
          invalid={invalid}
          aria-label="Phone country"
          searchPlaceholder="Search country or code…"
          renderValue={(opt) => (
            <span className="flex items-center gap-1.5">
              <span className="font-medium text-text-primary">{opt ? `+${callingCode}` : '—'}</span>
              <span className="truncate text-text-muted">{opt?.value ?? ''}</span>
            </span>
          )}
        />
      </div>
      <input
        id={id}
        name={name}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        aria-label={aria['aria-label']}
        aria-describedby={aria['aria-describedby']}
        value={text}
        onChange={onInput}
        placeholder={placeholder ?? 'Phone number'}
        className={cn(
          'h-input min-w-0 flex-1 rounded-md border bg-surface px-3 text-sm text-text-primary placeholder:text-text-muted',
          'transition-shadow duration-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          invalid ? 'border-danger focus-visible:border-danger' : 'border-border focus-visible:border-primary',
          (disabled || readOnly) && 'cursor-not-allowed opacity-60',
        )}
      />
    </div>
  );
}
