import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  FeatureDefinitionStatus,
  FeatureRolloutType,
  FeatureScope,
  RiskLevel,
} from '@edrion/shared-types';
import { can } from '@edrion/permissions';
import {
  resolveFeature,
  type FeatureAssignmentInput,
  type FeatureResolution,
  type FeatureResolutionContext,
  type FeatureRolloutInput,
} from '@edrion/feature-flags';
import type {
  CreateFeatureDefinitionInput,
  ListFeaturesQuery,
  RemoveFeatureAssignmentInput,
  RemoveFeatureRolloutInput,
  ResolveFeatureQuery,
  SetFeatureStatusInput,
  SetKillSwitchInput,
  UpdateFeatureDefinitionInput,
  UpsertFeatureAssignmentInput,
  UpsertFeatureRolloutInput,
} from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type {
  FeatureAssignment,
  FeatureDefinition,
  FeatureRollout,
} from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { FeatureControlsRepository } from './feature-controls.repository';

const MODULE = 'feature-controls';

/** Which manage permission a given scope assignment requires. */
const SCOPE_PERMISSION: Record<string, string> = {
  [FeatureScope.Global]: 'features.manage_global',
  [FeatureScope.Plan]: 'features.manage_plan',
  [FeatureScope.Institution]: 'features.manage_institution',
  [FeatureScope.Campus]: 'features.manage_campus',
  [FeatureScope.InstitutionUser]: 'features.manage_user',
  [FeatureScope.IndependentUser]: 'features.manage_user',
  [FeatureScope.EmployeeRole]: 'features.manage_user',
  [FeatureScope.Cohort]: 'features.manage_global',
};

