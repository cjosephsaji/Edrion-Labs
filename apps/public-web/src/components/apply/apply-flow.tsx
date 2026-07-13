'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { z } from 'zod';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronRight,
  FilePlus2,
  KeyRound,
  Mail,
  RotateCcw,
  Search,
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
  cn,
  subdivisionLabel,
} from '@edrion/ui';
import { applyApi, ApplyApiError, type AdmissionDraftView, type GeoGuess, type InstitutionOptions, type PublicInstitution } from './apply-api';
import { termsFor } from '@/lib/term';

const STORAGE_KEY = 'edrion_admission_v1';

type SectionKey = 'target' | 'student' | 'guardian' | 'contact' | 'address' | 'additional';

interface FieldDef {
  key: string;
  label: string;
  type: 'text' | 'email' | 'tel' | 'date' | 'textarea' | 'select' | 'country' | 'division' | 'phone';
  required?: boolean;
  placeholder?: string;
  maxLength?: number;
  options?: { value: string; label: string }[];
  half?: boolean;
}

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const RELATIONSHIP_OPTIONS = [
  { value: 'mother', label: 'Mother' },
  { value: 'father', label: 'Father' },
  { value: 'guardian', label: 'Guardian' },
  { value: 'other', label: 'Other' },
];

/** The plain-field steps. Institution pick, programme selects, review and verify are bespoke. */
const STUDENT_FIELDS: FieldDef[] = [
  { key: 'firstName', label: 'First name', type: 'text', required: true, placeholder: 'Ava', half: true },
  { key: 'middleName', label: 'Middle name', type: 'text', placeholder: 'Optional', half: true },
  { key: 'lastName', label: 'Last name', type: 'text', required: true, placeholder: 'Applicant', half: true },
  { key: 'gender', label: 'Gender', type: 'select', options: GENDER_OPTIONS, half: true },
  { key: 'dateOfBirth', label: 'Date of birth', type: 'date', half: true },
  { key: 'previousSchool', label: 'Previous school', type: 'text', placeholder: 'Sunrise Pre-School (optional)' },
];

const GUARDIAN_FIELDS: FieldDef[] = [
  { key: 'name', label: 'Full name', type: 'text', placeholder: 'Parent / guardian name', half: true },
  { key: 'relationship', label: 'Relationship', type: 'select', options: RELATIONSHIP_OPTIONS, half: true },
  { key: 'phone', label: 'Phone number', type: 'phone', half: true },
  { key: 'email', label: 'Email', type: 'email', placeholder: 'Optional', half: true },
];

const CONTACT_FIELDS: FieldDef[] = [
  { key: 'phone', label: 'Contact phone', type: 'phone', half: true },
  { key: 'line1', label: 'Address line 1', type: 'text', placeholder: 'Street address' },
  { key: 'line2', label: 'Address line 2', type: 'text', placeholder: 'Apartment, suite (optional)' },
  { key: 'city', label: 'City', type: 'text', half: true },
  { key: 'country', label: 'Country', type: 'country', half: true },
  { key: 'region', label: 'State / Province', type: 'division', half: true },
  { key: 'postalCode', label: 'Postal code', type: 'text', half: true },
];

const BLOOD_GROUP_OPTIONS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((v) => ({ value: v, label: v })).concat({ value: 'unknown', label: 'Not known' });

/** Health & additional info. All optional — the institution reviews it during admission. */
const ADDITIONAL_FIELDS: FieldDef[] = [
  { key: 'bloodGroup', label: 'Blood group', type: 'select', options: BLOOD_GROUP_OPTIONS, half: true },
  { key: 'emergencyContactName', label: 'Emergency contact name', type: 'text', half: true },
  { key: 'emergencyContactPhone', label: 'Emergency contact phone', type: 'phone', half: true },
  { key: 'medicalConditions', label: 'Medical conditions', type: 'textarea', placeholder: 'Any ongoing conditions we should be aware of (optional)', maxLength: 2000 },
  { key: 'allergies', label: 'Allergies', type: 'textarea', placeholder: 'Food, medication or other allergies (optional)', maxLength: 2000 },
  { key: 'medications', label: 'Current medications', type: 'textarea', placeholder: 'Medications taken regularly (optional)', maxLength: 2000 },
  { key: 'specialNeeds', label: 'Special needs / accommodations', type: 'textarea', placeholder: 'Learning or physical accommodations requested (optional)', maxLength: 2000 },
  { key: 'notes', label: 'Anything else we should know?', type: 'textarea', placeholder: 'Optional', maxLength: 2000 },
];

