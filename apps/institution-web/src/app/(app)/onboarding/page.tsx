'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, PartyPopper, Plus, Rocket } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ErrorState,
  Input,
  InternationalPhoneInput,
  Label,
  Skeleton,
} from '@edrion/ui';
import { Topbar } from '@/components/app-shell/topbar';
import { usePermissions } from '@/lib/permissions';
import { useCompleteOnboarding, useOnboarding, useStepCreate, useStepList } from '@/lib/onboarding';
import type { OnboardingStep, OnboardingSummary } from '@/lib/onboarding-types';

type FieldType = 'text' | 'date' | 'email' | 'phone';
interface FieldCfg {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
}
interface StepCfg {
  endpoint: string;
  itemLabel: string;
  fields: FieldCfg[];
  rowLabel: (row: Record<string, unknown>) => string;
}

/** Per-step inline form config, keyed by the summary step key. All adds happen on this page. */
const STEP_CFG: Record<string, StepCfg> = {
  academicYears: {
    endpoint: 'academics/academic-years',
    itemLabel: 'academic year',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. 2026–2027' },
      { name: 'startDate', label: 'Start date', type: 'date', required: true },
      { name: 'endDate', label: 'End date', type: 'date', required: true },
    ],
    rowLabel: (r) => String(r.name ?? ''),
  },
  departments: {
    endpoint: 'academics/departments',
    itemLabel: 'department',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Science' },
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. SCI' },
    ],
    rowLabel: (r) => `${r.name}${r.code ? ` (${r.code})` : ''}`,
  },
  subjects: {
    endpoint: 'academics/subjects',
    itemLabel: 'subject',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Mathematics' },
      { name: 'code', label: 'Code', type: 'text', required: true, placeholder: 'e.g. MATH' },
    ],
    rowLabel: (r) => `${r.name}${r.code ? ` (${r.code})` : ''}`,
  },
  students: {
    endpoint: 'people/students',
    itemLabel: 'student',
    fields: [
      { name: 'admissionNo', label: 'Admission no.', type: 'text', required: true },
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'phone' },
    ],
    rowLabel: (r) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
  },
  teachers: {
    endpoint: 'people/teachers',
    itemLabel: 'teacher',
    fields: [
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'phone' },
    ],
    rowLabel: (r) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
  },
  staff: {
    endpoint: 'people/staff',
    itemLabel: 'staff member',
    fields: [
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      { name: 'email', label: 'Email', type: 'email' },
      { name: 'phone', label: 'Phone', type: 'phone' },
    ],
    rowLabel: (r) => `${r.firstName ?? ''} ${r.lastName ?? ''}`.trim(),
  },
};

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
            title="Couldn’t load your setup"
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

function Wizard({ data, canManage }: { data: OnboardingSummary; canManage: boolean }) {
  const complete = useCompleteOnboarding();
  const readyToLaunch = data.progress.done === data.progress.total;

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
          Set up the essentials right here. Add at least one of each and you’re ready to go live.
        </p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-text-muted">
            <span>{data.progress.done} of {data.progress.total} steps complete</span>
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

      <ol className="flex flex-col gap-3">
        {data.steps.map((step, i) => (
          <StepSection key={step.key} step={step} index={i + 1} canManage={canManage} />
        ))}
      </ol>

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-text-primary">Ready to go live?</p>
            <p className="text-sm text-text-secondary">
              {readyToLaunch
                ? 'Every step has data. Launch your institution to unlock the full portal.'
                : 'Add at least one record to every step above to go live.'}
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
          {(complete.error as { message?: string })?.message ?? 'Could not go live. Try again.'}
        </p>
      )}
    </>
  );
}

function StepSection({ step, index, canManage }: { step: OnboardingStep; index: number; canManage: boolean }) {
  // Every backend step key has a config here; assert so the hooks below get a stable endpoint.
  const cfg = STEP_CFG[step.key]!;
  const create = useStepCreate(cfg.endpoint);
  const list = useStepList<Record<string, unknown>>(cfg.endpoint);
  const [values, setValues] = useState<Record<string, string>>({});

  const setField = (name: string, v: string) => setValues((s) => ({ ...s, [name]: v }));

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {};
    for (const f of cfg.fields) {
      const v = (values[f.name] ?? '').trim();
      if (v) body[f.name] = v;
    }
    create.mutate(body, { onSuccess: () => setValues({}) });
  }

  const items = list.data?.items ?? [];

  return (
    <li>
      <Card className={step.done ? 'border-success/30' : undefined}>
        <CardContent className="py-4">
          <div className="mb-3 flex items-center gap-3">
            <span
              className={
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ' +
                (step.done ? 'bg-success/15 text-success' : 'bg-background-secondary text-text-secondary')
              }
            >
              {step.done ? <Check className="h-4 w-4" /> : index}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary">{step.label}</p>
            </div>
            {step.count > 0 && (
              <Badge tone={step.done ? 'success' : 'neutral'}>
                {step.count} added
              </Badge>
            )}
          </div>

          {/* Existing records */}
          {items.length > 0 && (
            <ul className="mb-3 flex flex-wrap gap-1.5">
              {items.slice(0, 8).map((r) => (
                <li
                  key={String(r.id)}
                  className="rounded-md bg-background-secondary px-2 py-0.5 text-xs text-text-secondary"
                >
                  {cfg.rowLabel(r) || '—'}
                </li>
              ))}
              {step.count > 8 && (
                <li className="px-1 py-0.5 text-xs text-text-muted">+{step.count - 8} more</li>
              )}
            </ul>
          )}

          {/* Inline add form */}
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {cfg.fields.map((f) => (
              <div key={f.name} className={f.type === 'phone' ? 'sm:col-span-2' : undefined}>
                <Label htmlFor={`${step.key}-${f.name}`}>
                  {f.label}
                  {f.required && <span className="text-danger"> *</span>}
                </Label>
                {f.type === 'phone' ? (
                  <InternationalPhoneInput
                    id={`${step.key}-${f.name}`}
                    value={values[f.name] ?? ''}
                    onChange={(v) => setField(f.name, v)}
                    disabled={!canManage}
                  />
                ) : (
                  <Input
                    id={`${step.key}-${f.name}`}
                    type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                    required={f.required}
                    disabled={!canManage}
                    placeholder={f.placeholder}
                    value={values[f.name] ?? ''}
                    onChange={(e) => setField(f.name, e.target.value)}
                  />
                )}
              </div>
            ))}

            <div className="flex items-center gap-3 sm:col-span-2">
              <Button type="submit" size="sm" loading={create.isPending} disabled={!canManage}>
                <Plus className="mr-1 h-4 w-4" /> Add {cfg.itemLabel}
              </Button>
              {create.isError && (
                <span role="alert" className="text-sm text-danger">
                  {(create.error as { message?: string })?.message ?? 'Could not add. Check the fields.'}
                </span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </li>
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
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-lg" />
      ))}
    </div>
  );
}
