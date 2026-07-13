'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, ChevronRight, PartyPopper, Plus, Rocket } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ConfirmDialog,
  ErrorState,
  Input,
  InternationalPhoneInput,
  Label,
  Select,
  Skeleton,
  cn,
} from '@edrion/ui';
import type { TermKey } from '@edrion/shared-types';
import { Topbar } from '@/components/app-shell/topbar';
import { useAcademicYearOptions } from '@/lib/academics';
import { isEndAfterStart, maxStartDate, minEndDate } from '@/lib/date-range';
import { usePermissions } from '@/lib/permissions';
import { useInstitutionCountry } from '@/lib/settings';
import { useCompleteOnboarding, useOnboarding, useStepCreate, useStepList } from '@/lib/onboarding';
import type { OnboardingStep, OnboardingSummary } from '@/lib/onboarding-types';
import { formatPortalError } from '@/lib/portal-client';
import { formatPersonName } from '@/lib/person-name';
import { useTerm } from '@/lib/term';

type FieldType = 'text' | 'date' | 'email' | 'phone' | 'select';
interface FieldCfg {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
}
interface StepCfg {
  endpoint: string;
  itemLabel: string;
  blurb: string;
  fields: FieldCfg[];
  rowLabel: (row: Record<string, unknown>) => string;
  rowDetail?: (row: Record<string, unknown>) => string | null;
}

/** Per-step inline form config, keyed by the summary step key. */
const STEP_CFG: Record<string, StepCfg> = {
  academicYears: {
    endpoint: 'academics/academic-years',
    itemLabel: 'academic year',
    blurb: 'Add your first academic year — you can add more later from Academics.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. 2026–2027' },
      { name: 'startDate', label: 'Start date', type: 'date', required: true },
      { name: 'endDate', label: 'End date', type: 'date', required: true },
    ],
    rowLabel: (r) => String(r.name ?? ''),
    rowDetail: (r) => {
      const start = r.startDate as string | undefined;
      const end = r.endDate as string | undefined;
      return start && end ? `${start} → ${end}` : null;
    },
  },
  departments: {
    endpoint: 'academics/departments',
    itemLabel: 'department',
    blurb: 'Group subjects under departments. This step is optional.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Science' },
      { name: 'code', label: 'Code', type: 'text', placeholder: 'e.g. SCI (optional)' },
    ],
    rowLabel: (r) => `${r.name}${r.code ? ` (${r.code})` : ''}`,
  },
  academicTerms: {
    endpoint: 'academics/academic-terms',
    itemLabel: 'term',
    blurb: 'Add terms or semesters within an academic year. Optional for now.',
    fields: [
      { name: 'academicYearId', label: 'Academic year', type: 'select', required: true, options: [] },
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Term 1' },
      { name: 'startDate', label: 'Start date', type: 'date', required: true },
      { name: 'endDate', label: 'End date', type: 'date', required: true },
    ],
    rowLabel: (r) => String(r.name ?? ''),
    rowDetail: (r) => {
      const start = r.startDate as string | undefined;
      const end = r.endDate as string | undefined;
      return start && end ? `${start} → ${end}` : null;
    },
  },
  subjects: {
    endpoint: 'academics/subjects',
    itemLabel: 'subject',
    blurb: 'Add at least one subject your institution teaches.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Mathematics' },
      { name: 'code', label: 'Code', type: 'text', placeholder: 'e.g. MATH (optional)' },
    ],
    rowLabel: (r) => `${r.name}${r.code ? ` (${r.code})` : ''}`,
  },
  students: {
    endpoint: 'people/students',
    itemLabel: 'student',
    blurb: 'Add your first student to unlock the student directory.',
    fields: [
      { name: 'admissionNo', label: 'Admission no.', type: 'text', required: true },
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'middleName', label: 'Middle name', type: 'text', placeholder: 'Optional' },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'phone' },
    ],
    rowLabel: (r) => formatPersonName({ firstName: String(r.firstName ?? ''), middleName: r.middleName as string | undefined, lastName: String(r.lastName ?? '') }),
  },
  staff: {
    endpoint: 'people/staff',
    itemLabel: 'staff member',
    blurb: 'Add at least one staff member — teachers, administrators, and support staff all live here.',
    fields: [
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'middleName', label: 'Middle name', type: 'text', placeholder: 'Optional' },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      { name: 'designation', label: 'Designation', type: 'text', placeholder: 'e.g. Teacher, Accountant (optional)' },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'phone' },
    ],
    rowLabel: (r) => formatPersonName({ firstName: String(r.firstName ?? ''), middleName: r.middleName as string | undefined, lastName: String(r.lastName ?? '') }),
  },
};

