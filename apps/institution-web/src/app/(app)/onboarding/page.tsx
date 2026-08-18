'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, ChevronRight, CircleAlert, Info, PartyPopper, Plus, Rocket } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Checkbox,
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
import { SUBJECT_KIND_OPTIONS } from '@edrion/schemas';
import { Topbar } from '@/components/app-shell/topbar';
import { RoleMultiSelect } from '@/components/admin/role-multi-select';
import { useAcademicYearOptions, useClassOptions, useDepartmentOptions, useGradeLevelOptions, useProgrammeLevelSelectOptions } from '@/lib/academics';
import { isEndAfterStart, maxStartDate, minEndDate } from '@/lib/date-range';
import { usePermissions } from '@/lib/permissions';
import { useInstitutionCountry } from '@/lib/settings';
import { ProgrammeBuilder } from '@/components/academics/programme-builder';
import { CreatedProgrammesPanel } from '@/components/academics/created-programmes-panel';
import { CurriculumGrid } from '@/components/academics/curriculum-grid';
import { useCreatedProgrammeStructures } from '@/lib/academics';
import { useCompleteOnboarding, useOnboarding, useOnboardingStepSubmit, useStepList } from '@/lib/onboarding';
import type { OnboardingStep, OnboardingSummary } from '@/lib/onboarding-types';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { formatPersonName } from '@/lib/person-name';
import { useInstitutionProfile } from '@/lib/settings';
import { useTerm } from '@/lib/term';
import { useScope } from '@/lib/scope';
import { effectivePortalLogin, hasPortalLoginEmail, portalLoginAfterEmailChange } from '@/lib/portal-login-email';

type FieldType = 'text' | 'date' | 'email' | 'phone' | 'select' | 'checkbox' | 'number' | 'textarea';
interface FieldCfg {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  help?: string;
  defaultValue?: string;
}
interface StepCfg {
  endpoint: string;
  itemLabel: string;
  blurb: string;
  fields: FieldCfg[];
  rowLabel: (row: Record<string, unknown>) => string;
  rowDetail?: (row: Record<string, unknown>) => string | null;
}

type FormValues = Record<string, string | boolean | string[]>;

const ACADEMIC_YEAR_STATUS_OPTIONS = [
  { value: 'planning', label: 'Planning' },
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
];

const TERM_KIND_OPTIONS = [
  { value: 'term', label: 'Term' },
  { value: 'semester', label: 'Semester' },
  { value: 'trimester', label: 'Trimester' },
  { value: 'quarter', label: 'Quarter' },
];

const SEMESTER_OPTIONS = Array.from({ length: 12 }, (_, i) => ({
  value: String(i + 1),
  label: String(i + 1),
}));

const STUDENT_STATUS_OPTIONS = [
  { value: 'enrolled', label: 'Enrolled' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'graduated', label: 'Graduated' },
  { value: 'transferred', label: 'Transferred' },
  { value: 'alumni', label: 'Alumni' },
];

const GENDER_OPTIONS = [
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
  { value: 'other', label: 'Other' },
];

const STAFF_EMPLOYMENT_OPTIONS = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'visiting', label: 'Visiting' },
];

const STAFF_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
  { value: 'on_leave', label: 'On leave' },
];

