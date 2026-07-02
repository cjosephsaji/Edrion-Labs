'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { CheckCircle2, GraduationCap, Paperclip, Upload, X } from 'lucide-react';
import { Button, FieldError, Input, Label, Select } from '@edrion/ui';
import { applyApi, ApplyApiError, type InfoField, type InfoFileRef, type InfoRequestView } from '@/components/apply/apply-api';

export default function AdmissionInfoPage() {
  const { id } = useParams<{ id: string }>();
  const token = useSearchParams().get('token') ?? '';

  const [req, setReq] = useState<InfoRequestView | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let live = true;
    if (!token) {
      setLoadError('This link is missing its secure token. Please use the link from your email.');
      setLoading(false);
      return;
    }
    applyApi
      .getInfoRequest(id, token)
      .then((r) => {
        if (!live) return;
        setReq(r);
        setDone(r.submitted);
      })
      .catch((e) => live && setLoadError((e as ApplyApiError).message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [id, token]);

  const setValue = useCallback((key: string, v: unknown) => setValues((s) => ({ ...s, [key]: v })), []);

  async function submit() {
    if (!req) return;
    setSubmitError(null);
    for (const f of req.fields) {
      if (!f.required) continue;
      const v = values[f.key];
      const empty = v == null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && v.length === 0);
      if (empty) return setSubmitError(`"${f.label}" is required.`);
    }
    setSubmitting(true);
    try {
      await applyApi.submitInfo(id, token, values);
      setDone(true);
    } catch (e) {
      setSubmitError((e as ApplyApiError).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center overflow-y-auto bg-background px-4 py-12">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-white">
            <GraduationCap className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-md font-semibold text-text-primary">Edrion</span>
        </div>

        <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm sm:p-8">
          {loading ? (
            <div className="h-40 animate-pulse rounded-xl bg-background-secondary" />
          ) : loadError ? (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-3 text-sm text-danger">{loadError}</p>
          ) : done ? (
            <div className="py-6 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success-soft text-success">
                <CheckCircle2 className="h-8 w-8" aria-hidden />
              </span>
              <h1 className="mt-4 text-xl font-bold text-text-primary">Information received</h1>
              <p className="mt-2 text-sm text-text-secondary">Thank you. The admissions team will continue reviewing your application.</p>
            </div>
          ) : req ? (
            <>
              <h1 className="text-xl font-bold text-text-primary">Additional information requested</h1>
              {req.message && <p className="mt-1 whitespace-pre-wrap text-sm text-text-secondary">{req.message}</p>}
              <div className="mt-6 space-y-5">
                {req.fields.map((f) => (
                  <FieldInput key={f.key} field={f} value={values[f.key]} onChange={(v) => setValue(f.key, v)} requestId={id} token={token} />
                ))}
              </div>
              {submitError && (
                <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">{submitError}</p>
              )}
              <Button className="mt-6 w-full" onClick={submit} loading={submitting} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit information'}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

function FieldInput({ field, value, onChange, requestId, token }: { field: InfoField; value: unknown; onChange: (v: unknown) => void; requestId: string; token: string }) {
  const id = `f-${field.key}`;
  return (
    <div>
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-danger"> *</span>}
      </Label>
      {field.type === 'textarea' ? (
        <textarea
          id={id}
          rows={3}
          value={(value as string) ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-strong"
        />
      ) : field.type === 'select' ? (
        <Select id={id} value={(value as string) ?? ''} placeholder="Select…" options={(field.options ?? []).map((o) => ({ value: o, label: o }))} onChange={(e) => onChange(e.target.value)} />
      ) : field.type === 'mcq' ? (
        <McqInput field={field} value={(value as string[]) ?? []} onChange={onChange} />
      ) : field.type === 'file' ? (
        <FileInput field={field} value={(value as InfoFileRef[]) ?? []} onChange={onChange} requestId={requestId} token={token} />
      ) : (
        <Input id={id} type={field.type === 'date' ? 'date' : 'text'} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />
      )}
    </div>
  );
}

function McqInput({ field, value, onChange }: { field: InfoField; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) => (value.includes(opt) ? onChange(value.filter((v) => v !== opt)) : onChange([...value, opt]));
  return (
    <div className="mt-1 space-y-1.5">
      {(field.options ?? []).map((o) => (
        <label key={o} className="flex items-center gap-2 text-sm text-text-primary">
          <input type="checkbox" checked={value.includes(o)} onChange={() => toggle(o)} className="h-4 w-4 rounded border-border" />
          {o}
        </label>
      ))}
    </div>
  );
}

function FileInput({ field, value, onChange, requestId, token }: { field: InfoField; value: InfoFileRef[]; onChange: (v: InfoFileRef[]) => void; requestId: string; token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError(null);
    try {
      const uploaded: InfoFileRef[] = [];
      for (const file of field.multiple ? files : files.slice(0, 1)) {
        uploaded.push(await applyApi.uploadInfoFile(requestId, token, file));
      }
      onChange(field.multiple ? [...value, ...uploaded] : uploaded);
    } catch (err) {
      setError((err as ApplyApiError).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-text-secondary transition-colors hover:border-primary/40 hover:text-primary">
        <Upload className="h-4 w-4" /> {busy ? 'Uploading…' : field.multiple ? 'Add files' : 'Choose file'}
        <input type="file" hidden multiple={field.multiple} onChange={pick} disabled={busy} />
      </label>
      {value.length > 0 && (
        <ul className="mt-2 space-y-1">
          {value.map((f, i) => (
            <li key={i} className="flex items-center justify-between gap-2 rounded bg-background-secondary px-2 py-1 text-xs text-text-secondary">
              <span className="flex items-center gap-1 truncate"><Paperclip className="h-3 w-3" />{f.fileName}</span>
              <button type="button" aria-label="Remove" onClick={() => onChange(value.filter((_, j) => j !== i))}><X className="h-3 w-3" /></button>
            </li>
          ))}
        </ul>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}
