import { z } from 'zod';
import type { InstitutionType } from '@edrion/shared-types';
import { TERM_KEYS } from '@edrion/shared-types';
import { paginationQuerySchema, sortQuerySchema, versionSchema } from './common';
import { institutionTypeSchema } from './institutions';
import {
  countryCodeSchema,
  optionalCountryCodeSchema,
  timezoneSchema,
  optionalE164PhoneSchema,
} from './geo';

/**
 * Institution-Portal SETTINGS tree (Phase 11) request/response contracts: a flat, campus-scoped
 * key/value store grouped by `category`. Tenancy (institution_id) + the active campus scope
 * (campus_id) are NEVER taken from the body. Reads need `institution_settings.view`; writes need
 * the sensitive `institution_settings.manage` (campus writes also accept `campus_settings.manage`).
 *
 * `portal*`/`PortalSetting*`-prefixed to avoid colliding with the platform `institution-users.ts`
 * RBAC schema that already lives in this package.
 */

export const SETTING_CATEGORIES = [
  'general',
  'academic',
  'branding',
  'localization',
  'notifications',
  'security',
  'student_portal',
  'terminology',
  'documents',
] as const;
export const settingCategorySchema = z.enum(SETTING_CATEGORIES);
export type SettingCategory = (typeof SETTING_CATEGORIES)[number];

export const SETTING_VALUE_TYPES = ['string', 'number', 'boolean', 'json'] as const;
export const settingValueTypeSchema = z.enum(SETTING_VALUE_TYPES);
export type SettingValueType = (typeof SETTING_VALUE_TYPES)[number];

const key = z
  .string()
  .trim()
  .min(1, 'Required')
  .max(120)
  .regex(/^[a-z0-9][a-z0-9_.-]*$/, 'Use lower-case letters, numbers, dot, dash or underscore');
const label = z.string().trim().min(1, 'Required').max(160);
const value = z.string().trim().max(8000).nullish();
const description = z.string().trim().max(500).nullish();

export const portalSettingsListQuerySchema = paginationQuerySchema.merge(sortQuerySchema).extend({
  search: z.string().trim().max(160).optional(),
  category: settingCategorySchema.optional(),
});
export type PortalSettingsListQuery = z.infer<typeof portalSettingsListQuerySchema>;

export const createPortalSettingSchema = z.object({
  category: settingCategorySchema,
  key,
  label,
  valueType: settingValueTypeSchema.default('string'),
  value,
  description,
});
export type CreatePortalSettingInput = z.infer<typeof createPortalSettingSchema>;

export const updatePortalSettingSchema = z.object({
  category: settingCategorySchema.optional(),
  key: key.optional(),
  label: label.optional(),
  valueType: settingValueTypeSchema.optional(),
  value,
  description,
  version: versionSchema,
});
export type UpdatePortalSettingInput = z.infer<typeof updatePortalSettingSchema>;

// =============================================================================
// Canonical global settings registry (admin-redesign Phase 6)
// =============================================================================
//
// The retained institution-wide settings — the ONLY ones with a genuine global effect. Each is
// typed + defaulted + documents where it applies. The `effective` API overlays stored overrides on
// these defaults; the web renders a curated form from this registry (no free-form key/value editor).

export type SettingType = 'string' | 'number' | 'boolean' | 'select';
export interface SettingDef {
  /** Registry grouping (also stored as the row `category`). */
  category: string;
  key: string;
  label: string;
  type: SettingType;
  options?: { value: string; label: string }[];
  default: string | number | boolean;
  /** Where this setting takes effect (shown as help text). */
  applies: string;
}