/** Per-step inline form config, keyed by the summary step key. */
const STEP_CFG: Record<string, StepCfg> = {
  academicYears: {
    endpoint: 'academics/academic-years',
    itemLabel: 'academic year',
    blurb: 'Add your first academic year — set its status and whether it is the current year.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. 2026–2027' },
      { name: 'startDate', label: 'Start date', type: 'date', required: true },
      { name: 'endDate', label: 'End date', type: 'date', required: true },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: ACADEMIC_YEAR_STATUS_OPTIONS,
        defaultValue: 'planning',
      },
      {
        name: 'isCurrent',
        label: 'Mark as the current year',
        type: 'checkbox',
        help: 'Only one year can be current per scope.',
      },
    ],
    rowLabel: (r) => String(r.name ?? ''),
    rowDetail: (r) => {
      const parts: string[] = [];
      const start = r.startDate as string | undefined;
      const end = r.endDate as string | undefined;
      if (start && end) parts.push(`${start} → ${end}`);
      const status = r.status as string | undefined;
      if (status) parts.push(status.charAt(0).toUpperCase() + status.slice(1));
      if (r.isCurrent) parts.push('Current');
      return parts.length ? parts.join(' · ') : null;
    },
  },
  departments: {
    endpoint: 'academics/departments',
    itemLabel: 'department',
    blurb: 'Add at least one department — programmes, subjects, and terms are organised under departments.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Science' },
      { name: 'code', label: 'Code', type: 'text', placeholder: 'e.g. SCI (optional)' },
    ],
    rowLabel: (r) => `${r.name}${r.code ? ` (${r.code})` : ''}`,
  },
  programmeLevels: {
    endpoint: 'academics/department-grade-levels',
    itemLabel: 'programme year',
    blurb: 'Link a year level to a department so terms and subjects know which programme they belong to.',
    fields: [
      { name: 'departmentId', label: 'Department', type: 'select', required: true, options: [] },
      { name: 'name', label: 'Year name', type: 'text', required: true, placeholder: 'e.g. Year 1' },
      { name: 'sequence', label: 'Sequence', type: 'number', required: true, placeholder: '1', help: 'Position within the department (1 = first year).' },
    ],
    rowLabel: (r) => [r.departmentName, r.gradeLevelName].filter(Boolean).join(' · ') || String(r.name ?? ''),
    rowDetail: (r) => (r.sequence != null ? `Seq. ${r.sequence}` : null),
  },
  academicTerms: {
    endpoint: 'academics/academic-terms',
    itemLabel: 'term',
    blurb: 'Add terms or semesters — pick the academic year, programme year, and sequence so they slot into the structure.',
    fields: [
      { name: 'programmeLevelId', label: 'Programme', type: 'select', required: true, options: [] },
      { name: 'academicYearId', label: 'Academic year', type: 'select', required: true, options: [] },
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Term 1' },
      {
        name: 'kind',
        label: 'Kind',
        type: 'select',
        required: true,
        options: TERM_KIND_OPTIONS,
        defaultValue: 'semester',
      },
      { name: 'sequence', label: 'Sequence', type: 'number', required: true, placeholder: '1', help: 'Position within the programme year (1 = first).' },
      { name: 'startDate', label: 'Start date', type: 'date', required: true },
      { name: 'endDate', label: 'End date', type: 'date', required: true },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: ACADEMIC_YEAR_STATUS_OPTIONS,
        defaultValue: 'active',
      },
    ],
    rowLabel: (r) => String(r.name ?? ''),
    rowDetail: (r) => {
      const parts: string[] = [];
      const lineage = [r.departmentName, r.gradeLevelName].filter(Boolean).join(' · ');
      if (lineage) parts.push(lineage);
      if (r.academicYearName) parts.push(String(r.academicYearName));
      const start = r.startDate as string | undefined;
      const end = r.endDate as string | undefined;
      if (start && end) parts.push(`${start} → ${end}`);
      return parts.length ? parts.join(' · ') : null;
    },
  },
  subjects: {
    endpoint: 'academics/subjects',
    itemLabel: 'subject',
    blurb: 'Add subjects and place them in a programme year and term so they appear in the curriculum.',
    fields: [
      { name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'e.g. Mathematics' },
      { name: 'code', label: 'Code', type: 'text', placeholder: 'e.g. MATH (optional)' },
      {
        name: 'kind',
        label: 'Type',
        type: 'select',
        required: true,
        options: SUBJECT_KIND_OPTIONS,
        defaultValue: 'core',
      },
      { name: 'departmentId', label: 'Owning department', type: 'select', required: false, options: [] },
      { name: 'programmeLevelId', label: 'Taught in programme', type: 'select', required: true, options: [] },
      { name: 'semesterSequence', label: 'Term sequence', type: 'select', required: true, options: SEMESTER_OPTIONS, defaultValue: '1' },
    ],
    rowLabel: (r) => `${r.name}${r.code ? ` (${r.code})` : ''}`,
  },
  students: {
    endpoint: 'people/students',
    itemLabel: 'student',
    blurb: 'Add your first student to unlock the student directory.',
    fields: [
      { name: 'admissionNo', label: 'Admission no.', type: 'text', required: true, placeholder: 'e.g. ADM-1024' },
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'middleName', label: 'Middle name', type: 'text', placeholder: 'Optional' },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: STUDENT_STATUS_OPTIONS,
        defaultValue: 'enrolled',
      },
      {
        name: 'gender',
        label: 'Gender',
        type: 'select',
        options: GENDER_OPTIONS,
      },
      { name: 'dateOfBirth', label: 'Date of birth', type: 'date' },
      { name: 'gradeLevelId', label: 'Year', type: 'select', options: [] },
      { name: 'classId', label: 'Class', type: 'select', options: [] },
      { name: 'rollNo', label: 'Roll no.', type: 'text', placeholder: 'Optional' },
      { name: 'enrollmentDate', label: 'Enrolment date', type: 'date' },
      { name: 'email', label: 'Email', type: 'email', placeholder: 'Optional' },
      { name: 'phone', label: 'Phone', type: 'phone' },
      { name: 'address', label: 'Address', type: 'textarea', placeholder: 'Optional' },
    ],
    rowLabel: (r) => formatPersonName({ firstName: String(r.firstName ?? ''), middleName: r.middleName as string | undefined, lastName: String(r.lastName ?? '') }),
  },
  staff: {
    endpoint: 'people/staff',
    itemLabel: 'staff member',
    blurb: 'Add staff and assign portal roles when they need a login.',
    fields: [
      { name: 'firstName', label: 'First name', type: 'text', required: true },
      { name: 'middleName', label: 'Middle name', type: 'text', placeholder: 'Optional' },
      { name: 'lastName', label: 'Last name', type: 'text', required: true },
      { name: 'employeeNo', label: 'Employee no.', type: 'text', placeholder: 'e.g. EMP-512 (optional)' },
      {
        name: 'departmentId',
        label: 'Department',
        type: 'select',
        help: 'Optional — assign HODs and teachers to a programme department.',
      },
      { name: 'designation', label: 'Designation', type: 'text', placeholder: 'e.g. Teacher, Accountant (optional)' },
      {
        name: 'employmentType',
        label: 'Employment',
        type: 'select',
        required: true,
        options: STAFF_EMPLOYMENT_OPTIONS,
        defaultValue: 'full_time',
      },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        required: true,
        options: STAFF_STATUS_OPTIONS,
        defaultValue: 'active',
      },
      { name: 'joinDate', label: 'Join date', type: 'date' },
      { name: 'email', label: 'Email', type: 'email', placeholder: 'Optional' },
      { name: 'phone', label: 'Phone', type: 'phone' },
      {
        name: 'createLogin',
        label: 'Create portal login',
        type: 'checkbox',
        help: 'Turned on automatically when you add an email; you can turn it off.',
      },
    ],
    rowLabel: (r) => formatPersonName({ firstName: String(r.firstName ?? ''), middleName: r.middleName as string | undefined, lastName: String(r.lastName ?? '') }),
    rowDetail: (r) => (r.departmentName ? String(r.departmentName) : null),
  },
};

