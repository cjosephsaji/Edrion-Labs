import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AiMode, FeatureScope, RiskLevel } from '@edrion/shared-types';
import { can } from '@edrion/permissions';
import {
  evaluateGuardrail,
  resolveAiPolicy,
  type AiActionRuleInput,
  type AiPolicyInput,
  type AiResolutionContext,
  type GuardrailResult,
  type ProposedAction,
} from '@edrion/copilot';
import type {
  EvaluateGuardrailRequest,
  ListAiPoliciesQuery,
  RemoveAiActionRuleInput,
  RemoveAiPolicyInput,
  SetAiKillSwitchInput,
  UpsertAiActionRuleInput,
  UpsertAiPolicyInput,
} from '@edrion/schemas';
import type { AuditWriter } from '@edrion/audit';
import type { AiActionRule, AiPolicy } from '@edrion/database';
import { AUDIT_WRITER } from '../../common/tokens';
import { baseAudit, type ActionContext } from '../../common/action-context';
import { AiGovernanceRepository } from './ai-governance.repository';

const MODULE = 'ai-governance';

/** Policies + rules loaded once, reused across a batch of evaluations (avoids per-call N+1). */
export interface GuardrailEvaluationContext {
  policies: AiPolicyInput[];
  rules: AiActionRuleInput[];
}

