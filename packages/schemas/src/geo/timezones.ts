/**
 * IANA timezone reference data from the maintained `@vvo/tzdb` dataset
 * (DST-aware current offsets, country codes, representative cities) plus a runtime
 * validity check via Intl. We never store ambiguous abbreviations or fixed offsets —
 * only canonical IANA identifiers.
 */
import { getTimeZones, rawTimeZones } from '@vvo/tzdb';
import type { TimezoneOption } from './types';

function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '-' : '+';
  const abs = Math.abs(minutes);
  const hh = String(Math.floor(abs / 60)).padStart(2, '0');
  const mm = String(abs % 60).padStart(2, '0');
  return `UTC${sign}${hh}:${mm}`;
}

const ZONES = getTimeZones();

/** All zones, sorted by current offset then name. Label: "Asia/Kolkata — Mumbai, Delhi — UTC+05:30". */
export const TIMEZONE_OPTIONS: readonly TimezoneOption[] = Object.freeze(
  ZONES.map((z): TimezoneOption => {
    const offsetLabel = formatOffset(z.currentTimeOffsetInMinutes);
    const cities = z.mainCities.slice(0, 3).join(', ');
    return {
      value: z.name,
      label: cities ? `${z.name} — ${cities} — ${offsetLabel}` : `${z.name} — ${offsetLabel}`,
      offsetMinutes: z.currentTimeOffsetInMinutes,
      offsetLabel,
      countryCodes: [z.countryCode],
      mainCities: z.mainCities,
    };
  }).sort((a, b) => a.offsetMinutes - b.offsetMinutes || a.value.localeCompare(b.value)),
);

/** Every canonical name + grouped alias (e.g. Asia/Calcutta → Asia/Kolkata). */
const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const z of ZONES) {
  ALIAS_TO_CANONICAL.set(z.name, z.name);
  for (const g of z.group) ALIAS_TO_CANONICAL.set(g, z.name);
}
for (const z of rawTimeZones) ALIAS_TO_CANONICAL.set(z.name, z.name);

/**
 * Authoritative allow-set of real IANA ids. Built from the Intl engine's canonical
 * list plus the dataset's grouped aliases (Asia/Calcutta …). We deliberately do NOT
 * use `new Intl.DateTimeFormat({ timeZone })` as the check: ICU leniently accepts
 * ambiguous legacy abbreviations like "IST", which is exactly what we must reject.
 */
const VALID_ZONES = new Set<string>(['UTC']);
try {
  const supported = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf;
  if (supported) for (const z of supported('timeZone')) VALID_ZONES.add(z);
} catch {
  /* older runtime — fall back to dataset names only */
}
for (const key of ALIAS_TO_CANONICAL.keys()) VALID_ZONES.add(key);

const COUNTRY_TO_ZONES = new Map<string, TimezoneOption[]>();
for (const opt of TIMEZONE_OPTIONS) {
  for (const cc of opt.countryCodes) {
    const arr = COUNTRY_TO_ZONES.get(cc) ?? [];
    arr.push(opt);
    COUNTRY_TO_ZONES.set(cc, arr);
  }
}

/**
 * Authoritative validity check against the canonical IANA allow-set. Accepts real
 * ids and grouped aliases (Asia/Calcutta) but rejects ambiguous abbreviations
 * ("IST", "EST") and fixed offsets ("GMT+5:30").
 */
export function isValidTimezone(value: string | null | undefined): boolean {
  if (!value || typeof value !== 'string') return false;
  return VALID_ZONES.has(value.trim());
}

/** Resolve an alias (Asia/Calcutta) to the canonical id (Asia/Kolkata) when known. */
export function canonicalTimezone(value: string | null | undefined): string | null {
  if (!value) return null;
  return ALIAS_TO_CANONICAL.get(value) ?? (isValidTimezone(value) ? value : null);
}

/** Timezones used in a country (for prioritisation/filtering). */
export function timezonesForCountry(countryCode: string | null | undefined): TimezoneOption[] {
  if (!countryCode) return [];
  return COUNTRY_TO_ZONES.get(countryCode.trim().toUpperCase()) ?? [];
}

export function getTimezoneOption(value: string | null | undefined): TimezoneOption | undefined {
  if (!value) return undefined;
  return TIMEZONE_OPTIONS.find((z) => z.value === value);
}

/** Human-readable label for a stored id, falling back to the raw value. */
export function timezoneLabel(value: string | null | undefined): string {
  if (!value) return '';
  return getTimezoneOption(value)?.label ?? value;
}

/** The browser's IANA timezone — a *suggested* default, never authoritative. */
export function detectBrowserTimezone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}