function hasDraftInput(values: Record<string, string>): boolean {
  return Object.values(values).some((v) => v.trim() !== '');
}

/** Step-specific defaults when posting to a module create endpoint. */
function buildStepCreateBody(stepKey: string, fields: FieldCfg[], values: Record<string, string>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    const v = (values[f.name] ?? '').trim();
    if (v) body[f.name] = v;
  }

  if (stepKey === 'staff') {
    body.employmentType = 'full_time';
    body.status = 'active';
    body.createLogin = false;
    if (body.email) {
      body.createLogin = true;
      body.roleKeys = [];
    }
  } else if (stepKey === 'students') {
    body.status = 'enrolled';
  }

  return body;
}

export default function OnboardingPage() {
  const { data, isLoading, isError, refetch } = useOnboarding();
  const { can } = usePermissions();
  const canManage = can('institution_settings.manage');

  return (
    <>
      <Topbar title="Getting started" />
      <div className="page-enter mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-5">
        {isLoading && <WizardSkeleton />}
        {isError && (
          <ErrorState
            title="Couldn't load your setup"
            description="The portal API may be offline. Retry in a moment."
            action={
              <button
                onClick={() => refetch()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
              >
                Retry
              </button>
            }
          />
        )}
        {data &&
          (data.institution.isComplete ? (
            <LiveState name={data.institution.displayName} />
          ) : (
            <Wizard data={data} canManage={canManage} />
          ))}
      </div>
    </>
  );
}

function stepTitle(step: OnboardingStep, tp: (key: TermKey) => string): string {
  switch (step.key) {
    case 'departments':
      return tp('department');
    case 'subjects':
      return tp('subject');
    case 'students':
      return tp('student');
    case 'staff':
      return tp('staff');
    case 'academicYears':
      return tp('academicYear');
    case 'academicTerms':
      return tp('term');
    default:
      return step.label;
  }
}

function Wizard({ data, canManage }: { data: OnboardingSummary; canManage: boolean }) {
  const { tp } = useTerm();
  const complete = useCompleteOnboarding();
  const [stepIndex, setStepIndex] = useState(0);
  const [hasDraft, setHasDraft] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [pendingStep, setPendingStep] = useState<number | null>(null);
  const mandatory = data.steps.filter((s) => s.required > 0);
  const mandatoryDone = mandatory.filter((s) => s.done).length;
  const readyToLaunch = mandatoryDone === mandatory.length;
  const steps = data.steps;
  const current = steps[stepIndex];
  const totalSteps = steps.length;
  const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);
  const [stepError, setStepError] = useState<string | null>(null);
  const nextBlocked = !!(current && current.required > 0 && !current.done);

  useEffect(() => {
    setStepError(null);
  }, [stepIndex, current?.done]);

  function firstIncompleteRequiredBetween(from: number, to: number): OnboardingStep | undefined {
    if (to <= from) return undefined;
    for (let i = from; i < to; i++) {
      const s = steps[i]!;
      if (s.required > 0 && !s.done) return s;
    }
    return undefined;
  }

  function goToStep(target: number) {
    if (target === stepIndex || target < 0 || target >= totalSteps) return;

    if (target > stepIndex) {
      const blocked = firstIncompleteRequiredBetween(stepIndex, target);
      if (blocked) {
        setStepError(`Add at least one ${stepTitle(blocked, tp).toLowerCase()} before continuing.`);
        return;
      }
    }

    if (hasDraft) {
      setPendingStep(target);
      setLeaveOpen(true);
      return;
    }
    setStepError(null);
    setStepIndex(target);
  }

  function confirmLeave() {
    if (pendingStep !== null) setStepIndex(pendingStep);
    setPendingStep(null);
    setLeaveOpen(false);
    setHasDraft(false);
    setStepError(null);
  }

  return (
    <>
      <div>
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Rocket className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold text-text-primary">Welcome to Edrion, {data.institution.displayName}</h1>
        </div>
        <p className="mt-1.5 text-sm text-text-secondary">
          Work through each section to set up your institution. Required steps must have at least one record before you go live.
        </p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-text-muted">
            <span>
              Step {stepIndex + 1} of {totalSteps} · {mandatoryDone} of {mandatory.length} required complete
            </span>
            <span>{data.progress.percent}%</span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-background-secondary"
            role="progressbar"
            aria-valuenow={data.progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-standard"
              style={{ width: `${data.progress.percent}%` }}
            />
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="border-b border-border px-5 py-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text-primary">Setup wizard</h2>
            <span className="text-xs text-text-secondary">{progress}% through sections</span>
          </div>
          <ol className="hidden flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:flex">
            {steps.map((step, i) => (
              <li key={step.key} className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToStep(i)}
                  className={cn(
                    'flex items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:text-text-primary',
                    i === stepIndex ? 'font-semibold text-primary' : step.done ? 'text-success' : 'text-text-muted',
                  )}
                >
                  {step.done ? <Check className="h-3 w-3 shrink-0" /> : null}
                  <span>{stepTitle(step, tp)}</span>
                </button>
                {i < steps.length - 1 && <ChevronRight className="h-3 w-3 shrink-0 text-text-muted/40" />}
              </li>
            ))}
          </ol>
        </div>

        {current && (
          <div key={current.key} className="page-enter">
            <StepPanel step={current} index={stepIndex + 1} canManage={canManage} onDraftChange={setHasDraft} />
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goToStep(stepIndex - 1)}
            disabled={stepIndex === 0}
            className={stepIndex === 0 ? 'invisible' : ''}
          >
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>
          <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
            {stepError && (
              <p role="alert" className="text-right text-xs text-danger">
                {stepError}
              </p>
            )}
            <Button
              size="sm"
              onClick={() => goToStep(stepIndex + 1)}
              disabled={stepIndex >= totalSteps - 1 || nextBlocked}
              title={nextBlocked ? 'Add at least one record on this step to continue' : undefined}
            >
              Next <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => {
          setLeaveOpen(false);
          setPendingStep(null);
        }}
        onConfirm={confirmLeave}
        title="You haven't added this yet"
        description="You've entered details but haven't clicked Add. Leave this step without saving?"
        confirmLabel="Leave anyway"
        cancelLabel="Stay and add"
        danger={false}
      />

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">Ready to go live?</p>
            <p className="text-sm text-text-secondary">
              {readyToLaunch
                ? 'Every required step has data. Launch your institution to unlock the full portal.'
                : 'Add at least one record to every required step to go live.'}
            </p>
          </div>
          <Button
            onClick={() => complete.mutate()}
            loading={complete.isPending}
            disabled={!readyToLaunch || !canManage}
            className="shrink-0"
          >
            <Rocket className="mr-1.5 h-4 w-4" /> Go live
          </Button>
        </CardContent>
      </Card>
      {complete.isError && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          {formatPortalError(complete.error, 'Could not go live. Try again.')}
        </p>
      )}
    </>
  );
}