@Injectable()
export class AiGovernanceService {
  constructor(
    private readonly repo: AiGovernanceRepository,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // --- Reads --------------------------------------------------------------------------------

  listPolicies(q: ListAiPoliciesQuery) {
    return this.repo.listPolicies(q);
  }

  listRules() {
    return this.repo.listRules();
  }

  /** AI Control Centre header: global posture + kill-switch + capability map + counts. */
  async overview() {
    const [policies, rules] = await Promise.all([this.repo.allPolicies(), this.repo.listRules()]);
    const global = resolveAiPolicy(policies.map(toPolicyInput), {});
    const killSwitchActive = policies.some((p) => p.enabled && p.killSwitch);
    return {
      globalMode: global.mode,
      killSwitchActive,
      killSwitchScopes: policies
        .filter((p) => p.enabled && p.killSwitch)
        .map((p) => ({ scope: p.scope, scopeId: p.scopeId })),
      capabilities: global.capabilities,
      maxFinancialImpactMinor: global.maxFinancialImpactMinor,
      maxAffectedUsers: global.maxAffectedUsers,
      twoPersonThresholdMinor: global.twoPersonThresholdMinor,
      secondApproverCapabilities: global.secondApproverCapabilities,
      policyCount: policies.length,
      ruleCount: rules.length,
    };
  }

  /** Resolve the effective policy for an explicit context (the explainer). */
  async effectivePolicy(context: AiResolutionContext) {
    const policies = await this.repo.allPolicies();
    return resolveAiPolicy(policies.map(toPolicyInput), context);
  }

  /**
   * Run the deterministic guardrail evaluator for a proposed action. Read-only preview — the
   * SAME evaluation the 8b confirmation lifecycle runs server-side before dispatch. Returns the
   * deciding rule + reason (never a bare flag).
   */
  async evaluate(req: EvaluateGuardrailRequest): Promise<GuardrailResult> {
    return this.evaluateWith(await this.loadEvaluationContext(), req);
  }

  /**
   * Load the policy + rule set once for a batch of evaluations. A single Copilot run evaluates
   * every prepared tool call against the same guardrail set; loading here (not per call) turns an
   * N-tool run's 2·N policy/rule queries into 2.
   */
  async loadEvaluationContext(): Promise<GuardrailEvaluationContext> {
    const [policies, rules] = await Promise.all([this.repo.allPolicies(), this.repo.listRules()]);
    return { policies: policies.map(toPolicyInput), rules: rules.map(toRuleInput) };
  }

  /** Evaluate a proposed action against a pre-loaded context — pure, no I/O. */
  evaluateWith(loaded: GuardrailEvaluationContext, req: EvaluateGuardrailRequest): GuardrailResult {
    return evaluateGuardrail({
      proposed: req.proposed as ProposedAction,
      policies: loaded.policies,
      rules: loaded.rules,
      context: req.context as AiResolutionContext,
    });
  }

  // --- Policy mutations ---------------------------------------------------------------------

  async upsertPolicy(input: UpsertAiPolicyInput, ctx: ActionContext): Promise<AiPolicy> {
    this.assertCan(ctx, 'ai.configure');
    const scope = input.scope as FeatureScope;
    const scopeId = scope === FeatureScope.Global ? null : (input.scopeId ?? null);
    const existing = await this.repo.findPolicy(scope, scopeId);
    const setByName = ctx.principalContext.principal.fullName;

    const values = {
      enabled: input.enabled,
      mode: input.mode,
      capabilities: (input.capabilities ?? {}) as never,
      maxFinancialImpactMinor: input.maxFinancialImpactMinor ?? null,
      maxAffectedUsers: input.maxAffectedUsers ?? null,
      twoPersonThresholdMinor: input.twoPersonThresholdMinor ?? null,
      secondApproverCapabilities: (input.secondApproverCapabilities ?? []) as never,
      reason: input.reason,
      setByName,
      updatedBy: ctx.principalContext.principal.employeeId,
    };

    let row: AiPolicy;
    let previousState: Record<string, unknown> | undefined;
    if (existing) {
      // Optimistic concurrency on update of an existing scope policy.
      if (input.version != null && input.version !== existing.version) throw this.versionConflict();
      previousState = this.policySnapshot(existing);
      row = (await this.repo.updatePolicyWithVersion(existing.id, existing.version, values))!;
      if (!row) throw this.versionConflict();
    } else {
      row = await this.repo.insertPolicy({
        scope,
        scopeId,
        ...values,
        createdBy: ctx.principalContext.principal.employeeId,
      });
    }

    await this.write(ctx, {
      action: 'ai.policy_set',
      entityType: 'ai_policy',
      entityId: row.id,
      reason: input.reason,
      riskLevel: RiskLevel.High,
      previousState,
      newState: this.policySnapshot(row),
    });
    return row;
  }

  async removePolicy(id: string, input: RemoveAiPolicyInput, ctx: ActionContext): Promise<void> {
    this.assertCan(ctx, 'ai.configure');
    const existing = await this.repo.findPolicyById(id);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Policy not found' });
    if (existing.scope === FeatureScope.Global) {
      throw new ForbiddenException({
        code: 'GLOBAL_POLICY_PROTECTED',
        message: 'The global AI policy cannot be removed; edit it instead.',
      });
    }
    await this.repo.deletePolicy(id);
    await this.write(ctx, {
      action: 'ai.policy_remove',
      entityType: 'ai_policy',
      entityId: id,
      reason: input.reason,
      riskLevel: RiskLevel.High,
      previousState: this.policySnapshot(existing),
    });
  }

  /**
   * Emergency AI kill switch for a scope. Resolves to BLOCKED in the evaluator regardless of
   * mode. Toggles the scope policy's kill switch (creating a minimal disabled-mode policy to
   * hold it when the scope has none). Critical-risk, ai.disable, recent auth enforced upstream.
   */
  async setKillSwitch(input: SetAiKillSwitchInput, ctx: ActionContext): Promise<AiPolicy> {
    this.assertCan(ctx, 'ai.disable');
    const scope = input.scope as FeatureScope;
    const scopeId = scope === FeatureScope.Global ? null : (input.scopeId ?? null);
    const existing = await this.repo.findPolicy(scope, scopeId);
    const setByName = ctx.principalContext.principal.fullName;

    let row: AiPolicy;
    if (existing) {
      row = (await this.repo.updatePolicyWithVersion(existing.id, existing.version, {
        killSwitch: input.enabled,
        reason: input.reason,
        setByName,
        updatedBy: ctx.principalContext.principal.employeeId,
      }))!;
      if (!row) throw this.versionConflict();
    } else {
      row = await this.repo.insertPolicy({
        scope,
        scopeId,
        enabled: true,
        mode: AiMode.Disabled,
        killSwitch: input.enabled,
        reason: input.reason,
        setByName,
        createdBy: ctx.principalContext.principal.employeeId,
      });
    }

    await this.write(ctx, {
      action: 'ai.kill_switch',
      entityType: 'ai_policy',
      entityId: row.id,
      reason: input.reason,
      riskLevel: RiskLevel.Critical,
      previousState: { killSwitch: existing?.killSwitch ?? false },
      newState: { scope, scopeId, killSwitch: input.enabled },
    });
    return row;
  }

  // --- Action-rule mutations ----------------------------------------------------------------

  async upsertRule(input: UpsertAiActionRuleInput, ctx: ActionContext): Promise<AiActionRule> {
    this.assertCan(ctx, 'ai.configure');
    const action = input.action ?? null;
    const existing = await this.repo.findRule(input.capability, action);
    const setByName = ctx.principalContext.principal.fullName;

    const values = {
      enabled: input.enabled,
      effect: input.effect,
      riskLevel: input.riskLevel ?? null,
      description: input.description ?? null,
      reason: input.reason,
      setByName,
      updatedBy: ctx.principalContext.principal.employeeId,
    };

    let row: AiActionRule;
    let previousState: Record<string, unknown> | undefined;
    if (existing) {
      if (input.version != null && input.version !== existing.version) throw this.versionConflict();
      previousState = this.ruleSnapshot(existing);
      row = (await this.repo.updateRule(existing.id, { ...values, version: existing.version + 1 }))!;
    } else {
      row = await this.repo.insertRule({
        capability: input.capability,
        action,
        ...values,
        createdBy: ctx.principalContext.principal.employeeId,
      });
    }

    await this.write(ctx, {
      action: 'ai.rule_set',
      entityType: 'ai_action_rule',
      entityId: row.id,
      reason: input.reason,
      riskLevel: RiskLevel.Medium,
      previousState,
      newState: this.ruleSnapshot(row),
    });
    return row;
  }

  async removeRule(id: string, input: RemoveAiActionRuleInput, ctx: ActionContext): Promise<void> {
    this.assertCan(ctx, 'ai.configure');
    const existing = await this.repo.findRuleById(id);
    if (!existing) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Rule not found' });
    await this.repo.deleteRule(id);
    await this.write(ctx, {
      action: 'ai.rule_remove',
      entityType: 'ai_action_rule',
      entityId: id,
      reason: input.reason,
      riskLevel: RiskLevel.Medium,
      previousState: this.ruleSnapshot(existing),
    });
  }

  // --- Helpers ------------------------------------------------------------------------------

  private assertCan(ctx: ActionContext, key: string): void {
    if (!can(ctx.principalContext.principal.permissions, key)) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: `Missing required permission: ${key}`,
      });
    }
  }

  private async write(
    ctx: ActionContext,
    fields: {
      action: string;
      entityType: string;
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
      entityType: fields.entityType,
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

  private policySnapshot(p: AiPolicy): Record<string, unknown> {
    return {
      scope: p.scope,
      scopeId: p.scopeId,
      enabled: p.enabled,
      mode: p.mode,
      capabilities: p.capabilities,
      maxFinancialImpactMinor: p.maxFinancialImpactMinor,
      maxAffectedUsers: p.maxAffectedUsers,
      twoPersonThresholdMinor: p.twoPersonThresholdMinor,
      secondApproverCapabilities: p.secondApproverCapabilities,
      killSwitch: p.killSwitch,
    };
  }

  private ruleSnapshot(r: AiActionRule): Record<string, unknown> {
    return {
      capability: r.capability,
      action: r.action,
      enabled: r.enabled,
      effect: r.effect,
      riskLevel: r.riskLevel,
    };
  }
}

function toPolicyInput(p: AiPolicy): AiPolicyInput {
  return {
    scope: p.scope as FeatureScope,
    scopeId: p.scopeId,
    enabled: p.enabled,
    mode: p.mode as AiMode,
    capabilities: (p.capabilities ?? {}) as AiPolicyInput['capabilities'],
    maxFinancialImpactMinor: p.maxFinancialImpactMinor,
    maxAffectedUsers: p.maxAffectedUsers,
    twoPersonThresholdMinor: p.twoPersonThresholdMinor,
    maxRunsPerDay: p.maxRunsPerDay,
    maxRunsPerEmployeePerDay: p.maxRunsPerEmployeePerDay,
    secondApproverCapabilities: (p.secondApproverCapabilities ??
      []) as AiPolicyInput['secondApproverCapabilities'],
    killSwitch: p.killSwitch,
    setByName: p.setByName,
    setAt: p.updatedAt,
  };
}

function toRuleInput(r: AiActionRule): AiActionRuleInput {
  return {
    capability: r.capability as AiActionRuleInput['capability'],
    action: r.action,
    enabled: r.enabled,
    effect: r.effect as AiActionRuleInput['effect'],
    riskLevel: (r.riskLevel ?? undefined) as AiActionRuleInput['riskLevel'],
  };
}
