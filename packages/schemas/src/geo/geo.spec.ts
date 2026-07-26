import { describe, it, expect } from 'vitest';
import {
  COUNTRY_OPTIONS,
  getCountry,
  isValidCountryCode,
  countryName,
  normalizeCountryCode,
} from './countries';
import {
  getSubdivisions,
  subdivisionBelongsToCountry,
  subdivisionLabel,
  hasSubdivisions,
  normalizeAdministrativeDivisionCode,
} from './subdivisions';
import { normalizePhone, isE164, detectPhoneCountry, callingCodeForCountry } from './phone';
import { TIMEZONE_OPTIONS, isValidTimezone, canonicalTimezone, timezonesForCountry } from './timezones';
import {
  countryCodeSchema,
  e164PhoneSchema,
  timezoneSchema,
  administrativeDivisionCodeSchema,
  refineCountrySubdivision,
} from './validators';
import { z } from 'zod';

describe('countries', () => {
  it('exposes a complete, alphabetically sorted list with ISO codes', () => {
    expect(COUNTRY_OPTIONS.length).toBeGreaterThan(190);
    const names = COUNTRY_OPTIONS.map((c) => c.name);
    expect([...names]).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(getCountry('IN')?.iso3).toBe('IND');
    expect(getCountry('IN')?.callingCode).toBe('91');
  });

  it('validates and restores stored values; handles unknown legacy safely', () => {
    expect(isValidCountryCode('IN')).toBe(true);
    expect(isValidCountryCode('XX')).toBe(false);
    expect(countryName('IN')).toBe('India');
    expect(countryName('ZZ')).toBe('ZZ'); // unknown legacy → echoes raw
  });

  it('normalizes legacy free-text to ISO alpha-2, refusing ambiguous values', () => {
    expect(normalizeCountryCode('India')).toBe('IN');
    expect(normalizeCountryCode('india')).toBe('IN');
    expect(normalizeCountryCode('IND')).toBe('IN');
    expect(normalizeCountryCode('Republic of India')).toBe('IN');
    expect(normalizeCountryCode('IN')).toBe('IN');
    expect(normalizeCountryCode('Wakanda')).toBeNull();
  });
});

describe('administrative divisions', () => {
  it('loads divisions for a country with official codes', () => {
    const subs = getSubdivisions('IN');
    expect(subs.length).toBeGreaterThan(28);
    expect(subs.find((s) => s.code === 'IN-KL')?.name).toBe('Kerala');
  });

  it('uses country-aware labels', () => {
    expect(subdivisionLabel('AE')).toBe('Emirate');
    expect(subdivisionLabel('JP')).toBe('Prefecture');
    expect(subdivisionLabel('IN')).toBe('State or Union Territory');
  });

  it('detects membership and incompatibility after a country change', () => {
    expect(subdivisionBelongsToCountry('IN-KL', 'IN')).toBe(true);
    expect(subdivisionBelongsToCountry('IN-KL', 'US')).toBe(false);
  });

  it('handles countries with no subdivision data', () => {
    expect(hasSubdivisions('ZZ')).toBe(false); // unknown / no dataset entry
    expect(getSubdivisions('ZZ')).toEqual([]);
  });

  it('normalizes legacy subdivision values, refusing ambiguity', () => {
    expect(normalizeAdministrativeDivisionCode('IN', 'IN-KL')).toBe('IN-KL');
    expect(normalizeAdministrativeDivisionCode('IN', 'KL')).toBe('IN-KL');
    expect(normalizeAdministrativeDivisionCode('IN', 'Kerala')).toBe('IN-KL');
    expect(normalizeAdministrativeDivisionCode('IN', 'Nowhere')).toBeNull();
  });
});

describe('phone', () => {
  it('parses local + international numbers and normalizes to E.164', () => {
    expect(normalizePhone('09947273256', 'IN').e164).toBe('+919947273256');
    expect(normalizePhone('+91 99472 73256').e164).toBe('+919947273256');
    expect(normalizePhone('(99472) 73256', 'IN').e164).toBe('+919947273256');
    expect(normalizePhone('+971 50 123 4567').e164).toBe('+971501234567');
  });

  it('rejects invalid numbers and does not double the country code', () => {
    expect(normalizePhone('123', 'IN').ok).toBe(false);
    expect(normalizePhone('not a phone').ok).toBe(false);
    // already-international input must not get a second +91 prepended
    expect(normalizePhone('+919947273256', 'IN').e164).toBe('+919947273256');
  });

  it('lets address and phone countries differ + detects from pasted intl', () => {
    expect(normalizePhone('+971501234567', 'IN').country).toBe('AE');
    expect(detectPhoneCountry('+971501234567')).toBe('AE');
    expect(callingCodeForCountry('AE')).toBe('971');
    expect(isE164('+919947273256')).toBe(true);
    expect(isE164('09947273256')).toBe(false);
  });
});

describe('timezones', () => {
  it('exposes IANA ids with DST-aware offsets', () => {
    expect(TIMEZONE_OPTIONS.length).toBeGreaterThan(100);
    const kolkata = TIMEZONE_OPTIONS.find((t) => t.value === 'Asia/Kolkata');
    expect(kolkata?.offsetLabel).toBe('UTC+05:30');
  });

  it('validates ids and rejects abbreviations / offsets', () => {
    expect(isValidTimezone('Asia/Kolkata')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('IST')).toBe(false);
    expect(isValidTimezone('GMT+5:30')).toBe(false);
    expect(canonicalTimezone('Asia/Calcutta')).toBe('Asia/Kolkata');
  });

  it('lists multiple zones for large countries', () => {
    expect(timezonesForCountry('US').length).toBeGreaterThan(1);
    expect(timezonesForCountry('IN').length).toBe(1);
  });
});

describe('zod validators (server guard)', () => {
  it('country code: parses + uppercases, rejects junk', () => {
    expect(countryCodeSchema.parse('in')).toBe('IN');
    expect(() => countryCodeSchema.parse('XX')).toThrow();
  });

  it('e164: normalizes valid, rejects invalid', () => {
    expect(e164PhoneSchema.parse('+91 99472 73256')).toBe('+919947273256');
    expect(() => e164PhoneSchema.parse('123')).toThrow();
  });

  it('timezone: canonicalizes, rejects abbreviations', () => {
    expect(timezoneSchema.parse('Asia/Calcutta')).toBe('Asia/Kolkata');
    expect(() => timezoneSchema.parse('IST')).toThrow();
  });

  it('division code shape + cross-field membership refinement', () => {
    expect(administrativeDivisionCodeSchema.parse('in-kl')).toBe('IN-KL');
    const addr = z
      .object({ countryCode: countryCodeSchema, administrativeDivisionCode: z.string().optional() })
      .superRefine(refineCountrySubdivision('countryCode', 'administrativeDivisionCode'));
    expect(addr.safeParse({ countryCode: 'IN', administrativeDivisionCode: 'IN-KL' }).success).toBe(true);
    expect(addr.safeParse({ countryCode: 'US', administrativeDivisionCode: 'IN-KL' }).success).toBe(false);
  });
});
