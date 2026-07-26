import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AiActionStatus, AiGuardrailDecision, AiMode, FeatureScope, RiskLevel } from '@edrion/shared-types';
import { can } from '@edrion/permissions';
import { resolveScopeFilter, type ScopeFilter } from '@edrion/auth';
import type { AuditWriter, AuditEventInput } from '@edrion/audit';
import {
  assertTransition,
  evaluateGuardrail,
  initialRunStatus,
  isTerminalStatus,
  redactSecrets,
  type AiPolicyInput,
  type GuardrailResult,
} from '@edrion/copilot';
import type {
  PortalConfirmRunInput,
  PortalCreateRunInput,
  PortalRejectRunInput,
  PortalRunsListQuery,
} from '@edrion/schemas';
import type { PortalAiRun, PortalAiToolCall } from '@edrion/database';
import { Inject } from '@nestjs/common';
import { AUDIT_WRITER } from '../../common/tokens';
import type { Page } from './academics.repository';
import type { ListResult } from './academics.service';
import { PortalCopilotRepository } from './portal-copilot.repository';
import { PortalCopilotToolRegistry, type PortalToolPreparation } from './portal-copilot.tools';
import { PortalCopilotPlanner } from './portal-copilot.planner';
import { basePortalAudit, type PortalActionContext } from './portal-action-context';

const MODULE = 'portal-copilot';
const CONFIRMATION_TTL_MS = 15 * 60 * 1000;
const RISK_ORDER: RiskLevel[] = [RiskLevel.Low, RiskLevel.Medium, RiskLevel.High, RiskLevel.Critical];

/**
 * Institution-portal Copilot service (Phase 10). The tenant-facing counterpart of the platform
 * CopilotService — reuses the @edrion/copilot guardrail engine + run lifecycle, but the actor is an
 * INSTITUTION user, every run is tenant-scoped, and the boundary discipline matches the rest of the
 * portal: institution auth + the `ai.use` permission gate the controller; per-tool permissions are
 * re-asserted here (the AI never gets a wider reach than the user); scope is enforced by the reused
 * audited services; every tool call is audited. No mutation executes without a human confirmation row.
 */
@Injectable()
export class PortalCopilotService {
  constructor(
    private readonly repo: PortalCopilotRepository,
    private readonly registry: PortalCopilotToolRegistry,
    private readonly planner: PortalCopilotPlanner,
    @Inject(AUDIT_WRITER) private readonly audit: AuditWriter,
  ) {}

  // --- Reads --------------------------------------------------------------------------------

  async listRuns(ctx: PortalActionContext, q: PortalRunsListQuery): Promise<ListResult<PortalAiRun>> {
    const f = this.filter(ctx);
    return this.paginate(await this.repo.listRuns(ctx.principal.institutionId, f.campusIds, q), q);
  }

  /** Full run detail: prepared tool calls + confirmations. */
  async getRunDetail(ctx: PortalActionContext, id: string) {
    const run = await this.requireRun(ctx, id);
    const [toolCalls, confirmations] = await Promise.all([
      this.repo.toolCallsForRun(id),
      this.repo.confirmationsForRun(id),
    ]);
    return { run, toolCalls, confirmations };
  }

  // --- Create (understand → prepare → show exact impact) -------------------------------------