@Injectable()
export class FeatureControlsService {
  constructor(
    private readonly repo: FeatureControlsRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  list(q: ListFeaturesQuery) {
    return this.repo.list(q);
  }

  summary() {
    return this.repo.summaryByStatus();
  }

  /** Definition + its assignments + rollouts (the detail page payload). */
  async getDetail(id: string) {
    const definition = await this.getDefinition(id);
    const [assignments, rollouts] = await Promise.all([
      this.repo.assignmentsForFeature(id),
      this.repo.rolloutsForFeature(id),
    ]);
    return { definition, assignments, rollouts };
  }

  async getDefinition(id: string): Promise<FeatureDefinition> {
    const row = await this.repo.findById(id);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Feature not found' });
    return row;
  }

  /** Look up a definition by its stable key (used by Copilot tool dispatch). */
  async getByKey(key: string): Promise<FeatureDefinition> {
    const row = await this.repo.findByKey(key);
    if (!row) throw new NotFoundException({ code: 'NOT_FOUND', message: `Feature "${key}" not found` });
    return row;
  }

  async create(input: CreateFeatureDefinitionInput, ctx: ActionContext): Promise<FeatureDefinition> {
    const existing = await this.repo.findByKey(input.key);
    if (existing) {
      throw new ConflictException({ code: 'DUPLICATE_KEY', message: `Feature key "${input.key}" already exists` });
    }
    const row = await this.repo.insert({
      key: input.key,
      name: input.name,
      description: input.description ?? null,
      module: input.module,
      defaultValue: input.defaultValue,
      availableScopes: input.availableScopes as never,
      dependencies: input.dependencies as never,
      releaseStage: input.releaseStage,
      owner: input.owner ?? null,
      status: FeatureDefinitionStatus.Active,
      createdBy: ctx.principalContext.principal.employeeId,
    });

    await this.write(ctx, {
      action: 'feature.create',
      entityId: row.id,
      newState: { key: row.key, defaultValue: row.defaultValue, status: row.status },
    });
    return row;
  }

  async update(
    id: string,
    input: UpdateFeatureDefinitionInput,
    ctx: ActionContext,
  ): Promise<FeatureDefinition> {
    const existing = await this.getDefinition(id);
    const { version, ...patch } = input;
    const updated = await this.repo.updateWithVersion(id, version, {
      name: patch.name,
      description: patch.description,
      module: patch.module,
      defaultValue: patch.defaultValue,
      availableScopes: patch.availableScopes as never,
      dependencies: patch.dependencies as never,
      releaseStage: patch.releaseStage,
      owner: patch.owner,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();

    await this.write(ctx, {
      action: 'feature.update',
      entityId: id,
      previousState: this.defSnapshot(existing),
      newState: this.defSnapshot(updated),
    });
    return updated;
  }

  async setStatus(
    id: string,
    input: SetFeatureStatusInput,
    ctx: ActionContext,
  ): Promise<FeatureDefinition> {
    const existing = await this.getDefinition(id);
    const updated = await this.repo.updateWithVersion(id, input.version, {
      status: input.status,
      updatedBy: ctx.principalContext.principal.employeeId,
    });
    if (!updated) throw this.versionConflict();

    await this.write(ctx, {
      action: 'feature.set_status',
      entityId: id,
      reason: input.reason,
      riskLevel: RiskLevel.High,
      previousState: { status: existing.status },
      newState: { status: updated.status },
    });
    return updated;
  }

  // --- Assignments --------------------------------------------------------------------------

  async upsertAssignment(
    featureId: string,
    input: UpsertFeatureAssignmentInput,
    ctx: ActionContext,
  ): Promise<FeatureAssignment> {
    const definition = await this.getDefinition(featureId);
    const scope = input.scope as FeatureScope;
    this.assertScopePermission(scope, ctx);

    const scopeId = scope === FeatureScope.Global ? null : (input.scopeId ?? null);
    const existing = await this.repo.findAssignment(featureId, scope, scopeId);
    const setByName = ctx.principalContext.principal.fullName;

    const values = {
      value: input.value,
      enabled: input.enabled,
      activatesAt: input.activatesAt ? new Date(input.activatesAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      reason: input.reason,
      setByName,
      updatedBy: ctx.principalContext.principal.employeeId,
    };

    let row: FeatureAssignment;
    let previousState: Record<string, unknown> | undefined;
    if (existing) {
      previousState = this.assignSnapshot(existing);
      row = (await this.repo.updateAssignment(existing.id, { ...values, version: existing.version + 1 }))!;
    } else {
      row = await this.repo.insertAssignment({
        featureId,
        scope,
        scopeId,
        ...values,
        createdBy: ctx.principalContext.principal.employeeId,
      });
    }

    await this.write(ctx, {
      action: 'feature.assign',
      entityId: row.id,
      reason: input.reason,
      riskLevel: RiskLevel.Medium,
      previousState,
      newState: { feature: definition.key, scope, scopeId, value: input.value, enabled: input.enabled },
    });
    return row;
  }

  async removeAssignment(
    featureId: string,
    assignmentId: string,
    input: RemoveFeatureAssignmentInput,
    ctx: ActionContext,
  ): Promise<void> {
    await this.getDefinition(featureId);
    const existing = await this.repo.findAssignmentById(assignmentId);
    if (!existing || existing.featureId !== featureId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Assignment not found' });
    }
    this.assertScopePermission(existing.scope as FeatureScope, ctx);
    await this.repo.deleteAssignment(assignmentId);

    await this.write(ctx, {
      action: 'feature.unassign',
      entityId: assignmentId,
      reason: input.reason,
      riskLevel: RiskLevel.Medium,
      previousState: this.assignSnapshot(existing),
    });
  }

  // --- Rollouts -----------------------------------------------------------------------------

  async upsertRollout(
    featureId: string,
    input: UpsertFeatureRolloutInput,
    ctx: ActionContext,
  ): Promise<FeatureRollout> {
    const definition = await this.getDefinition(featureId);
    if (input.type === FeatureRolloutType.KillSwitch) {
      throw new BadRequestException({
        code: 'USE_KILL_SWITCH_ENDPOINT',
        message: 'Manage the kill switch via the dedicated endpoint',
      });
    }
    const existing = await this.repo.findRolloutByType(featureId, input.type);
    const values = {
      enabled: input.enabled,
      percentage: input.percentage ?? null,
      allowList: input.allowList as never,
      blockList: input.blockList as never,
      environments: input.environments as never,
      startsAt: input.startsAt ? new Date(input.startsAt) : null,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      reason: input.reason,
      setByName: ctx.principalContext.principal.fullName,
      updatedBy: ctx.principalContext.principal.employeeId,
    };

    let row: FeatureRollout;
    let previousState: Record<string, unknown> | undefined;
    if (existing) {
      previousState = this.rolloutSnapshot(existing);
      row = (await this.repo.updateRollout(existing.id, { ...values, version: existing.version + 1 }))!;
    } else {
      row = await this.repo.insertRollout({
        featureId,
        type: input.type,
        ...values,
        createdBy: ctx.principalContext.principal.employeeId,
      });
    }

    await this.write(ctx, {
      action: 'feature.set_rollout',
      entityId: row.id,
      reason: input.reason,
      riskLevel: RiskLevel.Medium,
      previousState,
      newState: { feature: definition.key, ...this.rolloutSnapshot(row) },
    });
    return row;
  }

  async removeRollout(
    featureId: string,
    rolloutId: string,
    input: RemoveFeatureRolloutInput,
    ctx: ActionContext,
  ): Promise<void> {
    await this.getDefinition(featureId);
    const existing = await this.repo.findRolloutById(rolloutId);
    if (!existing || existing.featureId !== featureId) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Rollout not found' });
    }
    await this.repo.deleteRollout(rolloutId);
    await this.write(ctx, {
      action: 'feature.remove_rollout',
      entityId: rolloutId,
      reason: input.reason,
      riskLevel: RiskLevel.Medium,
      previousState: this.rolloutSnapshot(existing),
    });
  }

  /** Emergency kill switch — short-circuits resolution to OFF. Critical-risk, audited. */
  async setKillSwitch(
    featureId: string,
    input: SetKillSwitchInput,
    ctx: ActionContext,
  ): Promise<FeatureRollout> {
    const definition = await this.getDefinition(featureId);
    const existing = await this.repo.findRolloutByType(featureId, FeatureRolloutType.KillSwitch);
    const values = {
      enabled: input.enabled,
      reason: input.reason,
      setByName: ctx.principalContext.principal.fullName,
      updatedBy: ctx.principalContext.principal.employeeId,
    };

    let row: FeatureRollout;
    if (existing) {
      row = (await this.repo.updateRollout(existing.id, { ...values, version: existing.version + 1 }))!;
    } else {
      row = await this.repo.insertRollout({
        featureId,
        type: FeatureRolloutType.KillSwitch,
        ...values,
        createdBy: ctx.principalContext.principal.employeeId,
      });
    }

    await this.write(ctx, {
      action: 'feature.kill_switch',
      entityId: featureId,
      reason: input.reason,
      riskLevel: RiskLevel.Critical,
      previousState: { enabled: existing?.enabled ?? false },
      newState: { feature: definition.key, killSwitchEnabled: input.enabled },
    });
    return row;
  }

  // --- Effective-value resolution -----------------------------------------------------------

  /** Resolve the effective value of a feature (by id) against an explicit context. */
  async resolve(featureId: string, query: ResolveFeatureQuery): Promise<FeatureResolution> {
    const definition = await this.getDefinition(featureId);
    return this.resolveLoaded(
      definition,
      await this.repo.assignmentsForFeature(featureId),
      await this.repo.rolloutsForFeature(featureId),
      query,
    );
  }

  /** Resolve by key — used by other modules / portal-side entitlement checks. */
  async resolveByKey(key: string, query: ResolveFeatureQuery): Promise<FeatureResolution> {
    const loaded = await this.repo.loadForResolution(key);
    if (!loaded) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Feature not found' });
    return this.resolveLoaded(loaded.definition, loaded.assignments, loaded.rollouts, query);
  }

  private resolveLoaded(
    definition: FeatureDefinition,
    assignments: FeatureAssignment[],
    rollouts: FeatureRollout[],
    query: ResolveFeatureQuery,
  ): FeatureResolution {
    const context: FeatureResolutionContext = {
      planId: query.planId ?? null,
      institutionId: query.institutionId ?? null,
      campusId: query.campusId ?? null,
      institutionUserId: query.institutionUserId ?? null,
      independentUserId: query.independentUserId ?? null,
      employeeRoleKeys: query.employeeRoleKeys,
      environment: query.environment,
      subjectId: query.subjectId,
      now: query.at,
    };
    return resolveFeature({
      definition: {
        key: definition.key,
        defaultValue: definition.defaultValue,
        status: definition.status as FeatureDefinitionStatus,
        availableScopes: (definition.availableScopes ?? undefined) as never,
      },
      assignments: assignments.map(toAssignmentInput),
      rollouts: rollouts.map(toRolloutInput),
      context,
    });
  }

  // --- Helpers ------------------------------------------------------------------------------

  private assertScopePermission(scope: FeatureScope, ctx: ActionContext): void {
    const key = SCOPE_PERMISSION[scope];
    if (!key || !can(ctx.principalContext.principal.permissions, key)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing required permission: ${key ?? 'unknown'} for scope ${scope}`,
      });
    }
  }

  private async write(
    ctx: ActionContext,
    fields: {
      action: string;
      entityId: string;
      reason?: string;
      riskLevel?: RiskLevel;
      previousState?: Record<string, unknown>;
      newState?: Record<string, unknown>;
    },
  ): Promise<void> {
    await this.audit.logAudit({
      ...baseAudit(ctx),
      action: fields.action,
      module: MODULE,
      entityType: 'feature',
      entityId: fields.entityId,
      reason: fields.reason,
      riskLevel: fields.riskLevel,
      previousState: fields.previousState,
      newState: fields.newState,
    } as Parameters<AuditWriter['logAudit']>[0]);
  }

  private versionConflict() {
    return new ConflictException({
      code: 'VERSION_CONFLICT',
      message: 'This record changed since you loaded it. Reload and try again.',
    });
  }

  private defSnapshot(d: FeatureDefinition): Record<string, unknown> {
    return {
      name: d.name,
      module: d.module,
      defaultValue: d.defaultValue,
      releaseStage: d.releaseStage,
      status: d.status,
      availableScopes: d.availableScopes,
    };
  }

  private assignSnapshot(a: FeatureAssignment): Record<string, unknown> {
    return { scope: a.scope, scopeId: a.scopeId, value: a.value, enabled: a.enabled };
  }

  private rolloutSnapshot(r: FeatureRollout): Record<string, unknown> {
    return {
      type: r.type,
      enabled: r.enabled,
      percentage: r.percentage,
      allowList: r.allowList,
      blockList: r.blockList,
      environments: r.environments,
      startsAt: r.startsAt,
      endsAt: r.endsAt,
    };
  }
}

function toAssignmentInput(a: FeatureAssignment): FeatureAssignmentInput {
  return {
    scope: a.scope as FeatureScope,
    scopeId: a.scopeId,
    value: a.value,
    enabled: a.enabled,
    activatesAt: a.activatesAt,
    expiresAt: a.expiresAt,
    setByName: a.setByName,
    setAt: a.updatedAt,
    reason: a.reason,
  };
}

function toRolloutInput(r: FeatureRollout): FeatureRolloutInput {
  return {
    type: r.type as FeatureRolloutType,
    enabled: r.enabled,
    percentage: r.percentage,
    allowList: r.allowList ?? [],
    blockList: r.blockList ?? [],
    environments: r.environments ?? [],
    startsAt: r.startsAt,
    endsAt: r.endsAt,
    setByName: r.setByName,
    reason: r.reason,
  };
}
