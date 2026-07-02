# Standardized location & contact fields

All country, administrative-division (state/province/emirate/…), international phone,
and timezone inputs use one centralized set of components + validators. **Do not build
new ad-hoc selects or phone inputs for these fields.**

## Where things live

| Concern | Module |
| --- | --- |
| Reference data + pure helpers (framework-agnostic) | `@edrion/schemas` → `src/geo/{countries,subdivisions,phone,timezones}.ts` |
| Zod validators (client **and** server) | `@edrion/schemas` → `src/geo/validators.ts` |
| React components | `@edrion/ui` → `country-select`, `administrative-division-select`, `phone-input`, `timezone-select` (built on the shared `combobox`) |

The components re-export the data helpers, so a form needs only `@edrion/ui`.

## Data sources

- **Countries / calling codes** — [`world-countries`](https://www.npmjs.com/package/world-countries) (ISO 3166-1, names, native names, flags, regions) + calling codes from `libphonenumber-js`. No hand-maintained country or dial-code lists.
- **Subdivisions** — [`iso-3166-2`](https://www.npmjs.com/package/iso-3166-2): official codes (`IN-KL`, `US-CA`, `AE-DU`) + per-country `type` (State / Province / Emirate / Prefecture …) that drives the country-aware label.
- **Phone** — [`libphonenumber-js/max`](https://www.npmjs.com/package/libphonenumber-js) (full metadata). Parses, validates, normalizes to **E.164**, formats as-you-type, detects country from a pasted international number. No regex is used as the primary validator.
- **Timezones** — [`@vvo/tzdb`](https://www.npmjs.com/package/@vvo/tzdb) for DST-aware current offsets, country codes, and city search; validity is checked against the canonical IANA allow-set (rejects ambiguous abbreviations like `IST` and fixed offsets like `GMT+5:30`).

## Stored values (never store only the display name)

| Field | Stored value | Example |
| --- | --- | --- |
| Country | ISO 3166-1 alpha-2 | `IN` |
| Subdivision | ISO 3166-2 code | `IN-KL` |
| Phone | E.164 | `+919947273256` |
| Phone country | ISO alpha-2 (optional companion) | `AE` |
| Timezone | IANA id | `Asia/Kolkata` |

## Using the components

```tsx
import {
  CountrySelect,
  AdministrativeDivisionSelect,
  InternationalPhoneInput,
  TimezoneSelect,
  subdivisionLabel,
} from '@edrion/ui';

<CountrySelect value={country} onChange={setCountry} />
<AdministrativeDivisionSelect countryCode={country} value={region} onChange={setRegion} />
<TimezoneSelect countryCode={country} value={tz} onChange={setTz} suggestDetected />
<InternationalPhoneInput value={phone} defaultCountry={country} onChange={setPhone} />
```

With **react-hook-form**, wrap each in a `Controller` (see
`apps/super-admin-web/src/app/(app)/institutions/new/page.tsx`).

The portal's declarative form (`apps/institution-web/.../academics/resource-form.tsx`)
exposes field `type: 'country' | 'division' | 'timezone' | 'phone'`; `division`/`timezone`/`phone`
take a `countryField` naming the sibling country field they depend on.

## Server validation (authoritative)

Import the shared validators in your Zod request schema — the API re-validates the
same schemas, so arbitrary text cannot bypass the selectors via direct API calls:

```ts
import {
  countryCodeSchema, optionalCountryCodeSchema,
  administrativeDivisionCodeSchema, refineCountrySubdivision,
  e164PhoneSchema, optionalE164PhoneSchema, lenientPhoneSchema,
  timezoneSchema, optionalTimezoneSchema,
} from '@edrion/schemas';
```

- `e164PhoneSchema` — strict E.164 for greenfield account/auth/contact flows.
- `lenientPhoneSchema` — normalizes when parseable, tolerates legacy values (high-volume
  operational tables) so existing records stay editable.
- `refineCountrySubdivision(countryKey, divisionKey)` — object-level `superRefine`;
  enforces that a code-shaped subdivision belongs to its country.

A DB-level E.164 `CHECK` (migration `0025`) guards the standardized `*_e164` columns.

## Legacy backfill

`pnpm --filter @edrion/database backfill:geo [-- --dry]` populates the standardized
companion columns from legacy values using the reliable normalizers, leaving anything
ambiguous for manual review and printing a report.
