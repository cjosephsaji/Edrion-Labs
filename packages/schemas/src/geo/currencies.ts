/**
 * Currency reference data + country→currency mapping, derived from the same maintained
 * `world-countries` dataset (ISO 3166-1 + ISO 4217) that drives the country list. No
 * hand-maintained currency table lives here.
 *
 * Used by the institution Settings screen to auto-select an institution's operating currency
 * from its country (shown read-only for confirmation), and anywhere a currency label/symbol
 * is rendered.
 */
import countriesData from 'world-countries';
import { getCountry } from './countries';
import type { CurrencyOption } from './types';

interface RawCountry {
  cca2: string;
  currencies?: Record<string, { name?: string; symbol?: string }>;
}

const RAW = countriesData as unknown as RawCountry[];

/** Every distinct ISO-4217 currency in the dataset, keyed by code, with the best name/symbol seen. */
const BY_CODE = new Map<string, CurrencyOption>();
for (const c of RAW) {
  for (const [rawCode, meta] of Object.entries(c.currencies ?? {})) {
    const code = rawCode.toUpperCase();
    const existing = BY_CODE.get(code);
    if (!existing) {
      BY_CODE.set(code, { code, name: meta?.name ?? code, symbol: meta?.symbol });
    } else if (!existing.symbol && meta?.symbol) {
      existing.symbol = meta.symbol;
    }
  }
}

/** All currencies, sorted alphabetically by code. */
export const CURRENCY_OPTIONS: readonly CurrencyOption[] = Object.freeze(
  [...BY_CODE.values()].sort((a, b) => a.code.localeCompare(b.code)),
);

export function getCurrency(code: string | null | undefined): CurrencyOption | undefined {
  if (!code) return undefined;
  return BY_CODE.get(code.trim().toUpperCase());
}

export function isValidCurrencyCode(value: string | null | undefined): boolean {
  if (!value) return false;
  return BY_CODE.has(value.trim().toUpperCase());
}

/** Display name for a stored code, falling back to the raw code for unknown legacy values. */
export function currencyName(code: string | null | undefined): string {
  if (!code) return '';
  return getCurrency(code)?.name ?? code.trim().toUpperCase();
}

/** Currency symbol for a code, falling back to the code itself when no symbol is known. */
export function currencySymbol(code: string | null | undefined): string {
  const c = getCurrency(code);
  return c?.symbol ?? (code ? code.trim().toUpperCase() : '');
}

/** Human label for a currency, e.g. "INR — Indian rupee (₹)". */
export function currencyLabel(code: string | null | undefined): string {
  const c = getCurrency(code);
  if (!c) return code ? code.trim().toUpperCase() : '';
  return c.symbol ? `${c.code} — ${c.name} (${c.symbol})` : `${c.code} — ${c.name}`;
}

/**
 * The ISO-4217 currency for an ISO 3166-1 alpha-2 country code, e.g. "IN" → "INR".
 * Returns `undefined` for unknown countries or the handful with no assigned currency
 * (e.g. Antarctica). Callers must NOT guess.
 */
export function currencyForCountry(iso2: string | null | undefined): string | undefined {
  return getCountry(iso2)?.currency;
}
