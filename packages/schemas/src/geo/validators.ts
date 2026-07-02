/**
 * Zod validators for the standardized location / contact fields. Used by both the
 * client forms and the server (apps/api validates the SAME schemas), so arbitrary
 * text values cannot bypass the selectors through direct API calls.
 */
import { z } from 'zod';
import { isValidCountryCode } from './countries';
import { subdivisionBelongsToCountry, hasSubdivisions } from './subdivisions';
import { normalizePhone } from './phone';
import { isValidTimezone, canonicalTimezone } from './timezones';

/** ISO 3166-1 alpha-2, normalized to uppercase. */
export const countryCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine(isValidCountryCode, { message: 'Please select a valid country.' });

export const optionalCountryCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => s === '' || isValidCountryCode(s), { message: 'Please select a valid country.' })
  .transform((s) => (s === '' ? undefined : s))
  .optional();

/** ISO 3166-2 code shape ("XX-YYY"). Country membership is checked at the object level. */
export const administrativeDivisionCodeSchema = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .refine((s) => /^[A-Z]{2}-[A-Z0-9]{1,3}$/.test(s), {
    message: 'Please select a valid state or province.',
  });

/** IANA timezone id, normalized to its canonical form. */
export const timezoneSchema = z
  .string()
  .trim()
  .refine(isValidTimezone, { message: 'Please select a valid timezone.' })
  .transform((s) => canonicalTimezone(s) ?? s);

/** Optional IANA timezone — '' → undefined, otherwise validated + canonicalized. */
export const optionalTimezoneSchema = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (s === '') return undefined;
    if (!isValidTimezone(s)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please select a valid timezone.' });
      return z.NEVER;
    }
    return canonicalTimezone(s) ?? s;
  })
  .optional();

/** A complete international ("+cc…") number → normalized E.164. */
export const e164PhoneSchema = z
  .string()
  .trim()
  .transform((s, ctx) => {
    const res = normalizePhone(s);
    if (!res.ok || !res.e164) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please enter a valid international phone number.' });
      return z.NEVER;
    }
    return res.e164;
  });

export const optionalE164PhoneSchema = z
  .string()
  .trim()
  .transform((s, ctx) => {
    if (s === '') return undefined;
    const res = normalizePhone(s);
    if (!res.ok || !res.e164) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Please enter a valid international phone number.' });
      return z.NEVER;
    }
    return res.e164;
  })
  .optional();

/** Optional ISO country code stored alongside a phone number. */
export const phoneCountryCodeSchema = optionalCountryCodeSchema;

/**
 * Backward-compatible phone schema for high-volume operational data (students,
 * teachers, staff, parents, admissions, transport) that may still hold legacy
 * national-format numbers. Normalizes to E.164 when the value parses; otherwise
 * passes the trimmed value through so existing records remain editable. New input
 * from the standardized phone component is always E.164. Accepts null/undefined.
 */
export const lenientPhoneSchema = z
  .string()
  .trim()
  .transform((s) => {
    if (s === '') return undefined;
    const res = normalizePhone(s);
    return res.ok && res.e164 ? res.e164 : s;
  })
  .nullish();

/**
 * Object-level refinement: a subdivision must belong to its country, and a country
 * that *has* subdivisions may require one. Attach to address-shaped objects.
 *
 *   schema.superRefine(refineCountrySubdivision('countryCode', 'administrativeDivisionCode'))
 */
export function refineCountrySubdivision<T extends Record<string, unknown>>(
  countryKey: keyof T,
  divisionKey: keyof T,
  opts: { requireWhenAvailable?: boolean } = {},
) {
  return (val: T, ctx: z.RefinementCtx) => {
    const country = val[countryKey] as string | undefined;
    const division = val[divisionKey] as string | undefined;
    if (!country) return;
    if (division) {
      // Only enforce membership for ISO 3166-2 code-shaped values; legacy free-text
      // region names ("Kerala") are tolerated until backfilled.
      if (!/^[A-Z]{2}-[A-Z0-9]{1,3}$/i.test(division)) return;
      if (!subdivisionBelongsToCountry(division, country)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [divisionKey as string],
          message: 'The selected state or province does not belong to this country.',
        });
      }
    } else if (opts.requireWhenAvailable && hasSubdivisions(country)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [divisionKey as string],
        message: 'Please select a valid state or province.',
      });
    }
  };
}
