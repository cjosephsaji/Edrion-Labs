'use client';
import { useEffect, useState } from 'react';
import { Button, Drawer, FieldError, Input, Label, Select, type SelectOption } from '@edrion/ui';

/** A declarative form field. The `name` must match the API body key for the resource. */
export type FieldDef =
  | { name: string; label: string; type: 'text' | 'textarea' | 'date'; required?: boolean; nullable?: boolean; placeholder?: string; help?: string }
  | { name: string; label: string; type: 'number'; required?: boolean; nullable?: boolean; min?: number; placeholder?: string; help?: string }
  | { name: string; label: string; type: 'checkbox'; help?: string }
  | { name: string; label: string; type: 'select'; required?: boolean; nullable?: boolean; options: SelectOption[]; placeholder?: string; help?: string };

type Values = Record<string, unknown>;

/**
 * Builds the API request body from the form values: numbers are coerced, cleared optional
 * fields become null (nullable) or are omitted, checkboxes are booleans. `version` is added by
 * the caller for updates.
 */
function buildBody(fields: FieldDef[], values: Values): Values {
  const body: Values = {};
  for (const f of fields) {
    const v = values[f.name];
    if (f.type === 'checkbox') {
      body[f.name] = !!v;
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
    else v[f.name] = provided ?? '';
  }
  return v;
}

/** The shared create/edit drawer form, driven entirely by a field list. */
export function ResourceForm({
  open,
  title,
  fields,
  initial,
  submitting,
  error,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  fields: FieldDef[];
  initial: Values;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (body: Values) => void;
  onClose: () => void;
}) {
  const [values, setValues] = useState<Values>(() => initialFor(fields, initial));
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset the form whenever it (re)opens or the edited row changes.
  useEffect(() => {
    if (open) {
      setValues(initialFor(fields, initial));
      setErrors({});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  function set(name: string, value: unknown) {
    setValues((v) => ({ ...v, [name]: value }));
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    for (const f of fields) {
      if ('required' in f && f.required) {
        const v = values[f.name];
        if (v === '' || v === undefined || v === null) next[f.name] = `${f.label} is required`;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    onSubmit(buildBody(fields, values));
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title}
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
          <Field key={f.name} field={f} value={values[f.name]} error={errors[f.name]} onChange={(v) => set(f.name, v)} />
        ))}
      </form>
    </Drawer>
  );
}

function Field({
  field,
  value,
  error,
  onChange,
}: {
  field: FieldDef;
  value: unknown;
  error?: string;
  onChange: (v: unknown) => void;
}) {
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary focus:ring-ring"
        />
        <span className="text-sm font-medium text-text-primary">{field.label}</span>
      </label>
    );
  }

  const requiredMark = 'required' in field && field.required ? <span className="text-danger"> *</span> : null;

  return (
    <div>
      <Label htmlFor={`f-${field.name}`}>
        {field.label}
        {requiredMark}
      </Label>
      {field.type === 'select' ? (
        <Select
          id={`f-${field.name}`}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          options={field.options}
          placeholder={field.placeholder ?? (field.required ? 'Select…' : '—')}
        />
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
          min={field.type === 'number' ? field.min : undefined}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
          placeholder={'placeholder' in field ? field.placeholder : undefined}
        />
      )}
      {field.help && !error && <p className="mt-1 text-xs text-text-muted">{field.help}</p>}
      <FieldError>{error}</FieldError>
    </div>
  );
}