// The settings surfaced (as editable cards) in the portal Settings → Preferences screen. Every
// registry category is shown so an institution admin can tune all institution-wide behaviour; the
// order here is the display order.
export const SETTINGS_CATEGORY_META: { key: string; label: string; description?: string }[] = [
  { key: 'localization', label: 'Localization', description: 'Language, date/time and number formats.' },
  { key: 'finance', label: 'Finance', description: 'Operating currency for fees, payroll and reports.' },
  { key: 'academic', label: 'Academic', description: 'Academic year and grading defaults.' },
  { key: 'nomenclature', label: 'Nomenclature', description: 'Labels for academic structure and people (Years vs Grades, etc.).' },
  { key: 'attendance', label: 'Attendance', description: 'Attendance thresholds and lateness rules.' },
  { key: 'notifications', label: 'Notifications', description: 'How announcements and alerts are delivered.' },
  { key: 'communication', label: 'Communication', description: 'Parent and staff messaging.' },
  { key: 'student_portal', label: 'Student Portal', description: 'Student-facing privacy and workflow preferences.' },
  { key: 'security', label: 'Security & Access', description: 'Sessions, passwords, MFA and lockout.' },
  { key: 'privacy', label: 'Data & Privacy', description: 'Retention of archived records.' },
];

const DATE_FORMATS = [
  { value: 'yyyy-MM-dd', label: '2026-07-01 (ISO)' },
  { value: 'dd/MM/yyyy', label: '01/07/2026 (DD/MM/YYYY)' },
  { value: 'MM/dd/yyyy', label: '07/01/2026 (MM/DD/YYYY)' },
  { value: 'd MMM yyyy', label: '1 Jul 2026' },
];
const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'AUD', 'CAD', 'AED', 'SGD', 'ZAR', 'NGN', 'KES'].map((c) => ({ value: c, label: c }));

export const SETTINGS_REGISTRY: SettingDef[] = [
  // Localization
  { category: 'localization', key: 'timezone', label: 'Institution timezone', type: 'string', default: 'UTC', applies: 'Schedules, attendance, messages, notifications, reports and activity logs.' },
  { category: 'localization', key: 'locale', label: 'Language / locale', type: 'string', default: 'en', applies: 'Institution-wide language and number/date locale.' },
  { category: 'localization', key: 'dateFormat', label: 'Date format', type: 'select', options: DATE_FORMATS, default: 'yyyy-MM-dd', applies: 'How dates render across every screen and report.' },
  { category: 'localization', key: 'timeFormat', label: 'Time format', type: 'select', options: [{ value: '24h', label: '24-hour (14:30)' }, { value: '12h', label: '12-hour (2:30 PM)' }], default: '24h', applies: 'How times render across schedules, attendance and logs.' },
  { category: 'localization', key: 'weekStart', label: 'Week starts on', type: 'select', options: [{ value: 'monday', label: 'Monday' }, { value: 'sunday', label: 'Sunday' }], default: 'monday', applies: 'Timetable and calendar week layout.' },
  { category: 'localization', key: 'numberFormat', label: 'Number & decimal format', type: 'select', options: [{ value: 'en', label: '1,234.56' }, { value: 'eu', label: '1.234,56' }, { value: 'in', label: '1,23,456.78 (Indian)' }], default: 'en', applies: 'Grouping/decimal style for all numeric and financial displays.' },
  // Finance
  { category: 'finance', key: 'currency', label: 'Default currency', type: 'select', options: CURRENCIES, default: 'USD', applies: 'All fees, invoices, payments, payroll, reports and dashboards.' },
  // Academic
  { category: 'academic', key: 'academicYear', label: 'Current academic year', type: 'string', default: '', applies: 'Default academic-year context across academics.' },
  { category: 'academic', key: 'gradingScale', label: 'Grading scale', type: 'select', options: [{ value: 'percentage', label: 'Percentage (0–100)' }, { value: 'gpa4', label: 'GPA (4.0)' }, { value: 'letter', label: 'Letter (A–F)' }, { value: 'points', label: 'Points' }], default: 'percentage', applies: 'Exams, gradebook, report cards and academic analytics.' },
  { category: 'academic', key: 'defaultCampusId', label: 'Default campus', type: 'string', default: '', applies: 'The campus pre-selected where a scope isn’t specified.' },
  // Attendance
  { category: 'attendance', key: 'minAttendancePercent', label: 'Minimum attendance %', type: 'number', default: 75, applies: 'Attendance risk flags and the Attention Centre.' },
  { category: 'attendance', key: 'lateThresholdMinutes', label: 'Late threshold (minutes)', type: 'number', default: 10, applies: 'When a check-in counts as “late” in attendance.' },
  // Notifications
  { category: 'notifications', key: 'emailNotifications', label: 'Email notifications', type: 'boolean', default: true, applies: 'Whether announcements/notifications send by email.' },
  { category: 'notifications', key: 'smsNotifications', label: 'SMS notifications', type: 'boolean', default: false, applies: 'Whether announcements/notifications send by SMS.' },
  // Communication
  { category: 'communication', key: 'allowParentMessaging', label: 'Allow parent messaging', type: 'boolean', default: true, applies: 'Whether parents can be messaged / message staff.' },
  // Student Portal
  { category: 'student_portal', key: 'show_staff_names_to_students', label: 'Show staff names on requests', type: 'boolean', default: false, applies: 'Whether request history shows staff names instead of role labels.' },
  // Security & Access
  { category: 'security', key: 'sessionTimeoutMinutes', label: 'Session timeout (minutes)', type: 'number', default: 60, applies: 'Idle session expiry for portal logins.' },
  { category: 'security', key: 'passwordMinLength', label: 'Minimum password length', type: 'number', default: 8, applies: 'Password policy on activation and reset.' },
  { category: 'security', key: 'mfaRequired', label: 'Require multi-factor auth', type: 'boolean', default: false, applies: 'Whether MFA enrolment is enforced for all users.' },
  { category: 'security', key: 'loginLockoutThreshold', label: 'Login lockout threshold', type: 'number', default: 5, applies: 'Failed logins before an account is locked.' },
  // Data & Privacy
  { category: 'privacy', key: 'dataRetentionDays', label: 'Data retention (days)', type: 'number', default: 365, applies: 'How long soft-deleted/archived records are retained.' },
];

