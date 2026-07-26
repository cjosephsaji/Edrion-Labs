/**
 * Country reference data, derived from the maintained `world-countries` dataset
 * (ISO 3166-1) plus calling codes from `libphonenumber-js`. No hand-maintained
 * country or calling-code lists live here.
 */
import countriesData from 'world-countries';
import { getCountryCallingCode, isSupportedCountry } from 'libphonenumber-js/max';
import type { CountryCode, CountryOption } from './types';

interface RawCountry {
  cca2: string;
  cca3: string;
  name: { common: string; official: string; native?: Record<string, { common: string; official: string }> };
  idd?: { root?: string; suffixes?: string[] };
  flag?: string;
  region?: string;
  altSpellings?: string[];
  currencies?: Record<string, { name?: string; symbol?: string }>;
}

const RAW = countriesData as unknown as RawCountry[];

function firstNative(c: RawCountry): string | undefined {
  const native = c.name.native;
  if (!native) return undefined;
  const first = Object.values(native)[0];
  return first?.common;
}

/** Prefer libphonenumber's calling code (canonical for dialing); fall back to IDD. */
function callingCodeFor(c: RawCountry): string | undefined {
  if (isSupportedCountry(c.cca2)) {
    try {
      return getCountryCallingCode(c.cca2 as Parameters<typeof getCountryCallingCode>[0]);
    } catch {
      /* fall through to IDD */
    }
  }
  const root = c.idd?.root;
  const suffixes = c.idd?.suffixes ?? [];
  if (root && suffixes.length === 1) return `${root}${suffixes[0]}`.replace('+', '');
  if (root) return root.replace('+', '');
  return undefined;
}

/** The country's primary currency = the first ISO-4217 code in the reference data (if any). */
function primaryCurrency(c: RawCountry): { code: string; symbol?: string } | undefined {
  const code = Object.keys(c.currencies ?? {})[0];
  if (!code) return undefined;
  return { code: code.toUpperCase(), symbol: c.currencies![code]?.symbol };
}

function toOption(c: RawCountry): CountryOption {
  const currency = primaryCurrency(c);
  return {
    iso2: c.cca2.toUpperCase(),
    iso3: c.cca3.toUpperCase(),
    name: c.name.common,
    nativeName: firstNative(c),
    callingCode: callingCodeFor(c),
    flag: c.flag,
    region: c.region,
    currency: currency?.code,
    currencySymbol: currency?.symbol,
  };
}

/** All countries + supported territories, sorted alphabetically by display name. */
export const COUNTRY_OPTIONS: readonly CountryOption[] = Object.freeze(
  RAW.map(toOption).sort((a, b) => a.name.localeCompare(b.name)),
);

const BY_ISO2 = new Map<string, CountryOption>(COUNTRY_OPTIONS.map((c) => [c.iso2, c]));
const BY_ISO3 = new Map<string, CountryOption>(COUNTRY_OPTIONS.map((c) => [c.iso3, c]));

/** Search index: every alt-spelling / official / native name, lowercased → iso2. */
const NAME_INDEX = new Map<string, string>();
for (const c of RAW) {
  const iso2 = c.cca2.toUpperCase();
  const add = (s?: string) => {
    if (s) NAME_INDEX.set(s.trim().toLowerCase(), iso2);
  };
  add(c.name.common);
  add(c.name.official);
  add(c.cca2);
  add(c.cca3);
  for (const alt of c.altSpellings ?? []) add(alt);
  if (c.name.native) for (const n of Object.values(c.name.native)) {
    add(n.common);
    add(n.official);
  }
}

export function getCountry(iso2: string | null | undefined): CountryOption | undefined {
  if (!iso2) return undefined;
  return BY_ISO2.get(iso2.trim().toUpperCase());
}

export function isValidCountryCode(value: string | null | undefined): value is CountryCode {
  if (!value) return false;
  return BY_ISO2.has(value.trim().toUpperCase());
}

/** Display name for a stored code, falling back to the raw code for unknown legacy values. */
export function countryName(iso2: string | null | undefined): string {
  if (!iso2) return '';
  return getCountry(iso2)?.name ?? iso2;
}

/**
 * Best-effort normalization of a free-text legacy value to an ISO 3166-1 alpha-2 code.
 * Returns `null` when the match is ambiguous or unknown — callers must NOT guess.
 * Handles: "IN", "in", "IND", "India", "india", "Republic of India", alt spellings.
 */
export function normalizeCountryCode(value: string | null | undefined): CountryCode | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  if (BY_ISO2.has(upper)) return upper;
  if (BY_ISO3.has(upper)) return BY_ISO3.get(upper)!.iso2;
  const byName = NAME_INDEX.get(v.toLowerCase());
  return byName ?? null;
}
