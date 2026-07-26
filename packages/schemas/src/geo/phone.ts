/**
 * Phone parsing / validation / normalization built on `libphonenumber-js/max`
 * (full metadata — required for reliable mobile-vs-fixed and account/auth flows).
 * No regex is used as the primary validator. The canonical stored value is E.164.
 */
import {
  parsePhoneNumberFromString,
  AsYouType,
  getCountryCallingCode,
  isSupportedCountry,
  type CountryCode as LibCountryCode,
} from 'libphonenumber-js/max';
import type { CountryCode, NormalizedPhone } from './types';

/** A structural E.164 guard — defense in depth only, never the primary validator. */
export const E164_REGEX = /^\+[1-9]\d{1,14}$/;

/**
 * Parse + validate + normalize to E.164.
 * @param input  Raw user input — may include spaces, brackets, hyphens, or a "+cc".
 * @param defaultCountry  ISO 3166-1 alpha-2 used when the input has no "+cc".
 */
export function normalizePhone(
  input: string | null | undefined,
  defaultCountry?: string | null,
): NormalizedPhone {
  if (input == null || input.trim() === '') return { ok: false, error: 'empty' };
  const country =
    defaultCountry && isSupportedCountry(defaultCountry.trim().toUpperCase())
      ? (defaultCountry.trim().toUpperCase() as LibCountryCode)
      : undefined;
  let parsed;
  try {
    parsed = parsePhoneNumberFromString(input.trim(), country);
  } catch {
    return { ok: false, error: 'unparseable' };
  }
  if (!parsed) return { ok: false, error: 'unparseable' };
  if (!parsed.isValid()) {
    return { ok: false, error: 'invalid', country: parsed.country };
  }
  return {
    ok: true,
    e164: parsed.number,
    country: parsed.country,
    type: parsed.getType(),
  };
}

export function isValidPhone(input: string | null | undefined, defaultCountry?: string | null): boolean {
  return normalizePhone(input, defaultCountry).ok;
}

export function isE164(value: string | null | undefined): boolean {
  return !!value && E164_REGEX.test(value);
}

/** Calling code (no "+") for an ISO 3166-1 alpha-2 country, or undefined. */
export function callingCodeForCountry(iso2: string | null | undefined): string | undefined {
  if (!iso2 || !isSupportedCountry(iso2.trim().toUpperCase())) return undefined;
  try {
    return getCountryCallingCode(iso2.trim().toUpperCase() as LibCountryCode);
  } catch {
    return undefined;
  }
}

/** Progressive formatting for an input field — e.g. "+91 99472 73256". */
export function formatAsYouType(input: string, country?: string | null): string {
  const c =
    country && isSupportedCountry(country.trim().toUpperCase())
      ? (country.trim().toUpperCase() as LibCountryCode)
      : undefined;
  return new AsYouType(c).input(input);
}

/** Detect the country of a complete international ("+cc…") number, when possible. */
export function detectPhoneCountry(input: string | null | undefined): CountryCode | undefined {
  if (!input) return undefined;
  const parsed = parsePhoneNumberFromString(input.trim());
  return parsed?.country;
}