  async createRun(ctx: PortalActionContext, input: PortalCreateRunInput) {
    const startedAt = Date.now();
    const campusId = ctx.scope.mode === 'campus' ? ctx.scope.campusId : null;
    const plan = await this.planner.plan({
      prompt: input.prompt,
      context: (input.context ?? {}) as Record<string, unknown>,
      availableTools: this.registry.keys(),
    });

    const run = await this.repo.insertRun({
      institutionId: ctx.principal.institutionId,
      campusId,
      institutionUserId: ctx.principal.institutionUserId,
      userName: ctx.principal.fullName,
      prompt: redactSecrets(input.prompt) as string,
      context: redactSecrets(input.context ?? {}) as Record<string, unknown>,
      contextSources: Object.keys(input.context ?? {}),
      status: AiActionStatus.Proposed,
      summary: plan.summary,
      model: 'stub-planner',
      promptVersion: 'v1',
      startedAt: new Date(startedAt),
      createdBy: ctx.principal.institutionUserId,
    });

    let anyNeedsConfirmation = false;
    let anyExecutable = false;
    let maxRisk: RiskLevel = RiskLevel.Low;
    const policies = this.policiesFor(ctx);

    for (const call of plan.toolCalls) {
      const tool = this.registry.get(call.toolKey);
      if (!tool) continue;

      let prep: PortalToolPreparation;
      try {
        prep = await tool.prepare(call.args, ctx);
      } catch (e) {
        await this.repo.insertToolCall({
          runId: run.id,
          institutionId: ctx.principal.institutionId,
          toolKey: call.toolKey,
          capability: tool.capability,
          args: redactSecrets(call.args) as Record<string, unknown>,
          explanation: call.explanation,
          requiredPermission: tool.requiredPermission,
          decision: AiGuardrailDecision.Blocked,
          decisionLayer: 'preparation_error',
          decisionReason: e instanceof Error ? e.message : 'Could not prepare this action',
          reversible: tool.reversible,
          status: AiActionStatus.Failed,
          errorDetail: e instanceof Error ? e.message : 'prepare failed',
        });
        continue;
      }

      const guardrail = evaluateGuardrail({
        proposed: {
          capability: tool.capability,
          action: tool.key,
          requiredPermission: tool.requiredPermission,
          financialImpactMinor: prep.financialImpactMinor,
          affectedUsers: prep.affectedUsers,
          riskLevel: prep.riskLevel,
          reversible: tool.reversible,
        },
        policies,
        rules: [],
        context: { institutionId: ctx.principal.institutionId, campusId },
      });

      maxRisk = maxOf(maxRisk, guardrail.riskLevel);
      let decision = guardrail.decision;
      let decisionLayer: string = guardrail.layer;
      let decisionReason = guardrail.reason;
      let status: AiActionStatus;
      let result: Record<string, unknown> | undefined;
      let executedAt: Date | undefined;

      // The AI never gets a wider reach than the user: even an auto-runnable (ALLOW) read tool
      // requires the underlying permission, exactly as the human path does.
      const lacksPermission = !!tool.requiredPermission && !can(ctx.principal.permissions, tool.requiredPermission);

      if (lacksPermission) {
        decision = AiGuardrailDecision.Blocked;
        decisionLayer = 'permission';
        decisionReason = `You lack the required permission: ${tool.requiredPermission}`;
        status = AiActionStatus.Rejected;
      } else if (decision === AiGuardrailDecision.Blocked) {
        status = AiActionStatus.Rejected;
      } else if (decision === AiGuardrailDecision.Allow) {
        // Read-only / allowed — no confirmation needed; execute immediately.
        try {
          result = await tool.execute(call.args, ctx);
          status = AiActionStatus.Executed;
          executedAt = new Date();
          anyExecutable = true;
        } catch (e) {
          status = AiActionStatus.Failed;
          result = { error: e instanceof Error ? e.message : 'execution failed' };
        }
      } else {
        status = AiActionStatus.AwaitingConfirmation;
        anyNeedsConfirmation = true;
      }

      await this.repo.insertToolCall({
        runId: run.id,
        institutionId: ctx.principal.institutionId,
        toolKey: tool.key,
        capability: tool.capability,
        args: redactSecrets(call.args) as Record<string, unknown>,
        explanation: call.explanation,
        requiredPermission: tool.requiredPermission,
        decision,
        decisionLayer,
        decisionReason,
        riskLevel: guardrail.riskLevel,
        reversible: prep.reversible,
        financialImpactMinor: prep.financialImpactMinor,
        affectedUsers: prep.affectedUsers,
        impactPreview: prep as unknown as Record<string, unknown>,
        status,
        result: result ? (redactSecrets(result) as Record<string, unknown>) : null,
        executedAt: executedAt ?? null,
      });
    }

    const status = initialRunStatus({ anyNeedsConfirmation, anyExecutable });
    const terminal = isTerminalStatus(status);
    await this.repo.updateRun(run.id, {
      status,
      riskLevel: maxRisk,
      durationMs: Date.now() - startedAt,
      completedAt: terminal ? new Date() : null,
      expiresAt: status === AiActionStatus.AwaitingConfirmation ? new Date(Date.now() + CONFIRMATION_TTL_MS) : null,
    });

    await this.writeRunAudit(ctx, run.id, campusId, 'ai.run_created', RiskLevel.Low, {
      prompt: input.prompt,
      status,
      toolCount: plan.toolCalls.length,
    });

    return this.getRunDetail(ctx, run.id);
  }