/** Registry lookup by key. */
export const SETTINGS_BY_KEY: Record<string, SettingDef> = Object.fromEntries(SETTINGS_REGISTRY.map((d) => [d.key, d]));

/** A resolved effective settings object: registry keys → typed values. */
export type EffectiveSettings = Record<string, string | number | boolean>;

// =============================================================================
// Nomenclature (institution-type presets + per-tenant overrides)
// =============================================================================

/** One side of a label pair may be omitted — the server falls back to the type preset for blanks. */
const termLabelOverrideSchema = z.object({
  singular: z.string().trim().min(1).max(40).optional(),
  plural: z.string().trim().min(1).max(40).optional(),
});

/** Drop empty / whitespace-only entries before Zod runs (the UI may briefly hold cleared fields). */
function sanitizeNomenclatureOverridesInput(raw: unknown): import('@edrion/shared-types').NomenclatureOverrides {
  if (!raw || typeof raw !== 'object') return {};
  const cleaned: import('@edrion/shared-types').NomenclatureOverrides = {};
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!(TERM_KEYS as readonly string[]).includes(key)) continue;
    if (!v || typeof v !== 'object') continue;
    const o = v as { singular?: string; plural?: string };
    const singular = o.singular?.trim();
    const plural = o.plural?.trim();
    if (!singular && !plural) continue;
    cleaned[key as (typeof TERM_KEYS)[number]] = {
      ...(singular ? { singular } : {}),
      ...(plural ? { plural } : {}),
    };
  }
  return cleaned;
}

export const nomenclatureOverrideSchema = z.object(
  Object.fromEntries(TERM_KEYS.map((k) => [k, termLabelOverrideSchema.optional()])) as Record<
    (typeof TERM_KEYS)[number],
    z.ZodOptional<typeof termLabelOverrideSchema>
  >,
);
export type NomenclatureOverrideInput = z.infer<typeof nomenclatureOverrideSchema>;

export type { NomenclatureOverrides } from '@edrion/shared-types';

export const putNomenclatureOverridesSchema = z.object({
  overrides: z.preprocess(sanitizeNomenclatureOverridesInput, nomenclatureOverrideSchema),
});
export type PutNomenclatureOverridesInput = z.infer<typeof putNomenclatureOverridesSchema>;

// =============================================================================
// Navigation layout (sidebar order + labels)
// =============================================================================

