/**
 * First-level administrative divisions (ISO 3166-2), from the maintained
 * `iso-3166-2` dataset. Codes like "IN-KL", "US-CA", "AE-DU" are the stored values;
 * names + the country-aware "type" (State / Province / Emirate / Prefecture …) come
 * straight from the dataset.
 */
import iso31662 from 'iso-3166-2';
import type { AdministrativeDivisionOption } from './types';

const cache = new Map<string, AdministrativeDivisionOption[]>();

/** Subdivisions for a country, sorted alphabetically by name. Empty when none exist. */
export function getSubdivisions(countryCode: string | null | undefined): AdministrativeDivisionOption[] {
  if (!countryCode) return [];
  const iso2 = countryCode.trim().toUpperCase();
  const cached = cache.get(iso2);
  if (cached) return cached;

  const country = iso31662.country(iso2);
  const out: AdministrativeDivisionOption[] = country
    ? Object.entries(country.sub).map(([code, info]) => ({
        code,
        countryCode: iso2,
        name: info.name,
        type: info.type,
      }))
    : [];
  out.sort((a, b) => a.name.localeCompare(b.name));
  cache.set(iso2, out);
  return out;
}

export function hasSubdivisions(countryCode: string | null | undefined): boolean {
  return getSubdivisions(countryCode).length > 0;
}

export function subdivisionBelongsToCountry(
  code: string | null | undefined,
  countryCode: string | null | undefined,
): boolean {
  if (!code || !countryCode) return false;
  return getSubdivisions(countryCode).some((s) => s.code === code.trim().toUpperCase());
}

export function getSubdivision(
  countryCode: string | null | undefined,
  code: string | null | undefined,
): AdministrativeDivisionOption | undefined {
  if (!code) return undefined;
  return getSubdivisions(countryCode).find((s) => s.code === code.trim().toUpperCase());
}

/** Display name for a stored subdivision code, falling back to the raw value. */
export function subdivisionName(
  countryCode: string | null | undefined,
  code: string | null | undefined,
): string {
  if (!code) return '';
  return getSubdivision(countryCode, code)?.name ?? code;
}

/**
 * Country-aware field label. Uses the dataset's subdivision "type" when a country
 * uses a single consistent term (Emirate, Prefecture, Province…), with curated
 * overrides for the common cases, and a neutral fallback otherwise.
 */
const LABEL_OVERRIDES: Record<string, string> = {
  IN: 'State or Union Territory',
  US: 'State',
  CA: 'Province or Territory',
  AE: 'Emirate',
  SA: 'Province',
  JP: 'Prefecture',
  GB: 'Country or Region',
  CN: 'Province',
  AU: 'State or Territory',
};

export function subdivisionLabel(countryCode: string | null | undefined): string {
  const iso2 = countryCode?.trim().toUpperCase();
  if (iso2 && LABEL_OVERRIDES[iso2]) return LABEL_OVERRIDES[iso2];
  if (iso2) {
    const subs = getSubdivisions(iso2);
    const types = new Set(subs.map((s) => s.type).filter(Boolean));
    if (types.size === 1) {
      const only = [...types][0]!;
      // Pluralise lightly for the label, e.g. "Province" stays readable as-is.
      return only;
    }
  }
  return 'State / Province / Region';
}

/**
 * Best-effort normalization of a legacy subdivision value to an ISO 3166-2 code
 * within a known country. Returns `null` when ambiguous/unknown — never guesses.
 * Handles: "IN-KL", "KL" (suffix), "Kerala" (name).
 */
export function normalizeAdministrativeDivisionCode(
  countryCode: string | null | undefined,
  value: string | null | undefined,
): string | null {
  if (!countryCode || !value) return null;
  const iso2 = countryCode.trim().toUpperCase();
  const v = value.trim();
  if (!v) return null;
  const subs = getSubdivisions(iso2);
  if (subs.length === 0) return null;

  const upper = v.toUpperCase();
  const byCode = subs.find((s) => s.code === upper);
  if (byCode) return byCode.code;
  const bySuffix = subs.find((s) => s.code === `${iso2}-${upper}`);
  if (bySuffix) return bySuffix.code;
  const byName = subs.filter((s) => s.name.toLowerCase() === v.toLowerCase());
  if (byName.length === 1) return byName[0]!.code;
  return null;
}