  // --- Confirm (CONFIRM → execute → result → audit) -----------------------------------------

  async confirm(ctx: PortalActionContext, runId: string, input: PortalConfirmRunInput) {
    const run = await this.requireRun(ctx, runId);
    if (run.status !== AiActionStatus.AwaitingConfirmation) {
      throw new ConflictException({
        code: 'NOT_AWAITING_CONFIRMATION',
        message: `Run is ${run.status}; only an awaiting_confirmation run can be confirmed.`,
      });
    }
    if (this.isExpired(run)) {
      await this.repo.updateRun(runId, { status: AiActionStatus.Expired, completedAt: new Date() });
      throw new ConflictException({ code: 'RUN_EXPIRED', message: 'This confirmation has expired. Start a new run.' });
    }

    const toolCalls = await this.repo.toolCallsForRun(runId);
    const executable = toolCalls.filter((t) => t.status === AiActionStatus.AwaitingConfirmation);

    // The AI cannot bypass the permission boundary — the confirming user must hold each underlying
    // permission, exactly as the human path requires.
    for (const t of executable) {
      if (t.requiredPermission && !can(ctx.principal.permissions, t.requiredPermission)) {
        throw new ForbiddenException({ code: 'FORBIDDEN', message: `Missing required permission: ${t.requiredPermission}` });
      }
    }

    // Typed confirmation for critical-risk runs.
    if (run.riskLevel === RiskLevel.Critical && !input.confirmationText?.trim()) {
      throw new ConflictException({
        code: 'TYPED_CONFIRMATION_REQUIRED',
        message: 'Type the confirmation phrase to authorise this critical action.',
      });
    }

    assertTransition(run.status as AiActionStatus, AiActionStatus.Confirmed);
    await this.repo.updateRun(runId, { status: AiActionStatus.Confirmed });
    await this.repo.insertConfirmation({
      runId,
      institutionId: ctx.principal.institutionId,
      institutionUserId: ctx.principal.institutionUserId,
      userName: ctx.principal.fullName,
      method: input.confirmationText ? 'typed' : 'recent_auth',
      confirmationText: input.confirmationText ?? null,
      reason: input.reason,
    });

    let anyFailed = false;
    const policies = this.policiesFor(ctx);

    for (const t of executable) {
      const tool = this.registry.get(t.toolKey);
      if (!tool) {
        anyFailed = true;
        await this.repo.updateToolCall(t.id, { status: AiActionStatus.Failed, errorDetail: 'Tool no longer registered' });
        continue;
      }

      // Re-evaluate guardrails server-side at execution time — never trust the prepared decision.
      const reeval = this.reevaluate(ctx, t, policies);
      if (reeval.decision === AiGuardrailDecision.Blocked) {
        anyFailed = true;
        await this.repo.updateToolCall(t.id, { status: AiActionStatus.Failed, errorDetail: `Blocked at execution: ${reeval.reason}` });
        continue;
      }

      try {
        const result = await tool.execute(t.args as Record<string, unknown>, ctx);
        await this.repo.updateToolCall(t.id, {
          status: AiActionStatus.Executed,
          result: redactSecrets(result) as Record<string, unknown>,
          executedAt: new Date(),
        });
      } catch (e) {
        anyFailed = true;
        await this.repo.updateToolCall(t.id, {
          status: AiActionStatus.Failed,
          errorDetail: e instanceof Error ? e.message : 'execution failed',
        });
      }
    }

    const finalStatus = anyFailed ? AiActionStatus.Failed : AiActionStatus.Executed;
    assertTransition(AiActionStatus.Confirmed, finalStatus);
    await this.repo.updateRun(runId, {
      status: finalStatus,
      completedAt: new Date(),
      durationMs: Date.now() - run.startedAt.getTime(),
      errorDetail: anyFailed ? 'One or more actions failed during execution' : null,
    });

    await this.writeRunAudit(ctx, runId, run.campusId, 'ai.run_confirmed', (run.riskLevel ?? RiskLevel.Low) as RiskLevel, {
      reason: input.reason,
      executed: executable.length,
      result: finalStatus,
    });

    return this.getRunDetail(ctx, runId);
  }

