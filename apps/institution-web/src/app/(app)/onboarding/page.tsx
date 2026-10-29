'use client';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  CircleAlert,
  Info,
  PartyPopper,
  Pencil,
  Plus,
  Rocket,
  Trash2,
} from 'lucide-react';
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
import { isEndAfterStart, maxStartDate, minEndDate } from '@/lib/date-range';
import { usePermissions } from '@/lib/permissions';
import { useInstitutionCountry } from '@/lib/settings';
import { ProgrammeBuilder } from '@/components/academics/programme-builder';
import { CreatedProgrammesPanel } from '@/components/academics/created-programmes-panel';
import { StaffDepartmentsPanel } from '@/components/academics/staff-departments-panel';
import { CurriculumGrid } from '@/components/academics/curriculum-grid';
import { useCreatedProgrammeStructures, useScheduleAcademicYear } from '@/lib/academics';
import {
  useCompleteOnboarding,
  useOnboarding,
  useOnboardingStepSubmit,
  useOnboardingRecordMutations,
  useStepList,
} from '@/lib/onboarding';
import type { OnboardingStep, OnboardingSummary } from '@/lib/onboarding-types';
import { formatPortalError, usePortalClient } from '@/lib/portal-client';
import { formatPersonName } from '@/lib/person-name';
import { STAFF_PROFILE_FIELDS } from '@/lib/staff-profile-fields';
import { useInstitutionProfile } from '@/lib/settings';
import { useAcademicStructureTerms } from '@/lib/academic-structure-terms';
import type { ProgrammeStructureDetail } from '@/lib/academics';
import { useScope } from '@/lib/scope';
import {
  effectivePortalLogin,
  hasPortalLoginEmail,
  portalLoginAfterEmailChange,
} from '@/lib/portal-login-email';
import type {
  AcademicTermRow,
  AcademicYearRow,
  ClassRow,
  DepartmentGradeLevelRow,
  DepartmentRow,
  GradeLevelRow,
} from '@/lib/academics-types';

type FieldType =
  | 'text'
  | 'date'
  | 'email'
  | 'phone'
  | 'select'
  | 'checkbox'
  | 'number'
  | 'textarea';
