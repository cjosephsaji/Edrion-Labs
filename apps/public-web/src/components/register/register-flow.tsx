'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  KeyRound,
  Mail,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import {
  AdministrativeDivisionSelect,
  Button,
  CountrySelect,
  FieldError,
  Input,
  InternationalPhoneInput,
  Label,
  Select,
  TimezoneSelect,
  cn,
  subdivisionLabel,
} from '@edrion/ui';
import {
  campusInfoSchema,
  consentSchema,
  institutionInfoSchema,
  locationSchema,
  primaryContactSchema,
  subscriptionInfoSchema,
} from '@edrion/schemas';
import { InstitutionType } from '@edrion/shared-types';
import {
  registrationApi,
  RegistrationApiError,
  type DraftView,
  type GeoGuess,
  type PublicPlan,
} from './registration-api';

const STORAGE_KEY = 'edrion_registration_v1';

type SectionKey =
  | 'institutionInfo'
  | 'location'
  | 'campusInfo'
  | 'primaryContact'
  | 'subscription'
  | 'consent';

interface FieldDef {
  key: string;
  label: string;
  type:
    | 'text'
    | 'number'
    | 'email'
    | 'tel'
    | 'url'
    | 'textarea'
    | 'select'
    | 'country'
    | 'division'
    | 'timezone'
    | 'phone';
  required?: boolean;
  placeholder?: string;
  hint?: string;
  maxLength?: number;
  options?: { value: string; label: string }[];
  half?: boolean;
}

interface StepDef {
  key: SectionKey;
  title: string;
  blurb: string;
  schema: z.ZodTypeAny;
  fields: FieldDef[];
}

const TYPE_OPTIONS = [
  { value: InstitutionType.School, label: 'School' },
  { value: InstitutionType.College, label: 'College' },
  { value: InstitutionType.University, label: 'University' },
  { value: InstitutionType.TrainingCenter, label: 'Training Center' },
];

const CONTACT_METHOD_OPTIONS = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const STEPS: StepDef[] = [
  {
    key: 'institutionInfo',
    title: 'Institution',
    blurb: 'Tell us about your institution.',
    schema: institutionInfoSchema,
    fields: [
      { key: 'legalName', label: 'Legal name', type: 'text', required: true, placeholder: 'Greenwood Education Trust' },
      { key: 'displayName', label: 'Display name', type: 'text', required: true, placeholder: 'Greenwood High School' },
      { key: 'type', label: 'Institution type', type: 'select', required: true, options: TYPE_OPTIONS, half: true },
      { key: 'yearEstablished', label: 'Year established', type: 'number', placeholder: '1998', half: true },
      { key: 'website', label: 'Website', type: 'url', placeholder: 'https://greenwood.edu', half: true },
      { key: 'registrationNumber', label: 'Registration number', type: 'text', placeholder: 'Optional', half: true },
      { key: 'logoUrl', label: 'Logo URL', type: 'url', placeholder: 'https://… (optional)' },
    ],
  },
  {
    key: 'location',
    title: 'Location',
    blurb: 'Where is your institution based?',
    schema: locationSchema,
    fields: [
      { key: 'country', label: 'Country', type: 'country', required: true, half: true },
      { key: 'region', label: 'State / Province', type: 'division', half: true },
      { key: 'city', label: 'City', type: 'text', required: true, half: true },
      { key: 'postalCode', label: 'Postal code', type: 'text', half: true },
      { key: 'address', label: 'Address', type: 'textarea', required: true, placeholder: 'Street address' },
      { key: 'timezone', label: 'Time zone', type: 'timezone', required: true, half: true },
    ],
  },
  {
    key: 'campusInfo',
    title: 'Campuses',
    blurb: 'Help us size your rollout.',
    schema: campusInfoSchema,
    fields: [
      { key: 'currentCampuses', label: 'Current campuses', type: 'number', required: true, placeholder: '1', half: true },
      { key: 'expectedCampusesNextYear', label: 'Expected next year', type: 'number', placeholder: '2', half: true },
      { key: 'firstCampusName', label: 'First campus name', type: 'text', required: true, placeholder: 'Main Campus' },
      { key: 'expectedStudents', label: 'Expected students', type: 'number', required: true, placeholder: '1200', half: true },
      { key: 'expectedStaff', label: 'Expected staff', type: 'number', placeholder: '120', half: true },
    ],
  },
  {
    key: 'primaryContact',
    title: 'Contact',
    blurb: 'Who should we work with?',
    schema: primaryContactSchema,
    fields: [
      { key: 'fullName', label: 'Full name', type: 'text', required: true, half: true },
      { key: 'jobTitle', label: 'Job title', type: 'text', placeholder: 'Principal', half: true },
      { key: 'phone', label: 'Phone number', type: 'phone', half: true },
      { key: 'preferredContactMethod', label: 'Preferred contact', type: 'select', options: CONTACT_METHOD_OPTIONS, half: true },
    ],
  },
  {
    key: 'subscription',
    title: 'Choose your plan',
    blurb: 'Pick the plan you want. You can change it later — billing starts after onboarding.',
    schema: subscriptionInfoSchema,
    fields: [
      { key: 'launchTimeline', label: 'Expected launch', type: 'text', placeholder: 'Next term', half: true },
      { key: 'currentErp', label: 'Current ERP / system', type: 'text', half: true },
      { key: 'hearAboutUs', label: 'How did you hear about us?', type: 'text', half: true },
      { key: 'additionalRequirements', label: 'Additional requirements', type: 'textarea', placeholder: 'Anything else we should know?' },
    ],
  },
  {
    key: 'consent',
    title: 'Consent',
    blurb: 'A couple of agreements to finish.',
    schema: consentSchema,
    fields: [],
  },
];