function emptyValues(fields: FieldCfg[]): FormValues {
  const v: FormValues = {};
  for (const f of fields) {
    if (f.type === 'checkbox') v[f.name] = false;
    else if (f.type === 'select') v[f.name] = f.defaultValue ?? '';
    else if (f.type === 'number') v[f.name] = f.defaultValue ?? '1';
    else v[f.name] = '';
  }
  v.roleKeys = [];
  v.campusIds = [];
  return v;
}

function fieldString(values: FormValues, name: string): string {
  const v = values[name];
  return typeof v === 'string' ? v : '';
}

function fieldStringArray(values: FormValues, name: string): string[] {
  const v = values[name];
  return Array.isArray(v) ? v : [];
}

function hasDraftInput(values: FormValues, fields: FieldCfg[]): boolean {
  if (fieldStringArray(values, 'roleKeys').length > 0) return true;
  if (fieldStringArray(values, 'campusIds').length > 0) return true;
  return fields.some((f) => {
    const v = values[f.name];
    if (f.type === 'checkbox') return v === true && f.name !== 'createLogin';
    if (f.type === 'select' && f.defaultValue && v === f.defaultValue) return false;
    if (typeof v === 'string') return v.trim() !== '';
    return false;
  });
}

function OnboardingNotice({
  tone,
  children,
  className,
  ...props
}: {
  tone: 'warning' | 'info' | 'danger';
  children: React.ReactNode;
  className?: string;
} & React.ComponentPropsWithoutRef<'div'>) {
  const Icon = tone === 'info' ? Info : CircleAlert;
  return (
    <div
      {...props}
      className={cn(
        'flex gap-3 rounded-lg px-3.5 py-3',
        tone === 'warning' && 'bg-warning-soft/70',
        tone === 'info' && 'bg-info-soft/70',
        tone === 'danger' && 'bg-danger-soft/70',
        className,
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 h-4 w-4 shrink-0',
          tone === 'warning' && 'text-warning',
          tone === 'info' && 'text-info',
          tone === 'danger' && 'text-danger',
        )}
        aria-hidden
      />
      <p className="text-sm leading-relaxed text-text-primary">{children}</p>
    </div>
  );
}