interface FieldCfg {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  help?: string;
  defaultValue?: string;
  min?: number;
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
  programmeLevels: {
    endpoint: 'academics/department-grade-levels',
    itemLabel: 'programme year',
    blurb:
      'Link a year level to a department so terms and subjects know which programme they belong to.',
    fields: [
      { name: 'departmentId', label: 'Department', type: 'select', required: true, options: [] },
      {
        name: 'name',
        label: 'Year name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Year 1',
      },
      {
        name: 'sequence',
        label: 'Sequence',
        type: 'number',
        required: true,
        placeholder: '1',
        help: 'Position within the department (1 = first year).',
      },
    ],
    rowLabel: (r) =>
      [r.departmentName, r.gradeLevelName].filter(Boolean).join(' · ') || String(r.name ?? ''),
    rowDetail: (r) => (r.sequence != null ? `Seq. ${r.sequence}` : null),
  },
  subjects: {
    endpoint: 'academics/subjects',
    itemLabel: 'subject',
    blurb:
      'Add subjects and place them in a programme year and term so they appear in the curriculum.',
    fields: [
      {
        name: 'name',
        label: 'Name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Mathematics',
      },
      { name: 'code', label: 'Code', type: 'text', placeholder: 'e.g. MATH (optional)' },
      {
        name: 'kind',
        label: 'Type',
        type: 'select',
        required: true,
        options: SUBJECT_KIND_OPTIONS,
        defaultValue: 'core',
      },
      {
        name: 'departmentId',
        label: 'Owning department',
        type: 'select',
        required: false,
        options: [],
      },
      {
        name: 'programmeLevelId',
        label: 'Taught in programme',
        type: 'select',
        required: true,
        options: [],
      },
      {
        name: 'semesterSequence',
        label: 'Term sequence',
        type: 'select',
        required: true,
        options: SEMESTER_OPTIONS,
        defaultValue: '1',
      },
    ],
    rowLabel: (r) => `${r.name}${r.code ? ` (${r.code})` : ''}`,
  },
  classes: {
    endpoint: 'academics/classes',
    itemLabel: 'class / section',
    blurb:
      'Create classes and sections for your programme years before assigning students. You can assign class teachers later.',
    fields: [
      {
        name: 'name',
        label: 'Class name',
        type: 'text',
        required: true,
        placeholder: 'e.g. Year 1 – A',
      },
      {
        name: 'programmeLevelId',
        label: 'Programme and year',
        type: 'select',
        required: true,
        options: [],
      },
      {
        name: 'academicYearId',
        label: 'Academic year',
        type: 'select',
        required: true,
        options: [],
      },
      { name: 'termId', label: 'Term', type: 'select', required: true, options: [] },
      { name: 'section', label: 'Section', type: 'text', placeholder: 'e.g. A' },
      { name: 'room', label: 'Room', type: 'text', placeholder: 'Optional' },
      {
        name: 'capacity',
        label: 'Capacity',
        type: 'number',
        min: 0,
        defaultValue: '',
        placeholder: 'Optional',
      },
    ],
    rowLabel: (r) => String(r.name ?? ''),
    rowDetail: (r) =>
      [
        r.departmentName,
        r.gradeLevelName,
        r.section ? `Section ${r.section}` : '',
        r.academicYearName,
        r.termName,
      ]
        .filter(Boolean)
        .join(' · '),
  },
  students: {
    endpoint: 'people/students',
    itemLabel: 'student',
    blurb: 'Add your first student to unlock the student directory.',
    fields: [
      {
        name: 'admissionNo',
        label: 'Admission no.',
        type: 'text',
        required: true,
        placeholder: 'e.g. ADM-1024',
      },
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
    rowLabel: (r) =>
      formatPersonName({
        firstName: String(r.firstName ?? ''),
        middleName: r.middleName as string | undefined,
        lastName: String(r.lastName ?? ''),
      }),
  },
  staff: {
    endpoint: 'people/staff',
    itemLabel: 'staff member',
    blurb:
      'Add staff details, including designation, department, employment, join date and contact information. Assign portal roles when they need a login.',
    fields: [
      ...STAFF_PROFILE_FIELDS.map(
        (field): FieldCfg => ({
          ...field,
          type: field.name === 'email' ? 'email' : field.type,
        }),
      ),
      {
        name: 'createLogin',
        label: 'Create portal login',
        type: 'checkbox',
        help: 'Turned on automatically when you add an email; you can turn it off.',
      },
    ],
    rowLabel: (r) =>
      formatPersonName({
        firstName: String(r.firstName ?? ''),
        middleName: r.middleName as string | undefined,
        lastName: String(r.lastName ?? ''),
      }),
    rowDetail: (r) =>
      [
        r.designation,
        r.departmentName
          ? `${r.departmentName}${r.departmentUnitKind === 'programme' ? ' (previous course link)' : ''}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ') || null,
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
function buildStepCreateBody(
  stepKey: string,
  fields: FieldCfg[],
  values: FormValues,
): Record<string, unknown> {
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
    case 'departments':
      return 'Departments';
    case 'classes':
      return tp('class') === tp('section')
        ? tp('class')
        : `${tp('class')} & ${tp('section').toLowerCase()}`;
    default:
      return step.label;
  }
}

function Wizard({ data, canManage }: { data: OnboardingSummary; canManage: boolean }) {
  const { tp } = useAcademicStructureTerms();
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
        setStepError(`Complete ${stepTitle(blocked, tp)} before continuing.`);
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
          <h1 className="text-lg font-semibold text-text-primary">
            Welcome to Edrion, {data.institution.displayName}
          </h1>
        </div>
        <p className="mt-1.5 text-sm text-text-secondary">
          Work through each section to set up your institution. Required steps must have at least
          one record before you go live.
        </p>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-text-muted">
            <span>
              Step {stepIndex + 1} of {totalSteps} · {mandatoryDone} of {mandatory.length} required
              complete
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
                    i === stepIndex
                      ? 'font-semibold text-primary'
                      : step.done
                        ? 'text-success'
                        : 'text-text-muted',
                  )}
                >
                  {step.done ? <Check className="h-3 w-3 shrink-0" /> : null}
                  <span>{stepTitle(step, tp)}</span>
                </button>
                {i < steps.length - 1 && (
                  <ChevronRight className="h-3 w-3 shrink-0 text-text-muted/40" />
                )}
              </li>
            ))}
          </ol>
        </div>

        {current && (
          <div key={current.key} className="page-enter">
            <StepPanel
              step={current}
              index={stepIndex + 1}
              canManage={canManage}
              onDraftChange={setHasDraft}
            />
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

  if (step.key === 'departments') {
    return (
      <CardContent className="py-5">
        <StepHeader
          step={step}
          index={index}
          title="Departments"
          blurb="Set up staff departments before assigning staff. You can continue without departments if your institution does not use them."
        />
        <StaffDepartmentsPanel canManage={canManage} onDraftChange={onDraftChange} />
      </CardContent>
    );
  }

  if (step.key === 'programmeStructures') {
    return (
      <ProgrammeStructuresStep
        step={step}
        index={index}
        canManage={canManage}
        onDraftChange={onDraftChange}
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
    <DefaultStepPanel
      step={step}
      index={index}
      canManage={canManage}
      onDraftChange={onDraftChange}
    />
  );
}

function ProgrammeStructuresStep({
  step,
  index,
  canManage,
  createDepartment,
  onDraftChange,
}: {
  step: OnboardingStep;
  index: number;
  canManage: boolean;
  createDepartment: (input: Record<string, unknown>) => Promise<{ id: string }>;
  onDraftChange: (hasDraft: boolean) => void;
}) {
  const { t, tp, type } = useAcademicStructureTerms();
  const { refetch } = useOnboarding();
  const { data: created, refetch: refetchCreated } = useCreatedProgrammeStructures();
  const { remove } = useOnboardingRecordMutations('academics/departments');
  const [editing, setEditing] = useState<ProgrammeStructureDetail | null>(null);
  const [removing, setRemoving] = useState<ProgrammeStructureDetail | null>(null);
  const [draft, setDraft] = useState(false);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [nextEdit, setNextEdit] = useState<ProgrammeStructureDetail | null>(null);
  const [revision, setRevision] = useState(0);
  function selectEditor(item: ProgrammeStructureDetail | null) {
    if (draft) {
      setNextEdit(item);
      setSwitchOpen(true);
      return;
    }
    setEditing(item);
    setRevision((value) => value + 1);
  }
  return (
    <CardContent className="py-5">
      <StepHeader
        step={step}
        index={index}
        title={stepTitle(step, tp)}
        blurb={
          type === 'school'
            ? 'Create the courses or streams students choose, then add the grades and terms offered under each. You can rename grades to match your school.'
            : 'Name each programme, then configure its years or levels and academic calendar. You can edit saved structures here.'
        }
      />
      {(created?.length ?? 0) > 0 && (
        <div className="mb-5">
          <CreatedProgrammesPanel
            items={created ?? []}
            disabled={remove.isPending}
            onEdit={canManage ? selectEditor : undefined}
            onDelete={
              canManage
                ? (item) => {
                    remove.reset();
                    setRemoving(item);
                  }
                : undefined
            }
          />
        </div>
      )}
      <ProgrammeBuilder
        key={`${editing?.department.id ?? 'new'}-${revision}`}
        initialStructureDetail={editing ?? undefined}
        onCancel={() => selectEditor(null)}
        canManage={canManage && !remove.isPending}
        createDepartment={createDepartment}
        onDraftChange={(value) => {
          setDraft(value);
          onDraftChange(value);
        }}
        onCommitted={() => {
          setDraft(false);
          onDraftChange(false);
          setEditing(null);
          setRevision((value) => value + 1);
          void refetch();
          void refetchCreated();
        }}
      />
      <ConfirmDialog
        open={switchOpen}
        title="Discard unsaved changes?"
        description="Your saved records will remain. The current unsaved form will be cleared."
        confirmLabel="Discard changes"
        danger={false}
        onClose={() => setSwitchOpen(false)}
        onConfirm={() => {
          setEditing(nextEdit);
          setRevision((value) => value + 1);
          setDraft(false);
          onDraftChange(false);
          setSwitchOpen(false);
        }}
      />
      <ConfirmDialog
        open={!!removing}
        title={`Delete ${removing?.department.name ?? t('department').toLowerCase()}?`}
        description={
          <>
            This removes the saved structure and its curriculum placements. Subject records remain
            available. A structure used by students or classes cannot be deleted.
            {remove.isError && (
              <span className="mt-2 block text-danger" role="alert">
                {formatPortalError(remove.error, 'Could not delete.')}
              </span>
            )}
          </>
        }
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(
            { id: removing.department.id, version: removing.department.version },
            {
              onSuccess: () => {
                if (editing?.department.id === removing.department.id) {
                  setEditing(null);
                  setRevision((value) => value + 1);
                  setDraft(false);
                  onDraftChange(false);
                }
                setRemoving(null);
              },
            },
          );
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
  const { tp } = useAcademicStructureTerms();
  const { refetch } = useOnboarding();
  const title = stepTitle(step, tp);

  return (
    <CardContent className="py-5">
      <StepHeader
        step={step}
        index={index}
        title={title}
        blurb="Choose a course or programme, then place required and elective subjects into its grades or years and terms."
      />
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
      {step.count > 0 && <Badge tone={step.done ? 'success' : 'neutral'}>{step.count} added</Badge>}
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
  const { t, tp } = useAcademicStructureTerms();
  const { campuses } = useScope();
  const { data: years } = useStepList<AcademicYearRow>('academics/academic-years', {
    pageSize: '100',
    sortBy: 'startDate',
    sortDir: 'desc',
  });
  const { data: departments } = useStepList<DepartmentRow>('academics/departments', {
    unitKind: 'programme',
    pageSize: '100',
  });
  const { data: gradeLevels } = useStepList<GradeLevelRow>('academics/grade-levels', {
    pageSize: '100',
  });
  const { data: levels } = useStepList<DepartmentGradeLevelRow>(
    'academics/department-grade-levels',
    { pageSize: '100', sortBy: 'sequence', sortDir: 'asc' },
  );
  const levelItems = levels?.items ?? [];
  const levelOptions = useMemo(
    () =>
      (levels?.items ?? []).map((level) => ({
        value: level.id,
        label: [level.departmentName, level.gradeLevelName].filter(Boolean).join(' · '),
      })),
    [levels],
  );
  const cfg = STEP_CFG[step.key]!;
  const { data: staffDepartments } = useStepList<DepartmentRow>('academics/departments', {
    unitKind: 'department',
    pageSize: '100',
  });
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [values, setValues] = useState<FormValues>(() => emptyValues(cfg.fields));
  const scheduleYear = useScheduleAcademicYear({ mode: 'institution' });
  // Onboarding spans the whole institution and every year, independently of shell filters.
  const { data: allClasses } = useStepList<ClassRow>('academics/classes', {
    pageSize: '100',
    sortBy: 'name',
    sortDir: 'asc',
  });
  const { data: terms } = useStepList<AcademicTermRow>('academics/academic-terms', {
    pageSize: '100',
    sortBy: 'sequence',
    sortDir: 'asc',
    ...(fieldString(values, 'programmeLevelId')
      ? { programmeLevelId: fieldString(values, 'programmeLevelId') }
      : {}),
    ...(fieldString(values, 'academicYearId')
      ? { academicYearId: fieldString(values, 'academicYearId') }
      : {}),
  });
  const fields = useMemo(() => {
    const deptOptions = (departments?.items ?? []).map((d) => ({ value: d.id, label: d.name }));
    const yearOptions = (years?.items ?? []).map((y) => ({ value: y.id, label: y.name }));
    const gradeOptions = (gradeLevels?.items ?? []).map((g) => ({
      value: g.id,
      label: [g.departmentName, g.name].filter(Boolean).join(' · '),
    }));
    const classOptions = (allClasses?.items ?? [])
      .filter(
        (c) =>
          !fieldString(values, 'gradeLevelId') ||
          c.gradeLevelId === fieldString(values, 'gradeLevelId'),
      )
      .map((c) => ({
        value: c.id,
        label: [c.name, c.academicYearName].filter(Boolean).join(' · '),
      }));

    return cfg.fields.map((f) => {
      if (f.name === 'departmentId') {
        if (step.key === 'staff') {
          const options = (staffDepartments?.items ?? []).map((row) => ({
            value: row.id,
            label: row.name,
          }));
          if (editing?.departmentId && editing.departmentUnitKind === 'programme')
            options.push({
              value: String(editing.departmentId),
              label: `Previous course/stream link: ${editing.departmentName ?? 'Unassigned department'}`,
            });
          return {
            ...f,
            label: 'Department',
            options,
            help:
              editing?.departmentUnitKind === 'programme'
                ? 'This staff member has a previous course/stream link. Choose a staff department or clear the selection to replace it.'
                : 'Optional — choose a department created in the Departments step.',
          };
        }
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
      if (f.name === 'termId') {
        return {
          ...f,
          label: t('term'),
          options: (terms?.items ?? [])
            .filter(
              (term) =>
                term.programmeLevelId === fieldString(values, 'programmeLevelId') &&
                term.academicYearId === fieldString(values, 'academicYearId'),
            )
            .map((term) => ({ value: term.id, label: term.name })),
          help: 'Choose the programme year and academic year first. Its scheduled terms appear here.',
        };
      }
      if (f.name === 'section') return { ...f, label: t('section') };
      if (f.name === 'name' && step.key === 'classes') return { ...f, label: `${t('class')} name` };
      if (f.name === 'semesterSequence') {
        return { ...f, label: t('term'), options: SEMESTER_OPTIONS };
      }
      if (f.name === 'name' && step.key === 'programmeLevels') {
        return { ...f, label: `${t('gradeLevel')} name`, placeholder: `e.g. ${t('gradeLevel')} 1` };
      }
      return f;
    });
  }, [
    cfg.fields,
    departments,
    staffDepartments,
    editing,
    gradeLevels,
    allClasses,
    terms,
    values,
    levelOptions,
    step.key,
    t,
    years,
  ]);
  const create = useOnboardingStepSubmit(step.key, cfg.endpoint, cfg.endpoint);
  const { update, remove } = useOnboardingRecordMutations(cfg.endpoint);
  const [page, setPage] = useState(1);
  const list = useStepList<Record<string, unknown>>(cfg.endpoint, {
    page: String(page),
    pageSize: '20',
  });
  const [removing, setRemoving] = useState<Record<string, unknown> | null>(null);
  const [pendingEdit, setPendingEdit] = useState<Record<string, unknown> | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const institutionCountry = useInstitutionCountry();
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const editable = canManage && !create.isPending && !update.isPending && !remove.isPending;
  const draft = editing
    ? fields.some(
        (field) =>
          String(values[field.name] ?? '') !==
          String(editing[field.name] ?? (field.type === 'checkbox' ? false : '')),
      )
    : hasDraftInput(values, fields);
  const staffEmail = fieldString(values, 'email');
  const createLogin =
    step.key === 'staff' && !editing?.institutionUserId
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

  function resetForm() {
    setEditing(null);
    setValues(emptyValues(fields));
    setFieldErrors({});
    create.reset();
    update.reset();
  }
  function openEditor(row: Record<string, unknown> | null) {
    if (!row) {
      resetForm();
      return;
    }
    const next = emptyValues(fields);
    for (const field of fields) {
      next[field.name] =
        field.type === 'checkbox' ? row[field.name] === true : String(row[field.name] ?? '');
    }
    setEditing(row);
    setValues(next);
    setFieldErrors({});
    create.reset();
    update.reset();
  }
  function requestEditor(row: Record<string, unknown> | null) {
    if (draft) {
      setPendingEdit(row);
      setDiscardOpen(true);
      return;
    }
    openEditor(row);
  }

  const setField = (name: string, v: string | boolean | string[]) => {
    setValues((s) => {
      const next = { ...s, [name]: v };
      if (step.key === 'classes' && (name === 'programmeLevelId' || name === 'academicYearId'))
        next.termId = '';
      if (step.key === 'students' && name === 'gradeLevelId') next.classId = '';
      if (step.key === 'students' && name === 'classId' && typeof v === 'string') {
        const selected = allClasses?.items.find((row) => row.id === v);
        if (selected) next.gradeLevelId = selected.gradeLevelId;
      }
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
    setFieldErrors((current) => {
      const next = { ...current };
      delete next[name];
      if ((name === 'email' && !hasPortalLoginEmail(v)) || (name === 'createLogin' && v === false)) {
        delete next.roleKeys;
      }
      return next;
    });
  };

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    for (const f of fields) {
      if (!f.required || f.type === 'checkbox') continue;
      const v = values[f.name];
      if (f.type === 'number') {
        const n = typeof v === 'string' ? Number(v) : NaN;
        if (!Number.isFinite(n) || n < (f.min ?? 1)) nextErrors[f.name] = `${f.label} is required`;
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
    if (step.key === 'staff' && createLogin && !editing?.institutionUserId) {
      const email = typeof values.email === 'string' ? values.email.trim() : '';
      if (!email) nextErrors.email = 'Email is required to create a portal login';
      const roles = Array.isArray(values.roleKeys) ? values.roleKeys : [];
      if (roles.length === 0) nextErrors.roleKeys = 'Select at least one portal role';
    }
    if (step.key === 'programmeLevels' && (departments?.items ?? []).length === 0) {
      nextErrors.departmentId = `Add a ${t('department').toLowerCase()} first`;
    }
    if (step.key === 'subjects' && levelOptions.length === 0) {
      nextErrors.programmeLevelId = `Add a programme year first`;
    }
    if (Object.keys(nextErrors).length) {
      setFieldErrors(nextErrors);
      return;
    }

    const body = buildStepCreateBody(step.key, fields, values);
    if (step.key === 'classes') {
      const level = levelItems.find((row) => row.id === body.programmeLevelId);
      const term = terms?.items.find(
        (row) =>
          row.id === body.termId &&
          row.programmeLevelId === body.programmeLevelId &&
          row.academicYearId === body.academicYearId,
      );
      if (!level || !term) {
        setFieldErrors({
          termId: 'Choose a scheduled term for this programme year and academic year.',
        });
        return;
      }
      body.gradeLevelId = level.gradeLevelId;
    }
    if (editing) {
      body.version = editing.version;
      // Blank optional fields intentionally clear existing values during editing.
      for (const field of fields) {
        if (
          !field.required &&
          field.type !== 'checkbox' &&
          fieldString(values, field.name).trim() === ''
        )
          body[field.name] = null;
      }
      if (step.key === 'staff' && editing.institutionUserId) {
        delete body.createLogin;
        delete body.roleKeys;
        delete body.campusIds;
      }
      update.mutate({ id: String(editing.id), body }, { onSuccess: resetForm });
      return;
    }
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
            (step.done
              ? 'bg-success/15 text-success'
              : 'bg-background-secondary text-text-secondary')
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
          <Badge tone={step.done ? 'success' : 'neutral'}>{step.count} added</Badge>
        )}
      </div>

      {step.required > 0 && !step.done && (
        <OnboardingNotice tone="warning" className="mb-4" role="status">
          Add at least one {step.key === 'classes' ? t('class').toLowerCase() : cfg.itemLabel}{' '}
          before you can continue to the next step.
        </OnboardingNotice>
      )}

      {draft && !editing && (
        <OnboardingNotice tone="info" className="mb-4" role="status">
          {step.required > 0 && !step.done ? (
            <>
              You&apos;ve entered details but haven&apos;t added them yet. Click{' '}
              <strong>Add</strong> to save — this step is required before you can continue.
            </>
          ) : (
            <>
              You&apos;ve entered details but haven&apos;t added them yet. Click{' '}
              <strong>Add</strong> to save, or use Next to leave — you&apos;ll be asked to confirm.
            </>
          )}
        </OnboardingNotice>
      )}

      <form
        onSubmit={onSubmit}
        onInvalid={(event) => {
          const control = event.target as HTMLInputElement;
          const name = control.id.replace(`${step.key}-`, '');
          if (name)
            setFieldErrors((current) => ({ ...current, [name]: control.validationMessage }));
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        {fields
          .filter((f) => !(editing?.institutionUserId && f.name === 'createLogin'))
          .map((f) => (
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
                      {f.help && (
                        <p className="mt-1 pl-[calc(18px+0.625rem)] text-xs text-text-muted">
                          {f.help}
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <label className="flex cursor-pointer items-center gap-2.5">
                        <Checkbox
                          id={`${step.key}-${f.name}`}
                          checked={values[f.name] === true}
                          disabled={!editable}
                          onChange={(e) => setField(f.name, e.target.checked)}
                        />
                        <span className="text-sm font-medium text-text-primary">{f.label}</span>
                      </label>
                      {f.help && (
                        <p className="mt-1 pl-[calc(18px+0.625rem)] text-xs text-text-muted">
                          {f.help}
                        </p>
                      )}
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
                      invalid={!!fieldErrors[f.name]}
                      aria-describedby={
                        fieldErrors[f.name] ? `${step.key}-${f.name}-error` : undefined
                      }
                      onChange={(v) => setField(f.name, v)}
                      disabled={!editable}
                    />
                  ) : f.type === 'select' ? (
                    <Select
                      id={`${step.key}-${f.name}`}
                      required={f.required}
                      disabled={!editable || (f.options?.length === 0 && f.required)}
                      value={fieldString(values, f.name)}
                      placeholder={f.options?.length ? 'Select…' : 'Nothing to select yet'}
                      options={f.options ?? []}
                      className={fieldErrors[f.name] ? 'border-danger' : undefined}
                      aria-describedby={
                        fieldErrors[f.name] ? `${step.key}-${f.name}-error` : undefined
                      }
                      onChange={(e) => setField(f.name, e.target.value)}
                    />
                  ) : f.type === 'number' ? (
                    <Input
                      id={`${step.key}-${f.name}`}
                      type="number"
                      aria-invalid={!!fieldErrors[f.name]}
                      aria-describedby={
                        fieldErrors[f.name] ? `${step.key}-${f.name}-error` : undefined
                      }
                      min={f.min ?? 1}
                      required={f.required}
                      disabled={!editable}
                      placeholder={f.placeholder}
                      value={fieldString(values, f.name)}
                      onChange={(e) => setField(f.name, e.target.value)}
                    />
                  ) : f.type === 'textarea' ? (
                    <textarea
                      id={`${step.key}-${f.name}`}
                      rows={3}
                      aria-invalid={!!fieldErrors[f.name]}
                      aria-describedby={
                        fieldErrors[f.name] ? `${step.key}-${f.name}-error` : undefined
                      }
                      disabled={!editable}
                      placeholder={f.placeholder}
                      value={fieldString(values, f.name)}
                      onChange={(e) => setField(f.name, e.target.value)}
                      className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-60"
                    />
                  ) : (
                    <Input
                      id={`${step.key}-${f.name}`}
                      type={f.type === 'date' ? 'date' : f.type === 'email' ? 'email' : 'text'}
                      aria-invalid={!!fieldErrors[f.name]}
                      aria-describedby={
                        fieldErrors[f.name] ? `${step.key}-${f.name}-error` : undefined
                      }
                      required={f.required}
                      disabled={!editable}
                      placeholder={f.placeholder}
                      value={fieldString(values, f.name)}
                      min={
                        f.type === 'date' && f.name === 'endDate'
                          ? minEndDate(fieldString(values, 'startDate'))
                          : undefined
                      }
                      max={
                        f.type === 'date' && f.name === 'startDate'
                          ? maxStartDate(fieldString(values, 'endDate'))
                          : undefined
                      }
                      onChange={(e) => setField(f.name, e.target.value)}
                    />
                  )}
                  {f.help && <p className="mt-1 text-xs text-text-muted">{f.help}</p>}
                  {step.key === 'classes' &&
                    f.name === 'termId' &&
                    fieldString(values, 'programmeLevelId') &&
                    fieldString(values, 'academicYearId') &&
                    !terms?.items.some(
                      (term) =>
                        term.programmeLevelId === fieldString(values, 'programmeLevelId') &&
                        term.academicYearId === fieldString(values, 'academicYearId'),
                    ) && (
                      <div className="mt-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          disabled={!editable || !terms}
                          loading={scheduleYear.isPending}
                          onClick={() =>
                            scheduleYear.mutate({
                              academicYearId: fieldString(values, 'academicYearId'),
                            })
                          }
                        >
                          Generate {tp('term').toLowerCase()}
                        </Button>
                        {scheduleYear.isError && (
                          <p role="alert" className="mt-1 text-xs text-danger">
                            {formatPortalError(scheduleYear.error, 'Could not generate terms.')}
                          </p>
                        )}
                      </div>
                    )}
                  {fieldErrors[f.name] && (
                    <p id={`${step.key}-${f.name}-error`} className="mt-1 text-xs text-danger">
                      {fieldErrors[f.name]}
                    </p>
                  )}
                </>
              )}
            </div>
          ))}

        {step.key === 'staff' && !editing?.institutionUserId && (
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
              disabled={!editable}
            />
            {fieldErrors.roleKeys && (
              <p className="mt-1 text-xs text-danger">{fieldErrors.roleKeys}</p>
            )}
          </div>
        )}

        {step.key === 'staff' && !editing?.institutionUserId && campuses.length > 0 && (
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
                    disabled={!editable || !!singleCampus}
                    onChange={() => {
                      const next = new Set(selectedCampusIds);
                      if (next.has(c.id)) next.delete(c.id);
                      else next.add(c.id);
                      setField('campusIds', [...next]);
                    }}
                  />
                  <label
                    htmlFor={`${step.key}-campus-${c.id}`}
                    className={cn(
                      'text-sm text-text-primary',
                      singleCampus ? 'cursor-default' : 'cursor-pointer',
                    )}
                  >
                    {c.name}
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {Object.values(fieldErrors).some(Boolean) && (
          <OnboardingNotice tone="danger" className="sm:col-span-2" role="alert">
            {Object.values(fieldErrors).filter(Boolean).join('. ')}
          </OnboardingNotice>
        )}

        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button
            type="submit"
            size="sm"
            loading={create.isPending || update.isPending}
            disabled={!editable || remove.isPending}
          >
            {editing ? (
              'Save changes'
            ) : (
              <>
                <Plus className="mr-1 h-4 w-4" /> Add{' '}
                {step.key === 'classes'
                  ? t('class').toLowerCase()
                  : step.key === 'programmeLevels'
                    ? t('gradeLevel').toLowerCase()
                    : cfg.itemLabel}
              </>
            )}
          </Button>
          {editing && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => requestEditor(null)}
              disabled={update.isPending}
            >
              Cancel
            </Button>
          )}
          {(create.isError || update.isError) && (
            <OnboardingNotice tone="danger" className="flex-1" role="alert">
              {formatPortalError(update.error ?? create.error, 'Could not save. Check the fields.')}
            </OnboardingNotice>
          )}
        </div>
      </form>

      {items.length > 0 && (
        <div className="mt-5 rounded-lg border border-border bg-background-secondary/50 p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            Added so far
          </p>
          <ul className="flex flex-col gap-2">
            {items.map((r) => (
              <li
                key={String(r.id)}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-surface px-3 py-2 text-sm"
              >
                <span className="min-w-0 flex-1 break-words font-medium text-text-primary">
                  {cfg.rowLabel(r) || '—'}
                </span>
                {canManage && (
                  <div className="ml-auto flex shrink-0 gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={create.isPending || update.isPending || remove.isPending}
                      onClick={() => requestEditor(r)}
                      aria-label={`Edit ${cfg.rowLabel(r)}`}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      Edit
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={create.isPending || update.isPending || remove.isPending}
                      onClick={() => {
                        remove.reset();
                        setRemoving(r);
                      }}
                      aria-label={`Delete ${cfg.rowLabel(r)}`}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      Delete
                    </Button>
                  </div>
                )}
                {cfg.rowDetail?.(r) && (
                  <span className="basis-full break-words text-xs text-text-muted">
                    {cfg.rowDetail(r)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {list.isError && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {formatPortalError(list.error, 'Could not load saved records.')}{' '}
          <button type="button" className="underline" onClick={() => list.refetch()}>
            Retry
          </button>
        </p>
      )}
      {(page > 1 || list.data?.hasMore) && (
        <div className="mt-3 flex items-center justify-between">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={page === 1 || list.isFetching}
            onClick={() => setPage((value) => value - 1)}
          >
            Previous records
          </Button>
          <span className="text-xs text-text-muted">Page {page}</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!list.data?.hasMore || list.isFetching}
            onClick={() => setPage((value) => value + 1)}
          >
            More records
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={discardOpen}
        title="Discard unsaved changes?"
        description="The current unsaved form will be cleared. Your saved records will remain."
        danger={false}
        confirmLabel="Discard changes"
        onClose={() => setDiscardOpen(false)}
        onConfirm={() => {
          openEditor(pendingEdit);
          setDiscardOpen(false);
        }}
      />
      <ConfirmDialog
        open={!!removing}
        title={`Delete ${removing ? cfg.rowLabel(removing) : cfg.itemLabel}?`}
        loading={remove.isPending}
        description={
          <>
            This record will be removed. Records with dependent data may need their linked records
            removed first.
            {remove.isError && (
              <span className="mt-2 block text-danger" role="alert">
                {formatPortalError(remove.error, 'Could not delete.')}
              </span>
            )}
          </>
        }
        onClose={() => setRemoving(null)}
        onConfirm={() => {
          if (!removing) return;
          remove.mutate(
            { id: String(removing.id), version: Number(removing.version) },
            {
              onSuccess: () => {
                if (editing?.id === removing.id) resetForm();
                setRemoving(null);
                if (items.length === 1 && page > 1) setPage((value) => value - 1);
              },
            },
          );
        }}
      />
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