function StepPanel({
  step,
  index,
  canManage,
  onDraftChange,
}: {
  step: OnboardingStep;
  index: number;
  canManage: boolean;
  onDraftChange: (hasDraft: boolean) => void;
}) {
  const { t, tp } = useTerm();
  const { data: years } = useAcademicYearOptions();
  const cfg = STEP_CFG[step.key]!;
  const fields = useMemo(() => {
    if (step.key !== 'academicTerms') return cfg.fields;
    return cfg.fields.map((f) =>
      f.name === 'academicYearId'
        ? {
            ...f,
            label: t('academicYear'),
            options: (years?.items ?? []).map((y) => ({ value: y.id, label: y.name })),
          }
        : f.name === 'name'
          ? { ...f, placeholder: `e.g. ${t('term')} 1` }
          : f,
    );
  }, [cfg.fields, step.key, t, years]);
  const create = useStepCreate(cfg.endpoint);
  const list = useStepList<Record<string, unknown>>(cfg.endpoint);
  const institutionCountry = useInstitutionCountry();
  const [values, setValues] = useState<Record<string, string>>({});
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const draft = hasDraftInput(values);

  useEffect(() => {
    onDraftChange(draft);
  }, [draft, onDraftChange]);

  const setField = (name: string, v: string) => {
    setValues((s) => {
      const next = { ...s, [name]: v };
      if (name === 'startDate' && next.endDate && !isEndAfterStart(v, next.endDate)) {
        next.endDate = '';
      }
      return next;
    });
    if (fieldErrors[name]) setFieldErrors((e) => ({ ...e, [name]: '' }));
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const f of fields) {
      if (f.required && !(values[f.name] ?? '').trim()) {
        nextErrors[f.name] = `${f.label} is required`;
      }
    }
    const start = values.startDate ?? '';
    const end = values.endDate ?? '';
    if (start && end && !isEndAfterStart(start, end)) {
      nextErrors.endDate = 'End date must be after the start date';
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }

    const body = buildStepCreateBody(step.key, fields, values);
    create.mutate(body, {
      onSuccess: () => {
        setValues({});
        setFieldErrors({});
      },
    });
  }

  const items = list.data?.items ?? [];
  const title = stepTitle(step, tp);

  return (
    <CardContent className="py-5">
      <div className="mb-4 flex items-start gap-3">
        <span
          className={
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
            (step.done ? 'bg-success/15 text-success' : 'bg-background-secondary text-text-secondary')
          }
        >
          {step.done ? <Check className="h-4 w-4" /> : index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-text-primary">{title}</p>
            {step.required === 0 ? (
              <Badge tone="neutral">Optional</Badge>
            ) : step.done ? (
              <Badge tone="success">Complete</Badge>
            ) : (
              <Badge tone="warning">Required</Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-text-secondary">{cfg.blurb}</p>
        </div>
        {step.count > 0 && (
          <Badge tone={step.done ? 'success' : 'neutral'}>
            {step.count} added
          </Badge>
        )}
      </div>

      {step.required > 0 && !step.done && (
        <p
          role="status"
          className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-text-secondary"
        >
          Add at least one {title.toLowerCase()} before you can continue to the next step.
        </p>
      )}

      {draft && (
        <p
          role="status"
          className="mb-4 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-text-secondary"
        >
          {step.required > 0 && !step.done ? (
            <>
              You&apos;ve entered details but haven&apos;t added them yet. Click <strong>Add</strong> to save — this
              step is required before you can continue.
            </>
          ) : (
            <>
              You&apos;ve entered details but haven&apos;t added them yet. Click <strong>Add</strong> to save, or use
              Next to leave — you&apos;ll be asked to confirm.
            </>
          )}
        </p>
      )}

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.name} className={f.type === 'phone' ? 'sm:col-span-2' : undefined}>
            <Label htmlFor={`${step.key}-${f.name}`}>
              {f.name === 'academicYearId' ? t('academicYear') : f.label}
              {f.required && <span className="text-danger"> *</span>}
            </Label>
            {f.type === 'phone' ? (
              <InternationalPhoneInput
                id={`${step.key}-${f.name}`}
                value={values[f.name] ?? ''}
                defaultCountry={institutionCountry}
                onChange={(v) => setField(f.name, v)}
                disabled={!canManage}
              />
            ) : f.type === 'select' ? (
              <Select
                id={`${step.key}-${f.name}`}
                required={f.required}
                disabled={!canManage}
                value={values[f.name] ?? ''}
                placeholder="Select…"
                options={f.options ?? []}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            ) : (
              <Input
                id={`${step.key}-${f.name}`}
                type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                required={f.required}
                disabled={!canManage}
                placeholder={f.placeholder}
                value={values[f.name] ?? ''}
                min={f.type === 'date' && f.name === 'endDate' ? minEndDate(values.startDate ?? '') : undefined}
                max={f.type === 'date' && f.name === 'startDate' ? maxStartDate(values.endDate ?? '') : undefined}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            )}
            {fieldErrors[f.name] && (
              <p className="mt-1 text-xs text-danger">{fieldErrors[f.name]}</p>
            )}
          </div>
        ))}

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" loading={create.isPending} disabled={!canManage}>
            <Plus className="mr-1 h-4 w-4" /> Add{' '}
            {step.key === 'departments'
              ? t('department').toLowerCase()
              : step.key === 'academicTerms'
                ? t('term').toLowerCase()
                : cfg.itemLabel}
          </Button>
          {create.isError && (
            <span role="alert" className="text-sm text-danger">
              {formatPortalError(create.error, 'Could not add. Check the fields.')}
            </span>
          )}
        </div>
      </form>

      {items.length > 0 && (
        <div className="mt-5 rounded-lg border border-border bg-background-secondary/50 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">Added so far</p>
          <ul className="flex flex-col gap-2">
            {items.map((r) => (
              <li
                key={String(r.id)}
                className="flex items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-sm"
              >
                <span className="font-medium text-text-primary">{cfg.rowLabel(r) || '—'}</span>
                {cfg.rowDetail?.(r) && (
                  <span className="shrink-0 tabular-nums text-xs text-text-muted">{cfg.rowDetail(r)}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </CardContent>
  );
}

function LiveState({ name }: { name: string }) {
  const router = useRouter();
  return (
    <Card className="border-success/30 bg-success/5">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/15 text-success">
          <PartyPopper className="h-7 w-7" />
        </span>
        <h1 className="text-lg font-semibold text-text-primary">{name} is live</h1>
        <p className="max-w-sm text-sm text-text-secondary">
          Onboarding is complete and every portal module is unlocked. Welcome aboard.
        </p>
        <Button onClick={() => router.replace('/dashboard')} className="mt-1">
          Go to dashboard <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function WizardSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-16 w-full rounded-lg" />
      <Skeleton className="h-2 w-full rounded-full" />
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}