/** Step-specific defaults when posting to a module create endpoint. */
function buildStepCreateBody(stepKey: string, fields: FieldCfg[], values: FormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.name === 'roleKeys' || f.name === 'campusIds') continue;
    const v = values[f.name];
    if (f.type === 'checkbox') {
      body[f.name] = v === true;
    } else if (f.type === 'number') {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s) body[f.name] = Number(s);
      else if (f.defaultValue) body[f.name] = Number(f.defaultValue);
    } else if (f.type === 'select') {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s || f.defaultValue) body[f.name] = s || f.defaultValue;
    } else {
      const s = typeof v === 'string' ? v.trim() : '';
      if (s) body[f.name] = s;
    }
  }

  if (stepKey === 'programmeLevels') {
    delete body.departmentId;
    delete body.name;
    delete body.sequence;
  } else if (stepKey === 'subjects') {
    delete body.programmeLevelId;
    delete body.semesterSequence;
  } else if (stepKey === 'staff') {
    body.employmentType = body.employmentType ?? 'full_time';
    body.status = body.status ?? 'active';
    body.createLogin = effectivePortalLogin(body.email, values.createLogin);
    body.roleKeys = Array.isArray(values.roleKeys) ? values.roleKeys : [];
    body.campusIds = Array.isArray(values.campusIds) ? values.campusIds : [];
    if (!body.createLogin) {
      delete body.createLogin;
      delete body.roleKeys;
      delete body.campusIds;
    }
  } else if (stepKey === 'students') {
    body.status = body.status ?? 'enrolled';
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
    case 'subjects':
      return 'Curriculum';
    case 'students':
      return tp('student');
    case 'staff':
      return tp('staff');
    case 'academicYears':
      return tp('academicYear');
    case 'programmeStructures':
      return tp('programmeStructure');
    default:
      return step.label;
  }
}

