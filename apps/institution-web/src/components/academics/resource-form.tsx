'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AdministrativeDivisionSelect,
  Button,
  Checkbox,
  Combobox,
  CountrySelect,
  Drawer,
  FieldError,
  Input,
  InternationalPhoneInput,
  Label,
  Select,
  TimezoneSelect,
  subdivisionLabel,
  type ComboboxOption,
  type SelectOption,
} from '@edrion/ui';
import { useFormat } from '@/lib/format';
import { useInstitutionCountry } from '@/lib/settings';
import { isEndAfterStart, maxStartDate, minEndDate } from '@/lib/date-range';
import {
  effectivePortalLogin,
  hasPortalLoginEmail,
  portalLoginAfterEmailChange,
} from '@/lib/portal-login-email';

/** A declarative form field. The `name` must match the API body key for the resource. */
export type FieldDef =
  | { name: string; label: string; type: 'text' | 'textarea' | 'date'; required?: boolean; nullable?: boolean; placeholder?: string; help?: string }
  | { name: string; label: string; type: 'number'; required?: boolean; nullable?: boolean; min?: number; placeholder?: string; help?: string }
  // Money entered in MAJOR units (e.g. rupees) with the institution's currency shown; stored as
  // integer MINOR units (×100). Keeps the DB's minor-unit convention while the user types real money.
  | { name: string; label: string; type: 'money'; required?: boolean; nullable?: boolean; min?: number; placeholder?: string; help?: string }
  | { name: string; label: string; type: 'checkbox'; help?: string }
  | { name: string; label: string; type: 'select'; required?: boolean; nullable?: boolean; options: SelectOption[]; placeholder?: string; help?: string }
  // Searchable single-select (e.g. a student/teacher picker). Options are supplied by the page.
  | { name: string; label: string; type: 'combobox'; required?: boolean; nullable?: boolean; options: ComboboxOption[]; placeholder?: string; searchPlaceholder?: string; emptyText?: string; help?: string }
  // Standardized location / contact selectors. `countryField` names the sibling field
  // that holds the ISO country code this field depends on.
  | { name: string; label: string; type: 'country'; required?: boolean; nullable?: boolean; help?: string }
  | { name: string; label: string; type: 'division'; required?: boolean; nullable?: boolean; countryField: string; help?: string }
  | { name: string; label: string; type: 'timezone'; required?: boolean; nullable?: boolean; countryField?: string; help?: string }
  | { name: string; label: string; type: 'phone'; required?: boolean; nullable?: boolean; countryField?: string; help?: string }
  // Escape hatch: a fully custom control (e.g. the RecipientPicker). The page supplies `render`,
  // which receives the current value + an onChange; the raw value is sent to the API unchanged.
  | {
      name: string;
      label: string;
      type: 'custom';
      render: (
        value: unknown,
        onChange: (v: unknown) => void,
        ctx?: { values: Values; disabled: boolean },
      ) => React.ReactNode;
      help?: string;
      /** Interactive only when `values[field]` equals `equals` (e.g. createLogin === true). */
      enabledWhen?: { field: string; equals: unknown };
      /** Required only when the same condition is met. */
      requiredWhen?: { field: string; equals: unknown };
    };

type Values = Record<string, unknown>;

function isFieldConditionMet(values: Values, condition?: { field: string; equals: unknown }): boolean {
  if (!condition) return true;
  return values[condition.field] === condition.equals;
}

/** Lets an embedded section (e.g. roles & access) contribute fields to the same Save action. */
export type ResourceFormExtraApi = {
  setSubmitPayload: (payload: Record<string, unknown>) => void;
  /** Live form values — use for fields (e.g. email) that sit above an extra section. */
  values: Values;
};

function formHasCreateLogin(fields: FieldDef[]): boolean {
  return fields.some((f) => f.name === 'createLogin');
}

function applyPortalLoginEmailRules(fields: FieldDef[], values: Values): Values {
  if (!formHasCreateLogin(fields)) return values;
  const next = { ...values };
  if (!hasPortalLoginEmail(next.email)) {
    next.createLogin = false;
    next.roleKeys = [];
    if ('campusIds' in next) next.campusIds = [];
  }
  return next;
}

/**
 * Builds the API request body from the form values: numbers are coerced, cleared optional
 * fields become null (nullable) or are omitted, checkboxes are booleans. `version` is added by
 * the caller for updates.
 */
function buildBody(fields: FieldDef[], values: Values): Values {
  const body: Values = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === 'custom') {
      body[f.name] = v;
    } else if (f.type === 'checkbox') {
      body[f.name] = !!v;
    } else if (f.type === 'money') {
      if (v === '' || v === undefined || v === null) {
        if (f.nullable) body[f.name] = null;
      } else {
        // Major units (rupees) → integer minor units (paise). Round to avoid FP drift (19.99 → 1999).
        body[f.name] = Math.round(Number(v) * 100);
      }
    } else if (f.type === 'number') {
      if (v === '' || v === undefined || v === null) {
        if (f.nullable) body[f.name] = null;
      } else {
        body[f.name] = Number(v);
      }
    } else {
      const s = typeof v === 'string' ? v.trim() : v;
      if (s === '' || s === undefined || s === null) {
        if (f.nullable) body[f.name] = null;
      } else {
        body[f.name] = s;
      }
    }
  }
  return body;
}

