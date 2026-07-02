import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InstitutionStatus, OnboardingStatus } from '@edrion/shared-types';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import { AUDIT_WRITER } from '../../common/tokens';
import { OnboardingRepository, type OnboardingSignals } from './onboarding.repository';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-onboarding';

/** The onboarding journey, in order. Every step is completed by entering real data in the wizard. */
const STEPS: { key: keyof OnboardingSignals; label: string }[] = [
  { key: 'academicYears', label: 'Academic Years' },
  { key: 'departments', label: 'Departments' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'students', label: 'Students' },
  { key: 'teachers', label: 'Teachers' },
  { key: 'staff', label: 'Staff' },
];

/** Minimum records for a step to count as done. One of each is enough to go live. */
const REQUIRED_PER_STEP = 1;

export interface OnboardingStepDto {
  key: string;
  label: string;
  /** Live count of records for this step. */
  count: number;
  /** How many are needed to complete the step. */
  required: number;
  done: boolean;
}

export interface OnboardingSummary {
  institution: {
    displayName: string;
    status: string;
    onboardingStatus: string;
    activatedAt: string | null;
    /** True once the institution is live (Active / onboarding Completed). */
    isComplete: boolean;
  };
  progress: { done: number; total: number; percent: number };
  steps: OnboardingStepDto[];
}

/**
 * Institution onboarding wizard service. The whole journey is data-driven: each step (academic
 * years, departments, subjects, students, teachers, staff) completes the moment the admin adds a
 * record — there is no manual checklist. Go-live is blocked until every step has data. Reads need
 * `institution_settings.view`; go-live needs the sensitive `institution_settings.manage`.
 */
@Injectable()
export class OnboardingService {
  constructor(
    private readonly repo: OnboardingRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  async getSummary(ctx: PortalActionContext): Promise<OnboardingSummary> {
    const institutionId = ctx.principal.institutionId;
    const [meta, signals] = await Promise.all([
      this.repo.getMeta(institutionId),
      this.repo.signals(institutionId),
    ]);
    if (!meta) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Institution not found' });

    const isComplete =
      meta.onboardingStatus === OnboardingStatus.Completed || meta.status === InstitutionStatus.Active;

    return { ...this.shape(signals, meta, isComplete) };
  }

  /** Take the institution live. Requires every step to have data first. Idempotent-guarded. */
  async complete(ctx: PortalActionContext): Promise<OnboardingSummary> {
    const summary = await this.getSummary(ctx);
    if (summary.institution.isComplete) {
      throw new ConflictException({ code: 'ALREADY_ACTIVE', message: 'This institution is already live.' });
    }
    const outstanding = summary.steps.filter((s) => !s.done);
    if (outstanding.length > 0) {
      throw new ConflictException({
        code: 'ONBOARDING_INCOMPLETE',
        message: `Add at least one record to every step before going live (${outstanding.length} remaining).`,
      });
    }

    const meta = await this.repo.goLive(ctx.principal.institutionId);
    await this.write(ctx, 'onboarding.completed', 'institution', ctx.principal.institutionId, {
      previousState: { status: summary.institution.status, onboardingStatus: summary.institution.onboardingStatus },
      newState: { status: meta?.status, onboardingStatus: meta?.onboardingStatus },
    });
    return this.getSummary(ctx);
  }

  private shape(
    signals: OnboardingSignals,
    meta: NonNullable<Awaited<ReturnType<OnboardingRepository['getMeta']>>>,
    isComplete: boolean,
  ): OnboardingSummary {
    const steps: OnboardingStepDto[] = STEPS.map((s) => {
      const value = signals[s.key];
      return { key: s.key, label: s.label, count: value, required: REQUIRED_PER_STEP, done: value >= REQUIRED_PER_STEP };
    });
    const total = steps.length;
    const done = steps.filter((s) => s.done).length;
    return {
      institution: {
        displayName: meta.displayName,
        status: meta.status,
        onboardingStatus: meta.onboardingStatus,
        activatedAt: meta.activatedAt ? meta.activatedAt.toISOString() : null,
        isComplete,
      },
      progress: { done, total, percent: total === 0 ? 0 : Math.round((done / total) * 100) },
      steps,
    };
  }

  private async write(
    ctx: PortalActionContext,
    action: string,
    entityType: string,
    entityId: string,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType,
      entityId,
      ...extra,
    } as AuditEventInput);
  }
}
