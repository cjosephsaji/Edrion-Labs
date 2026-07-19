export { cn } from './cn';
export { Button, type ButtonProps } from './button';
export { Card, CardHeader, CardTitle, CardDescription, CardContent, StatCard } from './card';
export { Badge, StatusBadge, type BadgeTone, type BadgeProps } from './badge';
export { Input, Label, FieldError } from './input';
export { OtpInput, OtpResendCooldown, type OtpInputProps, type OtpResendCooldownProps } from './otp-input';
export { Checkbox } from './checkbox';
export { Skeleton, TableSkeleton } from './skeleton';
export { EmptyState, ErrorState, PermissionDenied } from './states';
export { DataTable, type Column, type DataTableProps, type SortDir } from './table';
export { Drawer } from './drawer';
export { ToastProvider, useToast } from './toast';
export { MonthGrid, type MonthGridItem, type MonthGridProps } from './calendar/month-grid';
export { WeekGrid, type WeekGridProps } from './calendar/week-grid';
export {
  toISODate,
  fromISODate,
  startOfMonth,
  endOfMonth,
  addDays,
  addMonths,
  addWeeks,
  startOfWeek,
  monthMatrix,
  isSameDay,
  isToday,
  eachDayInRange,
} from './calendar/date-math';
export { DetailPanel, type DetailField, type DetailSection } from './detail-panel';
export { Dialog, ConfirmDialog } from './dialog';
export { Tabs, type TabItem } from './tabs';
export { useFocusTrap } from './use-focus-trap';
export { Select, type SelectOption, type SelectProps } from './select';

// ── Standardized location & contact selectors ──────────────────────────────────
export { Combobox, type ComboboxOption, type ComboboxProps } from './combobox';
export { CountrySelect, type CountrySelectProps } from './country-select';
export {
  AdministrativeDivisionSelect,
  type AdministrativeDivisionSelectProps,
} from './administrative-division-select';
export { TimezoneSelect, type TimezoneSelectProps } from './timezone-select';
export { InternationalPhoneInput, type InternationalPhoneInputProps } from './phone-input';
// Re-export the reference-data helpers so consumers have one import surface for both
// the components and the labels/validators that drive them.
export {
  COUNTRY_OPTIONS,
  TIMEZONE_OPTIONS,
  getCountry,
  countryName,
  isValidCountryCode,
  CURRENCY_OPTIONS,
  getCurrency,
  isValidCurrencyCode,
  currencyName,
  currencySymbol,
  currencyLabel,
  currencyForCountry,
  getSubdivisions,
  hasSubdivisions,
  subdivisionLabel,
  subdivisionName,
  subdivisionBelongsToCountry,
  timezoneLabel,
  detectBrowserTimezone,
  normalizePhone,
  type CountryOption,
  type CurrencyOption,
  type AdministrativeDivisionOption,
  type TimezoneOption,
} from '@edrion/schemas';
// Canonical global-settings registry (admin-redesign Phase 6) — one import surface for the web.
export {
  SETTINGS_REGISTRY,
  SETTINGS_BY_KEY,
  SETTINGS_CATEGORY_META,
  updateInstitutionProfileSchema,
  type SettingDef,
  type SettingType,
  type EffectiveSettings,
  type EffectiveSettingsResponse,
  type InstitutionProfile,
  type UpdateInstitutionProfileInput,
  putNomenclatureOverridesSchema,
  type NomenclatureOverrideInput,
  type PutNomenclatureOverridesInput,
  type NavigationLayout,
  putNavigationLayoutSchema,
  type PutNavigationLayoutInput,
} from '@edrion/schemas';
export {
  NOMENCLATURE_PRESETS,
  TERM_KEYS,
  resolveNomenclature,
  type TermKey,
  type TermLabel,
  type ResolvedNomenclature,
  type NomenclatureOverrides,
} from '@edrion/shared-types';