const ADDITIONAL_STEP = 5;
const REVIEW_STEP = 6;
const VERIFY_STEP = 7;

function stepTitlesFor(type?: PublicInstitution['type']) {
  const labels = termsFor(type);
  return [
    'Institution',
    labels.t('admission'),
    labels.t('student'),
    'Guardian',
    'Contact',
    'Health',
    'Review',
    'Verify',
  ];
}

type Data = {
  target: Record<string, string>;
  student: Record<string, string>;
  guardian: Record<string, string>;
  contact: Record<string, string>; // phone only (email lives at institution step)
  address: Record<string, string>;
  additional: Record<string, string>;
};

const emptyData = (): Data => ({ target: {}, student: {}, guardian: {}, contact: {}, address: {}, additional: {} });

/** Drop empty values so optional fields aren't coerced to ''. */
function clean(obj: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) if (v !== '' && v != null) out[k] = v;
  return out;
}

const emailValid = (e: string) => z.string().email().safeParse(e).success;

export function ApplyFlow({ resumeDraftId }: { resumeDraftId?: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [institution, setInstitution] = useState<PublicInstitution | null>(null);
  const [contactEmail, setContactEmail] = useState('');
  const [data, setData] = useState<Data>(emptyData);
  const [emailVerified, setEmailVerified] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [phase, setPhase] = useState<'choose' | 'form'>('choose');
  const [hasLocal, setHasLocal] = useState(false);
  const draftRef = useRef<{ id: string | null; token: string | null }>({ id: null, token: null });
  const geoRef = useRef(false);
  const stepTitles = useMemo(() => stepTitlesFor(institution?.type), [institution?.type]);
  const labels = useMemo(() => termsFor(institution?.type), [institution?.type]);

  // ── Persistence ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const s = raw ? JSON.parse(raw) : {};
        const wantId = resumeDraftId ?? null;
        if (wantId && s.resumeToken && s.draftId === wantId) {
          try {
            const view = await applyApi.resume(wantId, s.resumeToken);
            if (!cancelled) {
              hydrateFromServer(view.id, s.resumeToken, view);
              setPhase('form');
            }
          } catch {
            if (!cancelled) hydrateFromLocal(s);
          }
        } else {
          if (s.draftId && s.resumeToken) setHasLocal(true);
          if (!cancelled) hydrateFromLocal(s);
        }
      } catch {
        /* corrupt storage — start fresh */
      }
      if (!cancelled) setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeDraftId]);

  const hydrateFromLocal = (s: Record<string, unknown>) => {
    if (s.data) setData({ ...emptyData(), ...(s.data as Data) });
    if (s.institution) setInstitution(s.institution as PublicInstitution);
    if (s.contactEmail) setContactEmail(s.contactEmail as string);
    if (s.draftId) draftRef.current.id = s.draftId as string;
    if (s.resumeToken) draftRef.current.token = s.resumeToken as string;
    if (s.emailVerified) setEmailVerified(true);
    if (typeof s.step === 'number') setStep(Math.min(s.step, VERIFY_STEP));
  };

  const hydrateFromServer = (id: string, token: string, view: AdmissionDraftView) => {
    draftRef.current = { id, token };
    const p = view.payload ?? {};
    setContactEmail(view.contactEmail ?? '');
    setEmailVerified(view.emailVerified);
    setData({
      target: (p.target as Record<string, string>) ?? {},
      student: (p.student as Record<string, string>) ?? {},
      guardian: (p.guardian as Record<string, string>) ?? {},
      contact: { phone: ((p.contact as Record<string, string>)?.phone as string) ?? '' },
      address: (p.address as Record<string, string>) ?? {},
      additional: (p.additional as Record<string, string>) ?? {},
    });
    applyApi
      .institutions()
      .then((list) => setInstitution(list.find((i) => i.id === view.institutionId) ?? null))
      .catch(() => {});
  };

  const persist = useCallback((next: Record<string, unknown>) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const cur = raw ? JSON.parse(raw) : {};
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cur, ...next }));
    } catch {
      /* storage unavailable — non-fatal */
    }
  }, []);

  const startNew = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    draftRef.current = { id: null, token: null };
    geoRef.current = false;
    setInstitution(null);
    setContactEmail('');
    setData(emptyData());
    setEmailVerified(false);
    setErrors({});
    setStep(0);
    setPhase('form');
  };

  const resumeOnThisDevice = () => {
    setErrors({});
    setPhase('form');
  };

  const onResumedByCode = (view: AdmissionDraftView, id: string, token: string) => {
    draftRef.current = { id, token };
    persist({ draftId: id, resumeToken: token });
    hydrateFromServer(id, token, view);
    setPhase('form');
  };

  const handleEmailChange = useCallback(
    (v: string) => {
      setContactEmail((prev) => {
        if (emailVerified && v !== prev) {
          setEmailVerified(false);
          persist({ emailVerified: false });
        }
        return v;
      });
      persist({ contactEmail: v });
      setErrors((e) => ({ ...e, contactEmail: '', email: '' }));
      if (draftRef.current.id && draftRef.current.token && emailValid(v)) {
        void applyApi.patch(draftRef.current.id, draftRef.current.token, { contact: { email: v } }).catch(() => {});
      }
    },
    [emailVerified, persist],
  );

  const setField = (section: SectionKey, key: string, value: string) => {
    setData((d) => {
      const next = { ...d, [section]: { ...d[section], [key]: value } };
      persist({ data: next });
      return next;
    });
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
  };

  // ── Draft lifecycle ─────────────────────────────────────────────────────────
  const ensureDraft = useCallback(async (): Promise<{ id: string; token: string }> => {
    if (draftRef.current.id && draftRef.current.token) {
      return { id: draftRef.current.id, token: draftRef.current.token };
    }
    if (!institution || !emailValid(contactEmail)) {
      throw new ApplyApiError('NO_DRAFT', 'Select an institution and enter your email first.');
    }
    const res = await applyApi.start(institution.id, contactEmail);
    draftRef.current = { id: res.id, token: res.token };
    persist({ draftId: res.id, resumeToken: res.token });
    return { id: res.id, token: res.token };
  }, [institution, contactEmail, persist]);

  const autosave = useCallback(
    async (section: SectionKey) => {
      setSaving(true);
      try {
        const { id, token } = await ensureDraft();
        const body =
          section === 'contact'
            ? { contact: clean({ email: contactEmail, ...data.contact }), address: clean(data.address) }
            : { [section]: clean(data[section]) };
        await applyApi.patch(id, token, body);
      } catch {
        /* autosave is best-effort; submit re-sends everything */
      } finally {
        setSaving(false);
      }
    },
    [data, contactEmail, ensureDraft],
  );

  // Auto-detect location when the applicant first reaches Contact & address (step 4).
  useEffect(() => {
    if (!hydrated || phase !== 'form' || step !== 4 || geoRef.current || data.address.country) return;
    geoRef.current = true;
    void (async () => {
      const g = await applyApi.geo().catch(() => ({}) as GeoGuess);
      let country = g.country;
      const city = g.city;
      if (!country) {
        try {
          country = new Intl.Locale(navigator.language).maximize().region ?? undefined;
        } catch {
          /* ignore */
        }
      }
      setData((d) => {
        const addr = { ...d.address };
        if (country && !addr.country) addr.country = country;
        if (city && !addr.city) addr.city = city;
        const next = { ...d, address: addr };
        persist({ data: next });
        return next;
      });
    })();
  }, [hydrated, phase, step, data.address.country, persist]);

  // ── Navigation / validation ───────────────────────────────────────────────────
  const goNext = async () => {
    setErrors({});
    if (step === 0) {
      const e: Record<string, string> = {};
      if (!institution) e.institution = 'Please choose the institution you are applying to.';
      if (!emailValid(contactEmail)) e.contactEmail = 'Enter a valid email address to receive updates.';
      if (Object.keys(e).length) return setErrors(e);
      void ensureDraft();
    }
    if (step === 2) {
      const e: Record<string, string> = {};
      if (!data.student.firstName?.trim()) e.firstName = 'First name is required.';
      if (!data.student.lastName?.trim()) e.lastName = 'Last name is required.';
      if (Object.keys(e).length) return setErrors(e);
      void autosave('student');
    }
    if (step === 1) void autosave('target');
    if (step === 3) void autosave('guardian');
    if (step === 4) void autosave('contact');
    if (step === ADDITIONAL_STEP) void autosave('additional');
    const nextStep = Math.min(step + 1, VERIFY_STEP);
    setStep(nextStep);
    persist({ step: nextStep });
  };

  const goBack = () => {
    setErrors({});
    const prev = Math.max(0, step - 1);
    setStep(prev);
    persist({ step: prev });
  };

  const jumpTo = (s: number) => {
    setErrors({});
    setStep(s);
    persist({ step: s });
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const submit = async () => {
    setSubmitError(null);
    if (!data.student.firstName?.trim() || !data.student.lastName?.trim()) {
      jumpTo(2);
      setErrors({ firstName: `${labels.t('student')} name is required.` });
      return;
    }
    if (!emailVerified) {
      jumpTo(VERIFY_STEP);
      setErrors({ email: 'Verify your email to submit.' });
      return;
    }
    setSubmitting(true);
    try {
      const { id, token } = await ensureDraft();
      const payload = {
        target: clean(data.target),
        student: clean(data.student),
        guardian: clean(data.guardian),
        contact: clean({ email: contactEmail, ...data.contact }),
        address: clean(data.address),
        additional: clean(data.additional),
      };
      const res = await applyApi.submit(id, token, payload);
      persist({ applicationNo: res.applicationNo });
      localStorage.removeItem(STORAGE_KEY);
      router.push(`/apply/success?ref=${encodeURIComponent(res.applicationNo)}`);
    } catch (e) {
      setSubmitError((e as ApplyApiError).message);
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
        contactEmail={contactEmail}
        onStartNew={startNew}
        onResumeLocal={resumeOnThisDevice}
        onResumedByCode={onResumedByCode}
      />
    );
  }

  const totalSteps = stepTitles.length;
  const progress = Math.round(((step + 1) / totalSteps) * 100);

  return (
    <div className="rounded-2xl border border-border bg-surface-elevated shadow-sm">
      {/* Progress */}
      <div className="border-b border-border p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-md font-semibold text-text-primary">Admission application</h2>
          <span className="text-xs text-text-secondary" aria-live="polite">
            {saving ? 'Saving…' : `Step ${step + 1} of ${totalSteps}`}
          </span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-background-secondary"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div
            className="h-full rounded-full bg-primary transition-all duration-300 ease-standard"
            style={{ width: `${progress}%` }}
          />
        </div>
        <ol className="mt-4 hidden flex-wrap items-center gap-x-2.5 gap-y-1 text-xs sm:flex">
          {stepTitles.map((title, i) => (
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
              {i < stepTitles.length - 1 && <ChevronRight className="h-3 w-3 shrink-0 text-text-muted/40" />}
            </li>
          ))}
        </ol>
      </div>

      <div className="p-5 sm:p-6">
        {step === 0 && (
          <InstitutionStep
            selected={institution}
            contactEmail={contactEmail}
            errors={errors}
            onSelect={(inst) => {
              setInstitution(inst);
              setData((d) => ({ ...d, target: {} })); // reset programme when institution changes
              draftRef.current = { id: null, token: null }; // a new institution needs a new draft
              persist({ institution: inst, data: { ...data, target: {} }, draftId: null, resumeToken: null });
              setErrors((e) => ({ ...e, institution: '' }));
            }}
            onEmail={handleEmailChange}
          />
        )}

        {step === 1 && (
          <ProgrammeStep
            institutionId={institution?.id ?? null}
            value={data.target}
            onChange={(k, v) => setField('target', k, v)}
          />
        )}

        {step === 2 && (
          <FieldGrid
            title={`${labels.t('student')} details`}
            blurb="Tell us about the applicant."
            fields={STUDENT_FIELDS}
            values={data.student}
            errors={errors}
            countryCode={data.address.country ?? ''}
            onChange={(k, v) => setField('student', k, v)}
          />
        )}

        {step === 3 && (
          <FieldGrid
            title="Parent / guardian"
            blurb="Who should we contact about this application?"
            fields={GUARDIAN_FIELDS}
            values={data.guardian}
            errors={errors}
            countryCode={data.address.country ?? ''}
            onChange={(k, v) => setField('guardian', k, v)}
          />
        )}

        {step === 4 && (
          <FieldGrid
            title="Contact & address"
            blurb="How can the admissions team reach you?"
            fields={CONTACT_FIELDS}
            values={{ ...data.address, phone: data.contact.phone ?? '' }}
            errors={errors}
            countryCode={data.address.country ?? ''}
            onChange={(k, v) => (k === 'phone' ? setField('contact', 'phone', v) : setField('address', k, v))}
          />
        )}

        {step === ADDITIONAL_STEP && (
          <FieldGrid
            title="Health & additional info"
            blurb="Optional, but it helps the school prepare. Share anything the admissions team should know."
            fields={ADDITIONAL_FIELDS}
            values={data.additional}
            errors={errors}
            countryCode={data.address.country ?? ''}
            onChange={(k, v) => setField('additional', k, v)}
          />
        )}

        {step === REVIEW_STEP && (
          <ReviewStep
            institution={institution}
            contactEmail={contactEmail}
            data={data}
            emailVerified={emailVerified}
            onEdit={jumpTo}
          />
        )}

        {step === VERIFY_STEP && (
          <VerifyStep
            email={contactEmail}
            verified={emailVerified}
            error={errors.email}
            ensureDraft={ensureDraft}
            onEmail={handleEmailChange}
            onVerified={() => {
              setEmailVerified(true);
              persist({ emailVerified: true });
            }}
          />
        )}

        {submitError && (
          <p role="alert" className="mt-4 rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
            {submitError}
          </p>
        )}

        <div className="mt-6 flex items-center justify-between gap-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={goBack}
            disabled={step === 0 || submitting}
            className={step === 0 ? 'invisible' : ''}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          {step < VERIFY_STEP ? (
            <Button onClick={goNext}>
              Continue <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} loading={submitting} disabled={submitting || !emailVerified}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Institution picker ─────────────────────────────────────────────────────────
function InstitutionStep({
  selected,
  contactEmail,
  errors,
  onSelect,
  onEmail,
}: {
  selected: PublicInstitution | null;
  contactEmail: string;
  errors: Record<string, string>;
  onSelect: (inst: PublicInstitution) => void;
  onEmail: (v: string) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicInstitution[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      applyApi
        .institutions(q.trim() || undefined)
        .then((r) => live && setResults(r))
        .catch((e) => live && setError((e as ApplyApiError).message))
        .finally(() => live && setLoading(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="page-enter space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Choose an institution</h3>
        <p className="text-sm text-text-secondary">Search for the school or college you’re applying to.</p>
      </div>

      <div>
        <Label htmlFor="inst-search">Institution</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <Input
            id="inst-search"
            value={q}
            placeholder="Search by name or ID…"
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
            autoComplete="off"
          />
        </div>
        <FieldError>{errors.institution}</FieldError>

        <div className="mt-3 space-y-2" role="listbox" aria-label="Institutions">
          {loading && !results ? (
            <div className="h-16 animate-pulse rounded-xl border border-border bg-background-secondary" />
          ) : error ? (
            <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
              {error}
            </p>
          ) : results && results.length === 0 ? (
            <p className="rounded-md border border-border bg-background-secondary px-3 py-3 text-sm text-text-secondary">
              No institutions found. Try a different search, or check with your school for the exact name.
            </p>
          ) : (
            results?.map((inst) => {
              const active = selected?.id === inst.id;
              return (
                <button
                  key={inst.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => onSelect(inst)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors',
                    active ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'border-border hover:border-primary/40',
                  )}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary-soft text-primary">
                    {inst.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={inst.logoUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <Building2 className="h-5 w-5" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-text-primary">{inst.displayName}</span>
                    <span className="block truncate text-xs text-text-muted">
                      {inst.publicId} · {inst.country}
                    </span>
                  </span>
                  {active && <Check className="h-4 w-4 shrink-0 text-primary" />}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div>
        <Label htmlFor="contact-email">
          Your email address <span className="text-danger">*</span>
        </Label>
        <Input
          id="contact-email"
          type="email"
          value={contactEmail}
          placeholder="you@example.com"
          onChange={(e) => onEmail(e.target.value)}
        />
        <p className="mt-1 text-xs text-text-muted">We’ll send a verification code and application updates here.</p>
        <FieldError>{errors.contactEmail}</FieldError>
      </div>
    </div>
  );
}

// ── Programme (campus / year / grade) ────────────────────────────────────────────
function ProgrammeStep({
  institutionId,
  value,
  onChange,
}: {
  institutionId: string | null;
  value: Record<string, string>;
  onChange: (k: string, v: string) => void;
}) {
  const [opts, setOpts] = useState<InstitutionOptions | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!institutionId) return;
    let live = true;
    setOpts(null);
    setError(null);
    applyApi
      .options(institutionId)
      .then((o) => live && setOpts(o))
      .catch((e) => live && setError((e as ApplyApiError).message));
    return () => {
      live = false;
    };
  }, [institutionId]);

  // When there's only one campus, pre-select it — no need to ask the applicant.
  useEffect(() => {
    if (!opts || opts.campuses.length !== 1 || value.campusId) return;
    onChange('campusId', opts.campuses[0]!.id);
  }, [opts, value.campusId, onChange]);

  const labels = termsFor(opts?.institutionType, opts?.nomenclature);

  return (
    <div className="page-enter space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{labels.t('admission')}</h3>
        <p className="text-sm text-text-secondary">
          Which campus, {labels.t('academicYear').toLowerCase()} and {labels.t('gradeLevel').toLowerCase()} are you applying for?
        </p>
      </div>
      {error ? (
        <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      ) : !opts ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-background-secondary" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            id="campus"
            label="Campus"
            value={value.campusId ?? ''}
            options={opts.campuses.map((c) => ({ value: c.id, label: c.name }))}
            empty="No campuses listed"
            onChange={(v) => onChange('campusId', v)}
          />
          <SelectField
            id="year"
            label={labels.t('academicYear')}
            value={value.academicYearId ?? ''}
            options={opts.academicYears.map((y) => ({ value: y.id, label: y.name }))}
            empty={`No ${labels.tp('academicYear').toLowerCase()} listed`}
            onChange={(v) => onChange('academicYearId', v)}
          />
          <SelectField
            id="grade"
            label={labels.t('gradeLevel')}
            value={value.gradeLevelId ?? ''}
            options={opts.gradeLevels.map((g) => ({ value: g.id, label: g.name }))}
            empty={`No ${labels.tp('gradeLevel').toLowerCase()} listed`}
            onChange={(v) => onChange('gradeLevelId', v)}
            className="sm:col-span-2"
          />
        </div>
      )}
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  options,
  empty,
  className,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: { value: string; label: string }[];
  empty: string;
  className?: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      {options.length === 0 ? (
        <p className="rounded-md border border-border bg-background-secondary px-3 py-2 text-sm text-text-muted">
          {empty}
        </p>
      ) : (
        <Select
          id={id}
          options={options}
          placeholder="Select…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// ── Generic field grid (student / guardian / contact) ───────────────────────────
function FieldGrid({
  title,
  blurb,
  fields,
  values,
  errors,
  countryCode,
  onChange,
}: {
  title: string;
  blurb: string;
  fields: FieldDef[];
  values: Record<string, string>;
  errors: Record<string, string>;
  countryCode: string;
  onChange: (k: string, v: string) => void;
}) {
  return (
    <div className="page-enter space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">{title}</h3>
        <p className="text-sm text-text-secondary">{blurb}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {fields.map((f) => (
          <FieldControl
            key={f.key}
            field={f}
            value={values[f.key] ?? ''}
            error={errors[f.key]}
            countryCode={countryCode}
            onChange={(v) => onChange(f.key, v)}
          />
        ))}
      </div>
    </div>
  );
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
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          value={value}
          aria-describedby={errId}
          onChange={(e) => onChange(e.target.value)}
          className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-muted focus:border-border-strong"
        />
      ) : (
        <Input
          id={id}
          type={field.type === 'date' ? 'date' : field.type}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          value={value}
          aria-describedby={errId}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      <FieldError id={errId}>{error}</FieldError>
    </div>
  );
}

// ── OTP verify ─────────────────────────────────────────────────────────────────
function VerifyStep({
  email,
  verified,
  error,
  ensureDraft,
  onEmail,
  onVerified,
}: {
  email: string;
  verified: boolean;
  error?: string;
  ensureDraft: () => Promise<{ id: string; token: string }>;
  onEmail: (v: string) => void;
  onVerified: () => void;
}) {
  const [sentEmail, setSentEmail] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const sent = sentEmail !== null && sentEmail === email;

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const request = async () => {
    setLocalError(null);
    setBusy(true);
    try {
      const { id, token } = await ensureDraft();
      const res = await applyApi.requestOtp(id, token, email);
      setSentEmail(email);
      setCode('');
      setResendIn(res.resendAvailableInSeconds);
    } catch (e) {
      setLocalError((e as ApplyApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setLocalError(null);
    setBusy(true);
    try {
      const { id, token } = await ensureDraft();
      await applyApi.verifyOtp(id, token, code.trim());
      onVerified();
    } catch (e) {
      setLocalError((e as ApplyApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const changeEmail = (v: string) => {
    onEmail(v);
    setSentEmail(null);
    setCode('');
    setEditingEmail(false);
  };

  return (
    <div className="page-enter space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Verify your email</h3>
        <p className="text-sm text-text-secondary">
          We need to confirm you own this address before submitting.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-background-secondary p-4">
        {editingEmail ? (
          <div className="space-y-2">
            <Label htmlFor="verify-email">Email address</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                id="verify-email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => changeEmail(e.target.value)}
                className="sm:flex-1"
              />
              <Button variant="ghost" size="sm" onClick={() => setEditingEmail(false)}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-secondary">
            <span>
              Sending codes to <strong className="text-text-primary">{email}</strong>
            </span>
            {!verified && (
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setEditingEmail(true)}
              >
                Wrong email? Change it
              </button>
            )}
          </div>
        )}

        {verified ? (
          <>
            <span className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-success-soft px-3 py-2 text-sm font-medium text-success">
              <CheckCircle2 className="h-4 w-4" /> Email verified — you&apos;re ready to submit.
            </span>
            <p className="mt-2 text-xs text-text-muted">
              <button
                type="button"
                className="font-medium text-primary hover:underline"
                onClick={() => setEditingEmail(true)}
              >
                Wrong email?
              </button>{' '}
              Change it and we&apos;ll send a fresh code.
            </p>
          </>
        ) : (
          <>
            <Button
              className="mt-3"
              variant="secondary"
              onClick={request}
              loading={busy && !sent}
              disabled={!emailValid(email) || busy || resendIn > 0}
            >
              <Mail className="h-4 w-4" /> {sent ? (resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code') : 'Send verification code'}
            </Button>

            {sent && (
              <div className="page-enter mt-3 border-t border-border pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-sm text-text-secondary">
                  <ShieldCheck className="h-4 w-4 text-primary" /> We emailed a 6-digit code to{' '}
                  <strong className="text-text-primary">{email}</strong>. It expires in 10 minutes.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="123456"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    className="font-mono tracking-[0.4em] sm:max-w-[180px]"
                    aria-label="Verification code"
                  />
                  <Button onClick={verify} loading={busy} disabled={code.length !== 6 || busy}>
                    Verify
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        <FieldError>{error ?? localError}</FieldError>
      </div>
    </div>
  );
}

// ── Review ─────────────────────────────────────────────────────────────────────
function ReviewStep({
  institution,
  contactEmail,
  data,
  emailVerified,
  onEdit,
}: {
  institution: PublicInstitution | null;
  contactEmail: string;
  data: Data;
  emailVerified: boolean;
  onEdit: (step: number) => void;
}) {
  const labels = termsFor(institution?.type);
  const sections = useMemo(
    () => [
      {
        step: 0,
        title: 'Institution',
        items: [
          ['Institution', institution?.displayName ?? '—'],
          ['Your email', contactEmail || '—'],
        ] as [string, string][],
      },
      { step: 1, title: labels.t('admission'), items: Object.entries(clean(data.target)) as [string, string][] },
      { step: 2, title: labels.t('student'), items: Object.entries(clean(data.student)) as [string, string][] },
      { step: 3, title: 'Guardian', items: Object.entries(clean(data.guardian)) as [string, string][] },
      {
        step: 4,
        title: 'Contact & address',
        items: [...Object.entries(clean(data.contact)), ...Object.entries(clean(data.address))] as [string, string][],
      },
      { step: 5, title: 'Health & additional', items: Object.entries(clean(data.additional)) as [string, string][] },
    ],
    [institution, contactEmail, data, labels],
  );

  return (
    <div className="page-enter space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-text-primary">Review &amp; submit</h3>
        <p className="text-sm text-text-secondary">Check everything looks right, then verify your email to submit.</p>
      </div>
      {!emailVerified && (
        <p className="rounded-md border border-warning/30 bg-warning-soft/50 px-3 py-2 text-sm text-warning">
          You’ll verify your email on the next step before submitting.
        </p>
      )}
      <div className="divide-y divide-border rounded-xl border border-border">
        {sections.map((r) => (
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
  return k
    .replace(/Id$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase());
}

/** Opening screen: resume an in-progress application (this device or via a code) or start fresh. */
function LandingChooser({
  hasLocal,
  contactEmail,
  onStartNew,
  onResumeLocal,
  onResumedByCode,
}: {
  hasLocal: boolean;
  contactEmail: string;
  onStartNew: () => void;
  onResumeLocal: () => void;
  onResumedByCode: (view: AdmissionDraftView, id: string, token: string) => void;
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
      <h2 className="text-xl font-semibold text-text-primary">Apply for admission</h2>
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
              desc={contactEmail ? `Pick up your draft for ${contactEmail}.` : 'Pick up where you left off.'}
              onClick={onResumeLocal}
            />
          )}
          <Option
            icon={<KeyRound className="h-5 w-5" />}
            title="Continue with a code"
            desc="Get a code emailed to your application address to continue on any device."
            onClick={() => setMode('code')}
          />
          <Option
            icon={<FilePlus2 className="h-5 w-5" />}
            title="Start a new application"
            desc="Begin a fresh admission application."
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
  onResumed: (view: AdmissionDraftView, id: string, token: string) => void;
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

  const request = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await applyApi.resumeRequest(email);
      setSent(true);
      setCode('');
      setResendIn(res.resendAvailableInSeconds);
    } catch (e) {
      setErr((e as ApplyApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setErr(null);
    setBusy(true);
    try {
      const res = await applyApi.resumeVerify(email, code.trim());
      onResumed(res.draft, res.id, res.token);
    } catch (e) {
      setErr((e as ApplyApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-background-secondary p-4">
      <Label htmlFor="resume-email">Application email</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="resume-email"
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setSent(false);
          }}
          className="sm:flex-1"
        />
        <Button variant="secondary" onClick={request} loading={busy && !sent} disabled={!emailValid(email) || busy || resendIn > 0}>
          <Mail className="h-4 w-4" /> {sent ? (resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code') : 'Send code'}
        </Button>
      </div>

      {sent && (
        <div className="page-enter mt-3 border-t border-border pt-3">
          <p className="mb-2 flex items-center gap-1.5 text-sm text-text-secondary">
            <ShieldCheck className="h-4 w-4 text-primary" /> If an application exists for{' '}
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