/** Tenant overrides for sidebar group/item order and display names. */
export const navigationLayoutSchema = z.object({
  groupOrder: z.array(z.string().min(1).max(64)).max(50).optional(),
  /** Map of groupId → ordered item ids within that group. */
  itemOrder: z.record(z.string().min(1).max(64), z.array(z.string().min(1).max(64)).max(100)).optional(),
  groupLabels: z.record(z.string().min(1).max(64), z.string().trim().min(1).max(80)).optional(),
  itemLabels: z.record(z.string().min(1).max(64), z.string().trim().min(1).max(80)).optional(),
  /** Nav item ids hidden from the sidebar for everyone at this institution. */
  hiddenItems: z.array(z.string().min(1).max(64)).max(200).optional(),
});
export type NavigationLayout = z.infer<typeof navigationLayoutSchema>;

export const putNavigationLayoutSchema = z.object({
  layout: navigationLayoutSchema,
});
export type PutNavigationLayoutInput = z.infer<typeof putNavigationLayoutSchema>;

/** Effective settings response includes resolved nomenclature alongside scalar registry values. */
export interface EffectiveSettingsResponse {
  values: EffectiveSettings;
  nomenclature: import('@edrion/shared-types').ResolvedNomenclature;
  /** Stored tenant overrides (empty object when none). */
  nomenclatureOverrides: import('@edrion/shared-types').NomenclatureOverrides;
  /** Stored sidebar layout overrides (empty object when none). */
  navigation: NavigationLayout;
}

/** PUT body for the curated settings form — a partial map of known keys to values. */
export const putEffectiveSettingsSchema = z.object({
  values: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])),
});
export type PutEffectiveSettingsInput = z.infer<typeof putEffectiveSettingsSchema>;

// =============================================================================
// Institution profile (tenant-facing edit of the institutions row)
// =============================================================================
//
// The institution admin edits their own institution's public identity, location and primary
// contact from Settings. Platform-only fields (status, tier, trial dates, CS owner) are NOT
// editable here. The operating currency is DERIVED from the country (never entered) and returned
// read-only; the server also mirrors it into the `finance.currency` setting so fees/payroll/reports
// resolve it. Reads need `institution_settings.view`; writes `institution_settings.manage`.

const profileContactSchema = z.object({
  name: z.string().trim().min(1, 'Required').max(160),
  email: z.string().trim().email('Enter a valid email').max(200),
  phone: optionalE164PhoneSchema,
  title: z.string().trim().max(120).optional(),
});

const profileAddressSchema = z
  .object({
    line1: z.string().trim().max(200).optional(),
    line2: z.string().trim().max(200).optional(),
    city: z.string().trim().max(120).optional(),
    region: z.string().trim().max(120).optional(),
    postalCode: z.string().trim().max(40).optional(),
    country: optionalCountryCodeSchema,
  })
  .optional();

/** Empty string, a valid http(s) URL, or null. Kept lenient so "clear the logo" (→ null) works. */
const logoUrlSchema = z
  .union([z.literal(''), z.string().trim().url('Enter a valid URL (https://…)').max(2048), z.null()])
  .transform((v) => (v === '' ? null : v))
  .optional();

export const updateInstitutionProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'Required').max(160),
  legalName: z.string().trim().min(1, 'Required').max(200),
  type: institutionTypeSchema,
  logoUrl: logoUrlSchema,
  country: countryCodeSchema,
  region: z.string().trim().max(120).nullish(),
  timezone: timezoneSchema,
  address: profileAddressSchema,
  primaryContact: profileContactSchema,
  version: versionSchema,
});
export type UpdateInstitutionProfileInput = z.infer<typeof updateInstitutionProfileSchema>;

/** GET response: the curated, editable profile + the derived (read-only) operating currency. */
export interface InstitutionProfile {
  id: string;
  publicId: string;
  displayName: string;
  legalName: string;
  type: InstitutionType;
  logoUrl: string | null;
  country: string;
  region: string | null;
  timezone: string;
  address: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  } | null;
  primaryContact: { name: string; email: string; phone?: string; title?: string };
  /** ISO-4217 derived from `country` (read-only confirmation), e.g. "INR". */
  currency: string | null;
  /** Human label for `currency`, e.g. "INR — Indian rupee (₹)". */
  currencyLabel: string;
  status: string;
  onboardingStatus: string;
  version: number;
}