function initialFor(fields: FieldDef[], initial: Values): Values {
  const v: Values = {};
  for (const f of fields) {
    const provided = initial[f.name];
    if (f.type === 'checkbox') v[f.name] = !!provided;
    else if (f.type === 'custom') v[f.name] = provided ?? undefined;
    // Stored minor units → shown as major units for editing (150000 → "1500").
    else if (f.type === 'money') v[f.name] = provided == null || provided === '' ? '' : String(Number(provided) / 100);
    else v[f.name] = provided ?? '';
  }
  if (formHasCreateLogin(fields) && hasPortalLoginEmail(v.email)) {
    v.createLogin = true;
  }
  return applyPortalLoginEmailRules(fields, v);
}

/** The shared create/edit drawer form, driven entirely by a field list. */
export function ResourceForm({
  open,
  title,
  description,
  drawerClassName,
  fields,
  initial,
  submitting,
  error,
  onSubmit,
  onClose,
  extra,
}: {
  open: boolean;
  title: string;
  description?: string;
  drawerClassName?: string;
  fields: FieldDef[];
  initial: Values;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (body: Values) => void;
  onClose: () => void;
  /** Optional section below the standard fields; may register extra submit payload. */
  extra?: ReactNode | ((api: ResourceFormExtraApi) => ReactNode);
}) {
  const [values, setValues] = useState<Values>(() => initialFor(fields, initial));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [extraPayload, setExtraPayload] = useState<Values>({});
  const extraApi = useMemo<ResourceFormExtraApi>(
    () => ({ setSubmitPayload: setExtraPayload, values }),
    [values],
  );

  // Reset the form whenever it (re)opens or the edited row changes.
  useEffect(() => {
    if (open) {
      setValues(initialFor(fields, initial));
      setErrors({});
      setExtraPayload({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  function set(name: string, value: unknown) {
    setValues((v) => {
      const next = { ...v, [name]: value };
      if (name === 'email' && formHasCreateLogin(fields)) {
        const hadEmail = hasPortalLoginEmail(v.email);
        const hasEmail = hasPortalLoginEmail(value);
        next.createLogin = portalLoginAfterEmailChange(hadEmail, hasEmail, v.createLogin === true);
        if (!next.createLogin) {
          next.roleKeys = [];
          if ('campusIds' in next) next.campusIds = [];
        }
      }
      if (name === 'createLogin') {
        if (value === true && !hasPortalLoginEmail(next.email)) {
          next.createLogin = false;
        } else if (value === false) {
          next.roleKeys = [];
          if ('campusIds' in next) next.campusIds = [];
        }
      }
      if (name === 'startDate' && typeof value === 'string' && value) {
        const end = next.endDate;
        if (typeof end === 'string' && end && !isEndAfterStart(value, end)) {
          next.endDate = '';
        }
      }
      return next;
    });
  }

  function validate(): boolean {
    const activeValues = applyPortalLoginEmailRules(fields, values);
    const next: Record<string, string> = {};
    for (const f of fields) {
      if ('required' in f && f.required) {
        const v = activeValues[f.name];
        if (v === '' || v === undefined || v === null) next[f.name] = `${f.label} is required`;
      }
    }
    const start = activeValues.startDate;
    const end = activeValues.endDate;
    if (typeof start === 'string' && typeof end === 'string' && start && end && !isEndAfterStart(start, end)) {
      next.endDate = 'End date must be after the start date';
    }
    for (const f of fields) {
      if (f.type !== 'custom') continue;
      if (!isFieldConditionMet(activeValues, f.requiredWhen)) continue;
      const v = activeValues[f.name];
      const empty = Array.isArray(v) ? v.length === 0 : v === '' || v === undefined || v === null;
      if (empty) next[f.name] = `${f.label} is required`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    const synced = applyPortalLoginEmailRules(fields, values);
    onSubmit({ ...buildBody(fields, synced), ...extraPayload });
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      className={drawerClassName}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" form="resource-form" loading={submitting}>
            Save
          </Button>
        </div>
      }
    >
      <form id="resource-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {error && (
          <div role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {error}
          </div>
        )}
        {fields.map((f) => (
          <Field
            key={f.name}
            field={f}
            value={values[f.name]}
            values={values}
            error={errors[f.name]}
            onChange={(v) => set(f.name, v)}
          />
        ))}
        {extra && (
          <div className="border-t border-border pt-4">
            {typeof extra === 'function' ? extra(extraApi) : extra}
          </div>
        )}
      </form>
    </Drawer>
  );
}

function Field({
  field,
  value,
  values,
  error,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  values: Values;
  error?: string;
  onChange: (v: unknown) => void;
}) {
  const fmt = useFormat();
  const institutionCountry = useInstitutionCountry();
  const id = `f-${field.name}`;
  const errId = error ? `${id}-error` : undefined;

  if (field.type === 'checkbox') {
    const portalLoginField = field.name === 'createLogin';
    const hasEmail = hasPortalLoginEmail(values.email);
    const portalLoginChecked = portalLoginField
      ? effectivePortalLogin(values.email, value)
      : !!value;
    return (
      <div>
        <label className="flex cursor-pointer items-center gap-2.5">
          <Checkbox
            checked={portalLoginChecked}
            onChange={(e) => {
              if (portalLoginField && !hasEmail) return;
              onChange(e.target.checked);
            }}
          />
          <span className="text-sm font-medium text-text-primary">{field.label}</span>
        </label>
        {portalLoginField && !hasEmail && (
          <p className="mt-1 text-xs text-text-muted">Add an email address above to enable portal login.</p>
        )}
        {field.help && <p className="mt-1 text-xs text-text-muted">{field.help}</p>}
      </div>
    );
  }

  if (field.type === 'custom') {
    const enabled = isFieldConditionMet(values, field.enabledWhen);
    const required = isFieldConditionMet(values, field.requiredWhen);
    return (
      <div className={enabled ? undefined : 'opacity-50'}>
        <Label>
          {field.label}
          {required ? <span className="text-danger"> *</span> : null}
        </Label>
        <div className={enabled ? 'mt-1' : 'pointer-events-none mt-1'}>
          {field.render(value, onChange, { values, disabled: !enabled })}
        </div>
        {field.help && <p className="mt-1 text-xs text-text-muted">{field.help}</p>}
        <FieldError id={errId}>{error}</FieldError>
      </div>
    );
  }

  const requiredMark = 'required' in field && field.required ? <span className="text-danger"> *</span> : null;
  const countryValue =
    'countryField' in field && field.countryField ? String(values[field.countryField] ?? '') : '';
  const labelText =
    field.type === 'division' && countryValue ? subdivisionLabel(countryValue) : field.label;

  return (
    <div>
      <Label htmlFor={id}>
        {labelText}
        {requiredMark}
      </Label>
      {field.type === 'country' ? (
        <CountrySelect
          id={id}
          value={String(value ?? '')}
          invalid={!!error}
          aria-describedby={errId}
          onChange={onChange}
        />
      ) : field.type === 'division' ? (
        <AdministrativeDivisionSelect
          id={id}
          countryCode={countryValue}
          value={String(value ?? '')}
          invalid={!!error}
          aria-describedby={errId}
          onChange={onChange}
        />
      ) : field.type === 'timezone' ? (
        <TimezoneSelect
          id={id}
          countryCode={countryValue || undefined}
          value={String(value ?? '')}
          invalid={!!error}
          suggestDetected
          aria-describedby={errId}
          onChange={onChange}
        />
      ) : field.type === 'phone' ? (
        <InternationalPhoneInput
          id={id}
          value={String(value ?? '')}
          defaultCountry={countryValue || institutionCountry}
          invalid={!!error}
          aria-describedby={errId}
          onChange={onChange}
        />
      ) : field.type === 'select' ? (
        <Select
          id={`f-${field.name}`}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          options={field.options}
          placeholder={field.placeholder ?? (field.required ? 'Select…' : '—')}
        />
      ) : field.type === 'combobox' ? (
        <Combobox
          id={id}
          value={String(value ?? '')}
          onChange={onChange}
          options={field.options}
          placeholder={field.placeholder ?? 'Select…'}
          searchPlaceholder={field.searchPlaceholder}
          emptyText={field.emptyText}
          invalid={!!error}
          aria-describedby={errId}
        />
      ) : field.type === 'money' ? (
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-text-muted" aria-hidden="true">
            {fmt.currencySymbol}
          </span>
          <Input
            id={id}
            type="number"
            inputMode="decimal"
            step="0.01"
            min={field.min ?? 0}
            className="pl-9 tabular-nums"
            value={String(value ?? '')}
            aria-describedby={errId}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder ?? '0.00'}
          />
        </div>
      ) : field.type === 'textarea' ? (
        <textarea
          id={`f-${field.name}`}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      ) : (
        <Input
          id={`f-${field.name}`}
          type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
          min={
            field.type === 'number'
              ? field.min
              : field.type === 'date' && field.name === 'endDate'
                ? minEndDate(String(values.startDate ?? ''))
                : undefined
          }
          max={
            field.type === 'date' && field.name === 'startDate'
              ? maxStartDate(String(values.endDate ?? ''))
              : undefined
          }
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'placeholder' in field ? field.placeholder : undefined}
        />
      )}
      {field.help && !error && <p className="mt-1 text-xs text-text-muted">{field.help}</p>}
      <FieldError id={errId}>{error}</FieldError>
    </div>
  );
}
