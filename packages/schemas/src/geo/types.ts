/**
 * Shared, framework-agnostic types for the location / contact reference data.
 * These are consumed by both the React selector components (@edrion/ui) and the
 * Zod validators used on the client *and* the server (@edrion/schemas, apps/api).
 */

/** ISO 3166-1 alpha-2 country code, uppercased. The stable stored value. */
export type CountryCode = string;

export interface CountryOption {
  /** ISO 3166-1 alpha-2 — the stored value. */
  iso2: string;
  /** ISO 3166-1 alpha-3 — convenience for legacy import/export. */
  iso3: string;
  /** English common name — the displayed value, derived from reference data. */
  name: string;
  /** Endonym (native common name), when available. */
  nativeName?: string;
  /** E.164 calling code without the leading "+", e.g. "91". */
  callingCode?: string;
  /** Flag emoji (rendering is environment-dependent; treat as optional). */
  flag?: string;
  /** Geographic region, e.g. "Asia" — used for grouping/filtering. */
  region?: string;
  /** ISO 4217 code of the country's primary currency, e.g. "INR". Derived from reference data. */
  currency?: string;
  /** Symbol of the primary currency, e.g. "₹". Rendering is environment-dependent; treat as optional. */
  currencySymbol?: string;
}

export interface CurrencyOption {
  /** ISO 4217 alpha-3 code, uppercased, e.g. "INR". The stored value. */
  code: string;
  /** English currency name, e.g. "Indian rupee". */
  name: string;
  /** Currency symbol, e.g. "₹", when available. */
  symbol?: string;
}

export interface AdministrativeDivisionOption {
  /** Official ISO 3166-2 code, e.g. "IN-KL", "US-CA", "AE-DU". The stored value. */
  code: string;
  /** Parent ISO 3166-1 alpha-2. */
  countryCode: string;
  /** Display name (may contain accented / non-Latin characters). */
  name: string;
  /** Subdivision category, e.g. "State", "Province", "Emirate", "Prefecture". */
  type?: string;
}

export interface TimezoneOption {
  /** IANA identifier, e.g. "Asia/Kolkata". The stored value. */
  value: string;
  /** Human-readable label, e.g. "Asia/Kolkata — Mumbai, Delhi — UTC+05:30". */
  label: string;
  /** Current UTC offset in minutes (DST-aware at module load). */
  offsetMinutes: number;
  /** Formatted current offset, e.g. "UTC+05:30". */
  offsetLabel: string;
  /** ISO 3166-1 alpha-2 codes this zone is used in. */
  countryCodes: string[];
  /** Representative cities, for search. */
  mainCities: string[];
}

export interface NormalizedPhone {
  ok: boolean;
  /** E.164, e.g. "+919947273256" — present only when ok. */
  e164?: string;
  /** Detected ISO 3166-1 alpha-2 country, e.g. "IN". */
  country?: CountryCode;
  /** "mobile" | "fixedLine" | etc. when libphonenumber can infer it. */
  type?: string;
  /** Failure reason when !ok. */
  error?: string;
}