type Data = Record<SectionKey, Record<string, string | boolean>>;

const emptyData = (): Data => ({
  institutionInfo: {},
  location: { timezone: 'UTC' },
  campusInfo: {},
  primaryContact: {},
  subscription: {},
  consent: {},
});

/** Flatten a server JSONB section into form-field values (scalars → strings, booleans kept). */
function toFormValues(obj: Record<string, unknown>): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === 'boolean' ? v : String(v);
  }
  return out;
}

/** Drop empty-string / undefined keys so optional fields aren't coerced to 0/''. */
function clean(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}

export function RegisterFlow() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<Data>(emptyData);
  const [emailVerified, setEmailVerified] = useState(false);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hp, setHp] = useState(''); // honeypot
  const [hydrated, setHydrated] = useState(false);
  // 'choose' = the landing chooser (continue vs. start new); 'form' = the multi-step form.
  const [phase, setPhase] = useState<'choose' | 'form'>('choose');
  const [hasLocal, setHasLocal] = useState(false);
  const draftRef = useRef<{ id: string | null; token: string | null }>({ id: null, token: null });
  const geoRef = useRef(false);

  // ── Persistence ──────────────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.data) setData({ ...emptyData(), ...s.data });
        if (s.draftId) draftRef.current.id = s.draftId;
        if (s.resumeToken) draftRef.current.token = s.resumeToken;
        if (s.emailVerified) setEmailVerified(true);
        if (s.verifiedEmail) setVerifiedEmail(s.verifiedEmail);
        // Both id + token means this device can resume straight into the form (no code needed).
        if (s.draftId && s.resumeToken) setHasLocal(true);
      }
    } catch {
      /* ignore corrupt storage */
    }
    setHydrated(true);
  }, []);

  /** Rehydrate the whole form from a server draft (used on cross-device resume). */
  const hydrateFromView = useCallback((v: DraftView) => {
    const next = emptyData();
    const secs: SectionKey[] = ['institutionInfo', 'location', 'campusInfo', 'primaryContact', 'subscription', 'consent'];
    for (const k of secs) {
      const src = v[k] as Record<string, unknown> | null;
      if (src) next[k] = { ...next[k], ...toFormValues(src) };
    }
    setData(next);
    persist({ data: next });
    if (v.emailVerified) {
      setEmailVerified(true);
      setVerifiedEmail(v.verifiedEmail);
      persist({ emailVerified: true, verifiedEmail: v.verifiedEmail });
      setStep(1); // email already done — drop them at the first content step
    } else {
      setStep(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Landing chooser actions ──────────────────────────────────────────────────
  const startNew = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    draftRef.current = { id: null, token: null };
    geoRef.current = false;
    setData(emptyData());
    setEmailVerified(false);
    setVerifiedEmail(null);
    setErrors({});
    setStep(0);
    setPhase('form');
  };

  const resumeOnThisDevice = () => {
    setErrors({});
    setStep(emailVerified ? 1 : 0);
    setPhase('form');
  };

  const onResumedByCode = (view: DraftView, id: string, token: string) => {
    draftRef.current = { id, token };
    persist({ draftId: id, resumeToken: token });
    hydrateFromView(view);
    setPhase('form');
  };

  const persist = useCallback(
    (next: Partial<{ data: Data; draftId: string | null; resumeToken: string | null; emailVerified: boolean; verifiedEmail: string | null }>) => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const cur = raw ? JSON.parse(raw) : {};
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, ...next }));
      } catch {
        /* storage full / unavailable — non-fatal */
      }
    },
    [],
  );

  const setField = (section: SectionKey, key: string, value: string | boolean) => {
    setData((d) => {
      const next = { ...d, [section]: { ...d[section], [key]: value } };
      persist({ data: next });
      return next;
    });
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
    // Editing the contact email after verification invalidates it.
    if (section === 'primaryContact' && key === 'email' && emailVerified && value !== verifiedEmail) {
      setEmailVerified(false);
      persist({ emailVerified: false });
    }
  };

  // ── Draft lifecycle ─────────────────────────────────────────────────────────
  const ensureDraft = useCallback(async (): Promise<{ id: string; token: string }> => {
    if (draftRef.current.id && draftRef.current.token) {
      return { id: draftRef.current.id, token: draftRef.current.token };
    }
    const res = await registrationApi.start();
    draftRef.current = { id: res.id, token: res.resumeToken };
    persist({ draftId: res.id, resumeToken: res.resumeToken });
    return { id: res.id, token: res.resumeToken };
  }, [persist]);

  const autosave = useCallback(
    async (section: SectionKey) => {
      setSaving(true);
      try {
        const { id, token } = await ensureDraft();
        await registrationApi.patch(id, token, { [section]: clean(data[section]) });
      } catch {
        /* autosave is best-effort; the final submit re-sends everything */
      } finally {
        setSaving(false);
      }
    },
    [data, ensureDraft],
  );

  // ── Validation ──────────────────────────────────────────────────────────────
  const validateSection = (s: StepDef): boolean => {
    const res = s.schema.safeParse(coerce(data[s.key]));
    if (res.success) {
      setErrors({});
      return true;
    }
    const next: Record<string, string> = {};
    for (const issue of res.error.issues) {
      const k = String(issue.path[0] ?? '');
      if (k && !next[k]) next[k] = issue.message;
    }
    setErrors(next);
    return false;
  };

  // Step 0 = email, steps 1..N = the section forms, step N+1 = review.
  const REVIEW_STEP = STEPS.length + 1;
  const isEmailStep = step === 0;
  const isReview = step === REVIEW_STEP;
  const current = isEmailStep || isReview ? undefined : STEPS[step - 1];
  const isConsent = current?.key === 'consent';
  const isSubscription = current?.key === 'subscription';

  // Auto-detect location when the applicant first reaches the Location step (step index 2),
  // filling only fields they haven't set. Best-effort: server IP geo → browser locale/timezone.
  useEffect(() => {
    if (!hydrated || step !== 2 || geoRef.current || data.location.country) return;
    geoRef.current = true;
    void (async () => {
      const g = await registrationApi.geo().catch(() => ({}) as GeoGuess);
      let country = g.country;
      let timezone = g.timezone;
      const city = g.city;
      if (!country) {
        try {
          country = new Intl.Locale(navigator.language).maximize().region ?? undefined;
        } catch {
          /* ignore */
        }
      }
      if (!timezone) {
        try {
          timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          /* ignore */
        }
      }
      setData((d) => {
        const loc = { ...d.location };
        if (country && !loc.country) loc.country = country;
        if (city && !loc.city) loc.city = city;
        if (timezone && (!loc.timezone || loc.timezone === 'UTC')) loc.timezone = timezone;
        const next = { ...d, location: loc };
        persist({ data: next });
        return next;
      });
    })();
  }, [hydrated, step, data.location.country, persist]);

  const goNext = async () => {
    if (isEmailStep) {
      if (!emailVerified) {
        setErrors((e) => ({ ...e, email: 'Please verify your email to continue.' }));
        return;
      }
      setErrors({});
      setStep(1);
      return;
    }
    if (!isReview) {
      const s = STEPS[step - 1]!;
      if (!validateSection(s)) return;
      void autosave(s.key);
    }
    setErrors({});
    setStep((x) => Math.min(x + 1, REVIEW_STEP));
  };
  const goBack = () => {
    setErrors({});
    setStep((x) => Math.max(0, x - 1));
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async () => {
    setSubmitError(null);
    // Validate every section; jump to the first that fails.
    for (let i = 0; i < STEPS.length; i++) {
      const s = STEPS[i]!;
      const res = s.schema.safeParse(coerce(data[s.key]));
      if (!res.success) {
        setStep(i + 1); // section i renders at step i+1 (step 0 is the email step)
        validateSection(s);
        return;
      }
    }
    if (!emailVerified) {
      setStep(0);
      setErrors({ email: 'Please verify your email to continue.' });
      return;
    }
    setSubmitting(true);
    try {
      const { id, token } = await ensureDraft();
      const payload = {
        institutionInfo: coerce(data.institutionInfo),
        location: coerce(data.location),
        campusInfo: coerce(data.campusInfo),
        primaryContact: coerce(data.primaryContact),
        subscription: coerce(data.subscription),
        consent: coerce(data.consent),
        website: hp || undefined,
      };
      const res = await registrationApi.submit(id, token, payload);
      localStorage.removeItem(STORAGE_KEY);
      router.push(`/register/success?ref=${encodeURIComponent(res.publicRef)}`);
    } catch (e) {
      const err = e as RegistrationApiError;
      setSubmitError(err.message);
      setSubmitting(false);
    }
  };

  if (!hydrated) {
    return <div className="h-64 animate-pulse rounded-2xl border border-border bg-surface" aria-hidden />;
  }

  if (phase === 'choose') {
    return (
      <LandingChooser
        hasLocal={hasLocal}
        verifiedEmail={verifiedEmail}
        onStartNew={startNew}
        onResumeLocal={resumeOnThisDevice}
        onResumedByCode={onResumedByCode}
      />
    );
  }

  const totalSteps = STEPS.length + 2; // email + sections + review
  const progress = Math.round(((step + 1) / totalSteps) * 100);

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated shadow-sm">
      {/* Progress */}
      <div className="border-b border-border p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-md font-semibold text-text-primary">Institution registration</h2>
          <span className="text-xs text-text-secondary" aria-live="polite">
            {saving ? 'Saving…' : `Step ${Math.min(step + 1, totalSteps)} of ${totalSteps}`}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-background-secondary" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-primary transition-all duration-300 ease-standard" style={{ width: `${progress}%` }} />
        </div>
        <ol className="mt-4 hidden flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:flex">
          {['Email', ...STEPS.map((s) => s.title), 'Review'].map((title, i, arr) => (
            <li key={title} className="flex items-center gap-2.5">
              <span
                className={cn(
                  'flex items-center gap-1',
                  i === step ? 'font-semibold text-primary' : i < step ? 'text-success' : 'text-text-muted',
                )}
              >
                {i < step ? <Check className="h-3 w-3 shrink-0" /> : null}
                <span>{title}</span>
              </span>
              {i < arr.length - 1 && <ChevronRight className="h-3 w-3 text-text-muted/40 shrink-0" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="p-5 sm:p-6">
        {isEmailStep ? (
          <div className="page-enter space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">Let&apos;s start with your email</h3>
              <p className="text-sm text-text-secondary">
                We&apos;ll verify it and email you a link so you can continue this registration on any device.
              </p>
            </div>
            <EmailVerify
              email={(data.primaryContact.email as string) ?? ''}
              verified={emailVerified}
              error={errors.email}
              onEmailChange={(v) => setField('primaryContact', 'email', v)}
              ensureDraft={ensureDraft}
              onSavedEmail={async (id, token, email) => {
                await registrationApi.patch(id, token, { primaryContact: clean({ ...data.primaryContact, email }) });
              }}
              onVerified={(email) => {
                setEmailVerified(true);
                setVerifiedEmail(email);
                persist({ emailVerified: true, verifiedEmail: email });
              }}
            />
          </div>
        ) : current ? (
          <div className="page-enter space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-text-primary">{current.title}</h3>
              <p className="text-sm text-text-secondary">{current.blurb}</p>
            </div>

            {isSubscription && (
              <PlanPicker
                value={(data.subscription.planKey as string) ?? ''}
                error={errors.planKey}
                onChange={(v) => setField('subscription', 'planKey', v)}
              />
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {current.fields.map((f) => (
                <FieldControl
                  key={f.key}
                  field={f}
                  value={(data[current.key][f.key] as string) ?? ''}
                  error={errors[f.key]}
                  // The address country drives the subdivision list, the timezone
                  // prioritisation, and the default phone country (never locked).
                  countryCode={(data.location.country as string) ?? ''}
                  onChange={(v) => setField(current.key, f.key, v)}
                />
              ))}
            </div>

            {isConsent && (
              <ConsentStep
                values={data.consent}
                error={errors}
                onToggle={(k, v) => setField('consent', k, v)}
              />
            )}
          </div>
        ) : (
          <ReviewStep data={data} emailVerified={emailVerified} verifiedEmail={verifiedEmail} onEdit={setStep} />
        )}

        {/* Honeypot — hidden from humans + screen readers. */}
        <div aria-hidden className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} />
          </label>
        </div>

        {submitError && (
          <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {submitError}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button variant="ghost" size="sm" onClick={goBack} disabled={step === 0 || submitting} className={step === 0 ? 'invisible' : ''}>
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {!isReview ? (
            <Button onClick={goNext}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} loading={submitting} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Coerce raw string form values to the shapes the section schemas expect. */
function coerce(section: Record<string, string | boolean>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(section)) {
    if (v === '' || v === undefined || v === null) continue;
    out[k] = v;
  }
  return out;
}

function FieldControl({
  field,
  value,
  error,
  countryCode,
  onChange,
}: {
  field: FieldDef;
  value: string;
  error?: string;
  countryCode: string;
  onChange: (v: string) => void;
}) {
  const id = `f-${field.key}`;
  const wrap = field.type === 'textarea' || !field.half ? 'sm:col-span-2' : '';
  const errId = error ? `${id}-error` : undefined;
  const label = field.type === 'division' && countryCode ? subdivisionLabel(countryCode) : field.label;
  return (
    <div className={wrap}>
      <Label htmlFor={id}>
        {label}
        {field.required && <span className="text-danger"> *</span>}
      </Label>
      {field.type === 'country' ? (
        <CountrySelect id={id} value={value} invalid={!!error} aria-describedby={errId} onChange={onChange} />
      ) : field.type === 'division' ? (
        <AdministrativeDivisionSelect
          id={id}
          countryCode={countryCode}
          value={value}
          invalid={!!error}
          aria-describedby={errId}
          onChange={onChange}
        />
      ) : field.type === 'timezone' ? (
        <TimezoneSelect
          id={id}
          countryCode={countryCode}
          value={value}
          invalid={!!error}
          suggestDetected
          aria-describedby={errId}
          onChange={onChange}
        />
      ) : field.type === 'phone' ? (
        <InternationalPhoneInput
          id={id}
          value={value}
          defaultCountry={countryCode}
          invalid={!!error}
          aria-describedby={errId}
          onChange={onChange}
        />
      ) : field.type === 'select' ? (
        <Select
          id={id}
          options={field.options ?? []}
          placeholder="Select…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.type === 'textarea' ? (
        <textarea
          id={id}
          rows={3}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
      ) : (
        <Input
          id={id}
          type={field.type === 'number' ? 'number' : field.type}
          inputMode={field.type === 'number' ? 'numeric' : undefined}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          value={value}
          onChange={(e) => onChange(field.maxLength === 2 ? e.target.value.toUpperCase() : e.target.value)}
        />
      )}
      {field.hint && !error && <p className="mt-1 text-xs text-text-muted">{field.hint}</p>}
      <FieldError id={errId}>{error}</FieldError>
    </div>
  );
}

function EmailVerify({
  email,
  verified,
  error,
  onEmailChange,
  ensureDraft,
  onSavedEmail,
  onVerified,
}: {
  email: string;
  verified: boolean;
  error?: string;
  onEmailChange: (v: string) => void;
  ensureDraft: () => Promise<{ id: string; token: string }>;
  onSavedEmail: (id: string, token: string, email: string) => Promise<void>;
  onVerified: (email: string) => void;
}) {
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  // The code box only applies to the address we actually sent to — editing the email hides it.
  const sent = sentEmail !== null && sentEmail === email;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const emailValid = z.string().email().safeParse(email).success;

  const request = async () => {
    setLocalError(null);
    setBusy(true);
    try {
      const { id, token } = await ensureDraft();
      await onSavedEmail(id, token, email);
      const res = await registrationApi.requestOtp(id, token, email);
      setSentEmail(email);
      setCode('');
      setResendIn(res.resendAvailableInSeconds);
    } catch (e) {
      setLocalError((e as RegistrationApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setLocalError(null);
    setBusy(true);
    try {
      const { id, token } = await ensureDraft();
      await registrationApi.verifyOtp(id, token, code.trim());
      onVerified(email);
    } catch (e) {
      setLocalError((e as RegistrationApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background-secondary p-4">
      <Label htmlFor="email">
        Official email address <span className="text-danger">*</span>
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="email"
          type="email"
          placeholder="principal@greenwood.edu"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          className="sm:flex-1"
        />
        {verified ? (
          <span className="inline-flex h-input items-center gap-1.5 rounded-md bg-success-soft px-3 text-sm font-medium text-success">
            <CheckCircle2 className="h-4 w-4" /> Verified
          </span>
        ) : (
          <Button variant="secondary" onClick={request} loading={busy && !sent} disabled={!emailValid || busy || resendIn > 0}>
            <Mail className="h-4 w-4" /> {sent ? (resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code') : 'Verify email'}
          </Button>
        )}
      </div>
      {verified ? (
        <p className="mt-2 rounded-md border border-border bg-surface px-3 py-2 text-xs text-text-secondary">
          <span className="font-medium text-text-primary">Wrong email?</span> Edit the address above and we&apos;ll send a fresh verification code.
        </p>
      ) : sent ? (
        <p className="mt-2 text-xs text-text-muted">
          <span className="font-medium text-primary">Wrong email?</span> Edit the address above before entering the code.
        </p>
      ) : null}
      <FieldError>{error ?? localError}</FieldError>

      {sent && !verified && (
        <div className="page-enter mt-3 border-t border-border pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm text-text-secondary">
            <ShieldCheck className="h-4 w-4 text-primary" /> We emailed a 6-digit code to <strong className="text-text-primary">{email}</strong>. It expires in 10 minutes.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="font-mono tracking-[0.4em] sm:max-w-[180px]"
            />
            <Button onClick={verify} loading={busy} disabled={code.length !== 6 || busy}>
              Verify
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function ConsentStep({
  values,
  error,
  onToggle,
}: {
  values: Record<string, string | boolean>;
  error: Record<string, string>;
  onToggle: (k: string, v: boolean) => void;
}) {
  const Box = ({ k, label, required }: { k: string; label: React.ReactNode; required?: boolean }) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3.5 transition-colors hover:bg-background-secondary">
      <input
        type="checkbox"
        checked={Boolean(values[k])}
        onChange={(e) => onToggle(k, e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-[var(--primary)]"
      />
      <span className="text-sm text-text-primary">
        {label}
        {required && <span className="text-danger"> *</span>}
      </span>
    </label>
  );
  return (
    <div className="space-y-3">
      <Box k="termsAccepted" required label={<>I agree to the <a className="text-primary underline" href="#" onClick={(e) => e.preventDefault()}>Terms &amp; Conditions</a>.</>} />
      <Box k="privacyAccepted" required label={<>I have read and accept the <a className="text-primary underline" href="#" onClick={(e) => e.preventDefault()}>Privacy Policy</a>.</>} />
      <Box k="marketingOptIn" label="Send me occasional product updates and onboarding tips (optional)." />
      {(error.termsAccepted || error.privacyAccepted) && (
        <FieldError>{error.termsAccepted || error.privacyAccepted}</FieldError>
      )}
    </div>
  );
}

function ReviewStep({
  data,
  emailVerified,
  verifiedEmail,
  onEdit,
}: {
  data: Data;
  emailVerified: boolean;
  verifiedEmail: string | null;
  onEdit: (step: number) => void;
}) {
  // Section i is edited at UI step i+1 (step 0 is the email step).
  const rows: { step: number; title: string; items: [string, unknown][] }[] = STEPS.map((s, i) => ({
    step: i + 1,
    title: s.title,
    items: Object.entries(coerce(data[s.key])),
  }));
  return (
    <div className="page-enter space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Review &amp; submit</h3>
        <p className="text-sm text-text-secondary">Check everything looks right before submitting.</p>
      </div>
      {emailVerified ? (
        <p className="rounded-md border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
          Email verified{verifiedEmail ? <>: <strong>{verifiedEmail}</strong></> : ''}.
        </p>
      ) : (
        <p className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          Your email isn't verified yet.{' '}
          <button className="font-medium underline" onClick={() => onEdit(0)}>
            Verify it now
          </button>
          .
        </p>
      )}
      <div className="divide-y divide-border rounded-xl border border-border">
        {rows.map((r) => (
          <div key={r.step} className="p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">{r.title}</span>
              <button className="text-xs font-medium text-primary hover:underline" onClick={() => onEdit(r.step)}>
                Edit
              </button>
            </div>
            {r.items.length === 0 ? (
              <p className="text-xs text-text-muted">—</p>
            ) : (
              <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                {r.items.map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 text-sm">
                    <dt className="text-text-secondary">{labelize(k)}</dt>
                    <dd className="truncate text-right text-text-primary">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function labelize(k: string): string {
  return k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}

/** Opening screen: resume an in-progress registration (this device or via a code) or start fresh. */
function LandingChooser({
  hasLocal,
  verifiedEmail,
  onStartNew,
  onResumeLocal,
  onResumedByCode,
}: {
  hasLocal: boolean;
  verifiedEmail: string | null;
  onStartNew: () => void;
  onResumeLocal: () => void;
  onResumedByCode: (view: DraftView, id: string, token: string) => void;
}) {
  const [mode, setMode] = useState<'menu' | 'code'>('menu');

  const Option = ({
    icon,
    title,
    desc,
    onClick,
    highlight,
  }: {
    icon: React.ReactNode;
    title: string;
    desc: string;
    onClick: () => void;
    highlight?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors',
        highlight ? 'border-primary bg-primary/5 hover:bg-primary/10' : 'border-border hover:border-primary/40 hover:bg-background-secondary',
      )}
    >
      <span
        className={cn(
          'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg',
          highlight ? 'bg-primary text-white' : 'bg-background-secondary text-primary',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-text-primary">{title}</span>
        <span className="block text-xs text-text-secondary">{desc}</span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0 text-text-muted" />
    </button>
  );

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated p-6 shadow-sm sm:p-8">
      <h2 className="text-xl font-semibold text-text-primary">Register your institution</h2>
      <p className="mt-1 text-sm text-text-secondary">
        Start a new application, or continue one you already began.
      </p>

      {mode === 'menu' ? (
        <div className="page-enter mt-6 space-y-3">
          {hasLocal && (
            <Option
              highlight
              icon={<RotateCcw className="h-5 w-5" />}
              title="Resume on this device"
              desc={verifiedEmail ? `Pick up your draft for ${verifiedEmail}.` : 'Pick up where you left off.'}
              onClick={onResumeLocal}
            />
          )}
          <Option
            icon={<KeyRound className="h-5 w-5" />}
            title="Continue with a code"
            desc="Get a code emailed to your registration address to continue on any device."
            onClick={() => setMode('code')}
          />
          <Option
            icon={<FilePlus2 className="h-5 w-5" />}
            title="Start a new registration"
            desc="Begin a fresh institution application."
            onClick={onStartNew}
          />
        </div>
      ) : (
        <div className="page-enter mt-6">
          <ResumePanel onResumed={onResumedByCode} onBack={() => setMode('menu')} />
        </div>
      )}
    </div>
  );
}

/** Cross-device resume: verify ownership of a draft with an emailed code, then continue it. */
function ResumePanel({
  onResumed,
  onBack,
}: {
  onResumed: (view: DraftView, id: string, token: string) => void;
  onBack: () => void;
}) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const emailValid = z.string().email().safeParse(email).success;

  const request = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await registrationApi.resumeRequest(email);
      setSent(true);
      setCode('');
      setResendIn(res.resendAvailableInSeconds);
    } catch (e) {
      setErr((e as RegistrationApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await registrationApi.resumeVerify(email, code.trim());
      onResumed(res.draft, res.id, res.resumeToken);
    } catch (e) {
      setErr((e as RegistrationApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background-secondary p-4">
      <Label htmlFor="resume-email">Registration email</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="resume-email"
          type="email"
          placeholder="principal@greenwood.edu"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSent(false);
          }}
          className="sm:flex-1"
        />
        <Button variant="secondary" onClick={request} loading={busy && !sent} disabled={!emailValid || busy || resendIn > 0}>
          <Mail className="h-4 w-4" /> {sent ? (resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code') : 'Send code'}
        </Button>
      </div>

      {sent && (
        <div className="page-enter mt-3 border-t border-border pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm text-text-secondary">
            <ShieldCheck className="h-4 w-4 text-primary" /> If a registration exists for{' '}
            <strong className="text-text-primary">{email}</strong>, we&apos;ve emailed it a 6-digit code.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              inputMode="numeric"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              className="font-mono tracking-[0.4em] sm:max-w-[180px]"
            />
            <Button onClick={verify} loading={busy} disabled={code.length !== 6 || busy}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <FieldError>{err}</FieldError>
      <button className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:underline" onClick={onBack}>
        <ArrowLeft className="h-3 w-3" /> Back to options
      </button>
    </div>
  );
}

function formatPrice(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: minor % 100 === 0 ? 0 : 2,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(2)} ${currency}`;
  }
}

/** Self-serve plan picker — the institution chooses what it pays for. Required to continue. */
function PlanPicker({
  value,
  error,
  onChange,
}: {
  value: string;
  error?: string;
  onChange: (planKey: string) => void;
}) {
  const [plans, setPlans] = useState<PublicPlan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    registrationApi
      .plans()
      .then((p) => live && setPlans(p))
      .catch((e) => live && setLoadError((e as RegistrationApiError).message));
    return () => {
      live = false;
    };
  }, []);

  if (loadError) {
    return (
      <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
        Couldn’t load plans: {loadError}
      </p>
    );
  }
  if (!plans) {
    return <div className="h-28 animate-pulse rounded-xl border border-border bg-background-secondary" />;
  }
  if (plans.length === 0) {
    return (
      <p className="rounded-md border border-border bg-background-secondary px-3 py-2 text-sm text-text-secondary">
        No plans are available right now. Please contact us to get started.
      </p>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {plans.map((p) => {
          const selected = p.key === value;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => onChange(p.key)}
              aria-pressed={selected}
              className={cn(
                'rounded-xl border p-4 text-left transition-colors',
                selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-text-primary">{p.name}</span>
                {selected && <Check className="h-4 w-4 text-primary" />}
              </div>
              <div className="mt-1 text-sm text-text-primary">
                <span className="text-lg font-semibold">{formatPrice(p.monthlyPriceMinor, p.currency)}</span>
                <span className="text-text-muted"> /month</span>
              </div>
              <div className="text-xs text-text-muted">
                or {formatPrice(p.annualPriceMinor, p.currency)}/year
                {p.perCampusPriceMinor > 0 && ` · +${formatPrice(p.perCampusPriceMinor, p.currency)} per extra campus`}
              </div>
              {p.description && <p className="mt-2 text-xs text-text-secondary">{p.description}</p>}
            </button>
          );
        })}
      </div>
      {error && (
        <div className="mt-2">
          <FieldError>{error}</FieldError>
        </div>
      )}
    </div>
  );
}
