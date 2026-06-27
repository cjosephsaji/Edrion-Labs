import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InstitutionStatus } from '@edrion/shared-types';
import {
  canTransition,
  type CreateInstitutionInput,
  type ExtendTrialInput,
  type InstitutionStatusActionInput,
  type ListInstitutionsQuery,
  type UpdateInstitutionInput,
} from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { Institution } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { InstitutionsRepository } from './institutions.repository';

const MODULE = 'institutions';

@Injectable()
export class InstitutionsService {
  constructor(
    private readonly repo: InstitutionsRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  list(q: ListInstitutionsQuery) {
    return this.repo.list(q);
  }

  summary() {
    return this.repo.summaryByStatus();
  }

  async get(id: string): Promise<Institution> {
    const inst = await this.repo.findById(id);
    if (!inst) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Institution not found' });
    return inst;
  }

  async create(input: CreateInstitutionInput, ctx: ActionContext): Promise<Institution> {
    const publicId = await this.repo.nextPublicId();
    const inst = await this.repo.insert({
      publicId,
      legalName: input.legalName,
      displayName: input.displayName,
      type: input.type,
      country: input.country,
      region: input.region ?? null,
      timezone: input.timezone,
      currency: input.currency,
      dataRegion: input.dataRegion,
      supportTier: input.supportTier,
      primaryContact: input.primaryContact,
      billingContact: input.billingContact ?? null,
      technicalContact: input.technicalContact ?? null,
      address: input.address ?? null,
      customerSuccessOwnerId: input.customerSuccessOwnerId ?? null,
      internalNotes: input.internalNotes ?? null,
      status: InstitutionStatus.Lead,
      createdBy: ctx.principalContext.principal.employeeId,
    });

    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'institution.create',
      module: MODULE,
      entityType: 'institution',
      entityId: inst.id,
      institutionId: inst.id,
      institutionName: inst.displayName,
      newState: { publicId: inst.publicId, status: inst.status },
    } as Parameters<AuditWriter['logAudit']>[0]);

    return inst;
  }

  async update(id: string, input: UpdateInstitutionInput, ctx: ActionContext): Promise<Institution> {
    const existing = await this.get(id);
    const { version, ...patch } = input;
    const updated = await this.repo.updateWithVersion(id, version, {
      ...patch,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();

    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'institution.update',
      module: MODULE,
      entityType: 'institution',
      entityId: id,
      institutionId: id,
      institutionName: updated.displayName,
      previousState: this.snapshot(existing),
      newState: this.snapshot(updated),
    } as Parameters<AuditWriter['logAudit']>[0]);

    return updated;
  }

  activate(id: string, input: InstitutionStatusActionInput, ctx: ActionContext) {
    return this.transition(id, InstitutionStatus.Active, 'institution.activate', input, ctx, {
      activatedAt: new Date(),
    });
  }

  restrict(id: string, input: InstitutionStatusActionInput, ctx: ActionContext) {
    return this.transition(id, InstitutionStatus.Restricted, 'institution.restrict', input, ctx);
  }

  suspend(id: string, input: InstitutionStatusActionInput, ctx: ActionContext) {
    return this.transition(id, InstitutionStatus.Suspended, 'institution.suspend', input, ctx, {
      suspendedAt: new Date(),
      suspensionReason: input.reason,
    });
  }

  archive(id: string, input: InstitutionStatusActionInput, ctx: ActionContext) {
    return this.transition(id, InstitutionStatus.Archived, 'institution.archive', input, ctx);
  }

  async extendTrial(id: string, input: ExtendTrialInput, ctx: ActionContext): Promise<Institution> {
    const existing = await this.get(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      trialEndsAt: new Date(input.newTrialEndsAt),
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();

    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: 'institution.extend_trial',
      module: MODULE,
      entityType: 'institution',
      entityId: id,
      institutionId: id,
      institutionName: updated.displayName,
      reason: input.reason,
      previousState: { trialEndsAt: existing.trialEndsAt },
      newState: { trialEndsAt: updated.trialEndsAt },
    } as Parameters<AuditWriter['logAudit']>[0]);

    return updated;
  }

  /** Shared status-transition path: validate transition, version-check, persist, audit. */
  private async transition(
    id: string,
    to: InstitutionStatus,
    action: string,
    input: InstitutionStatusActionInput,
    ctx: ActionContext,
    extra: Record<string, unknown> = {},
  ): Promise<Institution> {
    const existing = await this.get(id);
    if (existing.status === to) return existing;
    if (!canTransition(existing.status as InstitutionStatus, to)) {
      throw new ConflictException({
        code: 'INVALID_TRANSITION',
        message: `Cannot move institution from ${existing.status} to ${to}`,
      });
    }
    const updated = await this.repo.updateWithVersion(id, input.version, {
      status: to,
      updatedBy: ctx.principalContext.principal.employeeId,
      ...extra,
    });
    if (!updated) throw this.versionConflict();

    await this.audit.logAudit({
      ...baseAudit(ctx),
      action,
      module: MODULE,
      entityType: 'institution',
      entityId: id,
      institutionId: id,
      institutionName: updated.displayName,
      reason: input.reason,
      caseRef: input.caseRef ?? ctx.principalContext.support?.caseRef,
      previousState: { status: existing.status },
      newState: { status: updated.status },
    } as Parameters<AuditWriter['logAudit']>[0]);

    return updated;
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }

  private snapshot(i: Institution): Record<string, unknown> {
    return {
      legalName: i.legalName,
      displayName: i.displayName,
      type: i.type,
      status: i.status,
      supportTier: i.supportTier,
      country: i.country,
    };
  }
}