function Wizard({ data, canManage }: { data: OnboardingSummary; canManage: boolean }) {
  const { tp } = useTerm();
  // Warm the profile cache early so phone inputs on later steps get the right default country.
  useInstitutionProfile();
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
  const isLastStep = stepIndex >= totalSteps - 1;
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
          <div className="flex min-w-0 flex-1 flex-col items-stretch gap-2 sm:items-end">
            {stepError && (
              <OnboardingNotice tone="warning" className="sm:max-w-sm" role="alert">
                {stepError}
              </OnboardingNotice>
            )}
            {isLastStep ? (
              <Button
                size="sm"
                onClick={() => complete.mutate()}
                loading={complete.isPending}
                disabled={!readyToLaunch || !canManage || nextBlocked}
                title={
                  nextBlocked
                    ? 'Add at least one record on this step to continue'
                    : !readyToLaunch
                      ? 'Complete every required step before going live'
                      : undefined
                }
              >
                <Rocket className="h-4 w-4" /> Go live
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => goToStep(stepIndex + 1)}
                disabled={nextBlocked}
                title={nextBlocked ? 'Add at least one record on this step to continue' : undefined}
              >
                Next <ArrowRight className="h-4 w-4" />
              </Button>
            )}
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

      {!isLastStep && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="py-5">
            <p className="text-sm font-semibold text-text-primary">Ready to go live?</p>
            <p className="mt-1 text-sm text-text-secondary">
              {readyToLaunch
                ? 'Every required step has data. Continue to the final step to launch your institution.'
                : 'Add at least one record to every required step to go live.'}
            </p>
          </CardContent>
        </Card>
      )}
      {complete.isError && (
        <OnboardingNotice tone="danger" role="alert">
          {formatPortalError(complete.error, 'Could not go live. Try again.')}
        </OnboardingNotice>
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
  const client = usePortalClient();
  const INSTITUTION_SCOPE = { mode: 'institution' } as const;

  if (step.key === 'programmeStructures') {
    return (
      <ProgrammeStructuresStep
        step={step}
        index={index}
        canManage={canManage}
        createDepartment={(input) =>
          client.post<{ id: string }>('/portal/academics/departments', INSTITUTION_SCOPE, input)
        }
      />
    );
  }

  if (step.key === 'subjects') {
    return <CurriculumStep step={step} index={index} canManage={canManage} />;
  }

  return (
    <DefaultStepPanel step={step} index={index} canManage={canManage} onDraftChange={onDraftChange} />
  );
}

function ProgrammeStructuresStep({
  step,
  index,
  canManage,
  createDepartment,
}: {
  step: OnboardingStep;
  index: number;
  canManage: boolean;
  createDepartment: (input: Record<string, unknown>) => Promise<{ id: string }>;
}) {
  const { tp } = useTerm();
  const { refetch } = useOnboarding();
  const { data: created, refetch: refetchCreated } = useCreatedProgrammeStructures();
  const title = stepTitle(step, tp);

  return (
    <CardContent className="py-5">
      <StepHeader step={step} index={index} title={title} blurb="Name each programme, pick how it is divided, preview the grid, then add it. Dates are scheduled later from Academics." />

      {(created?.length ?? 0) > 0 && (
        <div className="mb-5">
          <CreatedProgrammesPanel items={created ?? []} />
        </div>
      )}

      <ProgrammeBuilder
        canManage={canManage}
        createDepartment={createDepartment}
        onCommitted={() => {
          void refetch();
          void refetchCreated();
        }}
      />
    </CardContent>
  );
}

function CurriculumStep({
  step,
  index,
  canManage,
}: {
  step: OnboardingStep;
  index: number;
  canManage: boolean;
}) {
  const { tp } = useTerm();
  const { refetch } = useOnboarding();
  const title = stepTitle(step, tp);

  return (
    <CardContent className="py-5">
      <StepHeader step={step} index={index} title={title} blurb="Pick a programme and place subjects into its term slots — no sequence numbers to type." />
      <CurriculumGrid canManage={canManage} onChanged={() => refetch()} />
    </CardContent>
  );
}

function StepHeader({
  step,
  index,
  title,
  blurb,
}: {
  step: OnboardingStep;
  index: number;
  title: string;
  blurb: string;
}) {
  return (
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
        <p className="mt-1 text-sm text-text-secondary">{blurb}</p>
      </div>
      {step.count > 0 && (
        <Badge tone={step.done ? 'success' : 'neutral'}>{step.count} added</Badge>
      )}
    </div>
  );
}

function DefaultStepPanel({
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
  const { campuses } = useScope();
  const { data: years } = useAcademicYearOptions();
  const { data: departments } = useDepartmentOptions();
  const { data: gradeLevels } = useGradeLevelOptions();
  const { data: classes } = useClassOptions();
  const { options: levelOptions } = useProgrammeLevelSelectOptions();
  const cfg = STEP_CFG[step.key]!;
  const fields = useMemo(() => {
    const deptOptions = (departments?.items ?? []).map((d) => ({ value: d.id, label: d.name }));
    const yearOptions = (years?.items ?? []).map((y) => ({ value: y.id, label: y.name }));
    const gradeOptions = (gradeLevels?.items ?? []).map((g) => ({ value: g.id, label: g.name }));
    const classOptions = (classes?.items ?? []).map((c) => ({ value: c.id, label: c.name }));

    return cfg.fields.map((f) => {
      if (f.name === 'departmentId') {
        return { ...f, label: t('department'), options: deptOptions };
      }
      if (f.name === 'gradeLevelId') {
        return { ...f, label: t('gradeLevel'), options: gradeOptions };
      }
      if (f.name === 'classId') {
        return { ...f, label: t('class'), options: classOptions };
      }
      if (f.name === 'programmeLevelId') {
        return {
          ...f,
          label: `${t('department')} and ${t('gradeLevel').toLowerCase()}`,
          options: levelOptions,
          help:
            levelOptions.length === 0
              ? `Add a ${t('department').toLowerCase()} and programme year first.`
              : f.help,
        };
      }
      if (f.name === 'academicYearId') {
        return { ...f, label: t('academicYear'), options: yearOptions };
      }
      if (f.name === 'semesterSequence') {
        return { ...f, label: t('term'), options: SEMESTER_OPTIONS };
      }
      if (f.name === 'name' && step.key === 'academicTerms') {
        return { ...f, placeholder: `e.g. ${t('term')} 1` };
      }
      if (f.name === 'name' && step.key === 'programmeLevels') {
        return { ...f, label: `${t('gradeLevel')} name`, placeholder: `e.g. ${t('gradeLevel')} 1` };
      }
      return f;
    });
  }, [cfg.fields, departments, gradeLevels, classes, levelOptions, step.key, t, years]);
  const create = useOnboardingStepSubmit(step.key, cfg.endpoint, cfg.endpoint);
  const list = useStepList<Record<string, unknown>>(cfg.endpoint);
  const institutionCountry = useInstitutionCountry();
  const [values, setValues] = useState<FormValues>(() => emptyValues(fields));
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const draft = hasDraftInput(values, fields);
  const staffEmail = fieldString(values, 'email');
  const createLogin =
    step.key === 'staff'
      ? effectivePortalLogin(staffEmail, values.createLogin)
      : values.createLogin === true;
  const selectedCampusIds = fieldStringArray(values, 'campusIds');
  const singleCampus = campuses.length === 1 ? campuses[0]! : null;

  useEffect(() => {
    onDraftChange(draft);
  }, [draft, onDraftChange]);

  useEffect(() => {
    if (step.key !== 'staff' || !createLogin || !singleCampus) return;
    setValues((s) => {
      const current = fieldStringArray(s, 'campusIds');
      if (current.length === 1 && current[0] === singleCampus.id) return s;
      return { ...s, campusIds: [singleCampus.id] };
    });
  }, [step.key, createLogin, singleCampus]);

  const setField = (name: string, v: string | boolean | string[]) => {
    setValues((s) => {
      const next = { ...s, [name]: v };
      if (name === 'email' && step.key === 'staff') {
        const hadEmail = hasPortalLoginEmail(s.email);
        const hasEmail = hasPortalLoginEmail(v);
        next.createLogin = portalLoginAfterEmailChange(hadEmail, hasEmail, s.createLogin === true);
        if (!next.createLogin) {
          next.roleKeys = [];
          next.campusIds = [];
        }
      }
      if (name === 'createLogin') {
        if (v === true && !hasPortalLoginEmail(next.email)) {
          next.createLogin = false;
        } else if (v === false) {
          next.roleKeys = [];
          next.campusIds = [];
        }
      }
      if (
        typeof v === 'string' &&
        name === 'startDate' &&
        typeof next.endDate === 'string' &&
        next.endDate &&
        !isEndAfterStart(v, next.endDate)
      ) {
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
      if (!f.required || f.type === 'checkbox') continue;
      const v = values[f.name];
      if (f.type === 'number') {
        const n = typeof v === 'string' ? Number(v) : NaN;
        if (!Number.isFinite(n) || n < 1) nextErrors[f.name] = `${f.label} is required`;
        continue;
      }
      if (typeof v !== 'string' || !v.trim()) {
        nextErrors[f.name] = `${f.label} is required`;
      }
    }
    const start = typeof values.startDate === 'string' ? values.startDate : '';
    const end = typeof values.endDate === 'string' ? values.endDate : '';
    if (start && end && !isEndAfterStart(start, end)) {
      nextErrors.endDate = 'End date must be after the start date';
    }
    if (step.key === 'staff' && createLogin) {
      const email = typeof values.email === 'string' ? values.email.trim() : '';
      if (!email) nextErrors.email = 'Email is required to create a portal login';
      const roles = Array.isArray(values.roleKeys) ? values.roleKeys : [];
      if (roles.length === 0) nextErrors.roleKeys = 'Select at least one portal role';
    }
    if (step.key === 'programmeLevels' && (departments?.items ?? []).length === 0) {
      nextErrors.departmentId = `Add a ${t('department').toLowerCase()} first`;
    }
    if (
      (step.key === 'academicTerms' || step.key === 'subjects') &&
      levelOptions.length === 0
    ) {
      nextErrors.programmeLevelId = `Add a programme year first`;
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }

    const body = buildStepCreateBody(step.key, fields, values);
    create.mutate(
      { body, values },
      {
        onSuccess: () => {
          setValues(emptyValues(fields));
          setFieldErrors({});
        },
      },
    );
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
        <OnboardingNotice tone="warning" className="mb-4" role="status">
          Add at least one {title.toLowerCase()} before you can continue to the next step.
        </OnboardingNotice>
      )}

      {draft && (
        <OnboardingNotice tone="info" className="mb-4" role="status">
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
        </OnboardingNotice>
      )}

      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div
            key={f.name}
            className={
              f.type === 'phone' ||
              f.type === 'checkbox' ||
              f.type === 'textarea' ||
              f.name === 'programmeLevelId' ||
              f.name === 'semesterSequence' ||
              f.name === 'address'
                ? 'sm:col-span-2'
                : undefined
            }
          >
            {f.type === 'checkbox' ? (
              <div>
                {f.name === 'createLogin' ? (
                  <>
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <Checkbox
                        id={`${step.key}-${f.name}`}
                        checked={createLogin}
                        onChange={(e) => {
                          if (!hasPortalLoginEmail(staffEmail)) return;
                          setField('createLogin', e.target.checked);
                        }}
                      />
                      <span className="text-sm font-medium text-text-primary">{f.label}</span>
                    </label>
                    {!hasPortalLoginEmail(staffEmail) && (
                      <p className="mt-1 pl-[calc(18px+0.625rem)] text-xs text-text-muted">
                        Add an email address above to enable portal login.
                      </p>
                    )}
                    {f.help && <p className="mt-1 pl-[calc(18px+0.625rem)] text-xs text-text-muted">{f.help}</p>}
                  </>
                ) : (
                  <>
                    <label className="flex cursor-pointer items-center gap-2.5">
                      <Checkbox
                        id={`${step.key}-${f.name}`}
                        checked={values[f.name] === true}
                        disabled={!canManage}
                        onChange={(e) => setField(f.name, e.target.checked)}
                      />
                      <span className="text-sm font-medium text-text-primary">{f.label}</span>
                    </label>
                    {f.help && <p className="mt-1 pl-[calc(18px+0.625rem)] text-xs text-text-muted">{f.help}</p>}
                  </>
                )}
              </div>
            ) : (
              <>
            <Label htmlFor={`${step.key}-${f.name}`}>
              {f.label}
              {f.required && <span className="text-danger"> *</span>}
            </Label>
            {f.type === 'phone' ? (
              <InternationalPhoneInput
                id={`${step.key}-${f.name}`}
                value={fieldString(values, f.name)}
                defaultCountry={institutionCountry}
                onChange={(v) => setField(f.name, v)}
                disabled={!canManage}
              />
            ) : f.type === 'select' ? (
              <Select
                id={`${step.key}-${f.name}`}
                required={f.required}
                disabled={!canManage || (f.options?.length === 0 && f.required)}
                value={fieldString(values, f.name)}
                placeholder={f.options?.length ? 'Select…' : 'Nothing to select yet'}
                options={f.options ?? []}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            ) : f.type === 'number' ? (
              <Input
                id={`${step.key}-${f.name}`}
                type="number"
                min={1}
                required={f.required}
                disabled={!canManage}
                placeholder={f.placeholder}
                value={fieldString(values, f.name)}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            ) : f.type === 'textarea' ? (
              <textarea
                id={`${step.key}-${f.name}`}
                rows={3}
                disabled={!canManage}
                placeholder={f.placeholder}
                value={fieldString(values, f.name)}
                onChange={(e) => setField(f.name, e.target.value)}
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            ) : (
              <Input
                id={`${step.key}-${f.name}`}
                type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                required={f.required}
                disabled={!canManage}
                placeholder={f.placeholder}
                value={fieldString(values, f.name)}
                min={f.type === 'date' && f.name === 'endDate' ? minEndDate(fieldString(values, 'startDate')) : undefined}
                max={f.type === 'date' && f.name === 'startDate' ? maxStartDate(fieldString(values, 'endDate')) : undefined}
                onChange={(e) => setField(f.name, e.target.value)}
              />
            )}
            {f.help && <p className="mt-1 text-xs text-text-muted">{f.help}</p>}
            {fieldErrors[f.name] && (
              <p className="mt-1 text-xs text-danger">{fieldErrors[f.name]}</p>
            )}
              </>
            )}
          </div>
        ))}

        {step.key === 'staff' && (
          <div className="sm:col-span-2">
            <Label>
              Portal roles
              {createLogin ? <span className="text-danger"> *</span> : null}
            </Label>
            <p className="mb-2 text-xs text-text-muted">
              {createLogin
                ? 'Roles assigned when the portal login is created.'
                : 'Add an email address above to assign portal roles.'}
            </p>
            <RoleMultiSelect
              value={fieldStringArray(values, 'roleKeys')}
              onChange={(keys) => setField('roleKeys', keys)}
              disabled={!canManage}
            />
            {fieldErrors.roleKeys && (
              <p className="mt-1 text-xs text-danger">{fieldErrors.roleKeys}</p>
            )}
          </div>
        )}

        {step.key === 'staff' && campuses.length > 0 && (
          <div className="mt-3 sm:col-span-2">
            <Label>Campus access</Label>
            <p className="mb-2 text-xs text-text-muted">
              {!createLogin
                ? 'Add an email address above to choose campus access.'
                : singleCampus
                  ? 'This institution has one campus — portal access is assigned there automatically.'
                  : 'Choose which campuses this user can access. Leave empty for institution-wide roles.'}
            </p>
            <ul className="divide-y divide-border rounded-md border border-border">
              {campuses.map((c) => (
                <li key={c.id} className="flex items-center gap-2.5 px-3 py-2">
                  <Checkbox
                    id={`${step.key}-campus-${c.id}`}
                    checked={selectedCampusIds.includes(c.id)}
                    disabled={!canManage || !!singleCampus}
                    onChange={() => {
                      const next = new Set(selectedCampusIds);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      setField('campusIds', [...next]);
                    }}
                  />
                  <label
                    htmlFor={`${step.key}-campus-${c.id}`}
                    className={cn('text-sm text-text-primary', singleCampus ? 'cursor-default' : 'cursor-pointer')}
                  >
                    {c.name}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" loading={create.isPending} disabled={!canManage}>
            <Plus className="mr-1 h-4 w-4" /> Add{' '}
            {step.key === 'departments'
              ? t('department').toLowerCase()
              : step.key === 'programmeLevels'
                ? t('gradeLevel').toLowerCase()
              : step.key === 'academicTerms'
                ? t('term').toLowerCase()
                : cfg.itemLabel}
          </Button>
          {create.isError && (
            <OnboardingNotice tone="danger" className="flex-1" role="alert">
              {formatPortalError(create.error, 'Could not add. Check the fields.')}
            </OnboardingNotice>
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