  // --- Reject -------------------------------------------------------------------------------

  async reject(ctx: PortalActionContext, runId: string, input: PortalRejectRunInput) {
    const run = await this.requireRun(ctx, runId);
    if (isTerminalStatus(run.status as AiActionStatus)) {
      throw new ConflictException({ code: 'RUN_TERMINAL', message: `Run is already ${run.status}.` });
    }
    assertTransition(run.status as AiActionStatus, AiActionStatus.Rejected);
    await this.repo.updateRun(runId, { status: AiActionStatus.Rejected, completedAt: new Date() });
    const toolCalls = await this.repo.toolCallsForRun(runId);
    for (const t of toolCalls) {
      if (t.status === AiActionStatus.AwaitingConfirmation) {
        await this.repo.updateToolCall(t.id, { status: AiActionStatus.Rejected });
      }
    }
    await this.writeRunAudit(ctx, runId, run.campusId, 'ai.run_rejected', RiskLevel.Low, { reason: input.reason });
    return this.getRunDetail(ctx, runId);
  }

  // --- Helpers ------------------------------------------------------------------------------

  /**
   * The institution-scope guardrail policy the run is evaluated against. A single full-mode policy:
   * read-only tools ALLOW, every state-changing tool resolves to at least NEEDS_CONFIRMATION (the
   * non-negotiable rule). Per-institution overrides (modes/kill switch) are a P11 follow-up; the
   * engine already supports them, this layer just supplies the default.
   */
  private policiesFor(ctx: PortalActionContext): AiPolicyInput[] {
    return [
      {
        scope: FeatureScope.Institution,
        scopeId: ctx.principal.institutionId,
        enabled: true,
        mode: AiMode.Full,
      },
    ];
  }

  private async requireRun(ctx: PortalActionContext, id: string): Promise<PortalAiRun> {
    const run = await this.repo.findRun(id, ctx.principal.institutionId);
    if (!run) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Run not found' });
    this.assertInScope(run.campusId, this.filter(ctx));
    return run;
  }

  private isExpired(run: PortalAiRun): boolean {
    return !!run.expiresAt && run.expiresAt.getTime() < Date.now();
  }

  private reevaluate(ctx: PortalActionContext, t: PortalAiToolCall, policies: AiPolicyInput[]): GuardrailResult {
    return evaluateGuardrail({
      proposed: {
        capability: t.capability as never,
        action: t.toolKey,
        requiredPermission: t.requiredPermission ?? undefined,
        financialImpactMinor: t.financialImpactMinor ?? 0,
        affectedUsers: t.affectedUsers ?? 0,
        riskLevel: (t.riskLevel ?? undefined) as never,
      },
      policies,
      rules: [],
      context: { institutionId: ctx.principal.institutionId },
    });
  }

  private filter(ctx: PortalActionContext): ScopeFilter {
    return resolveScopeFilter(ctx.principal, ctx.scope);
  }

  private assertInScope(campusId: string | null, filter: ScopeFilter): void {
    if (campusId === null) return;
    if (filter.campusIds === null) return;
    if (!filter.campusIds.includes(campusId)) {
      throw new NotFoundException({ code: 'NOT_FOUND', message: 'Not found in the current scope' });
    }
  }

  private paginate<T>(page: Page<T>, q: { page: number; pageSize: number }): ListResult<T> {
    return { ...page, page: q.page, pageSize: q.pageSize, hasMore: q.page * q.pageSize < page.total };
  }

  private async writeRunAudit(
    ctx: PortalActionContext,
    runId: string,
    campusId: string | null,
    action: string,
    riskLevel: RiskLevel,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.logAudit({
      ...basePortalAudit(ctx),
      action,
      module: MODULE,
      entityType: 'portal_ai_run',
      entityId: runId,
      campusId: campusId ?? undefined,
      riskLevel,
      newState: detail,
    } as AuditEventInput);
  }
}

function maxOf(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER.indexOf(b) > RISK_ORDER.indexOf(a) ? b : a;
}
