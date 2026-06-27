import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { PlanStatus } from '@edrion/shared-types';
import type {
  ArchivePlanInput,
  CreatePlanDraftInput,
  ListPlansQuery,
  NewPlanVersionInput,
  PlanVersionPricingInput,
  PublishPlanVersionInput,
} from '@edrion/schemas';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import type { Plan, PlanVersion } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { PlansRepository } from './plans.repository';

const MODULE = 'plans';
const ENTITY = 'plan';

export interface PlanVersionDto {
  id: string;
  planId: string;
  version: number;
  status: string;
  currency: string;
  monthlyPriceMinor: number;
  annualPriceMinor: number;
  baseCampusAllowance: number;
  perCampusPriceMinor: number;
  usageLimits: Record<string, number>;
  featureEntitlements: Record<string, boolean>;
  trialDays: number;
  supportTier: string;
  note: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
}

export interface PlanListItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  audience: string;
  status: string;
  version: number;
  versionCount: number;
  /** The latest version's pricing summary, for the directory row. */
  latestVersion: number | null;
  currency: string | null;
  monthlyPriceMinor: number | null;
  baseCampusAllowance: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanDetail {
  id: string;
  key: string;
  name: string;
  description: string | null;
  audience: string;
  status: string;
  version: number;
  /** Full version history, oldest → newest. */
  versions: PlanVersionDto[];
  /** The currently-published version id, if any. */
  publishedVersionId: string | null;
  /** Live subscriptions pinned to a version of this plan (archive impact). */
  liveSubscriptionCount: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class PlansService {
  constructor(
    private readonly repo: PlansRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // --- Reads -------------------------------------------------------------------

  async list(q: ListPlansQuery): Promise<{ items: PlanListItem[]; total: number }> {
    const { items, total, latestByPlan } = await this.repo.list(q);
    return {
      items: items.map((p) => {
        const latest = latestByPlan.get(p.id);
        return {
          id: p.id,
          key: p.key,
          name: p.name,
          description: p.description,
          audience: p.audience,
          status: p.status,
          version: p.version,
          versionCount: latest ? latest.version : 0,
          latestVersion: latest?.version ?? null,
          currency: latest?.currency ?? null,
          monthlyPriceMinor: latest?.monthlyPriceMinor ?? null,
          baseCampusAllowance: latest?.baseCampusAllowance ?? null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        };
      }),
      total,
    };
  }

  summary() {
    return this.repo.summaryByStatus();
  }

  async get(id: string): Promise<PlanDetail> {
    const plan = await this.requirePlan(id);
    return this.toDetail(plan);
  }

  // --- Lifecycle ---------------------------------------------------------------

  async createDraft(input: CreatePlanDraftInput, ctx: ActionContext): Promise<PlanDetail> {
    const existing = await this.repo.findPlanByKey(input.key);
    if (existing) {
      throw new ConflictException({ code: 'PLAN_KEY_IN_USE', message: 'A plan with this key already exists' });
    }
    const actorId = ctx.principalContext.principal.employeeId;
    const plan = await this.repo.insertPlan({
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      audience: input.audience,
      status: PlanStatus.Draft,
      createdBy: actorId,
    });
    const version = await this.repo.insertVersion(
      this.versionValues(plan.id, 1, input.pricing, undefined, actorId),
    );

    await this.writeAudit(ctx, plan, 'plan.create_draft', {
      newState: { key: plan.key, name: plan.name, audience: plan.audience, version: version.version },
    });
    return this.toDetail(plan);
  }

  async newVersion(planId: string, input: NewPlanVersionInput, ctx: ActionContext): Promise<PlanDetail> {
    const plan = await this.requirePlan(planId);
    if (plan.status === PlanStatus.Archived) {
      throw new BadRequestException({ code: 'PLAN_ARCHIVED', message: 'Cannot add versions to an archived plan' });
    }
    const actorId = ctx.principalContext.principal.employeeId;
    const nextNumber = (await this.repo.maxVersion(planId)) + 1;
    // Immutable: a new draft row is inserted; no existing version is ever mutated.
    const version = await this.repo.insertVersion(
      this.versionValues(planId, nextNumber, input.pricing, input.note, actorId),
    );

    await this.writeAudit(ctx, plan, 'plan.new_version', {
      reason: input.note,
      newState: { version: version.version, status: version.status },
    });
    return this.toDetail(plan);
  }

  async publish(
    planId: string,
    versionId: string,
    input: PublishPlanVersionInput,
    ctx: ActionContext,
  ): Promise<PlanDetail> {
    const plan = await this.requirePlan(planId);
    if (plan.status === PlanStatus.Archived) {
      throw new BadRequestException({ code: 'PLAN_ARCHIVED', message: 'Cannot publish a version of an archived plan' });
    }
    const target = await this.repo.findVersionById(versionId);
    if (!target || target.planId !== planId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Plan version not found' });
    }
    if (target.status !== PlanStatus.Draft) {
      throw new BadRequestException({
        code: 'NOT_DRAFT',
        message: 'Only a draft version can be published',
      });
    }
    const actorId = ctx.principalContext.principal.employeeId;
    const published = await this.repo.publishVersionRow(versionId, actorId);
    if (!published) {
      // Lost the race — another publisher already transitioned this row out of draft.
      throw this.versionConflict();
    }
    // Exactly one published version: supersede any previously-published one.
    await this.repo.archiveOtherPublishedVersions(planId, versionId);
    await this.repo.stampPlan(planId, { status: PlanStatus.Published, updatedBy: actorId });

    await this.writeAudit(ctx, plan, 'plan.publish', {
      reason: input.reason,
      previousState: { planStatus: plan.status },
      newState: { planStatus: PlanStatus.Published, publishedVersion: published.version },
    });
    return this.toDetail((await this.repo.findPlanById(planId))!);
  }

  async archive(planId: string, input: ArchivePlanInput, ctx: ActionContext): Promise<PlanDetail> {
    const plan = await this.requirePlan(planId);
    if (plan.status === PlanStatus.Archived) {
      throw new BadRequestException({ code: 'ALREADY_ARCHIVED', message: 'Plan is already archived' });
    }
    const updated = await this.repo.updatePlanWithVersion(planId, input.version, {
      status: PlanStatus.Archived,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();

    await this.writeAudit(ctx, updated, 'plan.archive', {
      reason: input.reason,
      previousState: { status: plan.status },
      newState: { status: PlanStatus.Archived },
    });
    return this.toDetail(updated);
  }

  // --- Helpers -----------------------------------------------------------------

  private versionValues(
    planId: string,
    version: number,
    pricing: PlanVersionPricingInput,
    note: string | undefined,
    actorId: string | null,
  ) {
    return {
      planId,
      version,
      status: PlanStatus.Draft,
      currency: pricing.currency,
      monthlyPriceMinor: pricing.monthlyPriceMinor,
      annualPriceMinor: pricing.annualPriceMinor,
      baseCampusAllowance: pricing.baseCampusAllowance,
      perCampusPriceMinor: pricing.perCampusPriceMinor,
      usageLimits: pricing.usageLimits,
      featureEntitlements: pricing.featureEntitlements,
      trialDays: pricing.trialDays,
      supportTier: pricing.supportTier,
      metadata: note ? { note } : {},
      createdBy: actorId,
    };
  }

  private async requirePlan(id: string): Promise<Plan> {
    const plan = await this.repo.findPlanById(id);
    if (!plan) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Plan not found' });
    return plan;
  }

  private async toDetail(plan: Plan): Promise<PlanDetail> {
    const versions = await this.repo.versionsForPlan(plan.id);
    const liveSubscriptionCount = await this.repo.liveSubscriptionCount(plan.id);
    const published = versions.find((v) => v.status === PlanStatus.Published);
    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      description: plan.description,
      audience: plan.audience,
      status: plan.status,
      version: plan.version,
      versions: versions.map(toVersionDto),
      publishedVersionId: published?.id ?? null,
      liveSubscriptionCount,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
    };
  }

  private async writeAudit(
    ctx: ActionContext,
    plan: Plan,
    action: string,
    extra: Partial<AuditEventInput> = {},
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType: ENTITY,
      entityId: plan.id,
      ...extra,
    } as AuditEventInput);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This plan changed since you loaded it. Reload and try again.',
    });
  }
}

function toVersionDto(v: PlanVersion): PlanVersionDto {
  const meta = (v.metadata ?? {}) as { note?: string };
  return {
    id: v.id,
    planId: v.planId,
    version: v.version,
    status: v.status,
    currency: v.currency,
    monthlyPriceMinor: v.monthlyPriceMinor,
    annualPriceMinor: v.annualPriceMinor,
    baseCampusAllowance: v.baseCampusAllowance,
    perCampusPriceMinor: v.perCampusPriceMinor,
    usageLimits: (v.usageLimits ?? {}) as Record<string, number>,
    featureEntitlements: (v.featureEntitlements ?? {}) as Record<string, boolean>,
    trialDays: v.trialDays,
    supportTier: v.supportTier,
    note: meta.note ?? null,
    publishedAt: v.publishedAt ? v.publishedAt.toISOString() : null,
    archivedAt: v.archivedAt ? v.archivedAt.toISOString() : null,
    createdAt: v.createdAt.toISOString(),
  };
}
